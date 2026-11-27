import { db, response, rows } from "@/lib/market";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const run = (await rows<any>(db().prepare("SELECT market_date AS marketDate, updated_at AS updatedAt, szse_status AS szseStatus, sse_status AS sseStatus FROM market_runs WHERE active = 1 LIMIT 1")))[0] ?? null;
    const control = (await rows<any>(db().prepare("SELECT lease_until AS leaseUntil, bootstrap_next_at AS retryAt, bootstrap_last_attempt AS lastAttempt, bootstrap_error AS lastError FROM update_control WHERE id = 'bootstrap' LIMIT 1")))[0] ?? null;
    return response({ ready: Boolean(run), ...run, initializing: !run && Number(control?.leaseUntil ?? 0) > Date.now(), bootstrap: control });
  } catch (error) {
    return response({ ready: false, error: error instanceof Error ? error.message : "状态读取失败" }, 503);
  }
}
