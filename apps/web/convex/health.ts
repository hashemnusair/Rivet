import { query } from "./_generated/server";

export const check = query({
  args: {},
  handler: async () => ({
    status: "ok" as const,
    serverTime: Date.now(),
  }),
});
