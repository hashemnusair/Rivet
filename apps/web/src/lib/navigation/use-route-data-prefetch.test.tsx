import { hashKey, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { forwardRef, useLayoutEffect, type ComponentPropsWithoutRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { IntentPrefetchLink } from "@/components/shell/intent-prefetch-link";
import { qk } from "@/lib/api/keys";
import { bumpApiScope } from "@/lib/api/scope";
import { renderWithApp, resetApiForTests } from "@/test/harness";
import { DATA_INTENT_DWELL_MS } from "./use-route-data-prefetch";

vi.mock("next/link", () => ({
  default: forwardRef<HTMLAnchorElement, Omit<ComponentPropsWithoutRef<"a">, "href"> & { href: string; prefetch?: boolean | null }>(
    function Link({ href, prefetch, ...props }, ref) {
      return <a ref={ref} href={href} data-prefetch={String(prefetch)} {...props} />;
    },
  ),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }), usePathname: () => "/" }));

let client: QueryClient | undefined;
function Probe() {
  const queryClient = useQueryClient();
  useLayoutEffect(() => { client = queryClient; }, [queryClient]);
  return null;
}

const plansHash = hashKey(qk.plans({}));
const hasPlans = () => client!.getQueryCache().get(plansHash) !== undefined;

async function renderLink() {
  const result = await renderWithApp(<><IntentPrefetchLink href="/members">Members</IntentPrefetchLink><Probe /></>, { role: "owner" });
  return { ...result, link: screen.getByRole("link", { name: "Members" }) };
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

afterEach(() => {
  resetApiForTests();
  client = undefined;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("screen data on intent", () => {
  it("starts the screen's reads once the pointer rests on its link", async () => {
    const { link } = await renderLink();
    fireEvent.pointerEnter(link);
    expect(link).toHaveAttribute("data-prefetch", "true");
    expect(hasPlans()).toBe(false);
    await act(async () => wait(DATA_INTENT_DWELL_MS + 30));
    expect(hasPlans()).toBe(true);
    await waitFor(() => expect(client!.getQueryData(qk.plans({}))).toBeDefined());
  });

  it("reads nothing when the pointer only passes over the link", async () => {
    const { link } = await renderLink();
    fireEvent.pointerEnter(link);
    fireEvent.pointerLeave(link);
    await act(async () => wait(DATA_INTENT_DWELL_MS + 30));
    expect(hasPlans()).toBe(false);
  });

  it("starts at once on a touch or press", async () => {
    const { link } = await renderLink();
    fireEvent.touchStart(link);
    expect(hasPlans()).toBe(true);
  });

  it("reads nothing with Save-Data or in a hidden tab", async () => {
    const { link } = await renderLink();
    vi.stubGlobal("navigator", { ...navigator, connection: { saveData: true } });
    fireEvent.pointerDown(link);
    expect(hasPlans()).toBe(false);
    vi.unstubAllGlobals();
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    fireEvent.pointerDown(link);
    expect(hasPlans()).toBe(false);
  });

  it("does not keep a read that finished after the branch or session changed", async () => {
    const { link, api } = await renderLink();
    api.setBehavior({ latencyMs: 40 });
    fireEvent.pointerDown(link);
    bumpApiScope();
    await waitFor(() => expect(client!.getQueryState(qk.plans({}))?.status).toBe("error"));
    expect(client!.getQueryData(qk.plans({}))).toBeUndefined();
  });
});
