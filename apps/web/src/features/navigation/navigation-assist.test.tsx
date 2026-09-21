import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OnboardingChecklist } from "@/components/onboarding/onboarding-checklist";
import type { MockGymOSApi } from "@/lib/mock/MockGymOSApi";
import { useApp } from "@/lib/providers/app-providers";
import { renderWithApp, resetApiForTests } from "@/test/harness";
import { ReportFinder } from "./navigation-assist";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }), usePathname: () => "/reports", useParams: () => ({}) }));

afterEach(() => resetApiForTests());

const enableAssist = async (api: MockGymOSApi) => { await api.updateAssistPreference({ enabled: true }); };

function Finder() {
  const { session } = useApp();
  return <ReportFinder session={session} hrefForView={(href) => `${href}${href.includes("?") ? "&" : "?"}branchId=branch-abd&range=30`} />;
}

describe("suggested next setup step", () => {
  it("lifts one open step and keeps every step listed", async () => {
    await renderWithApp(<OnboardingChecklist audience="staff" />, { role: "receptionist", prepare: async (api) => { await api.switchDemoRole("owner"); await enableAssist(api); await api.switchDemoRole("receptionist"); } });
    const card = await screen.findByTestId("onboarding-next-step");
    expect(card).toHaveTextContent("Suggested next step");
    expect(card).toHaveTextContent("Understand your role");
    expect(within(card).getByRole("link", { name: "Open step" })).toHaveAttribute("href", "/getting-started#role");
    const listed = screen.getAllByRole("listitem");
    expect(listed.length).toBeGreaterThanOrEqual(4);
    expect(screen.getAllByRole("link", { name: "Open step" }).length).toBeGreaterThanOrEqual(4);
  });

  it("is absent while suggestions are off", async () => {
    await renderWithApp(<OnboardingChecklist audience="staff" />, { role: "receptionist" });
    expect(await screen.findByText("Understand your role")).toBeInTheDocument();
    expect(screen.queryByTestId("onboarding-next-step")).not.toBeInTheDocument();
  });
});

describe("report finder", () => {
  it("answers a question with a report view and keeps the page's own scope in the link", async () => {
    const user = userEvent.setup();
    await renderWithApp(<Finder />, { prepare: enableAssist });
    const input = await screen.findByRole("textbox", { name: "Question for the reports" });
    await user.type(input, "who is about to leave us?{Enter}");
    const card = await screen.findByTestId("report-finder-card");
    expect(card).toHaveTextContent("Retention");
    expect(card).toHaveTextContent("Dates and branch stay as set above.");
    expect(within(card).getByRole("link", { name: "Open Retention" })).toHaveAttribute("href", "/reports?view=retention&branchId=branch-abd&range=30");
    expect(input).toHaveValue("who is about to leave us?");

    await user.clear(input);
    await user.type(input, "what is the meaning of life{Enter}");
    expect(await screen.findByText(/No report view answers that directly/)).toBeInTheDocument();
  });

  it("is absent while suggestions are off", async () => {
    await renderWithApp(<Finder />);
    expect(screen.queryByTestId("report-finder")).not.toBeInTheDocument();
  });
});
