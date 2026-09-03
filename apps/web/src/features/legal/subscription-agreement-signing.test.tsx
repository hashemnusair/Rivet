import { afterEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithApp, resetApiForTests } from "@/test/harness";
import { SubscriptionAgreementSigning } from "./subscription-agreement-signing";

const routerMock = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => routerMock, usePathname: () => "/onboarding/agreement", useSearchParams: () => new URLSearchParams(), useParams: () => ({}) }));

afterEach(() => resetApiForTests());

describe("subscription agreement page", () => {
  it("shows the signed record when the gym already signed", async () => {
    await renderWithApp(<SubscriptionAgreementSigning />, { role: "owner" });
    expect(await screen.findByTestId("agreement-record")).toBeInTheDocument();
    expect(screen.getByText("RVT-20260815-FORGE")).toBeInTheDocument();
    expect(screen.getByText("Signed and countersigned")).toBeInTheDocument();
    expect(screen.getByText(/••••••4567/)).toBeInTheDocument();
    expect(screen.queryByTestId("sign-agreement")).not.toBeInTheDocument();
  });

  it("tells non-owners that the owner signs", async () => {
    await renderWithApp(<SubscriptionAgreementSigning />, { role: "manager", prepare: async (api) => { api.setBehavior({ agreementUnsigned: true }); } });
    expect(await screen.findByText("The gym owner signs this agreement")).toBeInTheDocument();
  });

  it("points an unsigned owner at the modal instead of embedding a form", async () => {
    await renderWithApp(<SubscriptionAgreementSigning />, { role: "owner", prepare: async (api) => { api.setBehavior({ agreementUnsigned: true }); } });
    expect(await screen.findByText("Sign the agreement to continue")).toBeInTheDocument();
    expect(screen.queryByTestId("agreement-signing")).not.toBeInTheDocument();
  });
});
