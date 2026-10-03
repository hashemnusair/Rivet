import { beforeEach, describe, expect, it } from "vitest";
import { MockGymOSApi } from "./MockGymOSApi";
import { addDays, todayISODate } from "@/lib/utils/dates";
import { createTranslator } from "@/lib/i18n/core";
import { makeFormatters } from "@/lib/i18n/formatters";
import { isRenderableSystemMessage, presentNotification, presentTimelineEvent, systemMessage, type SystemTextContext } from "@/lib/i18n/system-messages";
import { money } from "@/lib/utils/money";
import type * as T from "@/lib/domain/types";

const context = (locale: "en" | "ar"): SystemTextContext => ({
  locale,
  t: createTranslator(locale),
  format: makeFormatters(locale, "2026-10-03T12:00:00.000Z", "Asia/Amman"),
});
const EN = context("en");
const AR = context("ar");
const stripBidi = (value: string) => value.replace(/[\u2066-\u2069]/g, "");

let api: MockGymOSApi;

beforeEach(async () => {
  api = new MockGymOSApi();
  api.setBehavior({ latencyMs: 0 });
  await api.switchDemoRole("owner");
});

async function activeMembers(count: number): Promise<Array<{ memberId: string; membershipId: string; name: string }>> {
  const page = await api.listMembers({ membershipStatus: "active", pageSize: 50 });
  const picked: Array<{ memberId: string; membershipId: string; name: string }> = [];
  for (const member of page.items) {
    const memberships = await api.listMemberships({ memberId: member.id, status: "active", pageSize: 5 });
    const membership = memberships.items[0];
    if (membership) picked.push({ memberId: member.id, membershipId: membership.id, name: member.fullName });
    if (picked.length === count) break;
  }
  if (picked.length !== count) throw new Error(`Expected ${count} active memberships in the mock seed.`);
  return picked;
}

