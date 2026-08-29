import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
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

vi.mock("@/lib/hooks/use-api", () => ({
  useApiQuery: () => ({ data: offer, isLoading: false, isError: false }),
  useApiMutation: () => ({ mutate, isPending: false }),
}));

describe("public membership offer", () => {
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
