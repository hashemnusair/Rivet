import { v } from "convex/values";

/**
 * Storage shape of a system message descriptor (see
 * src/lib/i18n/system-messages.ts). Optional beside the original text on
 * notifications and timeline events; readers that do not know it ignore it.
 */
const systemMessageParam = v.union(
  v.string(),
  v.number(),
  v.object({ date: v.string() }),
  v.object({ at: v.string() }),
  v.object({ clock: v.string() }),
  v.object({ amountMinor: v.number(), currency: v.string() }),
  v.object({ enum: v.string(), value: v.string() }),
  v.object({ message: v.object({ key: v.string(), params: v.optional(v.record(v.string(), v.any())) }) }),
);

export const systemMessageValidator = v.object({ key: v.string(), params: v.optional(v.record(v.string(), systemMessageParam)) });
