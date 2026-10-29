import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LocaleProvider } from "@/lib/i18n/provider";
import MemberDetailPageClient from "./member-detail.client";

const state = vi.hoisted(() => ({ search: "", permissions: [] as string[] }));

vi.mock("next/navigation", () => ({
  useParams: () => ({ memberId: "member-1" }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(state.search),
}));
vi.mock("@/lib/providers/app-providers", () => ({
  useApp: () => ({ session: { branches: [] } }),
  usePermissions: () => ({ can: (permission: string) => state.permissions.includes(permission) }),
}));
vi.mock("@/lib/hooks/use-realtime-api", () => ({
  useRealtimeApiQuery: () => ({ isLoading: false, isError: false, data: { id: "member-1", fullName: "Yara Sweidan", homeBranchId: "branch-1" } }),
}));
vi.mock("@/lib/hooks/use-api", () => ({
  useApiQuery: () => ({ isLoading: false, isError: false, data: { items: [] } }),
  useApiMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useInvalidate: () => vi.fn(),
}));
vi.mock("@/features/members/member-tabs", () => ({
  CheckInsTab: () => null,
  MemberDetailsPanel: () => null,
  MemberTasksPanel: () => null,
  MembershipsTab: () => null,
  OverviewTab: () => null,
  PaymentsTab: () => <div data-testid="payments-tab" />,
  PersonalTrainingTab: () => null,
  TimelineTab: () => null,
}));
vi.mock("@/features/members/member-header", () => ({ MemberHeader: () => null }));
vi.mock("@/features/crm/contact-work-panel", () => ({ LogContactDialog: () => null }));
vi.mock("@/features/crm/whatsapp-handoff", () => ({ WhatsAppHandoff: () => null }));
vi.mock("@/features/members/create-task-dialog", () => ({ CreateTaskDialog: () => null }));
vi.mock("@/features/followup/follow-up-context", () => ({ FollowUpContextPanel: () => null }));
vi.mock("@/components/shared/chrome", () => ({ Breadcrumbs: () => null }));

function renderPage() {
  return render(<LocaleProvider initialLocale="en"><MemberDetailPageClient /></LocaleProvider>);
}

describe("member record Payments tab", () => {
  beforeEach(() => {
    state.search = "";
    state.permissions = ["members.read"];
  });

  it("leaves Payments out of the tab strip for a role that cannot read it", () => {
    renderPage();
    expect(screen.getByRole("tab", { name: "Timeline" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Payments" })).not.toBeInTheDocument();
  });

  it("answers a payments deep link with a permission state instead of a retry", () => {
    state.search = "tab=payments";
    renderPage();
    expect(screen.getByText("You don't have access")).toBeInTheDocument();
    expect(screen.getByText(/Your role cannot see this member's payments/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /try again/i })).not.toBeInTheDocument();
    expect(screen.queryByTestId("payments-tab")).not.toBeInTheDocument();
  });

  it("keeps the tab and the payment list for a role with financial reports", () => {
    state.permissions = ["members.read", "reports.financial.read"];
    state.search = "tab=payments";
    renderPage();
    expect(screen.getByRole("tab", { name: "Payments" })).toBeInTheDocument();
    expect(screen.getByTestId("payments-tab")).toBeInTheDocument();
  });
});
