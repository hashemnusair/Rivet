import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ResolutionWorkspace } from "@/features/resolution/resolution-workspace";
import type { MockGymOSApi } from "@/lib/mock/MockGymOSApi";
import type { MemberSummary } from "@/lib/domain/types";
import { renderWithApp, resetApiForTests } from "@/test/harness";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }), usePathname: () => "/members/member", useParams: () => ({}), useSearchParams: () => new URLSearchParams() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

afterEach(() => resetApiForTests());
beforeEach(() => window.sessionStorage.removeItem("rivet.resolution.collapsed"));

async function memberWithBalance(api: MockGymOSApi): Promise<MemberSummary> {
  const session = await api.getSession();
  const page = await api.listMembers({ status: "active", pageSize: 150 });
  const member = page.items.find((candidate) => candidate.membershipStatus === "active" && candidate.outstanding.amount > 0 && candidate.homeBranchId === session.branches[0]?.id);
  if (!member) throw new Error("seed should contain an active member with a balance");
  return member;
}

function Probe() {
  const stored = JSON.parse(window.sessionStorage.getItem("test.member") ?? "{}") as { id: string; name: string };
  return <ResolutionWorkspace memberId={stored.id} memberName={stored.name} />;
}

const remember = (member: MemberSummary) => window.sessionStorage.setItem("test.member", JSON.stringify({ id: member.id, name: member.fullName }));

describe("member resolution workspace", () => {
  it("explains its purpose, shows recorded facts and opens manual panels", async () => {
    const user = userEvent.setup();
    await renderWithApp(<Probe />, { prepare: async (mock) => { remember(await memberWithBalance(mock)); } });
    const area = await screen.findByTestId("resolution-area");
    expect(area).toHaveTextContent("Review recorded balances, membership, classes, trainers and open work.");
    expect(within(area).getByTestId("resolution-facts")).toHaveTextContent("Unresolved now:");

    await user.click(within(area).getByTestId("resolution-chip-panel.balance"));
    expect(await within(area).findByTestId("resolution-panel-panel.balance")).toBeInTheDocument();
    await user.click(within(area).getByTestId("resolution-show-all"));
    expect(within(area).getByTestId("resolution-panels").children.length).toBeGreaterThan(1);
  });

  it("keeps the deterministic plan comparison usable without a suggestion request", async () => {
    const user = userEvent.setup();
    await renderWithApp(<Probe />, { prepare: async (mock) => { remember(await memberWithBalance(mock)); } });
    const area = await screen.findByTestId("resolution-area");
    await user.click(within(area).getByTestId("resolution-chip-panel.plan_compare"));
    const panel = await screen.findByTestId("resolution-panel-panel.plan_compare");
    const emphasize = within(panel).getByRole("button", { name: "Freezing" });
    await user.click(emphasize);
    expect(emphasize).toHaveAttribute("aria-pressed", "true");
    const table = within(panel).getByTestId("plan-comparison");
    expect(within(table).getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual(expect.arrayContaining([expect.stringContaining("Price"), expect.stringContaining("Freezing ★")]));
  });
});
