import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithApp, resetApiForTests } from "@/test/harness";
import { SubscriptionAgreementSigning } from "./subscription-agreement-signing";

const routerMock = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => routerMock, usePathname: () => "/onboarding/agreement", useSearchParams: () => new URLSearchParams(), useParams: () => ({}) }));

HTMLElement.prototype.scrollIntoView = vi.fn();
vi.stubGlobal("ResizeObserver", class ResizeObserverMock { observe() {} unobserve() {} disconnect() {} });
HTMLElement.prototype.hasPointerCapture = vi.fn(() => false);

afterEach(() => resetApiForTests());

describe("subscription agreement signing", () => {
  it("shows the signed record when the gym already signed", async () => {
    await renderWithApp(<SubscriptionAgreementSigning />, { role: "owner" });
    expect(await screen.findByTestId("agreement-record")).toBeInTheDocument();
    expect(screen.getByText("RVT-20260815-FORGE")).toBeInTheDocument();
    expect(screen.getByText("Countersigned by RIVET")).toBeInTheDocument();
    expect(screen.getByText("••••••4567")).toBeInTheDocument();
    expect(screen.queryByTestId("sign-agreement")).not.toBeInTheDocument();
  });

  it("tells non-owners that the owner signs", async () => {
    await renderWithApp(<SubscriptionAgreementSigning />, { role: "manager", prepare: async (api) => { api.setBehavior({ agreementUnsigned: true }); } });
    expect(await screen.findByText("The gym owner signs this agreement")).toBeInTheDocument();
  });

  it("lets the owner review the text, type a signature, accept the declarations, and sign once", async () => {
    const user = userEvent.setup();
    const { api } = await renderWithApp(<SubscriptionAgreementSigning />, { role: "owner", prepare: async (api) => { api.setBehavior({ agreementUnsigned: true }); } });
    const signSpy = vi.spyOn(api, "signSubscriptionAgreement");
    expect(await screen.findByTestId("agreement-signing")).toBeInTheDocument();
    expect(screen.getByTestId("agreement-text")).toHaveTextContent("Electronic signature");
    expect(screen.getByLabelText(/Registered\ name\ of\ the\ gym\ or\ company/)).toHaveValue("Forge Fitness Club");
    expect(screen.getByLabelText(/Full\ name,\ as\ on\ your\ ID/)).toHaveValue("Omar Al-Khatib");

    const signButton = screen.getByTestId("sign-agreement");
    expect(signButton).toBeDisabled();
    await user.type(screen.getByLabelText(/Address/), "Abdoun Circle");
    await user.type(screen.getByLabelText(/ID\ number/), "9871234567");
    await user.click(screen.getByRole("radio", { name: "Type my name" }));
    await user.type(screen.getByLabelText(/Type\ your\ full\ name\ as\ your\ signature/), "Omar Al-Khatib");
    for (const box of screen.getAllByRole("checkbox")) await user.click(box);
    await waitFor(() => expect(signButton).toBeEnabled());
    await user.click(signButton);

    await waitFor(() => expect(signSpy).toHaveBeenCalledWith(expect.objectContaining({
      signatory: expect.objectContaining({ name: "Omar Al-Khatib", idType: "national", idNumber: "9871234567" }),
      signature: { method: "typed", typedName: "Omar Al-Khatib" },
      consents: { agreement: true, authority: true, electronic: true, accurate: true },
      clientDocumentSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    })));
    expect(await screen.findByTestId("agreement-record")).toBeInTheDocument();
    expect(screen.getByText("Awaiting RIVET countersignature")).toBeInTheDocument();
    expect((await api.getSession()).legal?.agreementStatus).toBe("signed");
  });
});
