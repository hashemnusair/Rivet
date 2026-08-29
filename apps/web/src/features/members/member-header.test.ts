import { describe, expect, it } from "vitest";

import { resolveMemberActionLink } from "./member-header";

const allowed = { canCollect: true, canSell: true, hasCurrentMembership: true, outstandingAmount: 25_000 };

describe("member action deep links", () => {
  it("opens collection and renewal only when the actor and account allow them", () => {
    expect(resolveMemberActionLink(new URLSearchParams("action=collect"), allowed)).toBe("collect");
    expect(resolveMemberActionLink(new URLSearchParams("action=renew"), allowed)).toBe("renew");
    expect(resolveMemberActionLink(new URLSearchParams("action=collect"), { ...allowed, canCollect: false })).toBeNull();
    expect(resolveMemberActionLink(new URLSearchParams("action=collect"), { ...allowed, outstandingAmount: 0 })).toBeNull();
    expect(resolveMemberActionLink(new URLSearchParams("action=renew"), { ...allowed, hasCurrentMembership: false })).toBeNull();
  });

  it("preserves the existing sell-membership link for members without a current term", () => {
    expect(resolveMemberActionLink(new URLSearchParams("sell=1"), { ...allowed, hasCurrentMembership: false })).toBe("sell");
    expect(resolveMemberActionLink(new URLSearchParams("sell=1"), { ...allowed, hasCurrentMembership: true })).toBeNull();
  });
});
