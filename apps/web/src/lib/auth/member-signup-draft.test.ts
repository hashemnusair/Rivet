import { afterEach, describe, expect, it } from "vitest";
import { clearMemberSignupDraft, readMemberSignupDraft, saveMemberSignupDraft } from "./member-signup-draft";

const draft = { fullName: "Lina Haddad", email: "Lina@Example.com", phone: "+962 79 000 0000", gender: "female" as const, returnTo: "/customer/gyms/forge" };

describe("member sign-up draft", () => {
  afterEach(() => window.sessionStorage.clear());

  it("keeps the details for the same email, without the password", () => {
    saveMemberSignupDraft(draft, 1_000);
    expect(readMemberSignupDraft("lina@example.com", 2_000)).toEqual({ ...draft, email: "lina@example.com" });
    expect(window.sessionStorage.getItem("rivet:member-signup-draft")).not.toContain("password");
  });

  it("ignores another account, an old draft and a cleared one", () => {
    saveMemberSignupDraft(draft, 1_000);
    expect(readMemberSignupDraft("someone@example.com", 2_000)).toBeUndefined();
    expect(readMemberSignupDraft("lina@example.com", 1_000 + 61 * 60 * 1000)).toBeUndefined();
    clearMemberSignupDraft();
    expect(readMemberSignupDraft("lina@example.com", 2_000)).toBeUndefined();
  });

  it("drops a return path that leaves RIVET", () => {
    saveMemberSignupDraft({ ...draft, returnTo: "https://evil.example" }, 1_000);
    expect(readMemberSignupDraft("lina@example.com", 2_000)?.returnTo).toBeUndefined();
  });
});
