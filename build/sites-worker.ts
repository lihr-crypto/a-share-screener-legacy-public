import handler from "vinext/server/fetch-handler";
import { runWithConnectorBinding } from "../lib/connector-context";
import type { ConnectorBinding } from "../lib/connector-contract.mjs";

export default {
  fetch(request: Request, env: Cloudflare.Env, ctx: ExecutionContext<{ CONNECTORS?: ConnectorBinding }>) {
    let binding = ctx.props?.CONNECTORS;
    // Local preview emulates the same request-scoped capability. This branch and
    // the auxiliary service binding are absent from production builds.
    if (import.meta.env.DEV && !binding && env.CONNECTORS) {
      const preview = env.CONNECTORS;
      const expiresAt = Date.now() + 60_000;
      binding = {
        async getContext() {
          if (Date.now() >= expiresAt) return { status: "request_context_expired" };
          return preview.getContext?.() ?? { status: "binding_unavailable" };
        },
        async invoke(connectorId, actionName, args) {
          if (Date.now() >= expiresAt) {
            return { status: "request_context_expired", message: "This request has expired. Please try again." };
          }
          return preview.invoke(connectorId, actionName, args);
        },
      };
    }
    if (request.method === "GET" && new URL(request.url).pathname === "/api/screen") {
      ctx.waitUntil(bootstrapIfMissingCriteria(env, ctx));
    }
    return runWithConnectorBinding(binding, () => handler.fetch(request, env, ctx));
  },
};

async function bootstrapIfMissingCriteria(env: Cloudflare.Env, ctx: ExecutionContext) {
  const database = env.DB;
  if (!database || !env.UPDATE_TOKEN) return;
  try {
    const active = await database.prepare("SELECT r.id, (SELECT COUNT(*) FROM screen_rows s WHERE s.run_id = r.id AND s.limit_up_count IS NOT NULL) AS evaluated FROM market_runs r WHERE r.active = 1 LIMIT 1").first<{ id: string; evaluated: number }>();
    // Additive migrations leave legacy rows with NULL new criteria; refresh them once like an empty database.
    const hasCurrentCriteria = Boolean(active && Number(active.evaluated) > 0);
    if (hasCurrentCriteria) return;
    const now = Date.now();
    const leaseToken = crypto.randomUUID();
    await database.prepare("INSERT OR IGNORE INTO update_control (id, lease_token, lease_until, bootstrap_next_at) VALUES ('bootstrap', NULL, 0, 0)").run();
    const claimed = await database.prepare("UPDATE update_control SET lease_token = ?, lease_until = ?, bootstrap_next_at = ?, bootstrap_last_attempt = ?, bootstrap_error = NULL WHERE id = 'bootstrap' AND lease_until <= ? AND bootstrap_next_at <= ?")
      .bind(leaseToken, now + 600_000, now + 900_000, now, now, now).run();
    if (claimed.meta.changes !== 1) return;
    const request = new Request("https://site.internal/api/update", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.UPDATE_TOKEN}`,
        "X-Internal-Bootstrap-Lease": leaseToken,
      },
    });
    const result = await handler.fetch(request, env, ctx);
    if (!result.ok) console.error("Initial official market data bootstrap failed", result.status);
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 300) : "initialization failed";
    console.error("Initial official market data bootstrap failed", message);
    try {
      await database.prepare("INSERT OR IGNORE INTO update_control (id, lease_token, lease_until, bootstrap_next_at) VALUES ('bootstrap', NULL, 0, 0)").run();
      await database.prepare("UPDATE update_control SET lease_token = NULL, lease_until = 0, bootstrap_next_at = ?, bootstrap_error = ? WHERE id = 'bootstrap'")
        .bind(Date.now() + 900_000, message).run();
    } catch (releaseError) {
      console.error("Unable to record bootstrap failure", releaseError);
    }
  }
}
