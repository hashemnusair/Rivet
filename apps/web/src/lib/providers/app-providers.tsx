"use client";

import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { RefreshCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { getApi } from "@/lib/api/client";
import { isConvexMode } from "@/lib/api/ConvexGymOSApi";
import { ERR, isApiError } from "@/lib/api/errors";
import type { MockBehavior } from "@/lib/api/GymOSApi";
import { DEFAULT_BEHAVIOR } from "@/lib/api/GymOSApi";
import { qk } from "@/lib/api/keys";
import type { RoleKey, Session, UUID } from "@/lib/domain/types";
import { useRivetIdentity, type RivetMembership } from "@/lib/auth/rivet-identity";

/** Error codes where retrying cannot change the outcome. */
const TERMINAL_ERROR_CODES: string[] = [ERR.FORBIDDEN, ERR.NOT_FOUND, ERR.VALIDATION, ERR.UNAUTHENTICATED];

interface AppContextValue {
  session: Session | undefined;
  organizations: RivetMembership[];
  sessionLoading: boolean;
  signedIn: boolean;
  signIn: (
    role: RoleKey,
    branchId?: UUID,
    identity?: { name: string; email: string },
  ) => Promise<void>;
  signOut: () => Promise<void>;
  switchRole: (role: RoleKey) => Promise<void>;
  setBranch: (branchId: UUID | undefined) => Promise<void>;
  selectOrganization: (organizationId: UUID) => Promise<void>;
  behavior: MockBehavior;
  setBehavior: (b: Partial<MockBehavior>) => void;
  resetDemo: () => Promise<void>;
  dir: "ltr" | "rtl";
  toggleDir: () => void;
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

const STORAGE_KEYS = {
  persona: "rivet.demo.persona",
  branch: "rivet.demo.branch",
  dir: "rivet.demo.dir",
  sidebar: "rivet.demo.sidebar",
} as const;

const PERSONA_DEFAULT_BRANCH: Partial<Record<RoleKey, UUID>> = {};

export function AppProviders({ children }: { children: ReactNode }) {
  const convexMode = isConvexMode();
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Convex queries in the API seam are currently one-shot reads.
            // Keep the existing seam while refreshing active screens so a
            // second operator's changes appear without a hard reload. The
            // Convex websocket remains responsible for auth and mutations.
            staleTime: convexMode ? 0 : 5_000,
            refetchInterval: convexMode ? 4_000 : false,
            refetchIntervalInBackground: false,
            refetchOnWindowFocus: true,
            refetchOnReconnect: true,
            // Deterministic rejections (permissions, missing records, bad input)
            // will never succeed on a retry — surface them immediately.
            retry: (failureCount, error) => {
              if (isApiError(error) && TERMINAL_ERROR_CODES.includes(error.code)) return false;
              return failureCount < 1;
            },
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider>{children}</SessionProvider>
      <QueryRefreshNotice />
    </QueryClientProvider>
  );
}

function QueryRefreshNotice() {
  const queryClient = useQueryClient();
  const [staleCount, setStaleCount] = useState(0);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    const update = () => {
      const count = queryClient
        .getQueryCache()
        .getAll()
        .filter(
          (query) =>
            query.isActive() && query.state.data !== undefined && query.state.error != null,
        ).length;
      setStaleCount(count);
    };
    update();
    return queryClient.getQueryCache().subscribe(update);
  }, [queryClient]);

  if (staleCount === 0) return null;

  const retry = async () => {
    if (retrying) return;
    setRetrying(true);
    try {
      await queryClient.refetchQueries({ type: "active" });
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div
      className="fixed inset-x-0 top-0 z-[70] flex items-center justify-center gap-2 border-b border-warning/30 bg-warning-bg px-4 py-2 text-center text-[11.5px] text-warning-deep shadow-sm"
      role="status"
      aria-live="polite"
    >
      <span>Some live RIVET data is stale. Your last loaded data is still shown.</span>
      <button
        type="button"
        onClick={() => void retry()}
        className="inline-flex items-center gap-1 font-medium underline underline-offset-2 hover:no-underline"
        disabled={retrying}
      >
        <RefreshCcw className={retrying ? "size-3 animate-spin" : "size-3"} aria-hidden />
        {retrying ? "Retrying…" : "Retry now"}
      </button>
    </div>
  );
}

