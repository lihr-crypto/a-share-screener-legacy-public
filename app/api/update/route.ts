import * as XLSX from "xlsx";
import { env } from "cloudflare:workers";
import { change, chunks, dateDigits, db, jsonpJson, monthBase, mondayOf, response, weekBase, ymd, type Candle, type Price, type Stock } from "@/lib/market";
import { evaluateTenSessions } from "@/lib/screening-rules";
import { maxRowsPerInsert } from "@/lib/d1-batching";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const SZSE = "https://www.szse.cn/api/report/ShowReport";
const SSE = "https://yunhq.sse.com.cn:32042";
const UA = "Mozilla/5.0 (compatible; MarketScreen/1.0)";

function authorized(request: Request) {
  const secret = env.UPDATE_TOKEN;
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!secret || !provided || secret.length !== provided.length) return false;
  let mismatch = 0;
  for (let i = 0; i < secret.length; i++) mismatch |= secret.charCodeAt(i) ^ provided.charCodeAt(i);
  return mismatch === 0;
}

async function fetchOk(url: string, referer: string) {
  const response = await fetch(url, { headers: { "User-Agent": UA, Referer: referer, Accept: "application/json, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, */*" } });
  if (!response.ok) throw new Error(`Official data request failed (${response.status}): ${new URL(url).hostname}`);
  return response;
}

function workbookRows(data: ArrayBuffer) {
  const workbook = XLSX.read(data, { type: "array", cellDates: false, raw: false });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error("Official SZSE workbook did not contain a worksheet");
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: false });
}

