import { describe, expect, it } from "vitest";

import { resolveMemberActionLink } from "./member-header";

const allowed = { canCollect: true, canSell: true, hasRenewableMembership: true, outstandingAmount: 25_000 };

describe("member action deep links", () => {
  it("opens collection and renewal only when the actor and account allow them", () => {
    expect(resolveMemberActionLink(new URLSearchParams("action=collect"), allowed)).toBe("collect");
    expect(resolveMemberActionLink(new URLSearchParams("action=renew"), allowed)).toBe("renew");
    expect(resolveMemberActionLink(new URLSearchParams("action=collect"), { ...allowed, canCollect: false })).toBeNull();
    expect(resolveMemberActionLink(new URLSearchParams("action=collect"), { ...allowed, outstandingAmount: 0 })).toBeNull();
    expect(resolveMemberActionLink(new URLSearchParams("action=renew"), { ...allowed, hasRenewableMembership: false })).toBeNull();
  });

  it("treats an expired term as renewable so the Today queue link still opens the renewal", () => {
    // An expired term is still the renewal target: the server renews it with lineage.
    expect(resolveMemberActionLink(new URLSearchParams("action=renew"), { ...allowed, hasRenewableMembership: true })).toBe("renew");
  });

  it("preserves the existing sell-membership link for members without a renewable term", () => {
    expect(resolveMemberActionLink(new URLSearchParams("sell=1"), { ...allowed, hasRenewableMembership: false })).toBe("sell");
    expect(resolveMemberActionLink(new URLSearchParams("sell=1"), { ...allowed, hasRenewableMembership: true })).toBeNull();
  });
});
