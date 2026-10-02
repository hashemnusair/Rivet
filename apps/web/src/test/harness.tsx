import { render, screen, waitFor, type RenderResult } from "@testing-library/react";
import type { ReactNode } from "react";
import { setApiForTests } from "@/lib/api/client";
import type { RoleKey } from "@/lib/domain/types";
import { MockGymOSApi } from "@/lib/mock/MockGymOSApi";
import { AppProviders, useApp } from "@/lib/providers/app-providers";

/**
 * Component-test harness. Boots a freshly seeded MockGymOSApi behind the real
 * providers so components are exercised through the same client boundary they
 * use in the browser — no hand-written stubs to drift out of date.
 *
 * Test files must mock `next/navigation` themselves (vi.mock is hoisted):
 *
 *   vi.mock("next/navigation", () => ({ useRouter: () => routerMock, useParams: () => ({}) }));
 */

/** Waits for the demo session before rendering, mirroring the app shell. */
function SessionReady({ children }: { children: ReactNode }) {
  const { session } = useApp();
  if (!session) return <div data-testid="session-loading" />;
  return <>{children}</>;
}

export interface RenderAppResult extends RenderResult {
  api: MockGymOSApi;
}

export async function renderWithApp(
  ui: ReactNode,
  { role = "owner" as RoleKey, branchId, latencyMs = 0, prepare }: { role?: RoleKey; branchId?: string; latencyMs?: number; /** Adjust the seeded API (permissions, data) before the session loads. */ prepare?: (api: MockGymOSApi) => Promise<void> } = {},
): Promise<RenderAppResult> {
  window.sessionStorage.clear();
  window.sessionStorage.setItem("rivet.demo.persona", role);
  if (branchId) window.sessionStorage.setItem("rivet.demo.branch", branchId);

  const api = new MockGymOSApi();
  api.setBehavior({ latencyMs });
  if (prepare) await prepare(api);
  setApiForTests(api);

  const utils = render(
    <AppProviders>
      <SessionReady>{ui}</SessionReady>
    </AppProviders>,
  );

  await waitFor(() => {
    if (screen.queryByTestId("session-loading")) throw new Error("demo session did not load");
  });

  return { ...utils, api };
}

/** Clears the client singleton so tests do not share mutated demo state. */
export function resetApiForTests() {
  setApiForTests(null);
  window.sessionStorage.clear();
}
