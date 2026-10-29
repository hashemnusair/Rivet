import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CustomerShell } from "./public-shell";

const state = vi.hoisted(() => ({
  pathname: "/customer/my-gyms",
  customerSignedIn: true,
  previewSessionReady: true,
  clerkSignedIn: true,
  identityStatus: "loading",
  experienceStatus: "loading",
  replace: vi.fn(),
}));

vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: state.clerkSignedIn }),
  useClerk: () => ({ signOut: vi.fn() }),
  UserButton: () => <span data-testid="user-button" />,
}));
vi.mock("next/navigation", () => ({
  usePathname: () => state.pathname,
  useRouter: () => ({ replace: state.replace, push: vi.fn() }),
}));
vi.mock("@/lib/auth/rivet-identity", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/rivet-identity")>();
  return { ...actual, useRivetIdentity: () => ({ status: state.identityStatus, platformAdmin: false, gymAccessUnavailable: false, memberships: [] }) };
});
vi.mock("@/lib/providers/app-providers", () => ({ useApp: () => ({ session: undefined }) }));
vi.mock("@/lib/providers/experience-provider", () => ({
  useExperience: () => ({ customerSignedIn: state.customerSignedIn, experienceStatus: state.experienceStatus, previewSessionReady: state.previewSessionReady, platformAdminSignedIn: false, signOutCustomer: vi.fn() }),
  useCustomerPersona: () => (state.customerSignedIn ? { id: "customer-lina", name: "Lina Haddad", email: "lina@example.com" } : undefined),
}));
vi.mock("@/lib/auth/public-viewer", () => ({
  usePublicViewer: () => (state.customerSignedIn
    ? { status: "signed-in", destination: { area: "member", href: "/customer/my-gyms", label: "My gyms", verb: "Open your gyms" }, signOut: vi.fn() }
    : { status: "signed-out" }),
}));
vi.mock("@/components/public/signed-in-guard", () => ({ SignedInGuard: () => null }));
vi.mock("@/components/onboarding/onboarding-banner", () => ({ OnboardingBanner: () => null }));
vi.mock("@/components/pwa/member-pwa", () => ({ MemberPwaManager: () => null }));
// The dock's prefetching and scroll memory have their own tests (member-tabs.test.tsx).
vi.mock("@/components/public/member-tabs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/public/member-tabs")>();
  return { ...actual, useMemberTabs: (pathname: string) => ({ activeHref: actual.MEMBER_TAB_HREFS.find((href) => pathname === href || pathname.startsWith(`${href}/`)), pressed: undefined, press: vi.fn() }) };
});

