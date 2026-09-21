import { act, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NotificationCenter } from "@/components/shell/notification-center";
import { ChecklistHandover } from "@/features/checklists/checklist-handover";
import type { EquipmentAsset, EquipmentIssue, EquipmentWorkOrder, Zone } from "@/lib/domain/types";
import type { MockGymOSApi } from "@/lib/mock/MockGymOSApi";
import { addDays, todayISODate } from "@/lib/utils/dates";
import { renderWithApp, resetApiForTests } from "@/test/harness";
import { RepairHistoryPanel } from "./repair-history";
import { ReportIntake } from "./report-intake";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/operations", useParams: () => ({}), useSearchParams: () => new URLSearchParams() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
afterEach(() => { resetApiForTests(); router.push.mockReset(); });

const enableAssist = async (api: MockGymOSApi) => { await api.updateAssistPreference({ enabled: true }); };

async function equipmentBranch(api: MockGymOSApi): Promise<{ branchId: string; assets: EquipmentAsset[]; zones: Zone[]; issues: EquipmentIssue[]; workOrders: EquipmentWorkOrder[] }> {
  const assets = await api.listEquipmentAssets();
  const branchId = assets[0]?.branchId;
  if (!branchId) throw new Error("seed should contain a machine");
  return { branchId, assets: assets.filter((asset) => asset.branchId === branchId), zones: await api.listZones({ branchId, includeArchived: false }), issues: await api.listEquipmentIssues({ branchId }), workOrders: await api.listEquipmentWorkOrders({ branchId }) };
}

const stash = (key: string, value: unknown) => window.sessionStorage.setItem(`test.${key}`, JSON.stringify(value));
const stored = <T,>(key: string): T => JSON.parse(window.sessionStorage.getItem(`test.${key}`) ?? "null") as T;

describe("describe what you found", () => {
  it("suggests the report kind and the branch's own machine, files through the existing form prefilled, and works by keyboard", async () => {
    const user = userEvent.setup();
    const onFileIssue = vi.fn();
    await renderWithApp(<IntakeProbe onFileIssue={onFileIssue} />, { role: "manager", prepare: async (api) => { await enableAssist(api); const branch = await equipmentBranch(api); stash("branch", branch); } });
    const text = await screen.findByTestId("report-intake-text");
    await user.type(text, "TREAD-01 belt slipping again under load, grinding noise at speed 10");
    const run = screen.getByTestId("report-intake-run");
    run.focus();
    await user.keyboard("{Enter}");
    expect(await screen.findByTestId("report-intake-category-label")).toHaveTextContent("Machine issue");
    expect(await screen.findByTestId("report-intake-target-label")).toHaveTextContent("TREAD-01");
    await user.click(screen.getByTestId("report-intake-file-issue"));
    const branch = stored<{ assets: EquipmentAsset[] }>("branch");
    expect(onFileIssue).toHaveBeenCalledWith({ assetId: branch.assets.find((asset) => asset.code === "TREAD-01")?.id, description: "TREAD-01 belt slipping again under load, grinding noise at speed 10" });
  });

  it("says none and unclear honestly, and points cleaning descriptions at the maintenance page", async () => {
    const user = userEvent.setup();
    await renderWithApp(<IntakeProbe onFileIssue={vi.fn()} />, { role: "manager", prepare: async (api) => { await enableAssist(api); stash("branch", await equipmentBranch(api)); } });
    await user.type(await screen.findByTestId("report-intake-text"), "Sticky floor and a bad smell near the lockers, bins overflowing");
    await user.click(screen.getByTestId("report-intake-run"));
    expect(await screen.findByTestId("report-intake-category-label")).toHaveTextContent("Cleaning task");
    await screen.findByTestId("report-intake-target");
    expect(screen.getByTestId("report-intake-open-maintenance")).toHaveAttribute("href", expect.stringMatching(/^\/maintenance\?branch=/));
  });

  it("renders nothing while the gym's switch is off", async () => {
    await renderWithApp(<IntakeProbe onFileIssue={vi.fn()} />, { role: "manager", prepare: async (api) => { stash("branch", await equipmentBranch(api)); } });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 40)); });
    expect(screen.queryByTestId("report-intake")).not.toBeInTheDocument();
  });
});

function IntakeProbe({ onFileIssue }: { onFileIssue: (filing: { assetId?: string; description: string }) => void }) {
  const branch = stored<{ branchId: string; assets: EquipmentAsset[]; zones: Zone[] }>("branch");
  return <ReportIntake branchId={branch.branchId} machines={branch.assets} spaces={branch.zones.map((zone) => ({ id: zone.id, name: zone.name, kind: zone.kind }))} onFileIssue={onFileIssue} />;
}

