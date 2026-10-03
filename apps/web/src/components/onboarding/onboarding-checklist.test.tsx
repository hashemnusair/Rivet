import { LocaleProvider } from "@/lib/i18n/provider";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { qk } from "@/lib/api/keys";
import type { OnboardingAudience, OnboardingExperience } from "@/lib/domain/qol";
import { OnboardingChecklist } from "./onboarding-checklist";

const mocks = vi.hoisted(() => ({ get: vi.fn(), update: vi.fn(), success: vi.fn(), error: vi.fn() }));
vi.mock("@/lib/api/client", () => ({ getApi: () => ({ getOnboardingExperience: mocks.get, updateOnboardingProgress: mocks.update }) }));
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error } }));
const experience: OnboardingExperience = {
  progress: { audience: "member", version: 1, completedStepKeys: [], updatedAt: "2026-09-08T00:00:00Z" },
  tasks: [{ key: "member_intro", title: "Review entry", description: "Read the entry instructions", href: "/customer/my-gyms", category: "required", complete: true, completionMode: "manual" }],
};
const staffExperience: OnboardingExperience = {
  progress: { audience: "staff", version: 1, completedStepKeys: [], updatedAt: "2026-09-08T00:00:00Z" },
  tasks: [{ key: "staff_role", title: "Understand your role", description: "Review your role access", href: "/getting-started#role", category: "required", complete: false, completionMode: "manual" }],
};
function show(compact = false, audience: OnboardingAudience = "member") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return { ...render(<QueryClientProvider client={client}><OnboardingChecklist audience={audience} compact={compact} /></QueryClientProvider>), client };
}
beforeEach(() => { vi.clearAllMocks(); mocks.get.mockResolvedValue(experience); });
afterEach(() => { window.history.replaceState({}, "", "/"); });

describe("onboarding completion", () => {
  it("hides the banner when required tasks are complete even without a saved completion timestamp", async () => {
    mocks.get.mockResolvedValue({ ...experience, tasks: [...experience.tasks, { ...experience.tasks[0], key: "optional", category: "optional", complete: false }] });
    const { container, client } = show(true);
    await waitFor(() => expect(client.getQueryState(qk.onboarding("member"))?.status).toBe("success"));
    expect(container).toBeEmptyDOMElement();
  });
  it("keeps the full checklist available for review", async () => {
    show();
    expect(await screen.findByText("100% ready")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Review" })).toBeInTheDocument();
  });
  it("re-applies a guide hash after delayed checklist data loads", async () => {
    const target = document.createElement("section");
    target.id = "role";
    const scrollIntoView = vi.fn();
    Object.defineProperty(target, "scrollIntoView", { configurable: true, value: scrollIntoView });
    document.body.append(target);
    window.history.replaceState({}, "", "/getting-started#role");

    let resolvePending: (value: OnboardingExperience) => void = () => undefined;
    const pending = new Promise<OnboardingExperience>((resolve) => { resolvePending = resolve; });
    mocks.get.mockReturnValue(pending);
    const rendered = show(false, "staff");
    try {
      expect(scrollIntoView).not.toHaveBeenCalled();
      resolvePending(staffExperience);
      await waitFor(() => expect(scrollIntoView).toHaveBeenCalledWith({ block: "start" }));

      mocks.get.mockResolvedValue({ ...staffExperience, progress: { ...staffExperience.progress, updatedAt: "2026-09-08T00:01:00Z" } });
      await rendered.client.invalidateQueries({ queryKey: qk.onboarding("staff") });
      await waitFor(() => expect(mocks.get).toHaveBeenCalledTimes(2));
      expect(scrollIntoView).toHaveBeenCalledTimes(1);
    } finally {
      rendered.unmount();
      target.remove();
    }
  });
  it("does not report success when saving a manual step fails", async () => {
    mocks.get.mockResolvedValue({ ...experience, tasks: [{ ...experience.tasks[0], complete: false }] });
    mocks.update.mockRejectedValue(new Error("Save failed"));
    show();
    fireEvent.click(await screen.findByRole("button", { name: "Mark as done" }));
    await waitFor(() => expect(mocks.error).toHaveBeenCalled());
    expect(mocks.success).not.toHaveBeenCalled();
  });
  it("reports success after the manual step is saved", async () => {
    mocks.get.mockResolvedValue({ ...experience, tasks: [{ ...experience.tasks[0], complete: false }] });
    mocks.update.mockResolvedValue(experience.progress);
    show();
    fireEvent.click(await screen.findByRole("button", { name: "Mark as done" }));
    await waitFor(() => expect(mocks.success).toHaveBeenCalledWith("Step marked as done."));
  });
});

it("renders Arabic setup instructions and records only the canonical task key", async () => {
  mocks.get.mockResolvedValue({ ...staffExperience, role: "manager" });
  mocks.update.mockResolvedValue(staffExperience.progress);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<LocaleProvider initialLocale="ar"><QueryClientProvider client={client}><OnboardingChecklist audience="staff" /></QueryClientProvider></LocaleProvider>);
  expect(await screen.findByRole("heading", { name: "فهم دورك" })).toBeInTheDocument();
  expect(screen.getByText(/راجع ما يمكن لدور/)).toHaveTextContent("مدير");
  fireEvent.click(screen.getByRole("button", { name: "تحديد كمكتملة" }));
  await waitFor(() => expect(mocks.update).toHaveBeenCalledWith({ audience: "staff", completedStepKey: "staff_role" }));
  expect(mocks.success).toHaveBeenCalledWith("تم تحديد الخطوة كمكتملة.");
});
