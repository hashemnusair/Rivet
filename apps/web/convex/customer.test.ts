import { describe, expect, it } from "vitest";
import { buildCustomerProfileDraft, customerProfileOwnership, findCustomerProfileByUserId } from "./customer";

describe("authenticated customer identity invariants", () => {
  it("does not match a profile by an attacker-controlled email", () => {
    const profiles = [{ userId: "user-b", id: "profile-b", email: "b@example.com" }];

    expect(findCustomerProfileByUserId(profiles, "user-a")).toBeUndefined();
    expect(
      buildCustomerProfileDraft(
        { userId: "user-a", email: "a@example.com", fullName: "User A" },
        { fullName: "User A", email: "b@example.com", phone: "+962 79 000 0000" },
        "profile-a",
      ),
    ).toMatchObject({ id: "profile-a", userId: "user-a", email: "a@example.com" });
  });

  it("derives trial ownership from the authenticated profile", () => {
    expect(customerProfileOwnership("user-a", "profile-a")).toEqual({ customerUserId: "user-a", customerId: "profile-a" });
    expect(customerProfileOwnership("user-b", "profile-b")).not.toEqual({ customerUserId: "user-a", customerId: "profile-b" });
  });
});
