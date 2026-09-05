import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, ERR } from "@/lib/api/errors";
import type { PublicOffer } from "@/lib/domain/types";
import PublicOfferClient from "./public-offer.client";

const mutate = vi.fn();
const offer: PublicOffer = {
  token: "a".repeat(64),
  recipientName: "Ahmad Saleh",
  organizationName: "Forge Fitness",
  planName: "Monthly unlimited",
  price: { amount: 35_000, currency: "JOD" },
  expiresAt: "2026-09-05T12:00:00.000Z",
  status: "available",
  brand: { paletteKey: "gold", primaryColor: "#b88a2b", tokens: { primary: "#b88a2b", primaryHover: "#8f6b20", primaryForeground: "#15140f", primarySoft: "#f2e9d6", primarySoftForeground: "#15140f", focusRing: "#b88a2b" } },
};

const query = { data: offer as PublicOffer | undefined, isLoading: false, isError: false, isBackgroundError: false, error: undefined as unknown, refetch: vi.fn() };

vi.mock("@/lib/hooks/use-api", () => ({
  useApiQuery: () => query,
  useApiMutation: () => ({ mutate, isPending: false }),
}));

describe("public membership offer", () => {
  beforeEach(() => { Object.assign(query, { data: offer, isLoading: false, isError: false, isBackgroundError: false, error: undefined }); vi.clearAllMocks(); });

  it("distinguishes a retryable outage from an unavailable link", async () => {
    Object.assign(query, { data: undefined, isError: true, error: new Error("Offline") });
    const { rerender } = render(<PublicOfferClient token={offer.token} />);
    expect(screen.getByRole("heading", { name: "Offer could not be loaded" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(query.refetch).toHaveBeenCalledOnce();
    query.error = ApiError.of(ERR.NOT_FOUND, "Unavailable");
    rerender(<PublicOfferClient token={offer.token} />);
    expect(screen.getByRole("heading", { name: "This link cannot be opened." })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  });

  it("preserves loaded terms when a refresh fails", () => {
    query.isBackgroundError = true;
    render(<PublicOfferClient token={offer.token} />);
    expect(screen.getByRole("heading", { name: "Offer could not refresh" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: offer.planName })).toBeInTheDocument();
  });

  it.each(["preparing", "expired", "accepted", "declined"] as const)("does not offer another response while %s", (status) => {
    query.data = { ...offer, status };
    render(<PublicOfferClient token={offer.token} />);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Accept offer" })).not.toBeInTheDocument();
  });
  it("shows branded terms and confirms an acceptance before recording it", async () => {
    const user = userEvent.setup();
    render(<PublicOfferClient token={offer.token} />);

    expect(screen.getByRole("heading", { name: "Forge Fitness" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Monthly unlimited" })).toBeInTheDocument();
    expect(screen.getByText(/JOD\s+35\.000/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Accept offer" }));
    expect(screen.getByRole("dialog", { name: "Accept this offer?" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Confirm acceptance" }));
    expect(mutate).toHaveBeenCalledWith("accepted");
  });
});
