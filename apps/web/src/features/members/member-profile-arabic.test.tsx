import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Task } from "@/lib/domain/types";
import { TimelineFeed } from "@/components/shared/timeline-feed";
import { LocaleProvider } from "@/lib/i18n/provider";
import { MemberTasksPanel } from "./member-tabs";

const state = vi.hoisted(() => ({ listTasks: vi.fn(), completeTask: vi.fn() }));
vi.mock("@/lib/api/client", () => ({ getApi: () => ({ listTasks: state.listTasks, completeTask: state.completeTask }) }));
vi.mock("@/lib/providers/app-providers", () => ({ useApp: () => ({ session: undefined }), usePermissions: () => ({ can: () => true }) }));
vi.mock("@/features/crm/contact-work-panel", () => ({ LogContactForm: ({ submitLabel }: { submitLabel?: string }) => <div data-testid="log-contact-form">{submitLabel}</div> }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

const now = new Date().toISOString();
const task = (overrides: Partial<Task>): Task => ({ id: "task-1", organizationId: "org", type: "follow_up", title: "Follow up — Yara Sweidan", ownerId: "user", ownerName: "Omar", dueAt: now, priority: "normal", status: "open", memberId: "member-1", subjectName: "Yara Sweidan", createdById: "user", createdAt: now, ...overrides });

function renderArabic(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <LocaleProvider initialLocale="ar">{ui}</LocaleProvider>
    </QueryClientProvider>,
  );
}

describe("member profile in Arabic", () => {
  beforeEach(() => {
    state.listTasks.mockReset();
    state.completeTask.mockReset();
  });

  it("shows the empty task list in Arabic", async () => {
    state.listTasks.mockResolvedValue({ items: [], page: 1, pageSize: 10, totalItems: 0, totalPages: 1 });
    renderArabic(<MemberTasksPanel memberId="member-1" />);
    expect(await screen.findByText("لا توجد مهام مفتوحة لهذا العضو.")).toBeInTheDocument();
  });

  it("asks what happened in Arabic before finishing a follow-up", async () => {
    state.listTasks.mockResolvedValue({ items: [task({})], page: 1, pageSize: 10, totalItems: 1, totalPages: 1 });
    const user = userEvent.setup();
    renderArabic(<MemberTasksPanel memberId="member-1" />);
    await user.click(await screen.findByRole("button", { name: /إكمال المهمة/ }));
    expect(await screen.findByRole("dialog", { name: "ماذا حدث؟" })).toBeInTheDocument();
    expect(screen.getByTestId("log-contact-form")).toHaveTextContent("حفظ وإنهاء");
    expect(screen.getByRole("button", { name: "تم، لا شيء للتسجيل" })).toBeInTheDocument();
  });

  it("shows the timeline empty state in Arabic", () => {
    renderArabic(<TimelineFeed events={[]} />);
    expect(screen.getByText("لا يوجد شيء مسجّل بعد.")).toBeInTheDocument();
  });
});
