import { describe, expect, it } from "vitest";
import {
  PROFILE_NONE,
  buildGymProfileReviewContext,
  buildLanguageGapState,
  buildProfileClaimState,
  languageGapEvidence,
  languageGapUnavailableReason,
  profileClaimEvidence,
  profileConceptsIn,
  profilePassages,
  profileUncheckedClaims,
  resolveLanguageGapFixture,
  resolveLanguageGapReading,
  resolveProfileClaimFixture,
  resolveProfileClaimReading,
  type ProfileDraftText,
  type ProfileRecordedServices,
} from "./profileAssist";

const SERVICES: ProfileRecordedServices = {
  branches: { count: 2, names: ["Abdoun", "Sweifieh"] },
  trainers: { publishedCount: 2, names: ["Coach A", "Coach B"], specialties: ["Strength"], languages: ["en", "ar"] },
  ptPackages: { count: 3, names: ["12 PT sessions", "20 PT sessions", "30 PT sessions"] },
  plans: { count: 2, names: ["Basic Monthly", "Flex Monthly"], freezeAvailable: false, multiBranchAccess: false, includedTraining: true },
  classes: { count: 4, names: ["Morning HIIT"] },
  amenities: ["Free weights", "Cardio", "Showers"],
  audience: "All members",
  category: "Strength & conditioning",
};

function context(draft: ProfileDraftText, services: ProfileRecordedServices = SERVICES) {
  return buildGymProfileReviewContext({ organizationId: "org-a", version: 3, status: "draft", updatedAt: "2026-09-20T12:00:00.000Z", draft, services, now: "2026-09-21T09:00:00.000Z" });
}

const choice = (judgment: ReturnType<typeof resolveProfileClaimFixture>) => (judgment?.kind === "choice" ? judgment.choice : undefined);

describe("profile passages and concepts", () => {
  it("cuts both languages into passages whose ids name the field and language", () => {
    const passages = profilePassages({ taglineEn: "Strength for everyone.", taglineAr: "قوة للجميع", descriptionEn: "Two branches. Free parking.", descriptionAr: "فرعان. موقف مجاني." });
    expect(passages.map((passage) => passage.id)).toEqual(["en:taglineEn:0", "en:descriptionEn:0", "en:descriptionEn:1", "ar:taglineAr:0", "ar:descriptionAr:0", "ar:descriptionAr:1"]);
    expect(passages[4]).toMatchObject({ lang: "ar", field: "descriptionAr", text: "فرعان." });
  });

  it("recognises the same concept in either language, including verb forms", () => {
    expect(profileConceptsIn("Freeze your membership when you travel").map((family) => family.id)).toEqual(["freeze"]);
    expect(profileConceptsIn("جمّد اشتراكك في أي وقت").map((family) => family.id)).toEqual(["freeze"]);
    expect(profileConceptsIn("Free parking at every branch").map((family) => family.id)).toEqual(expect.arrayContaining(["branches", "multi_branch", "parking"]));
    expect(profileConceptsIn("موقف سيارات مجاني").map((family) => family.id)).toEqual(["parking"]);
    // "Amman" must not read as MMA, and "we offer classes" is not a promotion.
    expect(profileConceptsIn("Two branches in Amman").map((family) => family.id)).toEqual(["branches"]);
    expect(profileConceptsIn("We offer group classes").map((family) => family.id)).toEqual(["classes"]);
  });
});

