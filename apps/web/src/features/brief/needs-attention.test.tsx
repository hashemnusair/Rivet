import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { OperatingBrief } from "@/lib/domain/types";
import { LocaleProvider } from "@/lib/i18n/provider";
import { BRANCH_SWF } from "@/lib/mock/seed";
import { renderWithApp, resetApiForTests } from "@/test/harness";
import { NeedsAttention } from "./needs-attention";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }), usePathname: () => "/dashboard", useParams: () => ({}), useSearchParams: () => new URLSearchParams() }));
afterEach(() => resetApiForTests());

describe("Needs attention", () => {
  it("shows one plain sentence per problem, each linking to the page where it is fixed", async () => {
    const { api } = await renderWithApp(<NeedsAttention />, { role: "owner" });
    const brief = await api.getOperatingBrief({});
    expect(brief.attention.length).toBeGreaterThan(3);
    const lines = await screen.findAllByTestId("needs-attention-line");
    expect(lines.map((line) => line.getAttribute("data-key"))).toEqual(brief.attention.map((line) => line.key));
    for (const [index, line] of brief.attention.entries()) {
      const link = within(lines[index]!).getByRole("link");
      expect(link).toHaveAttribute("href", line.href);
      expect(link).toHaveTextContent(line.text);
    }
    // The unpaid line carries the exact total the server computed.
    const unpaid = brief.attention.find((line) => line.key === "unpaid");
    expect(unpaid?.money).toBeDefined();
    expect(screen.getByTestId("needs-attention-scope")).toHaveTextContent(/^Updated \d{1,2}:\d{2}\.$/);
    // Plain words only: no symbols or system words.
    expect(screen.getByTestId("needs-attention").textContent).not.toMatch(/≤|≥|coverage|queue|source|variance|outstanding|consolidated/i);
  });

  it("says all clear when nothing needs attention", async () => {
    await renderWithApp(<NeedsAttention />, { role: "owner", prepare: async (api) => {
      const original = api.getOperatingBrief.bind(api);
      vi.spyOn(api, "getOperatingBrief").mockImplementation(async (query) => ({ ...(await original(query)), attention: [] } satisfies OperatingBrief));
    } });
    expect(await screen.findByTestId("needs-attention-clear")).toHaveTextContent("All clear. Nothing needs attention right now.");
    expect(screen.queryByTestId("needs-attention-line")).not.toBeInTheDocument();
  });

  it("names information it could not load, in plain words", async () => {
    await renderWithApp(<NeedsAttention />, { role: "owner", prepare: async (api) => {
      const original = api.getOperatingBrief.bind(api);
      vi.spyOn(api, "getOperatingBrief").mockImplementation(async (query) => ({ ...(await original(query)), missing: ["stock levels"] }));
    } });
    expect(await screen.findByTestId("needs-attention-missing")).toHaveTextContent("Could not load stock levels. Press Refresh to try again.");
  });

  it("counts only the selected branch when one is chosen", async () => {
    const { api } = await renderWithApp(<NeedsAttention branchId={BRANCH_SWF} />, { role: "owner", branchId: BRANCH_SWF });
    const [branch, all] = await Promise.all([api.getOperatingBrief({ branchId: BRANCH_SWF }), api.getOperatingBrief({})]);
    await waitFor(() => expect(screen.getAllByTestId("needs-attention-line").map((line) => line.getAttribute("data-key"))).toEqual(branch.attention.map((line) => line.key)));
    expect(branch.scope.branchId).toBe(BRANCH_SWF);
    const unpaid = (brief: typeof all) => brief.attention.find((line) => line.key === "unpaid")?.money?.amount ?? 0;
    expect(unpaid(branch)).toBeLessThan(unpaid(all));
  });

  it("offers a way back when it cannot load, and reloads only when asked", async () => {
    const user = userEvent.setup();
    const { api } = await renderWithApp(<NeedsAttention />, { role: "owner", prepare: async (api) => {
      vi.spyOn(api, "getOperatingBrief").mockRejectedValueOnce(new Error("offline"));
    } });
    expect(await screen.findByTestId("needs-attention-error")).toHaveTextContent("This could not be loaded.");
    const calls = vi.mocked(api.getOperatingBrief).mock.calls.length;
    await user.click(screen.getByRole("button", { name: "Refresh" }));
    await screen.findAllByTestId("needs-attention-line");
    expect(vi.mocked(api.getOperatingBrief).mock.calls.length).toBe(calls + 1);
  });

  it("shows Arabic wording, with money and times kept left-to-right, when the language is Arabic", async () => {
    const { api } = await renderWithApp(<LocaleProvider initialLocale="ar"><NeedsAttention /></LocaleProvider>, { role: "owner" });
    const brief = await api.getOperatingBrief({});
    expect(await screen.findByRole("heading", { name: "يتطلب انتباهك" })).toBeInTheDocument();
    const lines = await screen.findAllByTestId("needs-attention-line");
    expect(lines).toHaveLength(brief.attention.length);
    for (const [index, line] of brief.attention.entries()) {
      const text = within(lines[index]!).getByRole("link").textContent ?? "";
      expect(text).toMatch(/[\u0600-\u06FF]/);
      expect(text).not.toContain(line.text);
    }
    expect(screen.getByTestId("needs-attention-scope")).toHaveTextContent(/^آخر تحديث .*\d{1,2}:\d{2}.*\.$/);
    expect(screen.getByRole("button", { name: "تحديث" })).toBeInTheDocument();
  });
});
