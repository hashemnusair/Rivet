import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => {
  const state = {
    identity: undefined as unknown,
    queriedEarly: false,
    syncing: true,
    resolveSync: undefined as undefined | (() => void),
    // Stable like Convex's own hooks: ensureCurrent stays in flight until the test lets it finish.
    mutation: () => new Promise<void>((resolve) => { state.resolveSync = resolve; }),
    action: () => Promise.resolve(),
    bindAccount: () => undefined,
  };
  return state;
});

const USER = vi.hoisted(() => ({ id: "user_lina", firstName: "Lina", lastName: "Haddad" }));

vi.mock("./demo-auth", () => ({ DEMO_AUTH_BYPASS: false }));
vi.mock("@/lib/providers/convex-client-provider", () => ({ CONVEX_ENABLED: true }));
vi.mock("@/lib/api/ConvexGymOSApi", () => ({ dataMode: () => "convex" }));
vi.mock("@/lib/i18n/provider", () => ({ useLocale: () => ({ bindAccount: state.bindAccount }) }));
vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true }),
  useUser: () => ({ user: USER }),
}));
vi.mock("convex/react", () => ({
  useConvexAuth: () => ({ isAuthenticated: true, isLoading: false }),
  useAction: () => state.action,
  useMutation: () => state.mutation,
  useQuery: (_query: unknown, args: unknown) => {
    if (args === "skip") return undefined;
    if (state.syncing) state.queriedEarly = true;
    return state.identity;
  },
}));

const { RivetIdentityProvider, useRivetIdentity } = await import("./rivet-identity");

function Probe() {
  const identity = useRivetIdentity();
  return <p data-testid="identity">{identity.status}</p>;
}

const member = { pending: false, user: { id: "user-lina", email: "lina@example.com", fullName: "Lina Haddad", platformAdmin: false }, memberships: [], gymAccessUnavailable: false, organizationSelectionRequired: false };

describe("opening the app for a returning account", () => {
  beforeEach(() => {
    state.identity = undefined;
    state.queriedEarly = false;
    state.syncing = true;
    state.resolveSync = undefined;
  });

  it("asks who the account is while its row is being synchronized, and opens on that answer", async () => {
    state.identity = member;
    await act(async () => { render(<RivetIdentityProvider><Probe /></RivetIdentityProvider>); });
    expect(state.queriedEarly).toBe(true);
    expect(screen.getByTestId("identity")).toHaveTextContent("ready");
  });

  it("keeps waiting for the sync when the early answer is a first sign-in, an unclaimed invitation or a closed account", async () => {
    for (const early of [{ pending: true, user: null, memberships: [] }, null, { pending: false, deactivated: true, user: null, memberships: [] }]) {
      state.identity = early;
      const view = await act(async () => render(<RivetIdentityProvider><Probe /></RivetIdentityProvider>));
      expect(screen.getByTestId("identity")).toHaveTextContent("loading");
      view.unmount();
    }

    // Once the row exists and the sync is done, the answer is used as before.
    state.identity = member;
    render(<RivetIdentityProvider><Probe /></RivetIdentityProvider>);
    state.syncing = false;
    await act(async () => { state.resolveSync?.(); });
    expect(screen.getByTestId("identity")).toHaveTextContent("ready");
  });
});
