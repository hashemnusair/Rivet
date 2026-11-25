import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { preloadSigningInCover, SigningInCover } from "@/components/auth/signing-in-cover";
import type { RivetIdentity } from "@/lib/auth/rivet-identity";
import { resetSigningInForTests, useSignInArrival } from "@/lib/auth/signing-in";
import { IdentityPanel } from "./identity-panels.client";

/**
 * What someone sees between the sign-in form and the dashboard: one screen
 * that says "Signing you in…", however many steps happen behind it.
 */

const state = vi.hoisted(() => ({
  identity: { status: "loading", platformAdmin: false, gymAccessUnavailable: false, memberships: [] } as import("@/lib/auth/rivet-identity").RivetIdentity,
  replace: vi.fn(),
  signIn: vi.fn(),
}));

vi.mock("@/lib/api/client", () => ({ getApi: () => ({}) }));
vi.mock("@clerk/nextjs", () => ({ useClerk: () => ({ signOut: vi.fn() }) }));
vi.mock("convex/react", () => ({ useAction: () => vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: state.replace }) }));
vi.mock("@/lib/auth/rivet-identity", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/rivet-identity")>()),
  useRivetIdentity: () => state.identity,
}));
vi.mock("@/lib/providers/app-providers", () => ({ useApp: () => ({ signIn: state.signIn, signOut: vi.fn() }) }));
vi.mock("@/lib/providers/experience-provider", () => ({
  useExperience: () => ({ signInAsIdentity: vi.fn(), signInPlatformAdmin: vi.fn(), signOutCustomer: vi.fn(), signOutPlatformAdmin: vi.fn() }),
}));

const LOADING: RivetIdentity = { status: "loading", platformAdmin: false, gymAccessUnavailable: false, memberships: [] };
const MANAGER: RivetIdentity = {
  status: "ready",
  userId: "user-staff",
  email: "staff@rivetjo.com",
  fullName: "Gym Staff",
  platformAdmin: false,
  gymAccessUnavailable: false,
  memberships: [{ organizationId: "org-1", organizationName: "QA Gym", organizationSlug: "qa-gym", role: "manager", branchScope: "all", branches: [{ id: "branch-a", name: "Main", code: "MAIN" }] }],
};
const NOT_ON_A_TEAM: RivetIdentity = { ...MANAGER, memberships: [] };

/** Stands in for the gym workspace: it keeps the sign-in cover until it is ready. */
function Workspace({ ready }: { ready: boolean }) {
  const arrival = useSignInArrival(ready);
  return (
    <>
      <h1>Dashboard</h1>
      {/* The workspace's own cover, which must stay out of the way. */}
      {!ready && !arrival.covered ? <p role="status">Loading your gym</p> : null}
    </>
  );
}

function App({ page, workspaceReady = false }: { page: "door" | "workspace"; workspaceReady?: boolean }) {
  return (
    <>
      {page === "door" ? <IdentityPanel audience="staff" /> : <Workspace ready={workspaceReady} />}
      <SigningInCover />
    </>
  );
}

const OLD_WORDING = ["You’re signed in", "Getting your account ready", "Opening your gym", "Opening your account", "Loading your gym"];

function expectOneSigningInScreen() {
  const statuses = screen.getAllByRole("status");
  expect(statuses).toHaveLength(1);
  expect(statuses[0]).toHaveAccessibleName("Signing you in…");
  for (const text of OLD_WORDING) expect(screen.queryByText(text, { exact: false })).toBeNull();
  return statuses[0]!;
}

describe("signing in shows one loading screen", () => {
  beforeEach(() => {
    resetSigningInForTests();
    state.replace.mockReset();
    state.signIn.mockReset();
    state.identity = LOADING;
  });

  afterEach(() => resetSigningInForTests());

  it("keeps the same 'Signing you in…' screen from the account check until the workspace is ready", async () => {
    state.signIn.mockResolvedValue(undefined);
    const { rerender } = render(<App page="door" />);

    // 1. Clerk has a session; Convex is still reading the account.
    const cover = await screen.findByTestId("signing-in-cover");
    expect(expectOneSigningInScreen()).toBe(cover);

    // 2. The account is known: the gym session loads and the dashboard is asked for.
    state.identity = MANAGER;
    rerender(<App page="door" />);
    await waitFor(() => expect(state.replace).toHaveBeenCalledWith("/dashboard"));
    expect(state.replace).toHaveBeenCalledTimes(1);
    expect(expectOneSigningInScreen()).toBe(cover);

    // 3. The address has changed; the workspace is mounted but not ready.
    rerender(<App page="workspace" />);
    expect(expectOneSigningInScreen()).toBe(cover);
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 200));
    });
    expect(expectOneSigningInScreen()).toBe(cover);

    // 4. Ready: the cover stops being the page's status and lifts off the dashboard.
    rerender(<App page="workspace" workspaceReady />);
    await waitFor(() => expect(cover).toHaveAttribute("aria-hidden", "true"));
    expect(screen.queryByRole("status")).toBeNull();
    await waitFor(() => expect(screen.queryByTestId("signing-in-cover")).toBeNull(), { timeout: 3_000 });
    expect(screen.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  });

  it("is on screen in the same paint as the wait once a sign-in page has fetched it", async () => {
    preloadSigningInCover();
    await import("@/components/auth/signing-in-cover-body");
    await Promise.resolve();

    render(<App page="door" />);
    // No waiting for it: nothing of the page underneath is shown first.
    expect(screen.getByTestId("signing-in-cover")).toHaveAccessibleName("Signing you in…");
  });

  it("lifts for a screen that needs the person instead of hiding it", async () => {
    const { rerender } = render(<App page="door" />);
    const cover = await screen.findByTestId("signing-in-cover");
    expect(cover).toHaveAccessibleName("Signing you in…");

    state.identity = NOT_ON_A_TEAM;
    rerender(<App page="door" />);

    expect(screen.getByText("This account is not on a gym team")).toBeVisible();
    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
    await waitFor(() => expect(screen.queryByTestId("signing-in-cover")).toBeNull(), { timeout: 3_000 });
    expect(state.replace).not.toHaveBeenCalled();
    expect(state.signIn).not.toHaveBeenCalled();
  });
});
