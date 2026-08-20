import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GymProvisioningResult, PlatformGymApplication } from "@/lib/api/GymOSApi";
import PlatformApplicationsPage from "./page";

const state = vi.hoisted(() => ({
  rows: [] as PlatformGymApplication[],
  list: vi.fn(),
  subscribe: vi.fn(),
  review: vi.fn(),
  provision: vi.fn(),
  saveNote: vi.fn(),
}));

vi.mock("@/lib/api/client", () => ({
  getApi: () => ({
    listGymApplications: state.list,
    subscribePlatformApplications: state.subscribe,
    reviewGymApplication: state.review,
    provisionGym: state.provision,
    saveGymApplicationReviewNote: state.saveNote,
  }),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

function application(overrides: Partial<PlatformGymApplication> = {}): PlatformGymApplication {
  return {
    id: "app-1",
    gymName: "Northline Strength",
    ownerName: "Karim Haddad",
    email: "karim@northline.example",
    contactNumber: "+962 79 555 0144",
    plan: "Growth",
    status: "pending",
    notificationStatus: "sent",
    reviewNotificationStatus: "not_configured",
    submittedAt: "2026-08-06T08:42:00.000Z",
    updatedAt: "2026-08-06T08:42:00.000Z",
    ...overrides,
  };
}

function provisioningResult(input: PlatformGymApplication): GymProvisioningResult {
  return {
    applicationId: input.id,
    status: "completed",
    organizationId: `org-${input.id}`,
    organizationName: input.gymName,
    branchId: `branch-${input.id}`,
    branchName: `${input.gymName} — Main branch`,
    plan: input.plan,
    ownerName: input.ownerName,
    ownerEmail: input.email,
    clerkOrganizationId: `clerk-org-${input.id}`,
    clerkInvitationId: `clerk-inv-${input.id}`,
  };
}

describe("PlatformApplicationsPage", () => {
  beforeEach(() => {
    state.rows = [];
    state.list.mockReset().mockImplementation(async () => state.rows.map((row) => ({ ...row })));
    state.subscribe.mockReset().mockResolvedValue(() => undefined);
    state.review.mockReset();
    state.provision.mockReset();
    state.saveNote.mockReset();
    window.history.replaceState({}, "", "/platform/applications");
  });

  afterEach(() => {
    window.history.replaceState({}, "", "/platform/applications");
  });

  it("opens the application requested by the platform header search", async () => {
    const requested = application({ id: "app-2", gymName: "Mosaic Women's Fitness", status: "approved" });
    state.rows = [application(), requested];
    window.history.replaceState({}, "", "/platform/applications?application=app-2");

    render(<PlatformApplicationsPage />);

    expect(await screen.findByRole("heading", { name: "Mosaic Women's Fitness" })).toBeInTheDocument();
    expect(screen.getAllByText("approved", { selector: "span" })).toHaveLength(2);
  });

  it("follows application query changes without leaving the route", async () => {
    const first = application({ id: "app-1", gymName: "Northline Strength" });
    const second = application({ id: "app-2", gymName: "Mosaic Women's Fitness" });
    state.rows = [first, second];
    window.history.replaceState({}, "", "/platform/applications?application=app-1");

    const view = render(<PlatformApplicationsPage />);
    expect(await screen.findByRole("heading", { name: "Northline Strength" })).toBeInTheDocument();

    window.history.replaceState({}, "", "/platform/applications?application=app-2");
    view.rerender(<PlatformApplicationsPage />);
    expect(await screen.findByRole("heading", { name: "Mosaic Women's Fitness" })).toBeInTheDocument();
  });

  it("does not let a slower one-shot load overwrite the live subscription", async () => {
    const live = application({ id: "app-live", gymName: "Live Tenant" });
    const stale = application({ id: "app-stale", gymName: "Stale Tenant" });
    let resolveList!: (rows: PlatformGymApplication[]) => void;
    state.list.mockReturnValue(new Promise<PlatformGymApplication[]>((resolve) => { resolveList = resolve; }));
    state.subscribe.mockImplementation(async (onValue: (rows: PlatformGymApplication[]) => void) => {
      onValue([live]);
      return () => undefined;
    });

    render(<PlatformApplicationsPage />);
    expect(await screen.findByRole("heading", { name: "Live Tenant" })).toBeInTheDocument();

    resolveList([stale]);
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Live Tenant" })).toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: "Stale Tenant" })).not.toBeInTheDocument();
    });
  });

  it("requires a rejection reason, then carries an approval through provisioning", async () => {
    const user = userEvent.setup();
    const pending = application();
    const approved = application({ status: "approved", reviewedBy: "RIVET Admin", reviewedAt: "2026-08-20T10:00:00.000Z" });
    state.rows = [pending];
    state.review.mockImplementation(async ({ decision }: { decision: string }) => decision === "rejected" ? application({ status: "rejected", reviewNotes: "Duplicate submission" }) : approved);
    state.provision.mockResolvedValue(provisioningResult(approved));

    render(<PlatformApplicationsPage />);
    await screen.findByRole("heading", { name: "Northline Strength" });

    await user.click(screen.getByRole("button", { name: "Reject application" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Add a reason before rejecting");
    expect(state.review).not.toHaveBeenCalled();

    await user.type(screen.getByRole("textbox", { name: "Review notes" }), "Duplicate submission");
    await user.click(screen.getByRole("button", { name: "Reject application" }));
    await waitFor(() => expect(screen.getByText("Application rejected", { selector: "strong" })).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Approve application" })).not.toBeInTheDocument();

    // A fresh application remains actionable through the approved path.
    state.rows = [pending];
    await user.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(screen.queryByText("Application rejected", { selector: "strong" })).not.toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /Northline Strength/ }));
    await user.clear(screen.getByRole("textbox", { name: "Review notes" }));
    await user.type(screen.getByRole("textbox", { name: "Review notes" }), "Verified owner and location");
    await user.click(screen.getByRole("button", { name: "Approve application" }));
    await waitFor(() => expect(screen.getByText("Ready to provision", { selector: "strong" })).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Provision gym workspace" }));
    await waitFor(() => expect(screen.getByText("Workspace provisioned", { selector: "strong" })).toBeInTheDocument());
    expect(state.provision).toHaveBeenCalledWith({ applicationId: pending.id });
  });

  it("lets an operator refresh an in-progress provisioning state to a terminal result", async () => {
    const user = userEvent.setup();
    const inProgress = application({ status: "approved", provisioningStatus: "in_progress" });
    const completed = application({ status: "approved", provisioningStatus: "completed", provisionedOrganizationId: "org-app-1", provisionedBranchId: "branch-app-1" });
    state.rows = [inProgress];

    render(<PlatformApplicationsPage />);
    await screen.findByRole("heading", { name: "Northline Strength" });
    expect(screen.getByRole("button", { name: "Refresh status" })).toBeEnabled();

    state.rows = [completed];
    await user.click(screen.getByRole("button", { name: "Refresh status" }));
    await waitFor(() => expect(screen.getByText("Workspace provisioned", { selector: "strong" })).toBeInTheDocument());
  });
});
