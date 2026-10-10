import { act, fireEvent, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PortalSignIn } from "./portal-sign-in.client";

const clerk = vi.hoisted(() => ({ isLoaded: false, isSignedIn: false }));

vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ isLoaded: clerk.isLoaded, isSignedIn: clerk.isLoaded ? clerk.isSignedIn : undefined }),
  useClerk: () => ({ loaded: clerk.isLoaded, signOut: vi.fn() }),
  useUser: () => ({ user: clerk.isLoaded && clerk.isSignedIn ? { primaryEmailAddress: { emailAddress: "owner@example.com" }, fullName: "Owner Example" } : null }),
  useSignIn: () => ({ signIn: {}, errors: { fields: { identifier: null, password: null, code: null } }, fetchStatus: "idle" }),
}));

vi.mock("@/lib/auth/demo-auth", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/auth/demo-auth")>()), DEMO_AUTH_BYPASS: false }));
vi.mock("@/lib/providers/convex-client-provider", () => ({ CONVEX_ENABLED: false }));
vi.mock("@/lib/auth/public-viewer", () => ({ usePublicViewer: () => ({ status: "signed-out" }) }));
vi.mock("@/lib/providers/app-providers", () => ({ useApp: () => ({ signIn: vi.fn(), sessionLoading: false }) }));
vi.mock("@/lib/providers/experience-provider", () => ({
  useExperience: () => ({ customers: [], experienceReady: true, signInCustomer: vi.fn(), signInPlatformAdmin: vi.fn() }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/login/gym",
  useSearchParams: () => new URLSearchParams(),
}));

describe("a sign-in door", () => {
  beforeEach(() => {
    clerk.isLoaded = false;
    clerk.isSignedIn = false;
  });

  it("is on the server's first paint with its form, not a loading mark, before Clerk has loaded", () => {
    const html = renderToString(<PortalSignIn audience="staff" />);
    expect(html).toContain('id="login-email"');
    expect(html).toContain('id="login-password"');
    expect(html).not.toContain('role="status"');
  });

  it("keeps what was typed when Clerk arrives, with the heading where it was", () => {
    const { rerender, container } = render(<PortalSignIn audience="member" />);
    const heading = screen.getByRole("heading", { level: 1 });
    fireEvent.change(screen.getByLabelText(/Email address/), { target: { value: "member@example.com" } });
    expect(screen.getByRole("link", { name: /Back to sign in/ }).className).toMatch(/back/);

    clerk.isLoaded = true;
    act(() => rerender(<PortalSignIn audience="member" />));
    expect(screen.getByLabelText(/Email address/)).toHaveValue("member@example.com");
    expect(screen.getByRole("heading", { level: 1 })).toBe(heading);
    expect(container.querySelector('[role="status"]')).toBeNull();
  });

  it("gives way to the account Clerk reports as signed in", () => {
    clerk.isLoaded = true;
    clerk.isSignedIn = true;
    render(<PortalSignIn audience="staff" />);
    expect(screen.queryByLabelText(/Email address/)).toBeNull();
    expect(screen.getByText("owner@example.com")).toBeInTheDocument();
  });
});
