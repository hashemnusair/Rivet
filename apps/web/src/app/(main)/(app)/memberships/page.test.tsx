import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithApp, resetApiForTests } from "@/test/harness";
import MembershipsPage from "./page";

// A navigation double that really updates the URL, so the page's URL-backed
// filters can be exercised the way a refresh, Back or a pasted link would.
vi.mock("next/navigation", async () => {
  const { useSyncExternalStore } = await import("react");
  const subscribe = (callback: () => void) => {
    window.addEventListener("test:navigation", callback);
    return () => window.removeEventListener("test:navigation", callback);
  };
  return {
    usePathname: () => "/memberships",
    useSearchParams: () => new URLSearchParams(useSyncExternalStore(subscribe, () => window.location.search)),
    useRouter: () => ({
      push: vi.fn(),
      replace: (url: string) => {
        window.history.replaceState({}, "", url);
        window.dispatchEvent(new Event("test:navigation"));
      },
    }),
  };
});

function navigateTo(search: string) {
  window.history.pushState({}, "", `/memberships${search}`);
  window.dispatchEvent(new Event("test:navigation"));
}

beforeEach(() => {
  window.history.replaceState({}, "", "/memberships");
});

afterEach(() => {
  resetApiForTests();
  window.history.replaceState({}, "", "/");
});

describe("memberships ledger URL state", () => {
  it("opens the filters named in the URL and follows an outside URL change", async () => {
    navigateTo("?status=expired&payment=unpaid&q=sara");
    await renderWithApp(<MembershipsPage />);

    expect(await screen.findByRole("combobox", { name: "Status filter" })).toHaveTextContent("Expired");
    expect(screen.getByRole("combobox", { name: "Payment status filter" })).toHaveTextContent("Unpaid");
    expect(screen.getByLabelText("Search memberships")).toHaveValue("sara");
    expect(screen.getByRole("button", { name: "Clear filters" })).toBeInTheDocument();

    // Back/Forward: the URL changes underneath the page and the controls follow it.
    act(() => navigateTo("?status=active"));
    expect(screen.getByRole("combobox", { name: "Status filter" })).toHaveTextContent("Active");
    expect(screen.getByRole("combobox", { name: "Payment status filter" })).toHaveTextContent("Any payment");
    expect(screen.getByLabelText("Search memberships")).toHaveValue("");
    await waitFor(() => expect(window.location.search).toBe("?status=active"));
  });

  it("ignores unknown URL values and writes the settled search text back to the URL", async () => {
    navigateTo("?status=nonsense&page=-4");
    const user = userEvent.setup();
    await renderWithApp(<MembershipsPage />);

    expect(await screen.findByRole("combobox", { name: "Status filter" })).toHaveTextContent("All statuses");
    expect(screen.queryByRole("button", { name: "Clear filters" })).not.toBeInTheDocument();

    await user.type(screen.getByLabelText("Search memberships"), "omar");
    // The unknown value is ignored, not rewritten; the settled text joins it.
    await waitFor(() => expect(window.location.search).toBe("?status=nonsense&q=omar"));
    expect(screen.getByRole("button", { name: "Clear filters" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    await waitFor(() => expect(window.location.search).toBe(""));
    expect(screen.getByLabelText("Search memberships")).toHaveValue("");
  });

  it("filters the ledger by the status in the URL", async () => {
    navigateTo("?status=expired");
    await renderWithApp(<MembershipsPage />);

    const list = await screen.findByRole("list", { name: "Memberships" });
    await waitFor(() => expect(within(list).getAllByRole("listitem").length).toBeGreaterThan(0));
    for (const row of within(list).getAllByRole("listitem")) {
      expect(within(row).getByText("Expired")).toBeInTheDocument();
    }
  });
});