function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [signedIn, setSignedIn] = useState(false);
  const [behavior, setBehaviorState] = useState<MockBehavior>({ ...DEFAULT_BEHAVIOR });
  const [dir, setDir] = useState<"ltr" | "rtl">("ltr");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [session, setSession] = useState<Session | undefined>(undefined);
  const [sessionLoading, setSessionLoading] = useState(true);
  const demoBootstrapped = useRef(false);
  const convexSessionKey = useRef<string | undefined>(undefined);
  const convexMode = isConvexMode();
  const identity = useRivetIdentity();

  // UI preferences are local presentation state in both modes. Identity and
  // workspace sessions are deliberately not restored from browser storage in
  // Convex mode.
  useEffect(() => {
    const storedDir = window.sessionStorage.getItem(STORAGE_KEYS.dir);
    if (storedDir === "rtl") {
      setDir("rtl");
      document.documentElement.dir = "rtl";
      document.documentElement.classList.add("rtl-font");
    }
    const collapsed = window.localStorage.getItem(STORAGE_KEYS.sidebar);
    if (collapsed === "1") setSidebarCollapsed(true);
  }, []);

  // Bootstrap from sessionStorage only for explicit preview/test mode.
  useEffect(() => {
    if (convexMode || demoBootstrapped.current) return;
    demoBootstrapped.current = true;
    const persona = window.sessionStorage.getItem(STORAGE_KEYS.persona) as RoleKey | null;
    const branch = window.sessionStorage.getItem(STORAGE_KEYS.branch) as UUID | null;
    if (persona) {
      const api = getApi();
      api
        .switchDemoRole(persona, branch ?? undefined)
        .then((s) => {
          setSession(s);
          setSignedIn(true);
        })
        .catch(() => undefined)
        .finally(() => setSessionLoading(false));
    } else {
      setSessionLoading(false);
    }
  }, [convexMode]);

  // In production Clerk is the identity provider and Convex is the source of
  // authorization plus the active tenant session. This call is the only place
  // the app session is hydrated; pages never manufacture a role locally.
  useEffect(() => {
    if (!convexMode) return;
    if (identity.status === "loading" || identity.status === "pending") return;
    if (identity.status === "anonymous" || identity.status === "error") {
      convexSessionKey.current = undefined;
      setSession(undefined);
      setSignedIn(false);
      setSessionLoading(false);
      return;
    }
    if (identity.status !== "ready") return;

    const key = `${identity.userId ?? identity.email ?? "unknown"}:${identity.memberships.map((membership) => `${membership.organizationId}:${membership.role}`).join(",")}:${identity.platformAdmin}`;
    if (convexSessionKey.current === key) return;
    convexSessionKey.current = key;
    setSessionLoading(true);

    void getApi()
      .getSession()
      .then((nextSession) => {
        setSession(nextSession);
        setSignedIn(true);
      })
      .catch(() => {
        setSession(undefined);
        setSignedIn(false);
      })
      .finally(() => setSessionLoading(false));
  }, [convexMode, identity.email, identity.memberships, identity.platformAdmin, identity.status, identity.userId]);

  const setBehavior = useCallback((b: Partial<MockBehavior>) => {
    setBehaviorState((prev) => {
      const next = { ...prev, ...b };
      getApi().setBehavior(next);
      return next;
    });
  }, []);

  const signIn = useCallback(
    async (role: RoleKey, branchId?: UUID, identity?: { name: string; email: string }) => {
      if (convexMode) {
        const s = await getApi().getSession();
        setSession(s);
        setSignedIn(true);
        queryClient.clear();
        return;
      }
      const api = getApi();
      const branch = branchId ?? PERSONA_DEFAULT_BRANCH[role];
      const s = await api.switchDemoRole(role, branch, identity);
      window.sessionStorage.setItem(STORAGE_KEYS.persona, role);
      if (branch) window.sessionStorage.setItem(STORAGE_KEYS.branch, branch);
      else window.sessionStorage.removeItem(STORAGE_KEYS.branch);
      setSession(s);
      setSignedIn(true);
      queryClient.clear();
    },
    [convexMode, queryClient],
  );

  const signOut = useCallback(async () => {
    await getApi().signOut();
    window.sessionStorage.removeItem(STORAGE_KEYS.persona);
    window.sessionStorage.removeItem(STORAGE_KEYS.branch);
    setSignedIn(false);
    setSession(undefined);
    queryClient.clear();
  }, [queryClient]);

  const switchRole = useCallback(
    async (role: RoleKey) => {
      if (convexMode) throw new Error("Role switching is available only in explicit mock mode.");
      const api = getApi();
      const s = await api.switchDemoRole(role);
      window.sessionStorage.setItem(STORAGE_KEYS.persona, role);
      window.sessionStorage.removeItem(STORAGE_KEYS.branch);
      setSession(s);
      queryClient.clear();
      router.push(role === "receptionist" ? "/reception" : "/dashboard");
    },
    [convexMode, queryClient, router],
  );

  const setBranch = useCallback(
    async (branchId: UUID | undefined) => {
      const s = await getApi().setActiveBranch(branchId);
      if (!convexMode) {
        if (branchId) window.sessionStorage.setItem(STORAGE_KEYS.branch, branchId);
        else window.sessionStorage.removeItem(STORAGE_KEYS.branch);
      }
      setSession(s);
      queryClient.invalidateQueries();
    },
    [convexMode, queryClient],
  );

  const selectOrganization = useCallback(async (organizationId: UUID) => {
    if (!convexMode) return;
    const nextSession = await getApi().selectOrganization(organizationId);
    setSession(nextSession);
    queryClient.clear();
  }, [convexMode, queryClient]);

  const resetDemo = useCallback(async () => {
    if (convexMode) throw new Error("Demo reset is available only in explicit mock mode.");
    await getApi().resetDemo();
    const s = await getApi().getSession();
    setSession(s);
    queryClient.clear();
    queryClient.invalidateQueries({ queryKey: qk.session });
  }, [convexMode, queryClient]);

  const toggleDir = useCallback(() => {
    setDir((prev) => {
      const next = prev === "ltr" ? "rtl" : "ltr";
      document.documentElement.dir = next;
      document.documentElement.classList.toggle("rtl-font", next === "rtl");
      window.sessionStorage.setItem(STORAGE_KEYS.dir, next);
      return next;
    });
  }, []);

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      window.localStorage.setItem(STORAGE_KEYS.sidebar, next ? "1" : "0");
      return next;
    });
  }, []);

  const value = useMemo<AppContextValue>(
    () => ({
      session,
      organizations: identity.memberships,
      sessionLoading,
      signedIn,
      signIn,
      signOut,
      switchRole,
      setBranch,
      selectOrganization,
      behavior,
      setBehavior,
      resetDemo,
      dir,
      toggleDir,
      sidebarCollapsed,
      toggleSidebar,
    }),
    [session, identity.memberships, sessionLoading, signedIn, signIn, signOut, switchRole, setBranch, selectOrganization, behavior, setBehavior, resetDemo, dir, toggleDir, sidebarCollapsed, toggleSidebar],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside AppProviders");
  return ctx;
}

export function useSession(): Session {
  const { session } = useApp();
  if (!session) throw new Error("No active session");
  return session;
}

export function usePermissions() {
  const { session } = useApp();
  const sessionPermissions = session?.permissions;
  const roles = session?.roles;
  return useMemo(() => {
    const permissions = sessionPermissions ?? [];
    return {
      permissions,
      can: (p: string) => permissions.includes(p),
      canAny: (ps: string[]) => ps.some((p) => permissions.includes(p)),
      role: roles?.[0],
    };
  }, [sessionPermissions, roles]);
}