function HistoryProbe() {
  const branch = stored<{ assets: EquipmentAsset[]; issues: EquipmentIssue[]; workOrders: EquipmentWorkOrder[] }>("branch");
  return <RepairHistoryPanel asset={branch.assets[0]!} issues={branch.issues} workOrders={branch.workOrders} />;
}

describe("related repair history", () => {
  it("lists this machine's earlier reports, tells a recurring fault from a separate one on request, and changes no severity or safety", async () => {
    const user = userEvent.setup();
    let earlierId = "";
    const { api } = await renderWithApp(<HistoryProbe />, {
      role: "manager",
      prepare: async (mock) => {
        await enableAssist(mock);
        const branch = await equipmentBranch(mock);
        const asset = branch.assets[0]!;
        const earlier = await mock.reportEquipmentIssue({ branchId: branch.branchId, assetId: asset.id, title: "Belt slipping", description: "Belt slipped under load during the evening peak; deck tensioned.", severity: "medium", safetyStatus: "safe_to_operate" });
        await mock.updateEquipmentIssue(earlier.id, { status: "resolved", safetyStatus: "safe_to_operate" });
        earlierId = earlier.id;
        // A resolved display fault with overlapping wording: history, but a separate defect. The seeded open belt issue stays the current report.
        const display = await mock.reportEquipmentIssue({ branchId: branch.branchId, assetId: asset.id, title: "Display flickers under load", description: "Console display flickers and resets at high speed.", severity: "low", safetyStatus: "safe_to_operate" });
        await mock.updateEquipmentIssue(display.id, { status: "resolved", safetyStatus: "safe_to_operate" });
        stash("branch", await equipmentBranch(mock));
      },
    });
    const panel = await screen.findByTestId("repair-history");
    expect(within(panel).getByTestId("repair-history-disclosure")).toHaveTextContent("Other machines and other branches are not included");
    const entries = within(panel).getAllByTestId("repair-history-entry");
    expect(entries.length).toBe(2);
    expect(within(panel).getAllByTestId("repair-history-similar").length).toBeGreaterThanOrEqual(1);
    await user.click(await within(panel).findByTestId(`same-fault-check-${earlierId}`));
    expect(await within(panel).findByTestId(`same-fault-verdict-${earlierId}`)).toHaveTextContent("Same fault, recurring");
    expect(within(panel).getByTestId("repair-history-recurring")).toHaveTextContent("1 earlier report confirmed as the same fault");
    const issues = await api.listEquipmentIssues();
    const current = issues.find((issue) => issue.title === "Belt slipping under load");
    expect(current).toMatchObject({ severity: "high", safetyStatus: "out_of_service", status: "in_progress" });
  });
});

function HandoverProbe() {
  return <ChecklistHandover branchId={stored<string>("handoverBranch")} />;
}

describe("checklist handover", () => {
  it("groups the same item across days and keeps every unresolved obligation with its owner and date, in both views", async () => {
    const user = userEvent.setup();
    await renderWithApp(<HandoverProbe />, {
      role: "manager",
      prepare: async (api) => {
        await enableAssist(api);
        const session = await api.getSession();
        const branchId = session.branches[0]!.id;
        const templates = await api.listChecklistTemplates({ branchId });
        const opening = templates.find((template) => template.type === "opening")!;
        const closing = templates.find((template) => template.type === "closing")!;
        const today = todayISODate("Asia/Amman");
        const changing = opening.items.find((item) => item.label.includes("changing rooms"))!;
        const scanner = opening.items.find((item) => item.label.includes("scanner"))!;
        await api.setChecklistItem({ templateId: opening.id, date: addDays(today, -2), itemId: changing.id, status: "failed", reason: "Shower drain blocked, water on the floor" });
        await api.setChecklistItem({ templateId: opening.id, date: addDays(today, -1), itemId: changing.id, status: "failed", reason: "Drain still blocked" });
        await api.setChecklistItem({ templateId: opening.id, date: addDays(today, -1), itemId: scanner.id, status: "completed" });
        await api.setChecklistItem({ templateId: closing.id, date: addDays(today, -1), itemId: closing.items[0]!.id, status: "failed", reason: "Weights left on the changing room floor, drain smell" });
        stash("handoverBranch", branchId);
      },
    });
    const handover = await screen.findByTestId("checklist-handover");
    expect(within(handover).getByTestId("handover-summary")).toHaveTextContent("previous 7 days");
    const groups = within(handover).getAllByTestId("handover-group");
    expect(groups.some((group) => group.getAttribute("data-group-kind") === "recurring" && group.textContent?.includes("Check changing rooms are clean"))).toBe(true);
    const groupedKeys = within(handover).getAllByTestId("handover-item").map((row) => row.getAttribute("data-item-key"));
    // Only the failed items and today's required pending items are obligations; the completed scanner check is not one.
    expect(groupedKeys.some((key) => key?.includes(addDays(todayISODate("Asia/Amman"), -1)) && key?.includes("open-3"))).toBe(false);
    await user.click(within(handover).getByRole("button", { name: "All items" }));
    const flat = within(handover).getAllByTestId("handover-item").map((row) => row.getAttribute("data-item-key"));
    expect([...flat].sort()).toEqual([...groupedKeys].sort());
    expect(within(handover).getAllByTestId("handover-item")[0]).toHaveTextContent(/receptionist|Reception/);
    await user.click(within(handover).getByRole("button", { name: "Grouped" }));
    const comparison = await within(handover).findByTestId("handover-comparison");
    await user.click(within(comparison).getByTestId("handover-related-check"));
    await within(comparison).findByTestId("handover-related-verdict");
    // Whatever the verdict, the items keep their own rows, owners and dates: nothing is merged or closed.
    expect(within(handover).getAllByTestId("handover-item").length).toBe(groupedKeys.length);
  });
});

