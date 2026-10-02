import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceModuleBoundary } from "./workspace-module-boundary";

const state = vi.hoisted(() => ({
  access: { modules: [{ key: "revenue", label: "Revenue protection", entitled: true, enabled: true }] },
}));

vi.mock("@/lib/providers/app-providers", () => ({ useApp: () => ({ session: { organization: { id: "org-1" } } }) }));
vi.mock("@/lib/hooks/use-api", () => ({
  useApiQuery: () => ({ data: state.access, isLoading: false, error: undefined, refetch: vi.fn() }),
}));

describe("workspace module direct-route boundary", () => {
  beforeEach(() => {
    state.access = { modules: [{ key: "revenue", label: "Revenue protection", entitled: true, enabled: true }] };
  });

  it("renders the route when the server entitlement is enabled", () => {
    render(<WorkspaceModuleBoundary moduleKey="revenue"><div>Revenue route</div></WorkspaceModuleBoundary>);
    expect(screen.getByText("Revenue route")).toBeInTheDocument();
  });

  it("locks a pasted route when the tier does not include the module", () => {
    state.access = { modules: [{ key: "revenue", label: "Revenue protection", entitled: false, enabled: false }] };
    render(<WorkspaceModuleBoundary moduleKey="revenue"><div>Revenue route</div></WorkspaceModuleBoundary>);
    expect(screen.getByRole("status")).toHaveTextContent("Revenue is not included");
    expect(screen.queryByText("Revenue route")).not.toBeInTheDocument();
  });
});
