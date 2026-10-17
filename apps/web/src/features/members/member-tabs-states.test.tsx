import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
import type { MemberDetail } from "@/lib/domain/types";
import { LocaleProvider } from "@/lib/i18n/provider";
import { MemberDetailsPanel, PaymentsTab } from "./member-tabs";

const state = vi.hoisted(() => ({ listTransactions: vi.fn() }));
vi.mock("@/lib/api/client", () => ({ getApi: () => ({ listTransactions: state.listTransactions }) }));
vi.mock("@/lib/providers/app-providers", () => ({ useApp: () => ({ session: undefined }), usePermissions: () => ({ can: () => true }) }));

function renderEnglish(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <LocaleProvider initialLocale="en">{ui}</LocaleProvider>
    </QueryClientProvider>,
  );
}

describe("member record tab states", () => {
  it("shows a server refusal of the payment list as a permission state, not a retry", async () => {
    state.listTransactions.mockRejectedValue(new ApiError({ code: "FORBIDDEN", message: "Missing permission: reports.financial.read", requestId: "req-1" }));
    renderEnglish(<PaymentsTab memberId="member-1" />);
    expect(await screen.findByText("You don't have access")).toBeInTheDocument();
    expect(screen.getByText(/Your role cannot see this member's payments/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /try again/i })).not.toBeInTheDocument();
  });

  it("prints Not recorded for profile fields nobody has filled in", () => {
    const member = {
      id: "member-1",
      fullName: "Yara Sweidan",
      phone: "+962790000001",
      preferredLanguage: "en",
      createdAt: "2026-09-01T08:00:00.000Z",
    } as unknown as MemberDetail;
    renderEnglish(<MemberDetailsPanel member={member} branchName="Main branch" />);
    // Email, gender, date of birth, address, emergency contact and how they found us.
    expect(screen.getAllByText("Not recorded")).toHaveLength(6);
    expect(screen.queryByText("—")).not.toBeInTheDocument();
  });
});