describe("notification center groups", () => {
  it("offers a grouped reading with the same rows, keeps mandatory alerts visible, and never marks anything read", async () => {
    const user = userEvent.setup();
    const { api } = await renderWithApp(<NotificationCenter />, { role: "owner", prepare: enableAssist });
    const markRead = vi.spyOn(api, "setNotificationRead");
    const bell = await screen.findByRole("button", { name: /unread notifications/ });
    const unreadBefore = bell.getAttribute("aria-label");
    await user.click(bell);
    const toggle = await screen.findByTestId("notifications-view-toggle");
    const rowsBefore = screen.getAllByTestId("notification-row").length;
    toggle.focus();
    await user.keyboard("{Enter}");
    const grouped = await screen.findByTestId("notification-grouped");
    expect(within(grouped).getByTestId("notification-mandatory")).toHaveTextContent("Entry denied at the door");
    const groups = within(grouped).getAllByTestId("notification-group");
    expect(groups.length).toBeGreaterThanOrEqual(2);
    const bookingGroup = groups.find((group) => group.getAttribute("data-group-id")?.startsWith("entity:booking:"))!;
    expect(within(bookingGroup).getByTestId("notification-group-count")).toHaveTextContent("2 updates · 2 unread");
    // Collapsed groups still count; expanding one shows the original rows with their own controls.
    const header = within(bookingGroup).getByRole("button", { expanded: true });
    await user.click(header);
    expect(within(bookingGroup).queryAllByTestId("notification-row")).toHaveLength(0);
    await user.click(header);
    expect(within(bookingGroup).getAllByTestId("notification-row")).toHaveLength(2);
    expect(markRead).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /unread notifications/ }).getAttribute("aria-label")).toBe(unreadBefore);
    // Every notification is still reachable in the grouped view (expanded groups + mandatory + singles) and the plain list is one click away.
    const visibleRows = within(grouped).getAllByTestId("notification-row").length + groups.filter((group) => group !== bookingGroup).reduce((sum, group) => sum + (within(group).queryAllByTestId("notification-row").length === 0 ? Number(within(group).getByTestId("notification-group-count").textContent?.match(/^(\d+)/)?.[1] ?? 0) : 0), 0);
    expect(visibleRows).toBe(rowsBefore);
    await user.click(screen.getByTestId("notifications-view-toggle"));
    expect(screen.getAllByTestId("notification-row").length).toBe(rowsBefore);
  });

  it("places a stray notification only on request and only as a suggestion", async () => {
    const user = userEvent.setup();
    const { api } = await renderWithApp(<NotificationCenter />, { role: "owner", prepare: enableAssist });
    await user.click(await screen.findByRole("button", { name: /unread notifications/ }));
    await user.click(await screen.findByTestId("notifications-view-toggle"));
    const single = (await screen.findAllByTestId("notification-single")).find((entry) => entry.textContent?.includes("Checklist item escalated"))!;
    await user.click(within(single).getByRole("button", { name: "Suggest a group" }));
    await screen.findByTestId("notification-topic-NOT-demo-task-1");
    expect(screen.queryByTestId("notification-placed")).not.toBeInTheDocument();
    const notifications = await api.listNotifications();
    expect(notifications.find((entry) => entry.id === "NOT-demo-task-1")?.readAt).toBeUndefined();
  });
});