function clean(value: unknown) {
  return String(value ?? "").replace(/<[^>]+>/g, "").replace(/&nbsp;|&#160;/gi, " ").replace(/&amp;/gi, "&").trim();
}
function field(row: Record<string, unknown>, names: string[]) {
  for (const name of names) if (row[name] !== undefined && row[name] !== "") return row[name];
  const keys = Object.keys(row);
  const normalized = (s: string) => s.replace(/[\s()（）%％]/g, "").toLowerCase();
  for (const name of names) {
    const found = keys.find(key => normalized(key) === normalized(name));
    if (found) return row[found];
  }
  return "";
}
function n(value: unknown) {
  const parsed = Number(clean(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}
function dateValue(value: unknown) {
  const text = clean(value);
  const digits = dateDigits(text);
  if (digits) return digits;
  const maybeSerial = Number(text);
  if (maybeSerial > 20000 && maybeSerial < 100000) {
    const d = XLSX.SSF.parse_date_code(maybeSerial);
    return `${d.y}${String(d.m).padStart(2, "0")}${String(d.d).padStart(2, "0")}`;
  }
  return "";
}
function mapSzseList(rows: Record<string, unknown>[]): Stock[] {
  const result: Stock[] = [];
  for (const row of rows) {
    const board = clean(field(row, ["板块", "上市板块", "市场板块"]));
    if (!board.includes("创业板")) continue;
    const code = clean(field(row, ["A股代码", "证券代码", "股票代码", "代码"])).padStart(6, "0");
    const name = clean(field(row, ["A股简称", "证券简称", "股票简称", "简称"]));
    const listingDate = dateValue(field(row, ["A股上市日期", "上市日期"]));
    if (/^\d{6}$/.test(code) && name) result.push({ exchange: "SZSE", board: "创业板", code, name, listingDate });
  }
  return result;
}
function* dateChunks(from: Date, to: Date) {
  let start = new Date(from);
  while (start <= to) {
    const end = new Date(start); end.setUTCDate(end.getUTCDate() + 4);
    if (end > to) end.setTime(to.getTime());
    yield { start: ymd(start), end: ymd(end) };
    start = new Date(end); start.setUTCDate(start.getUTCDate() + 1);
  }
}
function parseSzseDaily(rows: Record<string, unknown>[], validCodes: Set<string>) {
  const prices: Price[] = [];
  for (const row of rows) {
    const code = clean(field(row, ["证券代码", "股票代码", "代码"])).padStart(6, "0");
    if (!validCodes.has(code)) continue;
    const date = dateValue(field(row, ["交易日期", "日期", "交易日"]));
    const candle: Candle = {
      date,
      open: n(field(row, ["开盘", "今开", "开盘价"])),
      high: n(field(row, ["最高", "最高价"])),
      low: n(field(row, ["最低", "最低价"])),
      close: n(field(row, ["今收", "收盘", "收盘价"])),
      volume: n(field(row, ["成交量(万股)", "成交量（万股）", "成交量", "成交股数(万股)"])),
      prevClose: n(field(row, ["前收", "昨收", "前收盘价"])),
    };
    if (date && candle.close > 0) prices.push({ ...candle, exchange: "SZSE", code });
  }
  return prices;
}
async function fetchSzse() {
  const listUrl = `${SZSE}?SHOWTYPE=xlsx&CATALOGID=1110&TABKEY=tab1&selectModule=nm`;
  const listRows = workbookRows(await (await fetchOk(listUrl, "https://www.szse.cn/market/stock/stock list/")).arrayBuffer());
  const stocks = mapSzseList(listRows);
  if (stocks.length < 1000) throw new Error(`Official SZSE list is incomplete (${stocks.length} ChiNext records)`);
  const codes = new Set(stocks.map(s => s.code));
  const to = new Date(); to.setUTCHours(0, 0, 0, 0);
  const from = new Date(to); from.setUTCDate(from.getUTCDate() - 44);
  const allRows: Record<string, unknown>[] = [];
  for (const range of dateChunks(from, to)) {
    const url = `${SZSE}?SHOWTYPE=xlsx&CATALOGID=1815_stock_snapshot&TABKEY=tab1&txtBeginDate=${range.start.slice(0, 4)}-${range.start.slice(4, 6)}-${range.start.slice(6)}&txtEndDate=${range.end.slice(0, 4)}-${range.end.slice(4, 6)}-${range.end.slice(6)}`;
    const bytes = await (await fetchOk(url, "https://www.szse.cn/market/trend/index.html")).arrayBuffer();
    allRows.push(...workbookRows(bytes));
  }
  const prices = parseSzseDaily(allRows, codes);
  const exchangeDates = [...new Set(prices.map(price => price.date))].sort();
  const ipoNoLimitDates = new Map(stocks.map(stock => [stock.code, new Set(exchangeDates.filter(date => date >= (stock.listingDate ?? "99999999")).slice(0, 5))]));
  for (const price of prices) price.limitExempt = ipoNoLimitDates.get(price.code)?.has(price.date) ?? false;
  if (!prices.length) throw new Error("Official SZSE history response contained no valid ChiNext rows");
  return { stocks, prices };
}

async function fetchSse() {
  const url = `${SSE}/v1/sh1/list/exchange/kshare?select=code,name,open,high,low,last,prev_close,chg_rate,volume,amount&begin=0&end=999`;
  const result = jsonpJson(await (await fetchOk(url, "https://star.sse.com.cn/market/stocklist/")).text());
  const list = Array.isArray(result.list) ? result.list : [];
  if (list.length < 500) throw new Error(`Official SSE STAR list is incomplete (${list.length} records)`);
  const stocks: Stock[] = list.map((row: any) => {
    // The official endpoint returns positional arrays when `select` is used,
    // while some responses expose named fields. Support both official shapes.
    const code = Array.isArray(row) ? row[0] : row.code;
    const name = Array.isArray(row) ? row[1] : row.name;
    return { exchange: "SSE", board: "科创板", code: String(code ?? "").padStart(6, "0"), name: clean(name) };
  }).filter((row: Stock) => /^\d{6}$/.test(row.code) && row.name);
  const prices: Price[] = [];
  let seriesWithBars = 0;
  let totalKlineBars = 0;
  let dateAndCloseBars = 0;
  let responseKeys = "";
  const groups = chunks(stocks, 16);
  for (const group of groups) {
    const responses = await Promise.all(group.map(async stock => {
      const kurl = `${SSE}/v1/sh1/dayk/${stock.code}?begin=-35&end=-1&period=day`;
      const parsed = jsonpJson(await (await fetchOk(kurl, "https://star.sse.com.cn/market/stocklist/")).text());
      if (!responseKeys) responseKeys = Object.keys(parsed ?? {}).sort().join(",");
      return { stock, kline: Array.isArray(parsed.kline) ? parsed.kline : [], firstIndex: Number(parsed.begin ?? Math.max(0, Number(parsed.total ?? 0) - (parsed.kline?.length ?? 0))) };
    }));
    for (const { stock, kline, firstIndex } of responses) {
      if (kline.length) seriesWithBars++;
      totalKlineBars += kline.length;
      for (const [index, item] of kline.entries()) {
        const date = dateDigits(item[0]);
        const close = n(item[4]);
        if (date && close > 0) {
          dateAndCloseBars++;
          prices.push({ exchange: "SSE", code: stock.code, date, open: n(item[1]), high: n(item[2]), low: n(item[3]), close, volume: n(item[5]) / 10000, prevClose: index > 0 ? n(kline[index - 1][4]) : undefined, limitExempt: firstIndex + index < 5 });
        }
      }
    }
  }
  if (!prices.length) throw new Error(`Official SSE history response contained no valid STAR rows (stocks=${stocks.length}; series=${seriesWithBars}; klineBars=${totalKlineBars}; validBars=${dateAndCloseBars}; responseKeys=${responseKeys || "none"})`);
  return { stocks, prices };
}

function buildScreen(stocks: Stock[], prices: Price[], marketDate: string, runId: string) {
  const target = (() => { const year = Number(marketDate.slice(0,4)), month = Number(marketDate.slice(4,6)), day = Number(marketDate.slice(6,8)); const m = month - 2; const y = year + Math.floor(m / 12); const mm = ((m % 12) + 12) % 12; const last = new Date(Date.UTC(y, mm + 1, 0)).getUTCDate(); return `${y}${String(mm+1).padStart(2,"0")}${String(Math.min(day,last)).padStart(2,"0")}`; })();
  const weekStart = mondayOf(marketDate);
  const screened: any[] = [];
  for (const stock of stocks) {
    const history = prices.filter(p => p.exchange === stock.exchange && p.code === stock.code);
    const latest = history.find(p => p.date === marketDate && p.close > 0);
    if (!latest) { screened.push({ ...stock, close: 0, monthChange: null, weekChange: null, monthBaseDate: null, weekBaseDate: null, sufficient: 0, matched: 0, limitUpCount: null, pullbackPercent: null }); continue; }
    const mBase = monthBase(history, stock.code, stock.exchange, target);
    const wBase = weekBase(history, stock.code, stock.exchange, weekStart);
    const tenSession = evaluateTenSessions(history);
    const sufficient = Number(Boolean(mBase && wBase && tenSession.sufficient));
    const monthChange = mBase ? change(latest.close, mBase.close) : null;
    const weekChange = wBase ? change(latest.close, wBase.close) : null;
    const matched = Number(Boolean(sufficient && monthChange! <= 20 && weekChange! <= 5 && tenSession.matched));
    screened.push({ ...stock, close: latest.close, monthChange, weekChange, monthBaseDate: mBase?.date ?? null, weekBaseDate: wBase?.date ?? null, sufficient, matched, limitUpCount: tenSession.limitUpCount, pullbackPercent: tenSession.pullbackPercent });
  }
  return { rows: screened, target, weekStart };
}

async function insertMany(database: D1Database, table: string, columns: string[], values: any[][], rowLimit: number) {
  // Keep a margin below D1's bound-variable ceiling for each prepared statement.
  const safeRowLimit = maxRowsPerInsert(columns.length, rowLimit, 90);
  const statements = chunks(values, safeRowLimit).map(group => {
    const placeholders = `(${columns.map(() => "?").join(",")})`;
    const sql = `INSERT INTO ${table} (${columns.join(",")}) VALUES ${group.map(() => placeholders).join(",")}`;
    return database.prepare(sql).bind(...group.flat());
  });
  for (const batch of chunks(statements, 25)) {
    await database.batch(batch);
  }
}

export async function POST(request: Request) {
  if (!authorized(request)) return response({ error: "unauthorized" }, env.UPDATE_TOKEN ? 401 : 503);
  const database = env.DB;
  if (!database) return response({ error: "D1 binding DB is unavailable" }, 503);
  await database.prepare("INSERT OR IGNORE INTO update_control (id, lease_token, lease_until, bootstrap_next_at) VALUES ('bootstrap', NULL, 0, 0)").run();
  const now = Date.now();
  const suppliedLease = request.headers.get("x-internal-bootstrap-lease");
  const leaseToken = suppliedLease || crypto.randomUUID();
  if (suppliedLease) {
    const lease = await database.prepare("SELECT lease_token AS token, lease_until AS leaseUntil FROM update_control WHERE id = 'bootstrap'").first<{ token: string; leaseUntil: number }>();
    if (!lease || lease.token !== suppliedLease || lease.leaseUntil <= now) return response({ error: "bootstrap lease expired" }, 409);
  } else {
    const claimed = await database.prepare("UPDATE update_control SET lease_token = ?, lease_until = ? WHERE id = 'bootstrap' AND lease_until <= ?")
      .bind(leaseToken, now + 600_000, now).run();
    if (claimed.meta.changes !== 1) return response({ ok: true, busy: true }, 202);
  }
  let successful = false;
  let failure = "update failed";
  try {
    const [szse, sse] = await Promise.all([fetchSzse(), fetchSse()]);
    const szDates = szse.prices.map(p => p.date), ssDates = sse.prices.map(p => p.date);
    const szLatest = szDates.sort().at(-1), ssLatest = ssDates.sort().at(-1);
    if (!szLatest || !ssLatest || szLatest !== ssLatest) throw new Error(`Exchange data dates do not match (SZSE ${szLatest ?? "missing"}; SSE ${ssLatest ?? "missing"})`);
    const marketDate = szLatest;
    const allStocks = [...szse.stocks, ...sse.stocks];
    const allPrices = [...szse.prices, ...sse.prices];
    const runId = crypto.randomUUID();
    const result = buildScreen(allStocks, allPrices, marketDate, runId);
    const stamp = new Date().toISOString();
    await database.batch([
      database.prepare("DELETE FROM market_stocks WHERE run_id NOT IN (SELECT id FROM market_runs WHERE active = 1)"),
      database.prepare("DELETE FROM daily_prices WHERE run_id NOT IN (SELECT id FROM market_runs WHERE active = 1)"),
      database.prepare("DELETE FROM screen_rows WHERE run_id NOT IN (SELECT id FROM market_runs WHERE active = 1)"),
      database.prepare("DELETE FROM market_runs WHERE active = 0"),
    ]);
    await database.prepare("INSERT INTO market_runs (id, market_date, updated_at, week_start, month_target, szse_status, sse_status, active) VALUES (?, ?, ?, ?, ?, ?, ?, 0)").bind(runId, marketDate, stamp, result.weekStart, result.target, "OK", "OK").run();
    await insertMany(database, "market_stocks", ["run_id", "exchange", "board", "code", "name"], allStocks.map(s => [runId, s.exchange, s.board, s.code, s.name]), 18);
    await insertMany(database, "daily_prices", ["run_id", "exchange", "code", "trade_date", "open", "high", "low", "close", "volume", "prev_close", "limit_exempt"], allPrices.map(p => [runId, p.exchange, p.code, p.date, p.open, p.high, p.low, p.close, p.volume, p.prevClose ?? null, p.limitExempt ? 1 : 0]), 8);
    await insertMany(database, "screen_rows", ["run_id", "exchange", "board", "code", "name", "close", "month_change", "week_change", "month_base_date", "week_base_date", "sufficient", "matched", "limit_up_count", "pullback_percent"], result.rows.map(r => [runId, r.exchange, r.board, r.code, r.name, r.close, r.monthChange, r.weekChange, r.monthBaseDate, r.weekBaseDate, r.sufficient, r.matched, r.limitUpCount, r.pullbackPercent]), 6);
    await database.prepare("UPDATE market_runs SET active = CASE WHEN id = ? THEN 1 ELSE 0 END").bind(runId).run();
    await database.batch([
      database.prepare("DELETE FROM market_stocks WHERE run_id != ?").bind(runId),
      database.prepare("DELETE FROM daily_prices WHERE run_id != ?").bind(runId),
      database.prepare("DELETE FROM screen_rows WHERE run_id != ?").bind(runId),
      database.prepare("DELETE FROM market_runs WHERE id != ?").bind(runId),
    ]);
    const counts = Object.fromEntries(["创业板", "科创板"].map(board => [board, { matched: result.rows.filter(r => r.board === board && r.matched).length, insufficient: result.rows.filter(r => r.board === board && !r.sufficient).length }]));
    successful = true;
    return response({ ok: true, marketDate, stocks: allStocks.length, prices: allPrices.length, counts });
  } catch (error) {
    const message = error instanceof Error ? error.message : "update failed";
    failure = message.slice(0, 300);
    console.error("Official market update failed", message);
    return response({ ok: false, error: message, preservedPreviousBatch: true }, 502);
  } finally {
    try {
      await database.prepare("UPDATE update_control SET lease_token = NULL, lease_until = 0, bootstrap_next_at = ?, bootstrap_error = ? WHERE id = 'bootstrap' AND lease_token = ?")
        .bind(successful ? 0 : Date.now() + 900_000, successful ? null : failure, leaseToken).run();
    } catch (error) {
      console.error("Unable to release market update lease", error);
    }
  }
}
