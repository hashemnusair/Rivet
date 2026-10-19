import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PlatformShell } from "./platform-shell";

const state = vi.hoisted(() => ({
  clerkSignOut: vi.fn(),
  replace: vi.fn(),
  push: vi.fn(),
  clearPlatformSession: vi.fn(),
}));

vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true }),
  useClerk: () => ({ signOut: state.clerkSignOut }),
}));

vi.mock("next/link", async () => {
  const { forwardRef } = await import("react");
  type Props = Omit<import("react").ComponentPropsWithoutRef<"a">, "href"> & { href: string; prefetch?: boolean | null };
  return {
    default: forwardRef<HTMLAnchorElement, Props>(function Link({ href, prefetch, ...props }, ref) {
      return <a ref={ref} href={href} data-prefetch={String(prefetch)} {...props} />;
    }),
  };
});

vi.mock("next/navigation", () => ({
  usePathname: () => "/platform",
  useRouter: () => ({ replace: state.replace, push: state.push }),
}));

vi.mock("@/lib/auth/rivet-identity", () => ({
  useRivetIdentity: () => ({
    status: "ready",
    fullName: "RIVET Admin",
    email: "admin@rivetjo.com",
    platformAdmin: true,
    memberships: [],
  }),
}));

vi.mock("@/lib/providers/experience-provider", () => ({
  useExperience: () => ({
    platformAdminSignedIn: true,
    previewSessionReady: true,
    experienceReady: true,
    signOutPlatformAdmin: state.clearPlatformSession,
    platformSnapshot: {
      gyms: [],
      applications: [],
      invoices: [],
      plans: [],
      supportCases: [
        { id: "SUP-1", gym: "Pulse Lab", subject: "Payment retry failed", status: "open" },
        { id: "SUP-2", gym: "Pulse Lab", subject: "Payment reconciliation", status: "open" },
      ],
    },
  }),
}));

describe("PlatformShell sign out", () => {
  beforeEach(() => {
    state.clerkSignOut.mockReset().mockResolvedValue(undefined);
    state.replace.mockReset();
    state.push.mockReset();
    state.clearPlatformSession.mockReset();
  });

  it("holds a transition while signing out and uses only the login destination", async () => {
    render(<PlatformShell><div>Platform content</div></PlatformShell>);

    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

    expect(screen.getByRole("status")).toHaveTextContent("Signing you out");
    await waitFor(() => {
      expect(state.clerkSignOut).toHaveBeenCalledWith({ redirectUrl: "/login" });
      expect(state.clearPlatformSession).toHaveBeenCalledOnce();
      expect(state.replace).toHaveBeenCalledWith("/login");
    });
    expect(state.replace).not.toHaveBeenCalledWith("/");
  });

  it("searches loaded platform records and routes to their owning surface", () => {
    render(<PlatformShell><div>Platform content</div></PlatformShell>);

    fireEvent.change(screen.getByRole("combobox", { name: "Search platform records" }), { target: { value: "payment retry" } });

    expect(screen.getByRole("option")).toHaveTextContent("Payment retry failed");
    fireEvent.click(screen.getByRole("option"));

    expect(state.push).toHaveBeenCalledWith("/platform/support?case=SUP-1");
  });

  it("supports active option semantics and arrow-key selection", () => {
    render(<PlatformShell><div>Platform content</div></PlatformShell>);

    const input = screen.getByRole("combobox", { name: "Search platform records" });
    fireEvent.change(input, { target: { value: "payment" } });
    const options = screen.getAllByRole("option");
    const firstOption = options[0]!;
    const secondOption = options[1]!;
    expect(input).toHaveAttribute("aria-activedescendant", firstOption.id);
    expect(firstOption).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input).toHaveAttribute("aria-activedescendant", secondOption.id);
    expect(secondOption).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(input, { key: "Enter" });

    expect(state.push).toHaveBeenCalledWith("/platform/support?case=SUP-2");
  });
});

describe("PlatformShell navigation", () => {
  it("prepares a console screen only when the administrator reaches for its link", () => {
    render(<PlatformShell><div>Platform content</div></PlatformShell>);

    const sidebar = screen.getByRole("navigation", { name: "Platform navigation" }).closest("aside")!;
    const links = within(sidebar).getAllByRole("link");
    expect(links).toHaveLength(12);
    for (const link of links) expect(link).toHaveAttribute("data-prefetch", "false");

    const nav = within(sidebar).getByRole("navigation", { name: "Platform navigation" });
    const billing = within(nav).getByRole("link", { name: "Billing" });
    fireEvent.pointerEnter(billing);
    expect(billing).toHaveAttribute("data-prefetch", "true");
    expect(within(nav).getByRole("link", { name: "Gyms" })).toHaveAttribute("data-prefetch", "false");

    const support = within(nav).getByRole("link", { name: "Support" });
    fireEvent.focus(support);
    expect(support).toHaveAttribute("data-prefetch", "true");

    const workspace = within(sidebar).getByRole("link", { name: "Gym workspace" });
    fireEvent.touchStart(workspace);
    expect(workspace).toHaveAttribute("data-prefetch", "true");
  });
});
