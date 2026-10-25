import { useState } from "react";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import PlatformAssistancePage from "@/app/platform/assistance/page";
import { renderWithApp, resetApiForTests } from "@/test/harness";
import { PlatformReviewBrief } from "./platform-review-brief";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), useParams: () => ({}), usePathname: () => "/platform", useSearchParams: () => new URLSearchParams() }));

afterEach(() => resetApiForTests());

const pending = { id: "app-1", gymName: "Northline Strength", gymAddress: "", email: "owner@northline.example", contactNumber: "0791234567", plan: "Enterprise", status: "pending" };
const earlier = { ...pending, id: "app-0", gymName: "Northline", gymAddress: "Amman", plan: "Pro", status: "rejected" };

describe("platform review preparation", () => {
  it("shows what to check before deciding, and nothing for decided applications", async () => {
    function Probe() {
      const [status, setStatus] = useState("pending");
      return <><button type="button" onClick={() => setStatus("approved")}>decide</button><PlatformReviewBrief application={{ ...pending, status }} all={[pending, earlier]} /></>;
    }
    const user = userEvent.setup();
    await renderWithApp(<Probe />);
    const brief = await screen.findByTestId("platform-review-brief");
    expect(brief).toHaveTextContent("Same email as Northline (rejected).");
    expect(brief).toHaveTextContent("No gym address was given.");
    expect(brief).toHaveTextContent("Enterprise plan: record the quoted monthly price when you approve.");
    expect(brief).toHaveTextContent("You make the decision.");
    await user.click(screen.getByRole("button", { name: "decide" }));
    await waitFor(() => expect(screen.queryByTestId("platform-review-brief")).not.toBeInTheDocument());
  });

  it("stops assistance for every gym only with a reason, and hides the brief while stopped", async () => {
    const user = userEvent.setup();
    await renderWithApp(<><PlatformAssistancePage /><PlatformReviewBrief application={pending} all={[pending]} /></>);
    expect(await screen.findByTestId("platform-assistance-state")).toHaveTextContent("Running");
    expect(await screen.findByTestId("platform-review-brief")).toBeInTheDocument();
    expect(screen.getByTestId("platform-assistance-toggle")).toBeDisabled();
    await user.type(screen.getByTestId("platform-assistance-reason"), "Incident drill");
    await user.click(screen.getByTestId("platform-assistance-toggle"));
    await waitFor(() => expect(screen.getByTestId("platform-assistance-state")).toHaveTextContent("Stopped for every gym"));
    expect(screen.getByText(/Incident drill/)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByTestId("platform-review-brief")).not.toBeInTheDocument());
  });
});
