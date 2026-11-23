import { hashKey, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { act, waitFor } from "@testing-library/react";
import { useLayoutEffect, useState, type ReactNode } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { Session } from "@/lib/domain/types";
import type { RoleKey } from "@/lib/domain/types";
import { useApp } from "@/lib/providers/app-providers";
import { renderWithApp, resetApiForTests } from "@/test/harness";
import DashboardPage from "@/app/(app)/dashboard/page";
import ReceptionPage from "@/app/(app)/reception/page";
import MembersPage from "@/app/(app)/members/page";
import MemberDetailPage from "@/app/(app)/members/[memberId]/page";
import PaymentsPage from "@/app/(app)/payments/page";
import PipelinePage from "@/app/(app)/crm/pipeline/page";
import QueuesPage from "@/app/(app)/crm/queues/page";
import LeadDetailPage from "@/app/(app)/crm/leads/[leadId]/page";
import ClassesPage from "@/app/(app)/classes/page";
import PtPage from "@/app/(app)/pt/page";
import { routeReads } from "./route-reads";

/*
 * Drift guard for the intent-prefetch registry. Each case renders the real
 * screen against the seeded mock API, then checks that every read the
 * registry would start for that link is one the screen itself made: the same
 * cache key, and the same data when the registry's own request runs. A
 * screen that changes its key or its request fails here instead of silently
 * caching the wrong data (or wasting a read) on hover.
 */

const navigation = vi.hoisted(() => ({ pathname: "/", params: {} as Record<string, string> }));
const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), prefetch: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => navigation.pathname,
  useSearchParams: () => new URLSearchParams(),
  useParams: () => navigation.params,
}));

let probe: { client: QueryClient; session: Session | undefined } | undefined;
let showScreen: (screen: ReactNode) => void = () => undefined;

function Probe() {
  const client = useQueryClient();
  const { session } = useApp();
  useLayoutEffect(() => { probe = { client, session }; }, [client, session]);
  return null;
}

function Stage() {
  const [screen, setScreen] = useState<ReactNode>(null);
  useLayoutEffect(() => { showScreen = setScreen; }, []);
  return <>{screen}<Probe /></>;
}

/** Projections stamp the moment they were built; that alone may differ. */
const comparable = (value: unknown) => JSON.parse(JSON.stringify(value, (key, field: unknown) => key === "generatedAt" ? undefined : field)) as unknown;

beforeAll(() => {
  // The pipeline picks its first view from the pointer type.
  window.matchMedia ??= ((query: string) => ({ matches: false, media: query, onchange: null, addListener: () => undefined, removeListener: () => undefined, addEventListener: () => undefined, removeEventListener: () => undefined, dispatchEvent: () => false })) as typeof window.matchMedia;
});

afterEach(() => {
  resetApiForTests();
  probe = undefined;
  vi.clearAllMocks();
});

interface Case {
  name: string;
  role: RoleKey;
  href: (ids: { memberId: string; leadId: string }) => string;
  params?: (ids: { memberId: string; leadId: string }) => Record<string, string>;
  screen: ReactNode;
  /** Reads the registry is expected to start for this case. */
  expectedReads: number;
}

const CASES: Case[] = [
  { name: "owner dashboard", role: "owner", href: () => "/dashboard", screen: <DashboardPage />, expectedReads: 1 },
  { name: "manager dashboard", role: "manager", href: () => "/dashboard", screen: <DashboardPage />, expectedReads: 1 },
  { name: "reception dashboard", role: "receptionist", href: () => "/dashboard", screen: <DashboardPage />, expectedReads: 1 },
  { name: "sales dashboard", role: "salesperson", href: () => "/dashboard", screen: <DashboardPage />, expectedReads: 2 },
  { name: "trainer dashboard", role: "trainer", href: () => "/dashboard", screen: <DashboardPage />, expectedReads: 1 },
  { name: "reception", role: "receptionist", href: () => "/reception", screen: <ReceptionPage />, expectedReads: 3 },
  { name: "members list", role: "owner", href: () => "/members", screen: <MembersPage />, expectedReads: 2 },
  {
    name: "member detail",
    role: "owner",
    href: ({ memberId }) => `/members/${memberId}`,
    params: ({ memberId }) => ({ memberId }),
    screen: <MemberDetailPage />,
    expectedReads: 3,
  },
  { name: "payments", role: "owner", href: () => "/payments", screen: <PaymentsPage />, expectedReads: 1 },
  { name: "pipeline", role: "owner", href: () => "/crm/pipeline", screen: <PipelinePage />, expectedReads: 3 },
  { name: "follow-up queues", role: "owner", href: () => "/crm/queues", screen: <QueuesPage />, expectedReads: 2 },
  {
    name: "lead detail",
    role: "owner",
    href: ({ leadId }) => `/crm/leads/${leadId}`,
    params: ({ leadId }) => ({ leadId }),
    screen: <LeadDetailPage />,
    expectedReads: 4,
  },
  { name: "classes", role: "owner", href: () => "/classes", screen: <ClassesPage />, expectedReads: 4 },
  { name: "personal training", role: "owner", href: () => "/pt", screen: <PtPage />, expectedReads: 2 },
];

describe("route read registry", () => {
  it.each(CASES)("starts exactly the reads the $name screen makes", async ({ role, href, params, screen, expectedReads }) => {
    const { api } = await renderWithApp(<Stage />, { role });
    await waitFor(() => expect(probe?.session).toBeDefined());
    const session = probe!.session!;
    const [member] = (await api.listMembers({ pageSize: 1 })).items;
    const lead = await api.listLeads({ pageSize: 1 }).then((page) => page.items[0], () => undefined);
    const ids = { memberId: member!.id, leadId: lead?.id ?? "none" };
    const link = href(ids);
    navigation.pathname = link;
    navigation.params = params?.(ids) ?? {};

    const reads = routeReads(link, session);
    expect(reads).toHaveLength(expectedReads);

    await act(async () => showScreen(screen));
    const cache = probe!.client.getQueryCache();
    await waitFor(() => {
      for (const read of reads) {
        const query = cache.get(hashKey(read.queryKey));
        expect(query, `the screen never read ${hashKey(read.queryKey)}`).toBeDefined();
        expect(query!.state.data, `no data yet for ${hashKey(read.queryKey)}`).toBeDefined();
      }
    }, { timeout: 5_000 });

    for (const read of reads) {
      const cached = cache.get(hashKey(read.queryKey))!.state.data;
      const fresh = await read.queryFn(api);
      expect(comparable(fresh), `different request under ${hashKey(read.queryKey)}`).toEqual(comparable(cached));
    }
  });

  it("starts nothing for a link that carries filters the default view does not", async () => {
    await renderWithApp(<Stage />, { role: "owner" });
    await waitFor(() => expect(probe?.session).toBeDefined());
    const session = probe!.session!;
    expect(routeReads("/payments?method=cash", session)).toEqual([]);
    expect(routeReads("/members?membership=outstanding", session).map((read) => read.queryKey[0])).toEqual(["plans"]);
    expect(routeReads("/members/new", session)).toEqual([]);
    expect(routeReads("https://elsewhere.example/members", session)).toEqual([]);
    expect(routeReads("/settings", session)).toEqual([]);
  });
});
