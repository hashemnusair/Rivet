import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppProviders } from "@/lib/providers/app-providers";
import { setApiForTests } from "@/lib/api/client";
import { MockGymOSApi } from "@/lib/mock/MockGymOSApi";
import { addDays, todayISODate } from "@/lib/utils/dates";
import LeadDetailPageClient from "./lead-detail.client";

const navigation = vi.hoisted(() => ({
  leadId: "",
  push: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ leadId: navigation.leadId }),
  useRouter: () => ({ push: navigation.push, replace: navigation.replace, refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => `/crm/leads/${navigation.leadId}`,
  useSearchParams: () => new URLSearchParams(),
}));

Object.assign(HTMLElement.prototype, {
  hasPointerCapture: () => false,
  releasePointerCapture: () => undefined,
  scrollIntoView: () => undefined,
  setPointerCapture: () => undefined,
});

afterEach(() => {
  setApiForTests(null);
  window.sessionStorage.clear();
  navigation.leadId = "";
  navigation.push.mockReset();
  navigation.replace.mockReset();
});

async function prepareLead(api: MockGymOSApi, status: "confirmed" | "completed" = "confirmed") {
  window.sessionStorage.setItem("rivet.demo.persona", "owner");
  const session = await api.getSession();
  const branchId = session.activeBranchId ?? session.branches[0]!.id;
  window.sessionStorage.setItem("rivet.demo.branch", branchId);
  const lead = await api.createLead({ fullName: "CRM Regression Lead", phone: "+962790000099", branchId, source: "walk_in" });
  const scheduled = await api.scheduleLeadTrial(lead.id, { preferredDate: addDays(todayISODate(), 1), preferredTime: "18:00" });
  if (status === "completed") await api.updateTrialBooking(scheduled.trialBooking!.id, { status });
  navigation.leadId = lead.id;
  return lead.id;
}

function renderLead(api: MockGymOSApi) {
  setApiForTests(api);
  return render(
    <AppProviders>
      <LeadDetailPageClient />
    </AppProviders>,
  );
}

describe("CRM lead workflow language and transitions", () => {
  it("opens trial scheduling in a centered dialog", async () => {
    const api = new MockGymOSApi();
    window.sessionStorage.setItem("rivet.demo.persona", "owner");
    const session = await api.getSession();
    const branchId = session.activeBranchId ?? session.branches[0]!.id;
    window.sessionStorage.setItem("rivet.demo.branch", branchId);
    const lead = await api.createLead({ fullName: "Dialog Trial Lead", phone: "+962790000098", branchId, source: "walk_in" });
    navigation.leadId = lead.id;
    renderLead(api);

    await screen.findByRole("heading", { name: "Dialog Trial Lead" });
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Schedule trial" }));

    expect(screen.getByRole("dialog", { name: "Schedule trial" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("exposes separate no-show and cancelled trial outcomes", async () => {
    const api = new MockGymOSApi();
    const leadId = await prepareLead(api);
    renderLead(api);

    await screen.findByRole("heading", { name: "CRM Regression Lead" });
    expect(screen.getByRole("button", { name: "No-show" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancelled" })).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Cancelled" }));
    expect(screen.getByRole("dialog", { name: "Trial cancelled" })).toBeInTheDocument();
    await user.type(screen.getByRole("textbox", { name: "Reason" }), "Member cancelled the visit");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(async () => expect((await api.getLead(leadId)).trialBooking?.status).toBe("cancelled"));
  });

  it("edits contact identity without changing the lead stage and reports unsaved state", async () => {
    const api = new MockGymOSApi();
    const leadId = await prepareLead(api);
    await api.updateLeadContact(leadId, { fullName: "Original Contact", phone: "+962790000097", email: "original@example.com" });
    renderLead(api);

    await screen.findByRole("heading", { name: "Original Contact" });
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Edit contact" }));
    await screen.findByRole("dialog", { name: "Edit lead contact" });
    await user.clear(screen.getByRole("textbox", { name: "Full name" }));
    await user.type(screen.getByRole("textbox", { name: "Full name" }), "Corrected Contact");
    expect(screen.getByRole("status", { name: "" })).toHaveTextContent("Unsaved contact changes");
    await user.clear(screen.getByRole("textbox", { name: "Email" }));
    await user.type(screen.getByRole("textbox", { name: "Email" }), "  UPDATED@EXAMPLE.COM ");
    await user.click(screen.getByRole("button", { name: "Save contact" }));

    await waitFor(async () => expect(await api.getLead(leadId)).toMatchObject({ fullName: "Corrected Contact", email: "updated@example.com", stage: "trial_booked" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Edit lead contact" })).not.toBeInTheDocument());
    expect((await api.getLead(leadId)).activities).toContainEqual(expect.objectContaining({ type: "lead_contact_updated" }));
  });

  it("uses the selected sale language and navigates directly with a stable pending state", async () => {
    const api = new MockGymOSApi();
    await prepareLead(api, "completed");
    renderLead(api);

    await screen.findByRole("heading", { name: "CRM Regression Lead" });
    const user = userEvent.setup();
    await user.click(screen.getByTestId("sell-membership"));
    await screen.findByRole("dialog", { name: "Complete membership sale" });

    await user.selectOptions(screen.getByRole("combobox", { name: "Gender" }), "female");
    await user.selectOptions(screen.getByRole("combobox", { name: "Preferred language" }), "ar");
    await waitFor(() => expect(screen.getByTestId("confirm-membership-sale")).not.toBeDisabled());
    await user.click(screen.getByTestId("confirm-membership-sale"));

    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith(expect.stringMatching(/^\/members\//)));
    expect(navigation.push).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const members = await api.listMembers({ pageSize: 100 });
    const created = members.items.find((member) => member.fullName === "CRM Regression Lead");
    expect(created).toBeDefined();
    expect((await api.getMember(created!.id)).preferredLanguage).toBe("ar");
  });
});
