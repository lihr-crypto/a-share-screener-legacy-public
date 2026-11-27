import { db, response, rows } from "@/lib/market";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const exchange = url.searchParams.get("exchange");
  const code = url.searchParams.get("code");
  if (!((exchange === "SZSE" || exchange === "SSE") && code && /^\d{6}$/.test(code))) return response({ error: "invalid symbol", candles: [] }, 400);
  try {
    const result = await rows<any>(db().prepare("SELECT p.trade_date AS date, p.open, p.high, p.low, p.close, p.volume FROM daily_prices p JOIN market_runs r ON r.id = p.run_id WHERE r.active = 1 AND p.exchange = ? AND p.code = ? ORDER BY p.trade_date DESC LIMIT 35").bind(exchange, code));
    return response({ candles: result.reverse() });
  } catch (error) {
    return response({ error: error instanceof Error ? error.message : "日线暂时不可用", candles: [] }, 503);
  }
}
