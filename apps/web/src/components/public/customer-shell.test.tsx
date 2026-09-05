import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CustomerShell } from "./public-shell";

const state = vi.hoisted(() => ({
  pathname: "/customer/my-gyms",
  customerSignedIn: true,
  replace: vi.fn(),
}));

vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true }),
  useClerk: () => ({ signOut: vi.fn() }),
  UserButton: () => <span data-testid="user-button" />,
}));
vi.mock("next/navigation", () => ({
  usePathname: () => state.pathname,
  useRouter: () => ({ replace: state.replace, push: vi.fn() }),
}));
vi.mock("@/lib/auth/rivet-identity", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/rivet-identity")>();
  return { ...actual, useRivetIdentity: () => ({ status: "loading", platformAdmin: false, memberships: [] }) };
});
vi.mock("@/lib/providers/app-providers", () => ({ useApp: () => ({ session: undefined }) }));
vi.mock("@/lib/providers/experience-provider", () => ({
  useExperience: () => ({ customerSignedIn: state.customerSignedIn, platformAdminSignedIn: false, signOutCustomer: vi.fn() }),
  useCustomerPersona: () => (state.customerSignedIn ? { id: "customer-lina", name: "Lina Haddad", email: "lina@example.com" } : undefined),
}));
vi.mock("@/components/onboarding/onboarding-banner", () => ({ OnboardingBanner: () => null }));
vi.mock("@/components/pwa/member-pwa", () => ({ MemberPwaManager: () => null }));

describe("CustomerShell", () => {
  beforeEach(() => {
    state.pathname = "/customer/my-gyms";
    state.customerSignedIn = true;
  });

  it("gives a signed-in member one dock with Home, Payments, Explore and Account", () => {
    render(<CustomerShell><p>content</p></CustomerShell>);
    const dock = screen.getAllByRole("navigation", { name: "Member navigation" }).find((nav) => nav.classList.contains("member-bottom-nav"))!;
    expect(dock).toBeTruthy();
    const links = Array.from(dock.querySelectorAll("a")).map((link) => [link.textContent?.trim(), link.getAttribute("href")]);
    expect(links).toEqual([["Home", "/customer/my-gyms"], ["Payments", "/customer/finance"], ["Explore", "/customer/discover"]]);
    expect(dock.querySelector('a[aria-current="page"]')).toHaveTextContent("Home");
    expect(screen.getAllByRole("button", { name: "Open account menu" })).toHaveLength(2);
    expect(screen.queryByRole("contentinfo")).not.toBeInTheDocument();
  });

  it("links communication settings to the profile section and never duplicates the dock in the menu", async () => {
    const user = userEvent.setup();
    render(<CustomerShell><p>content</p></CustomerShell>);
    const [headerTrigger] = screen.getAllByRole("button", { name: "Open account menu" });
    await user.click(headerTrigger!);
    const menu = await screen.findByRole("menu");
    const items = Array.from(menu.querySelectorAll("a")).map((link) => [link.textContent?.trim(), link.getAttribute("href")]);
    expect(items).toEqual([
      ["Profile", "/customer/profile"],
      ["Getting started", "/customer/getting-started"],
      ["Communication settings", "/customer/profile#communication"],
    ]);
    expect(screen.getByRole("menuitem", { name: "Sign out" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /Payments and receipts/ })).not.toBeInTheDocument();
  });

  it("shows visitors the sign-in actions and the public footer without a dock", () => {
    state.customerSignedIn = false;
    state.pathname = "/customer/discover";
    render(<CustomerShell><p>content</p></CustomerShell>);
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
    expect(screen.getByRole("link", { name: "Create account" })).toHaveAttribute("href", "/login/member/create");
    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
    expect(document.querySelector(".member-bottom-nav")).toBeNull();
    expect(screen.queryByRole("link", { name: /Payments/ })).not.toBeInTheDocument();
  });
});
