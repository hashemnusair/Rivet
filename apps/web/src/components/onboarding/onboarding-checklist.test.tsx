import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OnboardingExperience } from "@/lib/domain/qol";
import { OnboardingChecklist } from "./onboarding-checklist";

const mocks = vi.hoisted(() => ({ get: vi.fn(), update: vi.fn(), success: vi.fn(), error: vi.fn() }));
vi.mock("@/lib/api/client", () => ({ getApi: () => ({ getOnboardingExperience: mocks.get, updateOnboardingProgress: mocks.update }) }));
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error } }));
const experience: OnboardingExperience = {
  progress: { audience: "member", version: 1, completedStepKeys: [], updatedAt: "2026-09-08T00:00:00Z" },
  tasks: [{ key: "member_intro", title: "Review entry", description: "Read the entry instructions", href: "/customer/my-gyms", category: "required", complete: true, completionMode: "manual" }],
};
function show(compact = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}><OnboardingChecklist audience="member" compact={compact} /></QueryClientProvider>);
}
beforeEach(() => { vi.clearAllMocks(); mocks.get.mockResolvedValue(experience); });

describe("onboarding completion", () => {
  it("hides the banner when required tasks are complete even without a saved completion timestamp", async () => {
    mocks.get.mockResolvedValue({ ...experience, tasks: [...experience.tasks, { ...experience.tasks[0], key: "optional", category: "optional", complete: false }] });
    const { container } = show(true);
    await waitFor(() => expect(mocks.get).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
  it("keeps the full checklist available for review", async () => {
    show();
    expect(await screen.findByText("100% ready")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Review" })).toBeInTheDocument();
  });
  it("does not report success when saving a manual step fails", async () => {
    mocks.get.mockResolvedValue({ ...experience, tasks: [{ ...experience.tasks[0], complete: false }] });
    mocks.update.mockRejectedValue(new Error("Save failed"));
    show();
    fireEvent.click(await screen.findByRole("button", { name: "Mark complete" }));
    await waitFor(() => expect(mocks.error).toHaveBeenCalled());
    expect(mocks.success).not.toHaveBeenCalled();
  });
  it("reports success after the manual step is saved", async () => {
    mocks.get.mockResolvedValue({ ...experience, tasks: [{ ...experience.tasks[0], complete: false }] });
    mocks.update.mockResolvedValue(experience.progress);
    show();
    fireEvent.click(await screen.findByRole("button", { name: "Mark complete" }));
    await waitFor(() => expect(mocks.success).toHaveBeenCalledWith("Step marked complete."));
  });
});