describe("claims against the recorded services", () => {
  it("flags counts, audience restrictions and plan terms the records contradict, and nothing the records are silent about", () => {
    const ctx = context({
      taglineEn: "Strength and conditioning across six branches.",
      descriptionEn: "Women only, with five certified coaches. Freeze your membership any time. Sauna, pool and free parking. Open 24/7.",
    });
    expect(profileClaimEvidence({ text: "Strength and conditioning across six branches." }, SERVICES)).toBe("Recorded: 2 active branches (Abdoun, Sweifieh).");
    expect(profileClaimEvidence({ text: "Women only, with five certified coaches." }, SERVICES)).toBe("Recorded: 2 published trainer profiles (Coach A, Coach B).");
    expect(profileClaimEvidence({ text: "Freeze your membership any time." }, SERVICES)).toBe("Recorded plans (Basic Monthly, Flex Monthly) allow no freeze days.");
    expect(profileClaimEvidence({ text: "Sauna, pool and free parking." }, SERVICES)).toBeUndefined();
    expect(profileClaimEvidence({ text: "Open 24/7." }, SERVICES)).toBeUndefined();
    const state = buildProfileClaimState({ context: ctx });
    expect(state.candidates.map((candidate) => candidate.id)).toEqual([...ctx.passages.map((passage) => passage.id), PROFILE_NONE]);
    const judgment = resolveProfileClaimFixture(state)!;
    const reading = resolveProfileClaimReading(judgment, ctx);
    expect(reading.clear).toBe(false);
    expect(reading.findings.map((finding) => finding.passage.text)).toEqual(["Strength and conditioning across six branches."]);
    expect(reading.findings[0]?.evidence).toBe("Recorded: 2 active branches (Abdoun, Sweifieh).");
    // Sauna, pool, parking and 24/7 are unknown, not false.
    const unchecked = profileUncheckedClaims(ctx);
    expect(unchecked.map((entry) => entry.passage.text)).toEqual(expect.arrayContaining(["Sauna, pool and free parking.", "Open 24/7."]));
    expect(unchecked.find((entry) => entry.passage.text === "Sauna, pool and free parking.")?.concepts).toEqual(expect.arrayContaining(["parking", "pool", "sauna or steam"]));
  });

  it("says none when the draft agrees with the records, even with claims the records cannot check", () => {
    const ctx = context({ taglineEn: "Two branches in Amman.", descriptionEn: "Two certified coaches, free weights and cardio. Free parking." });
    expect(choice(resolveProfileClaimFixture(buildProfileClaimState({ context: ctx })))).toBe(PROFILE_NONE);
    expect(resolveProfileClaimReading(resolveProfileClaimFixture(buildProfileClaimState({ context: ctx }))!, ctx).clear).toBe(true);
    const women = context({ taglineEn: "Women only.", descriptionEn: "Ladies-only floor." }, { ...SERVICES, audience: "Women" });
    expect(choice(resolveProfileClaimFixture(buildProfileClaimState({ context: women })))).toBe(PROFILE_NONE);
    const noPlans = context({ taglineEn: "Freeze any time.", descriptionEn: "Every branch." }, { ...SERVICES, plans: { count: 0, names: [], freezeAvailable: false, multiBranchAccess: false, includedTraining: false } });
    expect(choice(resolveProfileClaimFixture(buildProfileClaimState({ context: noPlans })))).toBe(PROFILE_NONE);
  });

  it("drops a flagged id the current draft no longer carries", () => {
    const ctx = context({ taglineEn: "Six branches.", descriptionEn: "Great gym." });
    const judgment = resolveProfileClaimFixture(buildProfileClaimState({ context: ctx }))!;
    expect(choice(judgment)).toBe("en:taglineEn:0");
    const edited = context({ taglineEn: "Two branches.", descriptionEn: "Great gym." });
    expect(resolveProfileClaimReading(judgment, edited).findings).toEqual([expect.objectContaining({ passage: expect.objectContaining({ text: "Two branches." }) })]);
    const shorter = context({ taglineEn: "", descriptionEn: "Great gym." });
    expect(resolveProfileClaimReading(judgment, shorter).findings).toEqual([]);
  });
});

describe("differences between the languages", () => {
  it("does not flag a legitimate paraphrase", () => {
    const ctx = context({
      taglineEn: "Strength training and cardio for everyone.",
      taglineAr: "تدريب قوة وكارديو للجميع",
      descriptionEn: "Two branches in Amman with certified coaches and showers.",
      descriptionAr: "فرعان في عمّان مع مدربين معتمدين وحمامات.",
    });
    expect(languageGapUnavailableReason(ctx)).toBeUndefined();
    const judgment = resolveLanguageGapFixture(buildLanguageGapState({ context: ctx }))!;
    expect(choice(judgment)).toBe(PROFILE_NONE);
    expect(resolveLanguageGapReading(judgment, ctx).aligned).toBe(true);
  });

  it("flags a service, restriction or number one language states and the other does not", () => {
    const ctx = context({
      taglineEn: "Strength and conditioning for everyone.",
      taglineAr: "قوة ولياقة للجميع",
      descriptionEn: "Freeze your membership when you travel. Free parking at every branch.",
      descriptionAr: "جمّد اشتراكك عندما تسافر. للسيدات فقط بعد الساعة 6.",
    });
    const judgment = resolveLanguageGapFixture(buildLanguageGapState({ context: ctx }))!;
    const reading = resolveLanguageGapReading(judgment, ctx);
    expect(reading.aligned).toBe(false);
    expect(reading.findings.map((finding) => finding.passage.text)).toEqual(["Free parking at every branch."]);
    expect(reading.findings[0]?.evidence).toBe("This passage mentions branch count, access to every branch, parking; the Arabic text does not.");
    expect(languageGapEvidence({ lang: "ar", text: "جمّد اشتراكك عندما تسافر." }, ctx)).toBeUndefined();
  });

  it("refuses the comparison when one language is missing", () => {
    const ctx = context({ taglineEn: "Strength for everyone.", descriptionEn: "Two branches." });
    expect(languageGapUnavailableReason(ctx)).toBe("Add an Arabic tagline or description to compare the two languages.");
  });
});


it("does not promote Choice alternatives to findings or clear an invalid selected passage", () => {
  const ctx = context({ taglineEn: "", descriptionEn: "Six branches. Free parking." });
  const [first, second] = ctx.passages;
  const judgment = { kind: "choice" as const, choice: first!.id, probabilities: { [first!.id]: 0.51, [second!.id]: 0.49 } };
  for (const read of [resolveProfileClaimReading, resolveLanguageGapReading]) {
    expect(read(judgment, ctx).findings.map((item) => item.passage.id)).toEqual([first!.id]);
    expect(read({ ...judgment, choice: "missing" }, ctx).findings).toEqual([]);
  }
  expect(resolveProfileClaimReading({ ...judgment, choice: "missing" }, ctx).clear).toBe(false);
  expect(resolveLanguageGapReading({ ...judgment, choice: "missing" }, ctx).aligned).toBe(false);
});
