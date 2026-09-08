import type { Doc } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

const SCAN_LIMIT = 100;
export type MessageSource = "automation" | "renewal";
type Candidate = { source: "automation"; row: Doc<"domainRecords"> } | { source: "renewal"; row: Doc<"renewalDeliveries"> };

/** Index existing nested fields so deployment backfills indexes, not duplicate data. */
export async function dueMessageCandidates(ctx: MutationCtx, now: number, first: MessageSource): Promise<Candidate[]> {
  const channels = ["whatsapp", "sms"] as const;
  const automationPages = await Promise.all(channels.flatMap(channel => [
    ...(["queued", "retrying"] as const).map(status => ctx.db.query("domainRecords")
      .withIndex("by_message_due", q => q.eq("entityType", "messageDelivery").eq("data.status", status).eq("data.channel", channel).lte("data.nextAttemptAt", new Date(now).toISOString()))
      .take(SCAN_LIMIT)),
    ctx.db.query("domainRecords")
      .withIndex("by_message_lease", q => q.eq("entityType", "messageDelivery").eq("data.status", "leased").eq("data.channel", channel).lte("data.leaseExpiresAt", now))
      .take(SCAN_LIMIT),
  ]));
  const renewalPages = await Promise.all(channels.map(channel => ctx.db.query("renewalDeliveries")
    .withIndex("by_status_channel_due", q => q.eq("status", "queued").eq("channel", channel).lte("nextAttemptAt", now))
    .take(SCAN_LIMIT)));
  const automation = automationPages.flat().sort((a, b) => automationDueAt(a) - automationDueAt(b) || a._creationTime - b._creationTime);
  const renewal = renewalPages.flat().sort((a, b) => (a.nextAttemptAt ?? 0) - (b.nextAttemptAt ?? 0) || a._creationTime - b._creationTime);
  const candidates: Candidate[] = [];
  for (let i = 0; i < Math.max(automation.length, renewal.length); i += 1) {
    const a = automation[i];
    const r = renewal[i];
    const pair: Candidate[] = [];
    if (a) pair.push({ source: "automation", row: a });
    if (r) pair.push({ source: "renewal", row: r });
    candidates.push(...(first === "renewal" ? pair.reverse() : pair));
  }
  return candidates;
}

function automationDueAt(row: Doc<"domainRecords">): number {
  const data = row.data as Record<string, unknown>;
  if (data.status === "leased" && typeof data.leaseExpiresAt === "number") return data.leaseExpiresAt;
  const parsed = typeof data.nextAttemptAt === "string" ? Date.parse(data.nextAttemptAt) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}
