import { screen, within } from "@testing-library/react";
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

function Probe() {
  return <FollowUpContextPanel memberId={window.sessionStorage.getItem("test.member") ?? ""} variant="renewal" />;
}

describe("follow-up context for a renewal conversation", () => {
  it("names an explicit opt-out and offers no message at all", async () => {
    await renderWithApp(<Probe />, {
      prepare: async (api) => {
        const member = await expiringMember(api);
        await api.updateMember(member.id, { marketingOptIn: false, marketingPreferenceSource: "member_selected" });
        window.sessionStorage.setItem("test.member", member.id);
      },
    });
    const panel = await screen.findByTestId("follow-up-context");
    expect(within(panel).getByTestId("follow-up-opt-out")).toHaveTextContent("Said no to renewal messages");
    expect(within(panel).queryByTestId("reminder-blocked")).not.toBeInTheDocument();
    expect(within(panel).queryByRole("button", { name: "Suggest a message" })).not.toBeInTheDocument();
  });

  it("shows an agreed callback and its recorded evidence without generating message suggestions", async () => {
    await renderWithApp(<Probe />, {
      prepare: async (api) => {
        const member = await expiringMember(api);
        await api.updateMember(member.id, { marketingOptIn: true, marketingPreferenceSource: "member_selected" });
        await api.logMemberContactAttempt(member.id, { outcome: "answered_call_back", notes: "Asked us to call after Thursday", nextFollowUpAt: `${addDays(todayISODate("Asia/Amman"), 3)}T07:00:00.000Z` });
        window.sessionStorage.setItem("test.member", member.id);
      },
    });
    const panel = await screen.findByTestId("follow-up-context");
    expect(within(panel).getByTestId("follow-up-callback")).toHaveTextContent("Asked");
    expect(within(panel).getByTestId("follow-up-related-work")).toHaveTextContent("after asked for a callback");
    const first = within(panel).getAllByTestId("follow-up-evidence")[0]!;
    expect(first).toHaveTextContent("Asked for a callback");
    expect(within(first).getByRole("link", { name: "View on timeline" })).toHaveAttribute("href", expect.stringContaining("#timeline-event-"));
    expect(within(panel).queryByRole("button", { name: "Highlight what matters" })).not.toBeInTheDocument();
    expect(within(panel).queryByRole("button", { name: "Suggest a message" })).not.toBeInTheDocument();
  });
});
