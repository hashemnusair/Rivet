import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithApp, resetApiForTests } from "@/test/harness";
import { useApp } from "@/lib/providers/app-providers";
import { SubscriptionAgreementGate } from "./subscription-agreement-modal";

const routerMock = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => routerMock, usePathname: () => "/members", useSearchParams: () => new URLSearchParams(), useParams: () => ({}) }));

HTMLElement.prototype.scrollIntoView = vi.fn();
HTMLElement.prototype.hasPointerCapture = vi.fn(() => false);
vi.stubGlobal("ResizeObserver", class ResizeObserverMock { observe() {} unobserve() {} disconnect() {} });

// jsdom has no layout. Give the agreement's scroll container a tall body and
// a short viewport so "read to the end" has to be earned by scrolling.
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "scrollHeight", { configurable: true, get(this: HTMLElement) { return this.dataset.testid === "agreement-scroll" ? 1600 : 0; } });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, get(this: HTMLElement) { return this.dataset.testid === "agreement-scroll" ? 400 : 0; } });
});

afterEach(() => resetApiForTests());

/** The gate as the app shell mounts it: driven by the live session. */
function SessionGate() {
  const { session } = useApp();
  return <SubscriptionAgreementGate required={session?.legal?.agreementStatus === "required"} />;
}

describe("subscription agreement modal", () => {
  it("stays out of the way when the gym has already signed", async () => {
    await renderWithApp(<SessionGate />, { role: "owner" });
    await waitFor(() => expect(screen.queryByTestId("agreement-modal")).not.toBeInTheDocument());
  });

  it("blocks an unsigned owner, unlocks agreement only after scrolling to the end, collects the essentials, signs, and reports the copies", async () => {
    const user = userEvent.setup();
    const { api } = await renderWithApp(<SessionGate />, { role: "owner", prepare: async (api) => { api.setBehavior({ agreementUnsigned: true }); } });
    const signSpy = vi.spyOn(api, "signSubscriptionAgreement");

    const modal = await screen.findByTestId("agreement-modal");
    expect(within(modal).getByTestId("agreement-text")).toHaveTextContent("Electronic signature");
    expect(within(modal).queryByRole("button", { name: "Close dialog" })).not.toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.getByTestId("agreement-modal")).toBeInTheDocument();

    const agree = within(modal).getByTestId("agree-continue");
    expect(agree).toBeDisabled();
    expect(within(modal).getByText("Scroll to the end of the agreement to continue.")).toBeInTheDocument();
    const scroller = within(modal).getByTestId("agreement-scroll");
    scroller.scrollTop = 600;
    fireEvent.scroll(scroller);
    expect(agree).toBeDisabled();
    scroller.scrollTop = 1200;
    fireEvent.scroll(scroller);
    await waitFor(() => expect(agree).toBeEnabled());
    expect(within(modal).getByText("You have reached the end of the agreement.")).toBeInTheDocument();
    await user.click(agree);

    // Only the essentials are asked for; the plan is shown, not chosen.
    expect(within(modal).getByLabelText(/Registered name of the gym or company/)).toHaveValue("Forge Fitness Club");
    expect(within(modal).getByLabelText(/Full name, as on your ID/)).toHaveValue("Omar Al-Khatib");
    expect(within(modal).getByLabelText(/^Plan/)).toHaveAttribute("readonly");
    expect(within(modal).queryByLabelText(/Trade name/)).not.toBeInTheDocument();
    expect(within(modal).queryByLabelText(/Commercial registration/)).not.toBeInTheDocument();
    expect(within(modal).queryByLabelText(/Phone/)).not.toBeInTheDocument();
    expect(within(modal).queryByLabelText(/Initial term/)).not.toBeInTheDocument();
    expect(within(modal).queryByLabelText(/quote/i)).not.toBeInTheDocument();

    await user.click(within(modal).getByTestId("details-continue"));
    expect(within(modal).getByText("Enter the ten-digit Jordanian national ID number.")).toBeInTheDocument();
    expect(within(modal).queryByTestId("signature-pad")).not.toBeInTheDocument();
    await user.type(within(modal).getByLabelText(/ID number/), "9871234567");
    await user.click(within(modal).getByTestId("details-continue"));

    expect(within(modal).getByTestId("signing-summary")).toHaveTextContent("••••••4567");
    const sign = within(modal).getByTestId("sign-agreement");
    expect(sign).toBeDisabled();
    await user.click(within(modal).getByRole("radio", { name: "Type my name" }));
    await user.type(within(modal).getByLabelText("Type your full name as your signature"), "Omar Al-Khatib");
    const boxes = within(modal).getAllByRole("checkbox");
    expect(boxes).toHaveLength(2);
    for (const box of boxes) await user.click(box);
    await waitFor(() => expect(sign).toBeEnabled());
    await user.click(sign);

    await waitFor(() => expect(signSpy).toHaveBeenCalledWith(expect.objectContaining({
      customer: { legalName: "Forge Fitness Club", address: "Salah Al-Suheimat St 12, Abdoun, Amman" },
      signatory: { name: "Omar Al-Khatib", idType: "national", idNumber: "9871234567", email: "omar@forgefitness.jo" },
      subscription: expect.objectContaining({ plan: "Pro" }),
      consents: { agreement: true, authority: true, electronic: true, accurate: true },
      signature: { method: "typed", typedName: "Omar Al-Khatib" },
      clientDocumentSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    })));
    const done = await screen.findByTestId("agreement-signed");
    expect(done).toHaveTextContent("Agreement signed");
    expect(done).toHaveTextContent("omar@forgefitness.jo");
    expect(done).toHaveTextContent("elias@rivetjo.com · hashem@rivetjo.com");

    await user.click(within(done).getByTestId("agreement-continue"));
    await waitFor(() => expect(screen.queryByTestId("agreement-modal")).not.toBeInTheDocument());
    expect((await api.getSession()).legal?.agreementStatus).toBe("signed");
  });

  it("never blocks staff", async () => {
    await renderWithApp(<SessionGate />, { role: "manager", prepare: async (api) => { api.setBehavior({ agreementUnsigned: true }); } });
    await waitFor(() => expect(screen.queryByTestId("agreement-modal")).not.toBeInTheDocument());
  });
});
