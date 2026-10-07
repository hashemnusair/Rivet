import { v } from "convex/values";
import { internalAction } from "./_generated/server";

/** Compatibility target for already scheduled invocations. The provider sender
 * has been removed, so retained settings/queued history cannot send anything. */
export const processDue = internalAction({
  args: {},
  returns: v.object({ processed: v.number(), disabled: v.boolean() }),
  handler: async () => ({ processed: 0, disabled: true }),
});
