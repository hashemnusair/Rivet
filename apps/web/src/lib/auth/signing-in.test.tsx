import { act, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  holdSigningIn,
  openSignedInPage,
  rememberSignInUrlDecorator,
  resetSigningInForTests,
  SIGNING_IN_MAX_COVER_MS,
  useSignInArrival,
  useSigningInCover,
  useSigningInHold,
} from "./signing-in";
import { SIGNING_IN_ARRIVAL_COOKIE, SIGNING_IN_DOCUMENT_ATTRIBUTE, SIGNING_IN_PRE_PAINT, signingInMarkerFresh } from "./signing-in-marker";

function Probe() {
  return <span data-testid="cover">{useSigningInCover() ? "covering" : "clear"}</span>;
}

function Wait() {
  useSigningInHold(true);
  return null;
}

const cover = () => screen.getByTestId("cover").textContent;
const marker = () => document.cookie.match(new RegExp(`${SIGNING_IN_ARRIVAL_COOKIE}=(\\d+)`))?.[1];

describe("the sign-in cover", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetSigningInForTests();
  });

  afterEach(() => {
    resetSigningInForTests();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    document.documentElement.removeAttribute(SIGNING_IN_DOCUMENT_ATTRIBUTE);
  });

  it("is up while anything waits and comes down once nothing does", () => {
    const { rerender } = render(<><Probe /><Wait /></>);
    expect(cover()).toBe("covering");

    rerender(<><Probe /></>);
    act(() => vi.advanceTimersByTime(200));
    expect(cover()).toBe("clear");
  });

  it("stays up, without a gap, while one waiting screen hands over to the next", () => {
    const seen: string[] = [];
    function Recorder() {
      seen.push(useSigningInCover() ? "covering" : "clear");
      return null;
    }
    const { rerender } = render(<><Recorder /><Wait key="account" /></>);
    rerender(<><Recorder /><Wait key="gym" /></>);
    rerender(<><Recorder /><Wait key="dashboard" /></>);
    act(() => vi.advanceTimersByTime(40));

    // "clear" appears only before the very first hold.
    expect(seen.slice(seen.indexOf("covering"))).not.toContain("clear");
    expect(seen.at(-1)).toBe("covering");
  });

  it("gives the page back after a wait that never ends, and does not cover it again for the same wait", () => {
    render(<><Probe /><Wait /></>);
    expect(cover()).toBe("covering");
    act(() => vi.advanceTimersByTime(SIGNING_IN_MAX_COVER_MS + 200));
    expect(cover()).toBe("clear");
  });

  it("has one deadline for the whole sign-in, however many screens hold it", () => {
    const { rerender } = render(<><Probe /><Wait key="account" /></>);
    act(() => vi.advanceTimersByTime(SIGNING_IN_MAX_COVER_MS - 1_000));
    rerender(<><Probe /><Wait key="gym" /></>);
    expect(cover()).toBe("covering");
    act(() => vi.advanceTimersByTime(1_200));
    expect(cover()).toBe("clear");
  });

  it("is kept by the shell someone lands in until that shell is ready", () => {
    function Shell({ ready }: { ready: boolean }) {
      const arrival = useSignInArrival(ready);
      return <span data-testid="shell">{arrival.covered ? "covered" : "own cover"}</span>;
    }
    // The sign-in page and the shell change places in one commit.
    const { rerender } = render(<><Probe /><Wait /></>);
    rerender(<><Probe /><Shell ready={false} /></>);
    act(() => vi.advanceTimersByTime(1_000));
    expect(cover()).toBe("covering");
    expect(screen.getByTestId("shell")).toHaveTextContent("covered");

    rerender(<><Probe /><Shell ready /></>);
    act(() => vi.advanceTimersByTime(200));
    expect(cover()).toBe("clear");
  });

  it("does not come down over a shell that opens on its own", () => {
    const { result } = renderHook(() => useSignInArrival(false));
    expect(result.current).toEqual({ covered: false, arriving: false });
  });

  it("leaves a short-lived marker for a page load that falls inside the sign-in, and clears it once the shell is open", () => {
    const release = holdSigningIn();
    expect(signingInMarkerFresh(marker(), Date.now())).toBe(true);
    release();
    act(() => vi.advanceTimersByTime(200));

    // A new document: nothing in memory, only the marker.
    const { result, rerender } = renderHook(({ ready }) => useSignInArrival(ready), { initialProps: { ready: false } });
    expect(result.current).toEqual({ covered: false, arriving: true });

    rerender({ ready: true });
    expect(result.current.arriving).toBe(false);
    expect(marker()).toBeUndefined();
  });

  it("treats only a recent marker as part of a sign-in", () => {
    const now = 1_800_000_000_000;
    expect(signingInMarkerFresh(String(now - 5_000), now)).toBe(true);
    expect(signingInMarkerFresh(String(now - 31_000), now)).toBe(false);
    expect(signingInMarkerFresh(String(now + 5_000), now)).toBe(false);
    expect(signingInMarkerFresh("1; path=/", now)).toBe(false);
    expect(signingInMarkerFresh(undefined, now)).toBe(false);
  });

  it("marks the document before paint only for a recent marker", () => {
    new Function(SIGNING_IN_PRE_PAINT)();
    expect(document.documentElement.hasAttribute(SIGNING_IN_DOCUMENT_ATTRIBUTE)).toBe(false);

    document.cookie = `${SIGNING_IN_ARRIVAL_COOKIE}=${Date.now() - 60_000}; path=/`;
    new Function(SIGNING_IN_PRE_PAINT)();
    expect(document.documentElement.hasAttribute(SIGNING_IN_DOCUMENT_ATTRIBUTE)).toBe(false);

    document.cookie = `${SIGNING_IN_ARRIVAL_COOKIE}=${Date.now()}; path=/`;
    new Function(SIGNING_IN_PRE_PAINT)();
    expect(document.documentElement.hasAttribute(SIGNING_IN_DOCUMENT_ATTRIBUTE)).toBe(true);
  });
});

