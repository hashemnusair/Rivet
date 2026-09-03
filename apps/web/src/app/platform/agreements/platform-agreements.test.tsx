import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithApp, resetApiForTests } from "@/test/harness";
import { PlatformAgreements } from "./platform-agreements.client";

const routerMock = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }));
let params = new URLSearchParams();
vi.mock("next/navigation", () => ({ useRouter: () => routerMock, usePathname: () => "/platform/agreements", useSearchParams: () => params, useParams: () => ({}) }));

HTMLElement.prototype.scrollIntoView = vi.fn();
HTMLElement.prototype.hasPointerCapture = vi.fn(() => false);

afterEach(() => { params = new URLSearchParams(); resetApiForTests(); });

describe("platform agreements console", () => {
  it("lists signed agreements and opens one from a deep link", async () => {
    const seededId = (await (async () => { const { MockGymOSApi } = await import("@/lib/mock/MockGymOSApi"); const probe = new MockGymOSApi(); return (await probe.listPlatformAgreements())[0]!.id; })());
    params = new URLSearchParams({ agreement: seededId });
    await renderWithApp(<PlatformAgreements />, { role: "owner" });
    expect(await screen.findAllByTestId("platform-agreement-row")).toHaveLength(1);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByTestId("agreement-record")).toHaveTextContent("RVT-20260815-FORGE");
    expect(within(dialog).getByText(/Countersigned by Elias Hreish/)).toBeInTheDocument();
  });

  it("reveals the ID with a reason and countersigns a newly signed agreement", async () => {
    const user = userEvent.setup();
    const { api } = await renderWithApp(<PlatformAgreements />, { role: "owner", prepare: async (api) => {
      api.setBehavior({ agreementUnsigned: true });
      const { canonicalAgreementText, sha256Hex } = await import("../../../../convex/legalAgreementText");
      await api.signSubscriptionAgreement({
        customer: { legalName: "Iron House Fitness Co.", address: "Mecca Street", city: "Amman", branches: 1 },
        signatory: { name: "Omar Al-Khatib", title: "Owner", idType: "national", idNumber: "9871234567", phone: "079 555 0101", email: "omar@forgefitness.jo" },
        subscription: { plan: "Growth", startDate: "2026-10-01", termMonths: 12 },
        consents: { agreement: true, authority: true, electronic: true, accurate: true },
        signature: { method: "typed", typedName: "Omar Al-Khatib" },
        client: { userAgent: "test", language: "en", viewport: "1440x900" },
        placeOfSigning: "Amman",
        clientDocumentSha256: await sha256Hex(canonicalAgreementText()),
        idempotencyKey: "test-sign",
      });
    } });
    const rows = await screen.findAllByTestId("platform-agreement-row");
    expect(rows).toHaveLength(2);
    expect(screen.getByText("1 awaiting countersignature")).toBeInTheDocument();
    await user.click(within(rows[0]!).getByRole("button", { name: /Open agreement/ }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("••••••4567")).toBeInTheDocument();

    await user.type(within(dialog).getByTestId("reveal-reason"), "Verifying before countersigning");
    await user.click(within(dialog).getByTestId("reveal-id"));
    expect(await within(dialog).findByText("9871234567")).toBeInTheDocument();

    const actorName = (await api.getSession()).user.name;
    const nameInput = within(dialog).getByTestId("countersign-name");
    await user.clear(nameInput);
    await user.type(nameInput, actorName);
    // RIVET signs its own side. A canvas cannot be drawn on in jsdom, so the
    // test adopts the typed name, which the server checks against the account.
    expect(within(dialog).getByTestId("countersign")).toBeDisabled();
    await user.click(within(dialog).getByRole("radio", { name: "Type my name" }));
    await user.type(within(dialog).getByLabelText("Type your full name as your signature"), actorName);
    await user.click(within(dialog).getByTestId("countersign"));
    await waitFor(() => expect(within(dialog).getByText(new RegExp(`Countersigned by ${actorName}`))).toBeInTheDocument());

    // Copies can be sent again, and the console says plainly what happened to
    // each one rather than implying delivery.
    await user.click(within(dialog).getByTestId("resend-copies"));
    const result = await within(dialog).findByTestId("resend-result");
    expect(result).toHaveTextContent("elias@rivetjo.com: not sent, Operational email mode is off (RIVET_EMAIL_MODE)");
    expect(result).toHaveTextContent("hashem@rivetjo.com: not sent");
    expect(result).not.toHaveTextContent("omar@forgefitness.jo");
    await user.click(within(dialog).getByLabelText("Also send to the signatory"));
    await user.click(within(dialog).getByTestId("resend-copies"));
    await waitFor(() => expect(within(dialog).getByTestId("resend-result")).toHaveTextContent("omar@forgefitness.jo"));

    // Voiding needs a reason, keeps the record, and tells the console why.
    await user.click(within(dialog).getByTestId("void-agreement"));
    expect(within(dialog).getByTestId("void-confirm")).toBeDisabled();
    await user.type(within(dialog).getByTestId("void-reason"), "Re-signing on the current text");
    await user.click(within(dialog).getByTestId("void-confirm"));
    expect(await within(dialog).findByTestId("agreement-void-notice")).toHaveTextContent("Re-signing on the current text");
    expect(within(dialog).queryByTestId("void-agreement")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByText("Void")).not.toHaveLength(0));
    await waitFor(() => expect(screen.getByText("All countersigned")).toBeInTheDocument());
  });
});
