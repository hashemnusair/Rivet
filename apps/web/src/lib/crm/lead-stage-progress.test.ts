import { describe, expect, it } from "vitest";
import { LEAD_STAGE_PROGRESS, leadStageProgress } from "./lead-stage-progress";
import type { LeadDetail, TimelineEvent } from "@/lib/domain/types";

const baseLead = (overrides: Partial<LeadDetail>): LeadDetail => ({
  id: "lead-1",
  organizationId: "org-1",
  branchId: "branch-1",
  fullName: "Test lead",
  phone: "+962790000000",
  stage: "new",
  source: "walk_in",
  branchName: "Main",
  overdue: false,
  activities: [],
  offers: [],
  createdAt: "2026-08-09T10:00:00.000Z",
  updatedAt: "2026-08-09T10:00:00.000Z",
  ...overrides,
});

const event = (type: TimelineEvent["type"], meta?: TimelineEvent["meta"]): TimelineEvent => ({
  id: `event-${type}`,
  organizationId: "org-1",
  leadId: "lead-1",
  type,
  title: type,
  occurredAt: "2026-08-09T10:00:00.000Z",
  meta,
});

describe("leadStageProgress", () => {
  it("marks skipped trial milestones instead of completing them by ordinal position", () => {
    const progress = leadStageProgress(
      baseLead({
        stage: "offer_sent",
        activities: [event("member_created"), event("call_attempt", { outcome: "answered_interested" }), event("offer_sent")],
        offers: [{ id: "offer-1", leadId: "lead-1", planId: "plan-1", planName: "Monthly", price: { amount: 40_000, currency: "JOD" }, status: "sent", deliveryChannel: "manual", createdById: "user-1", createdAt: "2026-08-09T10:00:00.000Z" }],
      }),
    );

    expect(progress.map((item) => item.state)).toEqual(["completed", "completed", "completed", "skipped", "skipped", "current", "pending"]);
  });

  it("uses trial facts to complete the trial milestones", () => {
    const progress = leadStageProgress(
      baseLead({
        stage: "offer_sent",
        activities: [event("member_created"), event("call_attempt", { outcome: "trial_booked" }), event("trial_confirmed"), event("trial_completed")],
        trialBooking: {
          id: "trial-1",
          gymId: "org-1",
          branchId: "branch-1",
          fullName: "Test lead",
          email: "test@example.com",
          phone: "+962790000000",
          preferredDate: "2026-08-09",
          preferredTime: "18:00",
          goal: "Strength",
          status: "completed",
          createdAt: "2026-08-09T10:00:00.000Z",
          leadId: "lead-1",
        },
      }),
    );

    expect(progress.find((item) => item.stage === "trial_booked")?.state).toBe("completed");
    expect(progress.find((item) => item.stage === "trial_completed")?.state).toBe("completed");
  });

  it("keeps future milestones pending for a new lead", () => {
    const progress = leadStageProgress(baseLead({}));
    expect(progress).toHaveLength(LEAD_STAGE_PROGRESS.length);
    expect(progress[0]).toEqual({ stage: "new", state: "current" });
    expect(progress.slice(1).every((item) => item.state === "pending")).toBe(true);
  });
});
