import { env } from "cloudflare:workers";

export type Candle = { date: string; open: number; high: number; low: number; close: number; volume: number };
export type Stock = { exchange: "SZSE" | "SSE"; board: "创业板" | "科创板"; code: string; name: string; listingDate?: string };
export type Price = Candle & { exchange: Stock["exchange"]; code: string; prevClose?: number; limitExempt?: boolean };
export type D1 = NonNullable<typeof env.DB>;

export function db(): D1 {
  if (!env.DB) throw new Error("D1 binding DB is unavailable");
  return env.DB;
}

export function response(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function rows<T>(statement: D1PreparedStatement): Promise<T[]> {
  const result = await statement.all<T>();
  return result.results ?? [];
}

export function jsonpJson(text: string): any {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("Official SSE endpoint returned non-JSON data");
  return JSON.parse(text.slice(start, end + 1));
}

export function dateDigits(value: unknown): string {
  const s = String(value ?? "").replace(/\D/g, "");
  if (s.length >= 8) return s.slice(0, 8);
  return "";
}

export function latestPrice(prices: Price[], code: string, date: string) {
  return prices.find(p => p.code === code && p.date === date && p.close > 0);
}

export function change(close: number, base: number) {
  return ((close / base) - 1) * 100;
}

export function ymd(date: Date) {
  return `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}${String(date.getUTCDate()).padStart(2, "0")}`;
}

export function calendarMonthBefore(yyyymmdd: string) {
  const y = Number(yyyymmdd.slice(0, 4)), m = Number(yyyymmdd.slice(4, 6)), d = Number(yyyymmdd.slice(6, 8));
  const targetMonth = m - 2;
  const year = y + Math.floor(targetMonth / 12);
  const month = ((targetMonth % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return `${year}${String(month + 1).padStart(2, "0")}${String(Math.min(d, lastDay)).padStart(2, "0")}`;
}

export function mondayOf(yyyymmdd: string) {
  const d = new Date(Date.UTC(Number(yyyymmdd.slice(0, 4)), Number(yyyymmdd.slice(4, 6)) - 1, Number(yyyymmdd.slice(6, 8))));
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return ymd(d);
}

export function monthBase(prices: Price[], code: string, exchange: string, target: string) {
  return prices.filter(p => p.code === code && p.exchange === exchange && p.date <= target && p.close > 0).sort((a, b) => b.date.localeCompare(a.date))[0];
}

export function weekBase(prices: Price[], code: string, exchange: string, weekStart: string) {
  return prices.filter(p => p.code === code && p.exchange === exchange && p.date < weekStart && p.close > 0).sort((a, b) => b.date.localeCompare(a.date))[0];
}

export function chunks<T>(input: T[], size: number) {
  const result: T[][] = [];
  for (let i = 0; i < input.length; i += size) result.push(input.slice(i, i + size));
  return result;
}
