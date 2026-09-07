import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Task } from "@/lib/domain/types";
import { MemberTasksPanel } from "./member-tabs";

const state = vi.hoisted(() => ({ listTasks: vi.fn(), completeTask: vi.fn() }));
vi.mock("@/lib/api/client", () => ({ getApi: () => ({ listTasks: state.listTasks, completeTask: state.completeTask }) }));
vi.mock("@/lib/providers/app-providers", () => ({ useApp: () => ({ session: undefined }), usePermissions: () => ({ can: () => true }) }));
vi.mock("@/features/crm/contact-work-panel", () => ({ LogContactForm: ({ submitLabel }: { submitLabel?: string }) => <div data-testid="log-contact-form">{submitLabel}</div> }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

const now = new Date().toISOString();
const task = (overrides: Partial<Task>): Task => ({ id: "task-1", organizationId: "org", type: "follow_up", title: "Follow up — Yara Sweidan", ownerId: "user", ownerName: "Omar", dueAt: now, priority: "normal", status: "open", memberId: "member-1", subjectName: "Yara Sweidan", createdById: "user", createdAt: now, ...overrides });

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><MemberTasksPanel memberId="member-1" /></QueryClientProvider>);
}

describe("member record open tasks", () => {
  beforeEach(() => {
    state.listTasks.mockReset();
    state.completeTask.mockReset().mockImplementation(async (id: string) => task({ id, status: "completed" }));
  });

  it("asks what happened before closing a follow-up, and still allows a blind completion", async () => {
    state.listTasks.mockResolvedValue({ items: [task({})], page: 1, pageSize: 10, totalItems: 1, totalPages: 1 });
    const user = userEvent.setup();
    renderPanel();
    await user.click(await screen.findByRole("button", { name: "Complete task Follow up — Yara Sweidan" }));
    const dialog = await screen.findByRole("dialog", { name: "What happened?" });
    expect(within(dialog).getByTestId("log-contact-form")).toHaveTextContent("Log contact and finish");
    expect(state.completeTask).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "Mark done without a contact" }));
    await waitFor(() => expect(state.completeTask).toHaveBeenCalledWith("task-1", { outcome: "Completed from member page" }));
  });

  it("completes a task that is not a conversation directly", async () => {
    state.listTasks.mockResolvedValue({ items: [task({ id: "task-2", type: "general", title: "Return locker key" })], page: 1, pageSize: 10, totalItems: 1, totalPages: 1 });
    const user = userEvent.setup();
    renderPanel();
    await user.click(await screen.findByRole("button", { name: "Complete task Return locker key" }));
    await waitFor(() => expect(state.completeTask).toHaveBeenCalledWith("task-2", { outcome: "Completed from member page" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