describe("opening the page a signed-in account belongs on", () => {
  const router = { replace: vi.fn() };
  const location = { replace: vi.fn(), hostname: "dashboard.rivetjo.com", protocol: "https:" };

  beforeEach(() => {
    router.replace.mockReset();
    location.replace.mockReset();
    resetSigningInForTests();
    vi.stubGlobal("window", new Proxy(window, { get: (target, key) => (key === "location" ? location : Reflect.get(target, key)) }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    resetSigningInForTests();
  });

  it("is a plain in-app change of page when Clerk asked for nothing", () => {
    openSignedInPage(router, "/dashboard");
    expect(router.replace).toHaveBeenCalledWith("/dashboard");
    expect(location.replace).not.toHaveBeenCalled();
  });

  it("goes through Clerk's Safari cookie renewal straight to that page, once", () => {
    rememberSignInUrlDecorator((path) => `https://clerk.rivetjo.com/v1/client/touch?redirect_url=${encodeURIComponent(`https://dashboard.rivetjo.com${path}`)}`);

    openSignedInPage(router, "/dashboard");
    expect(location.replace).toHaveBeenCalledWith("https://clerk.rivetjo.com/v1/client/touch?redirect_url=https%3A%2F%2Fdashboard.rivetjo.com%2Fdashboard");
    expect(router.replace).not.toHaveBeenCalled();

    // The decorator belonged to that one sign-in.
    openSignedInPage(router, "/members");
    expect(router.replace).toHaveBeenCalledWith("/members");
  });

  it("stays in the app when Clerk's decorator leaves the address alone or fails", () => {
    rememberSignInUrlDecorator((path) => path);
    openSignedInPage(router, "/reception");
    expect(router.replace).toHaveBeenLastCalledWith("/reception");

    rememberSignInUrlDecorator(() => {
      throw new Error("Clerk is gone");
    });
    openSignedInPage(router, "/dashboard");
    expect(router.replace).toHaveBeenLastCalledWith("/dashboard");
    expect(location.replace).not.toHaveBeenCalled();
  });

  it("keeps a decorated in-app path, and never follows anything else that is not https", () => {
    rememberSignInUrlDecorator((path) => `${path}?__clerk_db_jwt=dev`);
    openSignedInPage(router, "/dashboard");
    expect(router.replace).toHaveBeenLastCalledWith("/dashboard?__clerk_db_jwt=dev");

    for (const unsafe of ["javascript:alert(1)", "//evil.example/dashboard", "http://evil.example/dashboard"]) {
      rememberSignInUrlDecorator(() => unsafe);
      openSignedInPage(router, "/dashboard");
      expect(router.replace).toHaveBeenLastCalledWith("/dashboard");
    }
    expect(location.replace).not.toHaveBeenCalled();
  });
});
