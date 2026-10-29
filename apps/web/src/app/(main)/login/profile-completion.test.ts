import { describe, expect, it } from "vitest";
import { profileCompletionSchema } from "./profile-completion.client";

describe("profile completion", () => {
  it("requires both first and last name", () => {
    expect(profileCompletionSchema.safeParse({ firstName: "Hashem", lastName: "" }).success).toBe(false);
    expect(profileCompletionSchema.safeParse({ firstName: "", lastName: "Nusair" }).success).toBe(false);
  });

  it("trims the completed profile before saving", () => {
    expect(profileCompletionSchema.parse({ firstName: "  Hashem ", lastName: " Nusair  " })).toEqual({
      firstName: "Hashem",
      lastName: "Nusair",
    });
  });
});
