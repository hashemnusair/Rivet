import { fetchQuery } from "convex/nextjs";
import { api } from "../../../../convex/_generated/api";

export const dynamic = "force-dynamic";

/** How long Convex may take before the check reports it unreachable. */
export const CONVEX_HEALTH_TIMEOUT_MS = 5000;

const HEADERS = { "Cache-Control": "no-store" };

/**
 * For an uptime monitor: one public address that answers only when the
 * website and Convex both do. It reads Convex's own `health:check` query,
 * which touches no data, and returns no data or configuration of its own.
 * 503 when Convex does not answer in time, so the monitor alerts.
 */
export async function GET(): Promise<Response> {
  const checkedAt = new Date().toISOString();
  if (!process.env.NEXT_PUBLIC_CONVEX_URL) return Response.json({ status: "ok", web: "ok", convex: "not_configured", checkedAt }, { headers: HEADERS });
  try {
    const result = await Promise.race([
      fetchQuery(api.health.check, {}),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), CONVEX_HEALTH_TIMEOUT_MS)),
    ]);
    const convex = result.status === "ok" ? "ok" : "unexpected";
    return Response.json({ status: convex === "ok" ? "ok" : "degraded", web: "ok", convex, checkedAt }, { status: convex === "ok" ? 200 : 503, headers: HEADERS });
  } catch {
    return Response.json({ status: "degraded", web: "ok", convex: "unreachable", checkedAt }, { status: 503, headers: HEADERS });
  }
}