describe("CustomerShell", () => {
  beforeEach(() => {
    state.pathname = "/customer/my-gyms";
    state.customerSignedIn = true;
    state.previewSessionReady = true;
    state.clerkSignedIn = true;
    state.identityStatus = "loading";
    state.experienceStatus = "loading";
    state.replace.mockClear();
  });

  it("waits for the saved session before mounting interactive member content", () => {
    state.customerSignedIn = false;
    state.previewSessionReady = false;
    const { rerender } = render(<CustomerShell><button>Book class</button></CustomerShell>);
    expect(screen.queryByRole("button", { name: "Book class" })).not.toBeInTheDocument();
    expect(screen.queryByRole("contentinfo")).not.toBeInTheDocument();

    state.customerSignedIn = true;
    state.previewSessionReady = true;
    rerender(<CustomerShell><button>Book class</button></CustomerShell>);
    expect(screen.getByRole("button", { name: "Book class" })).toBeInTheDocument();
    expect(document.querySelector(".member-bottom-nav")).toBeInTheDocument();
  });

  it("gives a signed-in member one dock with Home, Payments, Explore and Account", () => {
    render(<CustomerShell><p>content</p></CustomerShell>);
    const dock = screen.getAllByRole("navigation", { name: "Member navigation" }).find((nav) => nav.classList.contains("member-bottom-nav"))!;
    expect(dock).toBeTruthy();
    const links = Array.from(dock.querySelectorAll("a")).map((link) => [link.textContent?.trim(), link.getAttribute("href")]);
    expect(links).toEqual([["Home", "/customer/my-gyms"], ["Payments", "/customer/finance"], ["Explore", "/customer/discover"], ["Account", "/customer/profile"]]);
    expect(dock.querySelector('a[aria-current="page"]')).toHaveTextContent("Home");
    expect(screen.queryByRole("button", { name: /account menu/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("contentinfo")).not.toBeInTheDocument();
  });

  it("opens the profile from Account, in the dock and from the header's name, and keeps it lit on the account's own pages", () => {
    state.pathname = "/customer/profile/password";
    render(<CustomerShell><p>content</p></CustomerShell>);
    const dock = screen.getAllByRole("navigation", { name: "Member navigation" }).find((nav) => nav.classList.contains("member-bottom-nav"))!;
    expect(within(dock).getByRole("link", { name: "Account" })).toHaveAttribute("data-active", "true");
    expect(within(dock).getByRole("link", { name: "Account" })).toHaveAttribute("aria-current", "page");
    const header = within(screen.getByRole("banner"));
    expect(header.getByRole("link", { name: "Account Lina Haddad" })).toHaveAttribute("href", "/customer/profile");
  });

  it("covers a member page with the RIVET mark until the member is known, then lifts off it", () => {
    state.customerSignedIn = false;
    const { rerender } = render(<CustomerShell><button>Show entry code</button></CustomerShell>);
    expect(screen.getByRole("status", { name: "Loading your account" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Show entry code" })).not.toBeInTheDocument();
    // Not the public site's bar and footer while it waits.
    expect(screen.queryByRole("banner")).not.toBeInTheDocument();
    expect(screen.queryByRole("contentinfo")).not.toBeInTheDocument();

    state.customerSignedIn = true;
    state.identityStatus = "ready";
    state.experienceStatus = "ready";
    rerender(<CustomerShell><button>Show entry code</button></CustomerShell>);
    expect(screen.getByRole("button", { name: "Show entry code" })).toBeInTheDocument();
    expect(screen.queryByRole("status", { name: "Loading your account" })).not.toBeInTheDocument();
    expect(screen.getByTestId("workspace-curtain")).toHaveAttribute("aria-hidden", "true");
  });

  it("sends a signed-out visitor from a member page to sign in without showing the public site first", () => {
    state.customerSignedIn = false;
    state.clerkSignedIn = false;
    state.identityStatus = "anonymous";
    render(<CustomerShell><p>content</p></CustomerShell>);
    expect(state.replace).toHaveBeenCalledWith("/login");
    expect(screen.getByRole("status", { name: "Loading your account" })).toBeInTheDocument();
    expect(screen.queryByRole("banner")).not.toBeInTheDocument();
  });

  it("does not hold the public marketplace behind the mark", () => {
    state.customerSignedIn = false;
    state.pathname = "/customer/discover";
    render(<CustomerShell><p>content</p></CustomerShell>);
    expect(screen.getByText("content")).toBeInTheDocument();
    expect(screen.queryByTestId("workspace-curtain")).not.toBeInTheDocument();
  });

  it("shows visitors the site's bar with the member door, and the site footer, without a dock", () => {
    state.customerSignedIn = false;
    state.pathname = "/customer/discover";
    render(<CustomerShell><p>content</p></CustomerShell>);
    const bar = within(screen.getByRole("banner"));
    expect(bar.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
    expect(bar.getByRole("link", { name: "Create account" })).toHaveAttribute("href", "/login/member/create");
    expect(screen.queryByRole("link", { name: "Apply for access" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Menu" })).toBeInTheDocument();
    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
    expect(document.querySelector(".member-bottom-nav")).toBeNull();
    expect(screen.queryByRole("link", { name: /Payments/ })).not.toBeInTheDocument();
  });
});
