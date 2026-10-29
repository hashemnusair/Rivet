import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CustomerPersona } from "@/lib/public/experience-data";
import MemberProfileEditPage from "./page";

const state = vi.hoisted(() => ({
  customer: undefined as CustomerPersona | undefined,
  replace: vi.fn(),
  update: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: state.replace, push: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: state.toast } }));
vi.mock("@/lib/hooks/use-member-gate", () => ({ useMemberGate: () => ({ ready: true, identitySignedIn: true, profileSelected: true }) }));
vi.mock("@/lib/providers/experience-provider", () => ({
  useCustomerPersona: () => state.customer,
  useExperience: () => ({ updateCustomerProfile: state.update }),
}));

const LINA: CustomerPersona = { id: "customer-lina", name: "Lina Haddad", nameAr: "", email: "lina@example.com", phone: "0790000001", gender: "female", initials: "LH", context: "" };

describe("edit member info", () => {
  beforeEach(() => {
    state.customer = LINA;
    state.replace.mockClear();
    state.toast.mockClear();
    state.update.mockReset().mockResolvedValue(undefined);
  });

  it("saves the member's details and returns to the profile", async () => {
    const user = userEvent.setup();
    render(<MemberProfileEditPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Edit info" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to profile" })).toHaveAttribute("href", "/customer/profile");
    expect(screen.getByLabelText(/^Full name/)).toHaveValue("Lina Haddad");

    await user.type(screen.getByLabelText(/^Phone/, { selector: "#emergency-phone" }), " ٠٧٩٠٠٠٠٠٠٢ ");
    await user.type(screen.getByLabelText(/^Name/), "Omar Haddad");
    await user.click(screen.getByRole("button", { name: "Save profile" }));

    expect(state.update).toHaveBeenCalledWith(expect.objectContaining({ fullName: "Lina Haddad", phone: "0790000001", gender: "female", emergencyContactName: "Omar Haddad", emergencyContactPhone: "0790000002" }));
    expect(state.toast).toHaveBeenCalledWith("Saved. Your gyms can see the changes.");
    expect(state.replace).toHaveBeenCalledWith("/customer/profile");
  });

  it("keeps the member on the form, with what they typed, when saving fails", async () => {
    state.update.mockRejectedValue(new Error("offline"));
    const user = userEvent.setup();
    render(<MemberProfileEditPage />);
    await user.type(screen.getByLabelText(/^City/), "Amman");
    await user.click(screen.getByRole("button", { name: "Save profile" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Your profile was not saved. Try again.");
    expect(screen.getByLabelText(/^City/)).toHaveValue("Amman");
    expect(state.replace).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Save profile" })).toBeEnabled();
  });

  it("asks for gender before saving", async () => {
    state.customer = { ...LINA, gender: undefined };
    const user = userEvent.setup();
    render(<MemberProfileEditPage />);
    // The select is required; submit the form directly to reach the page's own check.
    screen.getByRole("button", { name: "Save profile" }).closest("form")!.noValidate = true;
    await user.click(screen.getByRole("button", { name: "Save profile" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Choose female or male before saving your profile.");
    expect(state.update).not.toHaveBeenCalled();
  });

  it("cancels back to the profile", () => {
    render(<MemberProfileEditPage />);
    expect(screen.getByRole("link", { name: "Cancel" })).toHaveAttribute("href", "/customer/profile");
  });
});
