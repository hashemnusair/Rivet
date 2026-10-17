import { describe, expect, it } from "vitest";
import {
  AMMAN_PILOT_PROSPECTS,
  PROSPECT_STAGES,
  followUpState,
  instagramHandle,
  nextProspectCode,
  nextProspectStage,
  normalizeProspectChanges,
  phoneHref,
  prospectChangeList,
  prospectStageGroup,
  sameGymName,
  whatsappDigits,
  whatsappHref,
} from "./prospects";

describe("prospect rules", () => {
  it("puts every stage in exactly one filter group and only moves open deals forward", () => {
    expect(PROSPECT_STAGES.map(prospectStageGroup)).toEqual(["to_contact", "in_talks", "in_talks", "in_talks", "pilot", "pilot", "pilot", "closed", "closed"]);
    expect(nextProspectStage("not_contacted")).toBe("contacted");
    expect(nextProspectStage("pilot_active")).toBe("paid");
    expect(nextProspectStage("paid")).toBeUndefined();
    expect(nextProspectStage("not_interested")).toBeUndefined();
  });

  it("checks only the fields it is given and trims them", () => {
    expect(normalizeProspectChanges({ nextAction: "  Call Sunday  " })).toEqual({ values: { nextAction: "Call Sunday" }, fieldErrors: {} });
    expect(normalizeProspectChanges({ gymName: " ", phone: "abc", email: "x@", followUpOn: "2026-02-30", stage: "won", sources: ["https://a.example", "https://a.example", " "] })).toEqual({
      values: { sources: ["https://a.example"] },
      fieldErrors: { gymName: "required", phone: "invalidPhone", email: "invalidEmail", followUpOn: "invalidDate", stage: "invalidChoice" },
    });
    expect(normalizeProspectChanges({ followUpOn: "", ownerId: "" }).values).toEqual({ followUpOn: "", ownerId: "" });
    expect(normalizeProspectChanges({ sources: Array.from({ length: 7 }, (_, index) => `https://s${index}.example`) }).fieldErrors).toEqual({ sources: "tooMany" });
    expect(normalizeProspectChanges({ instagram: "javascript:alert(1)" }).fieldErrors).toEqual({ instagram: "invalidUrl" });
  });

  it("lists only real changes for history", () => {
    expect(prospectChangeList({ stage: "contacted", notes: "a", sources: ["x"] }, { stage: "contacted", notes: "b", sources: ["x"], followUpOn: "" })).toEqual([{ field: "notes", from: "a", to: "b" }]);
  });

  it("builds WhatsApp links from numbers written any way", () => {
    expect(whatsappDigits("+962 79 097 9998")).toBe("962790979998");
    expect(whatsappDigits("0785424553")).toBe("962785424553");
    expect(whatsappDigits("00962 78 177 3917")).toBe("962781773917");
    expect(whatsappHref("+962 79 097 9998", "مرحبا")).toBe("https://wa.me/962790979998?text=%D9%85%D8%B1%D8%AD%D8%A8%D8%A7");
    expect(whatsappHref("+962 79 097 9998", "  ")).toBe("https://wa.me/962790979998");
  });

  it("reads numbers without a country code as Jordanian and keeps explicit codes", () => {
    // Each of these passes the form's phone check; before, the first three
    // opened +7 (Russia), +06… and +9620… instead of the gym.
    expect(whatsappDigits("79 097 9998")).toBe("962790979998");
    expect(phoneHref("79 097 9998")).toBe("tel:+962790979998");
    expect(phoneHref("06 585 0000")).toBe("tel:+96265850000");
    expect(whatsappDigits("+962 (0) 79 097 9998")).toBe("962790979998");
    expect(whatsappDigits("962 79 097 9998")).toBe("962790979998");
    expect(whatsappDigits("٠٧٩٠٩٧٩٩٩٨")).toBe("962790979998");
    expect(whatsappDigits("+44 20 7946 0958")).toBe("442079460958");
    expect(whatsappDigits("0044 20 7946 0958")).toBe("442079460958");
  });

  it("numbers new gyms after the highest reference and spots duplicate names", () => {
    expect(nextProspectCode(AMMAN_PILOT_PROSPECTS.map((row) => row.code))).toBe("AMM-013");
    expect(nextProspectCode([])).toBe("AMM-001");
    expect(sameGymName("Body Life Gym & Boxing", "body life gym  boxing")).toBe(true);
    expect(sameGymName("Onyx Gym", "Onyx Gym 2")).toBe(false);
    expect(instagramHandle("https://www.instagram.com/onyxgym.jo/")).toBe("@onyxgym.jo");
  });

  it("compares follow-up dates on the calendar", () => {
    expect(followUpState("2026-10-14", "2026-10-15")).toBe("overdue");
    expect(followUpState("2026-10-15", "2026-10-15")).toBe("today");
    expect(followUpState("2026-10-16", "2026-10-15")).toBe("upcoming");
    expect(followUpState("", "2026-10-15")).toBeUndefined();
  });

  it("keeps the bundled Amman list valid under its own rules", () => {
    expect(AMMAN_PILOT_PROSPECTS).toHaveLength(12);
    expect(new Set(AMMAN_PILOT_PROSPECTS.map((row) => row.code)).size).toBe(12);
    for (const { code: _code, ...fields } of AMMAN_PILOT_PROSPECTS) expect(normalizeProspectChanges(fields).fieldErrors).toEqual({});
  });
});
