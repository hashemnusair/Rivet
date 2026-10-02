import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import { api } from "./_generated/api";
import schema from "./schema";
const modules = import.meta.glob("./**/*.ts");
describe("personal UI language boundary", () => {
  it("updates only the authenticated account and rejects a stale account request", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async ctx => {
      const fields = { email: "locale@example.invalid", fullName: "Language test", platformAdmin: false, status: "active" as const, createdAt: 1, updatedAt: 1 };
      return Promise.all([ctx.db.insert("users", { ...fields, publicId: "locale-a", authSubject: "a" }), ctx.db.insert("users", { ...fields, publicId: "locale-b", authSubject: "b" })]);
    });
    await t.withIdentity({ subject: "a" }).mutation(api.users.setUiLocale, { locale: "ar", accountId: "a" });
    expect(await t.withIdentity({ subject: "a" }).query(api.users.current, {})).toMatchObject({ uiLocale: "ar" });
    await expect(t.withIdentity({ subject: "b" }).mutation(api.users.setUiLocale, { locale: "ar", accountId: "a" })).rejects.toMatchObject({ data: expect.objectContaining({ code: "ACCOUNT_CHANGED" }) });
    expect(await t.run(async ctx => ctx.db.get(ids[1]))).not.toHaveProperty("uiLocale");
    await expect(t.mutation(api.users.setUiLocale, { locale: "ar", accountId: "a" })).rejects.toThrow();
  });
  it.each(["invited", "deactivated"] as const)("does not permit %s accounts to write preferences", async status => {
    const t = convexTest(schema, modules);
    await t.run(ctx => ctx.db.insert("users", { authSubject: "inactive", email: "inactive@example.invalid", fullName: "Inactive", platformAdmin: false, status, createdAt: 1, updatedAt: 1 }));
    await expect(t.withIdentity({ subject: "inactive" }).mutation(api.users.setUiLocale, { locale: "ar", accountId: "inactive" })).rejects.toThrow();
  });
});
