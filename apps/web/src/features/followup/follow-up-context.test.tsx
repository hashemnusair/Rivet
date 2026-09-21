import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FollowUpContextPanel } from "@/features/followup/follow-up-context";
import type { MockGymOSApi } from "@/lib/mock/MockGymOSApi";
import type { MemberSummary } from "@/lib/domain/types";
import { addDays, diffDays, todayISODate } from "@/lib/utils/dates";
import { renderWithApp, resetApiForTests } from "@/test/harness";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }), usePathname: () => "/crm/queues", useParams: () => ({}), useSearchParams: () => new URLSearchParams() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

afterEach(() => resetApiForTests());

async function expiringMember(api: MockGymOSApi): Promise<MemberSummary> {
  const today = todayISODate("Asia/Amman");
  const page = await api.listMembers({ status: "active", pageSize: 120 });
  const member = page.items.find((candidate) => candidate.membershipEndDate && diffDays(today, candidate.membershipEndDate) >= 4 && diffDays(today, candidate.membershipEndDate) <= 14 && candidate.membershipStatus !== "frozen");
  if (!member) throw new Error("seed should contain a member expiring within two weeks");
  return member;
}

const enableAssist = async (api: MockGymOSApi) => { await api.updateAssistPreference({ enabled: true }); };

function Probe() {
  return <FollowUpContextPanel memberId={window.sessionStorage.getItem("test.member") ?? ""} variant="renewal" />;
}

describe("follow-up context for a renewal conversation", () => {
  it("names an explicit opt-out and offers no message at all", async () => {
    await renderWithApp(<Probe />, {
      prepare: async (api) => {
        await enableAssist(api);
        const member = await expiringMember(api);
        await api.updateMember(member.id, { marketingOptIn: false, marketingPreferenceSource: "member_selected" });
        window.sessionStorage.setItem("test.member", member.id);
      },
    });
    const panel = await screen.findByTestId("follow-up-context");
    expect(within(panel).getByTestId("follow-up-opt-out")).toHaveTextContent("Opted out of renewal messages");
    expect(await within(panel).findByTestId("reminder-blocked")).toHaveTextContent("opted out");
    expect(within(panel).queryByRole("button", { name: "Suggest a message" })).not.toBeInTheDocument();
  });

  it("suggests the approved template for the timing and hands it to WhatsApp without sending anything", async () => {
    const user = userEvent.setup();
    let member: MemberSummary | undefined;
    const { api } = await renderWithApp(<Probe />, {
      prepare: async (mock) => {
        await enableAssist(mock);
        member = await expiringMember(mock);
        await mock.updateMember(member.id, { marketingOptIn: true, marketingPreferenceSource: "member_selected" });
        window.sessionStorage.setItem("test.member", member.id);
      },
    });
    const panel = await screen.findByTestId("follow-up-context");
    expect(within(panel).getByTestId("follow-up-consent-in")).toHaveTextContent("Opted in");
    await user.click(await within(panel).findByRole("button", { name: "Suggest a message" }));
    const card = await screen.findByTestId("reminder-card");
    expect(within(card).getByTestId("reminder-template")).toHaveTextContent("Renewal reminder · 7 days");
    const firstName = member!.fullName.split(/\s+/)[0]!;
    expect(within(card).getByTestId("reminder-template")).toHaveTextContent(`Hi ${firstName}`);
    await user.click(within(card).getByRole("button", { name: "Use in WhatsApp" }));
    const dialog = await screen.findByRole("dialog", { name: `Message ${member!.fullName}` });
    expect((within(dialog).getByRole("textbox", { name: "WhatsApp message" }) as HTMLTextAreaElement).value).toContain(`Hi ${firstName}`);
    expect(within(dialog).getByText(/RIVET does not claim that the message was sent/)).toBeInTheDocument();
    const timeline = await api.listMemberTimeline(member!.id, { pageSize: 50 });
    expect(timeline.items.some((event) => event.type === "call_attempt" && event.meta?.outcome === "whatsapp_opened")).toBe(false);
  });

  it("shows an agreed callback from the record, lifts it as the item that matters, and calls for a staff-written message", async () => {
    const user = userEvent.setup();
    await renderWithApp(<Probe />, {
      prepare: async (api) => {
        await enableAssist(api);
        const member = await expiringMember(api);
        await api.updateMember(member.id, { marketingOptIn: true, marketingPreferenceSource: "member_selected" });
        await api.logMemberContactAttempt(member.id, { outcome: "answered_call_back", notes: "Asked us to call after Thursday", nextFollowUpAt: `${addDays(todayISODate("Asia/Amman"), 3)}T07:00:00.000Z` });
        window.sessionStorage.setItem("test.member", member.id);
      },
    });
    const panel = await screen.findByTestId("follow-up-context");
    expect(within(panel).getByTestId("follow-up-callback")).toHaveTextContent("Agreed");
    expect(within(panel).getByTestId("follow-up-related-work")).toHaveTextContent("after asked for a callback");
    await user.click(await within(panel).findByRole("button", { name: "Highlight what matters" }));
    const items = await screen.findByTestId("renewal-context-items");
    const first = within(items).getAllByTestId("follow-up-evidence")[0]!;
    expect(first).toHaveTextContent("Most relevant");
    expect(first).toHaveTextContent("Asked for a callback");
    expect(within(first).getByRole("link", { name: "View on timeline" })).toHaveAttribute("href", expect.stringContaining("#timeline-event-"));
    await user.click(await within(panel).findByRole("button", { name: "Suggest a message" }));
    expect(await screen.findByTestId("reminder-staff-review")).toHaveTextContent("a callback is agreed");
    await waitFor(() => expect(screen.queryByRole("button", { name: "Use in WhatsApp" })).not.toBeInTheDocument());
  });
});
