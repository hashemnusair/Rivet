import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemberSignOutProvider } from "@/components/public/member-account";
import type { CustomerPersona } from "@/lib/public/experience-data";
import MemberProfilePage from "./page";

const state = vi.hoisted(() => ({
  customer: undefined as CustomerPersona | undefined,
  replace: vi.fn(),
  start: vi.fn(),
  standalone: false,
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: state.replace, push: vi.fn() }) }));
vi.mock("@/lib/hooks/use-member-gate", () => ({ useMemberGate: () => ({ ready: true, identitySignedIn: true, profileSelected: true }) }));
vi.mock("@/lib/providers/experience-provider", () => ({ useCustomerPersona: () => state.customer }));
vi.mock("@/components/pwa/member-app", () => ({ useMemberAppInstall: () => ({ app: { ready: true, standalone: state.standalone }, start: state.start }) }));

const LINA: CustomerPersona = {
  id: "customer-lina",
  name: "Lina Haddad",
  nameAr: "لينا حداد",
  email: "lina@example.com",
  phone: "+962790000001",
  dateOfBirth: "1994-03-12",
  gender: "female",
  preferredLanguage: "ar",
  initials: "LH",
  context: "",
};

describe("member profile", () => {
  beforeEach(() => {
    state.customer = LINA;
    state.standalone = false;
    state.replace.mockClear();
  });
  afterEach(() => {
    window.history.replaceState(null, "", "/");
  });

  it("shows every detail the member's gyms see, with Edit info beside them", () => {
    render(<MemberProfilePage />);
    expect(screen.getByRole("heading", { level: 1, name: "Profile" })).toBeInTheDocument();
    const card = screen.getByRole("region", { name: "Lina Haddad" });
    expect(card).toHaveTextContent("lina@example.com");
    expect(within(card).getByRole("link", { name: "Edit info" })).toHaveAttribute("href", "/customer/profile/edit");

    const personal = screen.getByRole("region", { name: "Personal information" });
    expect(personal).toHaveTextContent("Phone+962790000001");
    expect(personal).toHaveTextContent("Birth date12 Mar 1994");
    expect(personal).toHaveTextContent("GenderFemale");
    expect(personal).toHaveTextContent("Preferred languageالعربية");

    // Nothing recorded yet reads as such, not as a blank.
    expect(screen.getByRole("region", { name: "Address" })).toHaveTextContent("AddressNot addedCityNot added");
    const emergency = screen.getByRole("region", { name: "Emergency contact" });
    expect(emergency).toHaveTextContent("Add someone your gym can call in an emergency.");
    expect(within(emergency).getAllByText("Not added")).toHaveLength(3);
  });

  it("drops the emergency prompt once a number is on file", () => {
    state.customer = { ...LINA, emergencyContactName: "Omar Haddad", emergencyContactRelationship: "Brother", emergencyContactPhone: "+962790000002" };
    render(<MemberProfilePage />);
    const emergency = screen.getByRole("region", { name: "Emergency contact" });
    expect(emergency).toHaveTextContent("NameOmar HaddadRelationshipBrotherPhone+962790000002");
    expect(emergency).not.toHaveTextContent("Add someone");
  });

  it("keeps the rest of the account behind the ⋯ at the top", async () => {
    const user = userEvent.setup();
    const signOut = vi.fn();
    render(<MemberSignOutProvider value={signOut}><MemberProfilePage /></MemberSignOutProvider>);
    await user.click(screen.getByRole("button", { name: "More options" }));
    const menu = await screen.findByRole("menu");
    expect(Array.from(menu.querySelectorAll("a")).map((link) => [link.textContent?.trim(), link.getAttribute("href")])).toEqual([
      ["Change password", "/customer/profile/password"],
      ["Offers and news", "/customer/profile/offers"],
      ["Getting started", "/customer/getting-started"],
    ]);
    await user.click(within(menu).getByRole("menuitem", { name: "Add to home screen" }));
    expect(state.start).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "More options" }));
    await user.click(await screen.findByRole("menuitem", { name: "Sign out" }));
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it("does not offer the home screen inside the installed app", async () => {
    state.standalone = true;
    const user = userEvent.setup();
    render(<MemberProfilePage />);
    await user.click(screen.getByRole("button", { name: "More options" }));
    await screen.findByRole("menu");
    expect(screen.queryByRole("menuitem", { name: "Add to home screen" })).not.toBeInTheDocument();
  });

  it("sends old links to the profile's sections on to their own pages", () => {
    window.history.replaceState(null, "", "/customer/profile#communication");
    render(<MemberProfilePage />);
    expect(state.replace).toHaveBeenCalledWith("/customer/profile/offers");
  });
});
