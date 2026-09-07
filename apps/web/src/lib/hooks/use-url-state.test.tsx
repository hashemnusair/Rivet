import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { choiceFromParams, isoDateFromParams, pageFromParams, useReplaceSearchParams, useUrlSearchText } from "./use-url-state";

vi.mock("next/navigation", async () => {
  const { useSyncExternalStore } = await import("react");
  const subscribe = (callback: () => void) => {
    window.addEventListener("test:navigation", callback);
    return () => window.removeEventListener("test:navigation", callback);
  };
  return {
    usePathname: () => "/members",
    useSearchParams: () => new URLSearchParams(useSyncExternalStore(subscribe, () => window.location.search)),
    useRouter: () => ({
      replace: (url: string) => {
        window.history.replaceState({}, "", url);
        window.dispatchEvent(new Event("test:navigation"));
      },
    }),
  };
});

function navigateTo(search: string) {
  window.history.pushState({}, "", `/members${search}`);
  window.dispatchEvent(new Event("test:navigation"));
}

function SearchBox() {
  const { text, setText, settled } = useUrlSearchText("q", 50);
  return (
    <>
      <input aria-label="Search" value={text} onChange={(event) => setText(event.target.value)} />
      <output data-testid="settled">{settled}</output>
    </>
  );
}

function Filters() {
  const replace = useReplaceSearchParams();
  return (
    <>
      <button type="button" onClick={() => replace({ status: "expired" })}>Expired</button>
      <button type="button" onClick={() => replace({ page: "3" })}>Page 3</button>
      <button type="button" onClick={() => replace({ status: undefined })}>Clear</button>
    </>
  );
}

beforeEach(() => {
  window.history.replaceState({}, "", "/members");
});

afterEach(() => {
  window.history.replaceState({}, "", "/");
});

describe("useUrlSearchText", () => {
  it("writes the settled text to the URL and hydrates from it", async () => {
    navigateTo("?q=sara");
    const user = userEvent.setup();
    render(<SearchBox />);
    expect(screen.getByLabelText("Search")).toHaveValue("sara");

    await user.clear(screen.getByLabelText("Search"));
    await user.type(screen.getByLabelText("Search"), "omar");
    await waitFor(() => expect(window.location.search).toBe("?q=omar"));
    expect(screen.getByTestId("settled")).toHaveTextContent("omar");
  });

  it("refills the box when the URL changes from outside, as with Back/Forward", async () => {
    const user = userEvent.setup();
    render(<SearchBox />);
    await user.type(screen.getByLabelText("Search"), "omar");
    await waitFor(() => expect(window.location.search).toBe("?q=omar"));

    act(() => navigateTo("?q=sara"));
    expect(screen.getByLabelText("Search")).toHaveValue("sara");
    // The refilled text settles without writing the URL back to the old value.
    await waitFor(() => expect(screen.getByTestId("settled")).toHaveTextContent("sara"));
    expect(window.location.search).toBe("?q=sara");
  });

  it("clears the key when the box is emptied", async () => {
    navigateTo("?q=sara&status=active");
    const user = userEvent.setup();
    render(<SearchBox />);
    await user.clear(screen.getByLabelText("Search"));
    await waitFor(() => expect(window.location.search).toBe("?status=active"));
  });
});

describe("useReplaceSearchParams", () => {
  it("sets, deletes and resets the page number", async () => {
    navigateTo("?page=2&q=x");
    const user = userEvent.setup();
    render(<Filters />);
    await user.click(screen.getByRole("button", { name: "Expired" }));
    expect(window.location.search).toBe("?q=x&status=expired");
    await user.click(screen.getByRole("button", { name: "Page 3" }));
    expect(window.location.search).toBe("?q=x&status=expired&page=3");
    await user.click(screen.getByRole("button", { name: "Clear" }));
    expect(window.location.search).toBe("?q=x");
  });
});

describe("URL readers", () => {
  it("ignores malformed page numbers and unknown choices", () => {
    expect(pageFromParams(new URLSearchParams("page=4"))).toBe(4);
    expect(pageFromParams(new URLSearchParams("page=-2"))).toBe(1);
    expect(pageFromParams(new URLSearchParams("page=abc"))).toBe(1);
    expect(choiceFromParams(new URLSearchParams("status=expired"), "status", ["all", "expired"] as const, "all")).toBe("expired");
    expect(choiceFromParams(new URLSearchParams("status=<script>"), "status", ["all", "expired"] as const, "all")).toBe("all");
  });

  it("accepts only real calendar dates", () => {
    expect(isoDateFromParams(new URLSearchParams("date=2026-09-07"), "date")).toBe("2026-09-07");
    expect(isoDateFromParams(new URLSearchParams("date=2026-02-30"), "date")).toBeUndefined();
    expect(isoDateFromParams(new URLSearchParams("date=07/09/2026"), "date")).toBeUndefined();
    expect(isoDateFromParams(new URLSearchParams(""), "date")).toBeUndefined();
  });
});
