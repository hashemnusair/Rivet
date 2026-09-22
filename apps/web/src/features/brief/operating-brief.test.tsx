import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { OperatingBrief } from "@/lib/domain/types";
import type { MockGymOSApi } from "@/lib/mock/MockGymOSApi";
import { BRANCH_SWF } from "@/lib/mock/seed";
import { formatMoney } from "@/lib/utils/money";
import { renderWithApp, resetApiForTests } from "@/test/harness";
import { briefEmphasis } from "../../../convex/operatingBrief";
import { OperatingBriefPanel } from "./operating-brief";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/dashboard", useParams: () => ({}), useSearchParams: () => new URLSearchParams() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
afterEach(() => { resetApiForTests(); router.push.mockReset(); });

const enableAssist = async (api: MockGymOSApi) => { await api.updateAssistPreference({ enabled: true }); };
const figureValue = (brief: OperatingBrief, section: string, key: string) => {
  const figure = brief.sections.find((entry) => entry.key === section)?.figures.find((entry) => entry.key === key);
  if (!figure) throw new Error(`figure ${section}.${key} missing`);
  return figure.value.kind === "count" ? String(figure.value.value) : formatMoney(figure.value.money);
};

describe("operating brief", () => {
  it("shows exact figures, keeps mandatory items on top, offers the complete queue, and sends every action back to its own workflow", async () => {
    const user = userEvent.setup();
    const { api } = await renderWithApp(<OperatingBriefPanel />, { role: "owner" });
    const brief = await api.getOperatingBrief({});
    await screen.findByTestId("brief-mandatory");
    expect(screen.getByTestId("brief-coverage")).toHaveTextContent("Complete coverage");
    expect(screen.getByTestId("brief-scope")).toHaveTextContent("All 2 branches, consolidated.");
    // Figures are the server's numbers, rendered as given.
    const collections = screen.getByTestId("brief-figures-collections");
    expect(within(collections).getByText((_, node) => node?.getAttribute("data-figure") === "outstanding" && (node.textContent ?? "").includes(figureValue(brief, "collections", "outstanding")))).toBeInTheDocument();
    expect(within(collections).getByText((_, node) => node?.getAttribute("data-figure") === "members" && node.textContent === `Members with a balance${figureValue(brief, "collections", "members")}`)).toBeInTheDocument();
    expect(screen.getByTestId("brief-figures-renewals")).toHaveTextContent(`Expired, not renewed (30 days)${figureValue(brief, "renewals", "expired")}`);
    // Mandatory items: every urgent item, in queue order, as the queue's own rows with the server's action.
    const mandatory = screen.getAllByTestId("brief-mandatory-item");
    expect(mandatory).toHaveLength(brief.mandatory.length);
    expect(mandatory.map((row) => row.getAttribute("data-item-id"))).toEqual(brief.mandatory.map((item) => item.id));
    const firstMandatory = brief.mandatory[0]!;
    expect(within(mandatory[0]!).getByRole("link", { name: firstMandatory.title })).toHaveAttribute("href", firstMandatory.href);
    if (firstMandatory.action.kind === "navigate") expect(within(mandatory[0]!).getByRole("link", { name: `${firstMandatory.action.label}: ${firstMandatory.title}` })).toHaveAttribute("href", firstMandatory.href);
    // Sections preview three rows; "Show all" reveals the rest without re-reading.
    const followups = screen.getByTestId("brief-section-followups");
    expect(within(followups).getAllByTestId("brief-section-item")).toHaveLength(3);
    await user.click(within(followups).getByTestId("brief-section-toggle-followups"));
    expect(within(followups).getAllByTestId("brief-section-item")).toHaveLength(brief.sections.find((section) => section.key === "followups")!.totalItems);
    // Stale work carries its exact days.
    const stale = brief.queue.find((item) => item.stale);
    expect(stale).toBeDefined();
    // The complete queue lists every item in the server's order.
    await user.click(screen.getByTestId("brief-queue-toggle"));
    const rows = screen.getAllByTestId("brief-queue-item");
    expect(rows).toHaveLength(brief.totals.items);
    expect(rows.map((row) => row.getAttribute("data-item-id"))).toEqual(brief.queue.map((item) => item.id));
    expect(screen.getAllByTestId("brief-item-overdue").some((badge) => badge.textContent === `waiting ${stale!.overdueDays} days`)).toBe(true);
    // A follow-up's Done goes through the queue's own completion flow (asking what happened for a person).
    const followUp = brief.queue.find((item) => item.kind === "follow_up" && item.action.kind === "complete_task" && item.subject);
    expect(followUp).toBeDefined();
    const followUpRow = rows.find((row) => row.getAttribute("data-item-id") === followUp!.id)!;
    await user.click(within(followUpRow).getByRole("button", { name: `Complete ${followUp!.title}` }));
    expect(await screen.findByRole("dialog", { name: "What happened?" })).toBeVisible();
    await user.keyboard("{Escape}");
    // Sources and coverage are listed with their read time.
    await user.click(screen.getByTestId("brief-sources-toggle"));
    expect(screen.getAllByTestId(/^brief-source-/)).toHaveLength(brief.sources.length);
    expect(screen.getByTestId("brief-source-queue")).toHaveAttribute("data-status", "ok");
  });

  it("stays useful with Jev off: the standard order leads and nothing asks the model", async () => {
    const { api } = await renderWithApp(<OperatingBriefPanel />, { role: "owner" });
    const spy = vi.spyOn(api, "requestAssistJudgment");
    const brief = await api.getOperatingBrief({});
    await screen.findByTestId("brief-emphasis-default");
    expect(screen.getByTestId("brief-emphasis-default")).toHaveTextContent(briefEmphasis(brief.defaultEmphasis)!.heading);
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 40)); });
    expect(screen.queryByTestId("brief-emphasis-jev")).not.toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();
  });

  it("leads with Jev's prepared emphasis when the switch is on, and dismissing it changes nothing in the queue", async () => {
    const user = userEvent.setup();
    const { api } = await renderWithApp(<OperatingBriefPanel />, { role: "owner", prepare: enableAssist });
    const brief = await api.getOperatingBrief({});
    const card = await screen.findByTestId("brief-emphasis-jev");
    expect(brief.mandatory.length).toBeGreaterThan(0);
    expect(card).toHaveTextContent("Safety, cash and entry problems come first");
    expect(within(card).getByTestId("brief-emphasis-evidence")).toHaveTextContent("Approvals, cash and entry");
    expect(screen.queryByTestId("brief-emphasis-default")).not.toBeInTheDocument();
    const before = screen.getAllByTestId("brief-mandatory-item").length;
    await user.click(within(card).getByRole("button", { name: "Dismiss suggestion" }));
    expect(screen.queryByTestId("brief-emphasis-jev")).not.toBeInTheDocument();
    expect(screen.getByTestId("brief-emphasis-default")).toBeInTheDocument();
    expect(screen.getAllByTestId("brief-mandatory-item")).toHaveLength(before);
  });

  it("falls back to the standard order when the model fails, with the whole queue still there", async () => {
    const { api } = await renderWithApp(<OperatingBriefPanel />, { role: "owner", prepare: enableAssist });
    vi.spyOn(api, "requestAssistJudgment").mockResolvedValue({ status: "unavailable", reason: "timeout", message: "Jev did not answer in time.", retryable: true, correlationId: "test" });
    const brief = await api.getOperatingBrief({});
    expect(await screen.findByTestId("brief-emphasis-jev-unavailable")).toHaveTextContent("Jev did not answer in time.");
    expect(screen.getByTestId("brief-emphasis-default")).toHaveTextContent(briefEmphasis(brief.defaultEmphasis)!.heading);
    expect(screen.getAllByTestId("brief-mandatory-item")).toHaveLength(brief.mandatory.length);
  });

  it("reports sources that cannot be read as partial coverage and keeps the exact figures of the rest", async () => {
    const user = userEvent.setup();
    const { api } = await renderWithApp(<OperatingBriefPanel />, { role: "owner", prepare: async (api) => {
      const access = await api.getWorkspaceAccess();
      // Finance and reporting depend on operations, so the three go off together.
      const dependents = new Set(["operations", "finance", "reporting"]);
      await api.updateWorkspaceModulePreferences({ enabledModules: access.modules.filter((module) => module.enabled && !dependents.has(module.key)).map((module) => module.key) });
    } });
    const brief = await api.getOperatingBrief({});
    expect(brief.coverage).toBe("partial");
    await screen.findByTestId("brief-coverage");
    expect(screen.getByTestId("brief-coverage")).toHaveTextContent("Partial coverage · 2 sources not read");
    await user.click(screen.getByTestId("brief-sources-toggle"));
    expect(screen.getByTestId("brief-source-equipment")).toHaveAttribute("data-status", "not_enabled");
    expect(screen.getByTestId("brief-source-stock")).toHaveTextContent("The operations module is off for this gym.");
    expect(screen.getByTestId("brief-figures-collections").textContent).toContain(figureValue(brief, "collections", "outstanding"));
    expect(screen.queryByTestId("brief-section-equipment")).not.toBeInTheDocument();
  });

  it("scopes to the selected branch and shows it, with every row inside that branch", async () => {
    const { api } = await renderWithApp(<OperatingBriefPanel branchId={BRANCH_SWF} />, { role: "owner", branchId: BRANCH_SWF });
    const brief = await api.getOperatingBrief({ branchId: BRANCH_SWF });
    await screen.findByTestId("brief-scope");
    expect(screen.getByTestId("brief-scope")).toHaveTextContent("Showing Forge — Sweifieh only.");
    expect(brief.queue.every((item) => !item.branchName || item.branchName === "Forge — Sweifieh")).toBe(true);
    const all = await api.getOperatingBrief({});
    expect(brief.totals.items).toBeLessThan(all.totals.items);
    await waitFor(() => expect(screen.getByTestId("brief-queue-toggle")).toHaveTextContent(`Complete queue · ${brief.totals.items}`));
  });

  it("relates two similarly worded items only on request, reads conflicting descriptions as unclear, and lists both regardless", async () => {
    const user = userEvent.setup();
    const { api } = await renderWithApp(<OperatingBriefPanel />, { role: "owner", prepare: async (api) => {
      await enableAssist(api);
      const issues = await api.listEquipmentIssues();
      const issue = issues.find((candidate) => candidate.status !== "resolved");
      if (!issue) throw new Error("seed should hold an open machine report");
      const zones = await api.listZones({ branchId: issue.branchId, includeArchived: false });
      await api.upsertFacilityTask({ branchId: issue.branchId, zoneId: zones[0]!.id, kind: "inspection", severity: "medium", title: "TREAD-01 belt fixed", notes: "Belt tensioned this morning; treadmill safe to use again." });
    } });
    const brief = await api.getOperatingBrief({});
    const pair = brief.related.find((candidate) => [candidate.firstId, candidate.secondId].some((id) => id.startsWith("equipment:")));
    expect(pair).toBeDefined();
    const pairs = await screen.findAllByTestId("brief-related-pair");
    const row = pairs.find((candidate) => candidate.textContent?.includes("TREAD-01 belt fixed"))!;
    expect(row).toHaveTextContent("Belt slipping under load");
    expect(screen.queryByTestId("brief-related")).not.toBeInTheDocument();
    await user.click(await within(row).findByTestId("brief-related-check"));
    expect(await within(row).findByTestId("brief-related-verdict")).toHaveTextContent("Unclear");
    // Both items are still in the queue and the machine's recorded safety status is untouched.
    const issues = await api.listEquipmentIssues();
    expect(issues.find((candidate) => candidate.title === "Belt slipping under load")).toMatchObject({ safetyStatus: "out_of_service" });
    await user.click(screen.getByTestId("brief-queue-toggle"));
    const ids = screen.getAllByTestId("brief-queue-item").map((entry) => entry.getAttribute("data-item-id"));
    expect(ids).toEqual(expect.arrayContaining([pair!.firstId, pair!.secondId]));
    expect(screen.queryByTestId("brief-item-related")).not.toBeInTheDocument();
  });

  it("shows the empty state when nothing is unresolved in scope", async () => {
    await renderWithApp(<OperatingBriefPanel />, { role: "owner", prepare: async (api) => {
      const original = api.getOperatingBrief.bind(api);
      vi.spyOn(api, "getOperatingBrief").mockImplementation(async (query) => {
        const brief = await original(query);
        return { ...brief, queue: [], mandatory: [], related: [], totals: { items: 0, mandatory: 0, overdue: 0, stale: 0 }, sections: brief.sections.map((section) => ({ ...section, items: [], totalItems: 0 })) };
      });
    } });
    expect(await screen.findByTestId("brief-empty")).toHaveTextContent("Nothing unresolved in this scope");
    expect(screen.queryByTestId("brief-mandatory")).not.toBeInTheDocument();
  });
});