describe("mock system-message descriptors", () => {
  it("renders parameterized payment and membership events in Arabic while preserving English and authored reasons", async () => {
    const session = await api.getSession();
    const plan = (await api.listPlans({ status: "active", pageSize: 5 })).items[0];
    if (!plan) throw new Error("The mock seed must include an active membership plan.");
    const member = await api.createMember({
      fullName: "System Descriptor Member",
      phone: "+962790009801",
      homeBranchId: session.branches[0]!.id,
      preferredLanguage: "en",
      gender: "male",
    });
    const sale = await api.createMembershipSale({
      memberId: member.member.id,
      planId: plan.id,
      startDate: todayISODate(session.organization.timezone),
      payment: { amount: plan.basePrice, method: "card", externalReference: "MOCK-POS-SYSTEM-MESSAGE" },
    });

    const afterSale = (await api.listMemberTimeline(member.member.id, { pageSize: 30 })).items;
    const payment = afterSale.find((event) => event.type === "payment_collected");
    const membership = afterSale.find((event) => event.type === "membership_sold");
    expect(payment?.titleMessage).toBeDefined();
    expect(membership?.titleMessage).toBeDefined();
    expect(membership?.bodyMessage).toBeDefined();
    if (!payment || !membership) throw new Error("The sale should record payment and membership timeline events.");

    const paymentArabic = presentTimelineEvent(payment, AR);
    expect(stripBidi(paymentArabic.title)).toContain("تم استلام دفعة");
    expect(stripBidi(paymentArabic.title)).toContain("د.أ");
    expect(stripBidi(paymentArabic.title)).toContain("بطاقة");
    expect(presentTimelineEvent(payment, EN).title).toBe(payment.title);

    const membershipArabic = presentTimelineEvent(membership, AR);
    expect(stripBidi(membershipArabic.title)).toBe(`تم بيع اشتراك ${plan.name}`);
    expect(membershipArabic.body).toContain("المدة من");
    expect(presentTimelineEvent(membership, EN)).toEqual({ title: membership.title, body: membership.body });

    const authoredReason = "The member is changing work shifts.";
    await api.extendMembership(sale.membership.id, { days: 2, reason: authoredReason });
    const extended = (await api.listMemberTimeline(member.member.id, { pageSize: 30 })).items.find((event) => event.type === "membership_extended");
    expect(extended?.titleMessage).toBeDefined();
    expect(presentTimelineEvent(extended!, AR)).toEqual({ title: "تم تمديد الاشتراك يومين", body: authoredReason });
    expect(presentTimelineEvent(extended!, EN)).toEqual({ title: extended!.title, body: authoredReason });
    const audit = await api.listAuditEvents({ category: "memberships", entityId: sale.membership.id, pageSize: 10 });
    expect(audit.items).toContainEqual(expect.objectContaining({ action: "membership.date_override", reason: authoredReason }));

    const alternatePlan = (await api.listPlans({ status: "active", pageSize: 20 })).items.find((item) => item.id !== plan.id);
    if (!alternatePlan) throw new Error("The mock seed must include a second active plan.");
    const planChangeReason = "The member asked to move to a strength-focused plan.";
    const changed = await api.changeMembershipPlan(sale.membership.id, { planId: alternatePlan.id, effectiveDate: "immediate", reason: planChangeReason });
    const planChange = (await api.listMemberTimeline(member.member.id, { pageSize: 30 })).items.find((event) => event.type === "membership_plan_changed");
    expect(planChange?.bodyMessage?.key).toBe("communicationCompletion.timeline.membershipPlanChangeBody");
    if (!planChange) throw new Error("Changing plans should record a timeline event.");
    expect(presentTimelineEvent(planChange, AR).body).toContain(planChangeReason);
    expect(presentTimelineEvent(planChange, AR).body).toContain(AR.format.date(changed.membership.startDate));
    expect(presentTimelineEvent(planChange, EN).body).toBe(planChange.body);
  });

  it("localizes imported balance, payment evidence, and membership history without changing stored originals", async () => {
    const session = await api.getSession();
    const plan = (await api.listPlans({ status: "active", pageSize: 10 })).items.find((item) => item.kind === "time");
    if (!plan) throw new Error("The mock seed must include an active time-based plan.");
    const cutoff = "2026-08-30";
    const startDate = "2026-08-01";
    const endDate = "2099-09-07";
    const preview = await api.previewMemberImport({
      branchId: session.branches[0]!.id,
      migrationCutoffDate: cutoff,
      planMappings: { LegacyMonthly: plan.id },
      csv: "full_name,phone,gender,email,source_plan_name,membership_start_date,membership_end_date,opening_balance,historical_paid_total,historical_payment_date,historical_payment_reference\nDescriptor Import,0799911223,female,descriptor-import@example.com,LegacyMonthly,2026-08-01,2099-09-07,12.500,80.000,2026-08-20,OLD-44",
    });
    const committed = await api.commitMemberImport({ importId: preview.id, cursor: 0, chunkSize: 25, idempotencyKey: "system-message-import" });
    const memberId = committed.createdMemberIds[0];
    if (!memberId) throw new Error("The import should create its member.");
    const timeline = (await api.listMemberTimeline(memberId, { pageSize: 30 })).items;
    const openingBalance = timeline.find((event) => event.title.startsWith("Opening balance imported"));
    const paymentEvidence = timeline.find((event) => event.title.startsWith("Historical payment evidence imported"));
    const membershipHistory = timeline.find((event) => event.title.includes("membership history imported"));
    expect(openingBalance?.titleMessage?.key).toBe("communicationCompletion.timeline.openingBalanceImported");
    expect(openingBalance?.bodyMessage?.key).toBe("communicationCompletion.timeline.openingBalanceImportedBody");
    expect(paymentEvidence?.titleMessage?.key).toBe("communicationCompletion.timeline.historicalPaymentEvidenceImported");
    expect(paymentEvidence?.bodyMessage?.key).toBe("communicationCompletion.timeline.historicalPaymentEvidenceImportedBodyWithReference");
    expect(membershipHistory?.titleMessage?.key).toBe("communicationCompletion.timeline.membershipHistoryImported");
    expect(membershipHistory?.bodyMessage?.key).toBe("communicationCompletion.timeline.membershipHistoryImportedBody");
    if (!openingBalance || !paymentEvidence || !membershipHistory) throw new Error("The import should record its balance, payment evidence, and membership history.");
    expect(presentTimelineEvent(openingBalance, AR).title).toContain("تم استيراد الرصيد الافتتاحي");
    expect(presentTimelineEvent(openingBalance, AR).body).toContain(AR.format.date(cutoff));
    expect(presentTimelineEvent(paymentEvidence, AR).body).toContain("OLD-44");
    expect(presentTimelineEvent(paymentEvidence, AR).body).not.toContain("Read-only evidence");
    expect(presentTimelineEvent(membershipHistory, AR).title).toContain(plan.name);
    expect(presentTimelineEvent(membershipHistory, AR).body).toContain(AR.format.date(startDate));
    expect(presentTimelineEvent(membershipHistory, AR).body).toContain(AR.format.date(endDate));
    for (const event of [openingBalance, paymentEvidence, membershipHistory]) {
      expect(presentTimelineEvent(event, EN)).toEqual({ title: event.title, body: event.body });
    }
  });

  it("renders PT trainer parameters and retains the original event for English readers", async () => {
    await api.applyPtIntroductoryCredits({ sessionCount: 2, reason: "PT descriptor test credits", idempotencyKey: "pt-system-message-test" });
    const workspace = await api.getPtWorkspace();
    const trainer = workspace.trainers[0];
    const [member] = await activeMembers(1);
    if (!trainer || !member) throw new Error("The mock seed must include a trainer and active membership.");
    let date = addDays(todayISODate("Asia/Amman"), 1);
    let slots: T.PtAvailableSlot[] = [];
    for (let attempt = 0; attempt < 10 && slots.length === 0; attempt += 1) {
      slots = await api.listPtAvailableSlots({ trainerProfileId: trainer.id, branchId: trainer.branchIds[0]!, from: date, to: date });
      if (slots.length === 0) date = addDays(date, 1);
    }
    const slot = slots[0];
    if (!slot) throw new Error("The mock trainer should have an available future PT slot.");
    await api.createPtBooking({ membershipId: member.membershipId, trainerProfileId: trainer.id, branchId: trainer.branchIds[0]!, startsAt: slot.startsAt, idempotencyKey: "pt-system-message-booking" });

    const event = (await api.listMemberTimeline(member.memberId, { pageSize: 30 })).items.find((item) => item.type === "pt_booking_reserved");
    expect(event?.titleMessage).toBeDefined();
    if (!event) throw new Error("The PT booking should create a member timeline event.");
    expect(stripBidi(presentTimelineEvent(event, AR).title)).toBe(`تم حجز حصة تدريب شخصي مع ${trainer.displayName}`);
    expect(presentTimelineEvent(event, EN).title).toBe(event.title);
  });

  it("renders included-credit and package-refund counts while preserving original English and refund reason", async () => {
    const session = await api.getSession();
    const plan = await api.createPlan({
      name: "Descriptor PT Membership",
      code: "DPTM",
      kind: "time",
      durationDays: 30,
      basePrice: money(50_000),
      branchAccess: "all",
      branchIds: [],
      freezeAllowanceDays: 0,
      includedPtSessions: 3,
    });
    const member = await api.createMember({
      fullName: "Included Credit Descriptor",
      phone: "+962790009802",
      homeBranchId: session.branches[0]!.id,
      gender: "male",
      preferredLanguage: "en",
    });
    const sale = await api.createMembershipSale({
      memberId: member.member.id,
      planId: plan.id,
      startDate: todayISODate(session.organization.timezone),
      payment: { amount: plan.basePrice, method: "card", externalReference: "MOCK-POS-INCLUDED-CREDIT" },
    });
    await api.getPtMemberExperience(sale.membership.id);
    const included = (await api.listMemberTimeline(member.member.id, { pageSize: 30 })).items.find((item) => item.type === "pt_credit_granted");
    expect(included?.titleMessage).toBeDefined();
    if (!included) throw new Error("Reading a membership with included PT credits should record the grant in the mock.");
    expect(presentTimelineEvent(included, AR).title).toContain("مُنح رصيد");
    expect(presentTimelineEvent(included, AR).title).toContain("حصص تدريب شخصي مشمولة بالاشتراك");
    expect(presentTimelineEvent(included, EN).title).toBe(included.title);

    const [active] = await activeMembers(1);
    const ptPackage = (await api.getPtWorkspace()).packages[0];
    if (!active || !ptPackage) throw new Error("The mock seed must include an active member and PT package.");
    const order = await api.requestPtPackage({ membershipId: active.membershipId, packageId: ptPackage.id, idempotencyKey: "pt-system-message-refund-order" });
    await api.createPayment({ memberId: active.memberId, chargeId: order.chargeId, amount: ptPackage.totalPrice, method: "card", externalReference: "MOCK-POS-PT-REFUND" }, "pt-system-message-refund-payment");
    const reason = "Member relocating; refund one unused session.";
    await api.refundPtPackage(order.id, { sessions: 1, reason });
    const refunded = (await api.listMemberTimeline(active.memberId, { pageSize: 30 })).items.find((item) => item.type === "pt_credit_refunded");
    expect(refunded?.titleMessage).toBeDefined();
    if (!refunded) throw new Error("Refunding an unused PT package session should create a timeline event.");
    expect(presentTimelineEvent(refunded, AR).title).toContain("تم استرداد مبلغ");
    expect(presentTimelineEvent(refunded, EN).title).toBe(refunded.title);
    expect(presentTimelineEvent(refunded, AR).body).toBe(reason);
    expect(presentTimelineEvent(refunded, EN).body).toBe(reason);
  });

  it("localizes finite contact outcomes by source while preserving original English and authored notes", async () => {
    const session = await api.getSession();
    const member = await api.createMember({ fullName: "Contact Descriptor Member", phone: "+962790009803", homeBranchId: session.branches[0]!.id, gender: "female", preferredLanguage: "en" });
    const memberNote = "Asked to call after the weekend.";
    const memberEvent = await api.logMemberContactAttempt(member.member.id, { outcome: "answered_interested", notes: memberNote });
    expect(memberEvent.titleMessage?.key).toBe("communicationCompletion.timeline.contactAttempt");
    expect(stripBidi(presentTimelineEvent(memberEvent, AR).title)).toBe("محاولة تواصل — مهتم");
    expect(presentTimelineEvent(memberEvent, EN).title).toBe(memberEvent.title);
    expect(presentTimelineEvent(memberEvent, AR).body).toBe(memberNote);

    const lead = await api.createLead({ fullName: "Call Descriptor Lead", phone: "+962 79 900 0451", branchId: session.branches[0]!.id, source: "walk_in" });
    const leadNote = "No answer; try the alternate number tomorrow.";
    const detail = await api.logContactAttempt(lead.id, { outcome: "no_answer", notes: leadNote });
    const callEvent = detail.activities.find((item) => item.type === "call_attempt");
    expect(callEvent?.titleMessage?.key).toBe("communicationCompletion.timeline.callAttempt");
    if (!callEvent) throw new Error("Logging a lead call attempt should create an activity.");
    expect(stripBidi(presentTimelineEvent(callEvent, AR).title)).toBe("محاولة اتصال — لم يرد");
    expect(presentTimelineEvent(callEvent, EN).title).toBe(callEvent.title);
    expect(presentTimelineEvent(callEvent, AR).body).toBe(leadNote);

    const unknownOutcome = systemMessage("communicationCompletion.timeline.callAttempt", { outcome: { enum: "contactOutcome", value: "future_outcome" } });
    expect(isRenderableSystemMessage(unknownOutcome)).toBe(false);
    expect(presentTimelineEvent({ ...callEvent, titleMessage: unknownOutcome }, AR).title).toBe(callEvent.title);
  });

  it("localizes retention snooze dates and leaves the authored reason unchanged", async () => {
    const [member] = await activeMembers(1);
    if (!member) throw new Error("The mock seed must include an active member.");
    const until = addDays(todayISODate("Asia/Amman"), 7);
    const reason = "Revisit after the member returns from travel.";
    await api.snoozeAtRiskMember({ memberId: member.memberId, until, reason });
    const event = (await api.listMemberTimeline(member.memberId, { pageSize: 30 })).items.find((item) => item.title.startsWith("Retention follow-up snoozed"));
    expect(event?.titleMessage).toBeDefined();
    if (!event) throw new Error("Snoozing retention follow-up should create a timeline event.");
    expect(presentTimelineEvent(event, AR).title).toBe(`تم تأجيل متابعة العضو حتى ${AR.format.date(until)}`);
    expect(presentTimelineEvent(event, EN).title).toBe(event.title);
    expect(presentTimelineEvent(event, AR).body).toBe(reason);
    expect(presentTimelineEvent(event, EN).body).toBe(reason);
  });

  it("localizes task titles and contact-driven outcomes without translating authored task data", async () => {
    const [member] = await activeMembers(1);
    const session = await api.getSession();
    if (!member) throw new Error("The mock seed must include an active member.");
    const dueAt = new Date(Date.now() + 86_400_000).toISOString();
    const first = await api.createFollowUp({ type: "renewal_call", title: "Call about the annual plan", ownerId: session.user.id, dueAt, memberId: member.memberId });
    const followOn = await api.createFollowUp({ type: "renewal_call", title: "Confirm the new schedule", ownerId: session.user.id, dueAt, memberId: member.memberId, relatedTaskId: first.id });
    let timeline = (await api.listMemberTimeline(member.memberId, { pageSize: 50 })).items;
    const firstCreated = timeline.find((event) => event.type === "task_created" && event.title === `Task: ${first.title}`);
    const followOnCreated = timeline.find((event) => event.type === "task_created" && event.title === `Task: ${followOn.title}`);
    expect(firstCreated?.titleMessage?.key).toBe("communicationCompletion.timeline.taskCreated");
    expect(followOnCreated?.bodyMessage?.key).toBe("communicationCompletion.timeline.taskFollowOn");
    if (!firstCreated || !followOnCreated) throw new Error("Creating member tasks should create timeline rows.");
    expect(stripBidi(presentTimelineEvent(firstCreated, AR).title)).toBe(`مهمة: ${first.title}`);
    expect(presentTimelineEvent(followOnCreated, AR).body).toContain(first.title);
    expect(presentTimelineEvent(firstCreated, EN).title).toBe(firstCreated.title);

    const manual = await api.createFollowUp({ type: "renewal_call", title: "Confirm attendance", ownerId: session.user.id, dueAt, memberId: member.memberId });
    const authoredOutcome = "Member renewed for another year.";
    await api.completeTask(manual.id, { outcome: authoredOutcome });
    timeline = (await api.listMemberTimeline(member.memberId, { pageSize: 50 })).items;
    const manualCompletion = timeline.find((event) => event.type === "task_completed" && event.title === `Task completed: ${manual.title}`);
    expect(manualCompletion?.titleMessage?.key).toBe("communicationCompletion.timeline.taskCompleted");
    expect(manualCompletion?.bodyMessage).toBeUndefined();
    if (!manualCompletion) throw new Error("Completing a member task should create a timeline row.");
    expect(presentTimelineEvent(manualCompletion, AR).body).toBe(authoredOutcome);
    expect(presentTimelineEvent(manualCompletion, EN).body).toBe(authoredOutcome);

    await api.logMemberContactAttempt(member.memberId, { outcome: "wrong_number" });
    timeline = (await api.listMemberTimeline(member.memberId, { pageSize: 50 })).items;
    const contactCompletion = timeline.find((event) => event.type === "task_completed" && event.body?.startsWith("Contact logged —"));
    expect(contactCompletion?.bodyMessage?.key).toBe("communicationCompletion.timeline.taskContactCompleted");
    if (!contactCompletion) throw new Error("A terminal contact attempt should close existing follow-up tasks.");
    expect(presentTimelineEvent(contactCompletion, AR).body).toContain("رقم خاطئ");
    expect(presentTimelineEvent(contactCompletion, EN).body).toBe(contactCompletion.body);
  });

  it("localizes marketing, trial, and offer system bodies while keeping the trial goal and delivery reference verbatim", async () => {
    const session = await api.getSession();
    const member = await api.createMember({ fullName: "Marketing Descriptor Member", phone: "+962790009804", homeBranchId: session.branches[0]!.id, gender: "female", preferredLanguage: "en" });
    await api.updateMember(member.member.id, { marketingOptIn: false, marketingPreferenceSource: "staff_selected" });
    const preference = (await api.listMemberTimeline(member.member.id, { pageSize: 20 })).items.find((event) => event.type === "marketing_preference_changed");
    expect(preference?.bodyMessage?.key).toBe("communicationCompletion.timeline.marketingNowOut");
    if (!preference) throw new Error("Changing marketing preference should create a timeline event.");
    expect(presentTimelineEvent(preference, AR).body).toContain("تغيّر التفضيل");
    expect(presentTimelineEvent(preference, EN).body).toBe(preference.body);

    const lead = await api.createLead({ fullName: "Trial Descriptor Lead", phone: "+962790009805", email: "trial-descriptor@example.com", branchId: session.branches[0]!.id, source: "walk_in" });
    const date = addDays(todayISODate(session.organization.timezone), 1);
    const time = "18:15";
    const goal = "Strength training & mobility";
    const scheduled = await api.scheduleLeadTrial(lead.id, { preferredDate: date, preferredTime: time, goal });
    const trial = scheduled.activities.find((event) => event.type === "trial_confirmed");
    expect(trial?.bodyMessage?.key).toBe("communicationCompletion.timeline.trialScheduledBody");
    if (!trial) throw new Error("Scheduling a lead trial should create an activity.");
    expect(presentTimelineEvent(trial, AR).body).toContain(AR.format.date(date));
    expect(presentTimelineEvent(trial, AR).body).toContain(AR.format.clock(time));
    expect(presentTimelineEvent(trial, AR).body).not.toContain(goal);
    expect(presentTimelineEvent(trial, EN).body).toBe(trial.body);

    const plan = (await api.listPlans({ status: "active", pageSize: 5 })).items[0];
    if (!plan) throw new Error("The mock seed must include an active plan.");
    const offer = await api.createOffer({ leadId: lead.id, planId: plan.id, price: plan.basePrice });
    await api.markOfferDelivered(offer.id, { channel: "email", reference: "DELIVERY-REF-42" });
    const offerEvent = (await api.getLead(lead.id)).activities.find((event) => event.type === "offer_sent");
    expect(offerEvent?.bodyMessage?.key).toBe("communicationCompletion.timeline.offerDeliveryConfirmedBodyWithReference");
    if (!offerEvent) throw new Error("Confirming offer delivery should create an activity.");
    expect(presentTimelineEvent(offerEvent, AR).body).toContain("DELIVERY-REF-42");
    expect(presentTimelineEvent(offerEvent, AR).body).not.toContain("confirmed");
    expect(presentTimelineEvent(offerEvent, EN).body).toBe(offerEvent.body);
  });

  it("renders class names and class dates without translating cancellation reasons", async () => {
    const [first, second] = await activeMembers(2);
    if (!first || !second) throw new Error("The mock seed must include two active memberships.");
    const session = await api.getSession();
    const branchId = session.branches[0]!.id;
    const date = addDays(todayISODate("Asia/Amman"), 2);
    const template = await api.upsertClassSession({
      branchId,
      name: "Descriptor Proof Class",
      dayOfWeek: new Date(`${date}T12:00:00Z`).getUTCDay(),
      startMinute: 22 * 60,
      durationMinutes: 45,
      capacity: 1,
      audience: "mixed",
    });
    const occurrenceId = `occ:${template.id}:${date}`;
    await api.addClassOccurrenceAttendee({ occurrenceId, memberId: first.memberId, membershipId: first.membershipId });
    const waitlisted = await api.addClassOccurrenceAttendee({ occurrenceId, memberId: second.memberId, membershipId: second.membershipId });
    const waitlistEvent = (await api.listMemberTimeline(second.memberId, { pageSize: 30 })).items.find((item) => item.type === "class_waitlisted");
    expect(waitlistEvent?.titleMessage).toBeDefined();
    expect(stripBidi(presentTimelineEvent(waitlistEvent!, AR).title)).toBe("تمت الإضافة إلى قائمة الانتظار في Descriptor Proof Class");
    expect(presentTimelineEvent(waitlistEvent!, EN).title).toBe(waitlistEvent!.title);

    const firstBooking = waitlisted.roster.find((entry) => entry.memberId === first.memberId && entry.status === "booked");
    if (!firstBooking) throw new Error("The first attendee should hold the class seat.");
    await api.removeClassOccurrenceAttendee({ occurrenceId, bookingId: firstBooking.bookingId, reason: "Member changed plans." });
    const promoted = (await api.listMemberTimeline(second.memberId, { pageSize: 30 })).items.find((item) => item.type === "class_waitlist_promoted");
    expect(promoted?.titleMessage).toBeDefined();
    expect(promoted?.bodyMessage).toBeDefined();
    if (!promoted) throw new Error("Opening the seat should promote the waiting member.");
    expect(stripBidi(presentTimelineEvent(promoted, AR).title)).toBe("تم الانتقال من قائمة الانتظار إلى Descriptor Proof Class");
    expect(presentTimelineEvent(promoted, AR).body).toBe(`توفر مكان في ${AR.format.date(date)}.`);
    expect(presentTimelineEvent(promoted, EN)).toEqual({ title: promoted.title, body: promoted.body });
  });

  it("localizes mock system notifications but leaves their authored subjects intact", async () => {
    const seeded = await api.listNotifications();
    const ptBooking = seeded.find((notification) => notification.kind === "pt_booking");
    expect(ptBooking?.titleMessage).toBeDefined();
    expect(ptBooking?.bodyMessage).toBeDefined();
    if (!ptBooking) throw new Error("The owner notification seed should include a PT booking.");
    const ptArabic = presentNotification(ptBooking, AR);
    expect(ptArabic.title).toBe("حجز جديد لحصة تدريب شخصي");
    expect(ptArabic.body).not.toContain(ptBooking.body ?? "");
    expect(presentNotification(ptBooking, EN)).toEqual({ title: ptBooking.title, body: ptBooking.body });

    const session = await api.getSession();
    const subject = "July statement needs the second transfer reference";
    const supportCase = await api.createSupportCase({ email: session.user.email, subject, body: "Please check this authored request.", priority: "normal", branchId: session.branches[0]!.id, requestType: "general" });
    await api.replyToPlatformSupportCase(supportCase.id, "We reviewed the account history.");
    const notification = (await api.listNotifications()).find((item) => item.href === `/support?case=${supportCase.id}`);
    expect(notification?.titleMessage).toBeDefined();
    if (!notification) throw new Error("The support reply should notify its case creator.");
    expect(presentNotification(notification, AR)).toEqual({ title: "ردّت RIVET على طلب الدعم", body: subject });
    expect(presentNotification(notification, EN)).toEqual({ title: notification.title, body: subject });
  });
});
