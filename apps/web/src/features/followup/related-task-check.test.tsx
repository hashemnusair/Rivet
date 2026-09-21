import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CreateTaskDialog } from "@/features/members/create-task-dialog";
import type { MockGymOSApi } from "@/lib/mock/MockGymOSApi";
import type { MemberSummary, Task } from "@/lib/domain/types";
import { renderWithApp, resetApiForTests } from "@/test/harness";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }), usePathname: () => "/members", useParams: () => ({}), useSearchParams: () => new URLSearchParams() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

afterEach(() => resetApiForTests());

const later = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

async function memberWithoutTasks(api: MockGymOSApi): Promise<MemberSummary> {
  const page = await api.listMembers({ status: "active", pageSize: 80 });
  for (const candidate of page.items) {
    const open = await api.listTasks({ status: "open", memberId: candidate.id, pageSize: 5 });
    if (open.totalItems === 0) return candidate;
  }
  throw new Error("seed should contain a member without open tasks");
}

async function prepare(api: MockGymOSApi, existing: Pick<Task, "type" | "title">): Promise<{ member: MemberSummary; task: Task }> {
  await api.updateAssistPreference({ enabled: true });
  const member = await memberWithoutTasks(api);
  const session = await api.getSession();
  const task = await api.createFollowUp({ type: existing.type, title: existing.title, ownerId: session.user.id, dueAt: later(2), memberId: member.id });
  window.sessionStorage.setItem("test.member", JSON.stringify({ id: member.id, name: member.fullName }));
  return { member, task };
}

function Probe({ onOpenChange }: { onOpenChange: (open: boolean) => void }) {
  const stored = JSON.parse(window.sessionStorage.getItem("test.member") ?? "{}") as { id: string; name: string };
  return <CreateTaskDialog memberId={stored.id} memberName={stored.name} open onOpenChange={onOpenChange} />;
}

describe("related open work when creating a task", () => {
  it("lists open work, points at the same work, and links the new task only on an explicit follow-on", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    let seeded: { member: MemberSummary; task: Task } | undefined;
    const { api } = await renderWithApp(<Probe onOpenChange={onOpenChange} />, { prepare: async (mock) => { seeded = await prepare(mock, { type: "follow_up", title: "Follow up — about the class schedule" }); } });
    const related = await screen.findByTestId("related-work");
    await waitFor(() => expect(related).toHaveTextContent("Follow up — about the class schedule"));
    await user.click(screen.getByRole("button", { name: "Check for related work" }));
    const card = await screen.findByTestId("related-task-card");
    expect(within(card).getByTestId("related-task-match")).toHaveTextContent("same work as “Follow up — about the class schedule”");

    const before = await api.listTasks({ status: "open", memberId: seeded!.member.id, pageSize: 10 });
    expect(before.totalItems).toBe(1);
    await user.click(within(card).getByRole("button", { name: "Create as follow-on" }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    const after = await api.listTasks({ status: "open", memberId: seeded!.member.id, pageSize: 10 });
    expect(after.totalItems).toBe(2);
    const created = after.items.find((task) => task.id !== seeded!.task.id)!;
    expect(created).toMatchObject({ relatedTaskId: seeded!.task.id, relatedTaskTitle: "Follow up — about the class schedule", status: "open" });
    // The existing task is untouched: not closed, not merged, not moved.
    expect(after.items.find((task) => task.id === seeded!.task.id)).toMatchObject({ status: "open", dueAt: seeded!.task.dueAt });
  });

  it("refuses to link a task that changed since the suggestion", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    let seeded: { member: MemberSummary; task: Task } | undefined;
    const { api } = await renderWithApp(<Probe onOpenChange={onOpenChange} />, { prepare: async (mock) => { seeded = await prepare(mock, { type: "follow_up", title: "Follow up — renewal chat" }); } });
    await screen.findByTestId("related-work");
    await user.click(await screen.findByRole("button", { name: "Check for related work" }));
    const card = await screen.findByTestId("related-task-card");
    await api.completeTask(seeded!.task.id, { outcome: "Done elsewhere" });
    await user.click(within(card).getByRole("button", { name: "Create as follow-on" }));
    expect(await screen.findByTestId("related-task-stale")).toHaveTextContent("changed since the suggestion");
    expect(onOpenChange).not.toHaveBeenCalled();
    expect((await api.listTasks({ status: "open", memberId: seeded!.member.id, pageSize: 10 })).totalItems).toBe(0);
  });

  it("does not relate similar-looking but different work", async () => {
    const user = userEvent.setup();
    await renderWithApp(<Probe onOpenChange={vi.fn()} />, { prepare: async (mock) => { await prepare(mock, { type: "payment_collection", title: "Collect balance 40.000 JOD" }); } });
    await screen.findByTestId("related-work");
    await user.click(await screen.findByRole("button", { name: "Check for related work" }));
    expect(await screen.findByTestId("related-task-none")).toHaveTextContent("No open task covers this work");
  });
});
