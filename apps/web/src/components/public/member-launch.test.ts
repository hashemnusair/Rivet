import { describe, expect, it } from "vitest";
import { memberAppOpening } from "./member-launch";

type Input = Parameters<typeof memberAppOpening>[0];
const member: Input["identity"] = { status: "ready", platformAdmin: false, gymAccessUnavailable: false, memberships: [] };
const base: Input = { protectedRoute: true, previewSessionReady: true, customerSignedIn: false, signedOut: false, identity: member, experienceStatus: "loading" };

describe("memberAppOpening", () => {
  it("waits on a member page until the member's record arrives", () => {
    expect(memberAppOpening({ ...base, identity: { ...member, status: "loading" } })).toBe(true);
    expect(memberAppOpening({ ...base, identity: { ...member, status: "pending" } })).toBe(true);
    expect(memberAppOpening(base)).toBe(true);
    expect(memberAppOpening({ ...base, customerSignedIn: true })).toBe(false);
  });

  it("waits for the preview to restore its member, on any page", () => {
    expect(memberAppOpening({ ...base, protectedRoute: false, previewSessionReady: false })).toBe(true);
  });

  it("never holds the public marketplace or a gym's page", () => {
    expect(memberAppOpening({ ...base, protectedRoute: false })).toBe(false);
  });

  it("keeps the mark while a signed-out visitor is sent to sign in", () => {
    expect(memberAppOpening({ ...base, signedOut: true, identity: { ...member, status: "anonymous" } })).toBe(true);
  });

  it("ends the wait when the answer is not a member, so the page can say what happened", () => {
    expect(memberAppOpening({ ...base, identity: { ...member, status: "error" } })).toBe(false);
    expect(memberAppOpening({ ...base, identity: { ...member, status: "demo" } })).toBe(false);
    expect(memberAppOpening({ ...base, identity: { ...member, platformAdmin: true } })).toBe(false);
    expect(memberAppOpening({ ...base, identity: { ...member, memberships: [{}] as Input["identity"]["memberships"] } })).toBe(false);
    // A member without a profile: the record arrived and named no one.
    expect(memberAppOpening({ ...base, experienceStatus: "ready" })).toBe(false);
    expect(memberAppOpening({ ...base, experienceStatus: "error" })).toBe(false);
  });
});
