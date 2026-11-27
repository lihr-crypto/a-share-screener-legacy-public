import { db, response, rows } from "@/lib/market";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const database = db();
    const run = (await rows<any>(database.prepare("SELECT id, market_date AS marketDate, updated_at AS updatedAt, week_start AS weekStart, month_target AS monthTarget FROM market_runs WHERE active = 1 LIMIT 1")))[0];
    if (!run) {
      const control = (await rows<any>(database.prepare("SELECT lease_until AS leaseUntil, bootstrap_next_at AS retryAt, bootstrap_error AS bootstrapError FROM update_control WHERE id = 'bootstrap' LIMIT 1")))[0];
      return response({ marketDate: null, updatedAt: null, weekStart: null, monthTarget: null, rows: [], counts: {}, initializing: Number(control?.leaseUntil ?? 0) > Date.now(), retryAt: control?.retryAt ?? null, error: control?.bootstrapError ? "官方行情初始化暂未成功，将在稍后重试。" : "正在等待交易所官方数据首次初始化。" });
    }
    const evaluated = (await rows<any>(database.prepare("SELECT COUNT(*) AS count FROM screen_rows WHERE run_id = ? AND limit_up_count IS NOT NULL").bind(run.id)))[0]?.count ?? 0;
    if (!evaluated) return response({ ...run, rows: [], counts: {}, initializing: true, error: "正在等待交易所官方行情按新条件重新计算。" });
    const data = await rows<any>(database.prepare("SELECT exchange, board, code, name, close, month_change AS monthChange, week_change AS weekChange, month_base_date AS monthBaseDate, week_base_date AS weekBaseDate, limit_up_count AS limitUpCount, pullback_percent AS pullbackPercent, sufficient, matched FROM screen_rows WHERE run_id = ? AND ((matched = 1 AND limit_up_count BETWEEN 1 AND 3 AND pullback_percent <= 10) OR sufficient = 0) ORDER BY board, code").bind(run.id));
    const counts: Record<string, { matched: number; insufficient: number }> = {};
    for (const board of ["创业板", "科创板"]) {
      const count = (await rows<any>(database.prepare("SELECT SUM(CASE WHEN matched = 1 AND limit_up_count BETWEEN 1 AND 3 AND pullback_percent <= 10 THEN 1 ELSE 0 END) AS matched, SUM(CASE WHEN sufficient = 0 THEN 1 ELSE 0 END) AS insufficient FROM screen_rows WHERE run_id = ? AND board = ?").bind(run.id, board)))[0];
      counts[board] = { matched: Number(count?.matched ?? 0), insufficient: Number(count?.insufficient ?? 0) };
    }
    return response({ ...run, rows: data.filter(row => row.matched === 1), counts, initializing: false });
  } catch (error) {
    return response({ marketDate: null, updatedAt: null, weekStart: null, monthTarget: null, rows: [], counts: {}, error: error instanceof Error ? error.message : "筛选数据暂时不可用" }, 503);
  }
}
