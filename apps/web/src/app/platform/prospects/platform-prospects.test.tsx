import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithApp, resetApiForTests } from "@/test/harness";
import { LocaleProvider } from "@/lib/i18n/provider";
import { PlatformProspects } from "./platform-prospects.client";

const routerMock = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }));
let params = new URLSearchParams();
vi.mock("next/navigation", () => ({ useRouter: () => routerMock, usePathname: () => "/platform/prospects", useSearchParams: () => params, useParams: () => ({}) }));

HTMLElement.prototype.scrollIntoView = vi.fn();
HTMLElement.prototype.hasPointerCapture = vi.fn(() => false);

afterEach(() => { params = new URLSearchParams(); routerMock.replace.mockReset(); resetApiForTests(); });

describe("platform prospects", () => {
  it("shows the Amman list grouped like the sheet, with the first gym open and ready to contact", async () => {
    const user = userEvent.setup();
    await renderWithApp(<PlatformProspects />, { role: "owner" });
    expect(await screen.findAllByTestId("prospect-row")).toHaveLength(12);
    const list = screen.getByRole("navigation", { name: "Gyms" });
    expect(within(list).getAllByRole("heading").map((heading) => heading.textContent)).toEqual(["Selected · 5", "Reserve · 6", "Hold · 1"]);

    const detail = screen.getByTestId("prospect-detail");
    expect(within(detail).getByRole("heading", { level: 2 })).toHaveTextContent("Onyx Gym");
    expect(within(detail).getByText("AMM-001")).toBeInTheDocument();

    await user.click(within(detail).getByRole("tab", { name: "Contact" }));
    expect(within(detail).getByRole("link", { name: "@onyxgym.jo" })).toHaveAttribute("href", "https://www.instagram.com/onyxgym.jo/");
    expect(within(detail).getByText("Not known: Facebook, Email")).toBeInTheDocument();

    await user.click(within(detail).getByRole("tab", { name: "Messages" }));
    const whatsapp = within(detail).getByTestId("prospect-whatsapp-link");
    expect(whatsapp.getAttribute("href")).toMatch(/^https:\/\/wa\.me\/962790979998\?text=/);
    expect(decodeURIComponent(whatsapp.getAttribute("href")!.split("text=")[1]!)).toContain("يعطيكم العافية فريق Onyx");
    expect(within(detail).getByText("This message is not approved yet.")).toBeInTheDocument();
  });

  it("splits the open gym into a few tabs that keep their place and unsaved notes", async () => {
    const user = userEvent.setup();
    await renderWithApp(<PlatformProspects />, { role: "owner" });
    const detail = await screen.findByTestId("prospect-detail");
    const tabs = within(detail).getByRole("tablist", { name: "Gym sections" });
    expect(within(tabs).getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["Progress", "Contact", "Messages", "History"]);
    expect(within(detail).getByRole("tab", { name: "Progress" })).toHaveAttribute("aria-selected", "true");
    expect(within(detail).queryByRole("link", { name: "@onyxgym.jo" })).not.toBeInTheDocument();

    await user.type(within(detail).getByLabelText("Notes"), " Owner trains there on Sundays.");
    await user.click(within(detail).getByRole("tab", { name: "History" }));
    expect(routerMock.replace).toHaveBeenLastCalledWith("/platform/prospects?tab=history", { scroll: false });
    expect(within(detail).getByLabelText("Notes")).not.toBeVisible();
    await user.click(within(detail).getByRole("tab", { name: "Progress" }));
    expect(within(detail).getByLabelText("Notes")).toHaveValue("No outreach sent. Size and member count unverified. Owner trains there on Sundays.");
  }, 20_000);

  it("opens on the tab named in the address", async () => {
    params = new URLSearchParams({ tab: "messages" });
    await renderWithApp(<PlatformProspects />, { role: "owner" });
    const detail = await screen.findByTestId("prospect-detail");
    expect(within(detail).getByRole("tab", { name: "Messages" })).toHaveAttribute("aria-selected", "true");
    expect(within(detail).getByRole("combobox", { name: "Message status" })).toHaveTextContent("Needs review");
  });

  it("moves a gym forward in one click and records it in its history", async () => {
    const user = userEvent.setup();
    await renderWithApp(<PlatformProspects />, { role: "owner" });
    const detail = await screen.findByTestId("prospect-detail");
    expect(screen.getByRole("button", { name: /To contact\s*12/ })).toBeInTheDocument();

    await user.click(within(detail).getByTestId("prospect-next-step"));

    await waitFor(() => expect(within(detail).getByTestId("prospect-next-step")).toHaveTextContent("They replied"));
    expect(screen.getByRole("button", { name: /In talks\s*1/ })).toBeInTheDocument();
    expect(within(screen.getAllByTestId("prospect-row")[0]!).getByText("Contacted")).toBeInTheDocument();
    await user.click(within(detail).getByRole("tab", { name: "History" }));
    const history = await within(detail).findByTestId("prospect-history");
    await waitFor(() => expect(history).toHaveTextContent("Stage changed to Contacted"));
    expect(history).toHaveTextContent("Added from the Amman pilot sheet");
  }, 20_000);

  it("asks after WhatsApp opens and marks the message sent", async () => {
    const user = userEvent.setup();
    await renderWithApp(<PlatformProspects />, { role: "owner" });
    const detail = await screen.findByTestId("prospect-detail");
    await user.click(within(detail).getByRole("tab", { name: "Messages" }));
    const link = within(detail).getByTestId("prospect-whatsapp-link");
    link.addEventListener("click", (event) => event.preventDefault());
    await user.click(link);
    await user.click(await within(detail).findByRole("button", { name: "Yes, mark as sent" }));
    await waitFor(() => expect(within(detail).getByRole("combobox", { name: "Message status" })).toHaveTextContent("Sent"));
    await user.click(within(detail).getByRole("tab", { name: "Progress" }));
    expect(within(detail).getByRole("combobox", { name: "Stage" })).toHaveTextContent("Contacted");
  }, 20_000);

  it("adds a gym and refuses one that is already on the list", async () => {
    const user = userEvent.setup();
    await renderWithApp(<PlatformProspects />, { role: "owner" });
    await screen.findByTestId("prospect-detail");
    await user.click(screen.getByRole("button", { name: "Add gym" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText(/Gym name/), "Onyx Gym");
    await user.click(within(dialog).getByRole("button", { name: "Add gym" }));
    expect(await within(dialog).findByText("This gym is already on the list.")).toBeInTheDocument();

    await user.clear(within(dialog).getByLabelText(/Gym name/));
    await user.type(within(dialog).getByLabelText(/Gym name/), "Iron Yard");
    await user.type(within(dialog).getByLabelText("Instagram"), "not a link");
    await user.click(within(dialog).getByRole("button", { name: "Add gym" }));
    expect(await within(dialog).findByText("Enter a full link that starts with https://")).toBeInTheDocument();

    await user.clear(within(dialog).getByLabelText("Instagram"));
    await user.click(within(dialog).getByRole("button", { name: "Add gym" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getAllByTestId("prospect-row")).toHaveLength(13);
    expect(routerMock.replace).toHaveBeenLastCalledWith(expect.stringMatching(/^\/platform\/prospects\?gym=/), { scroll: false });
  }, 20_000);

  it("filters and searches, including phone numbers typed the local way", async () => {
    const user = userEvent.setup();
    params = new URLSearchParams({ show: "to_contact" });
    await renderWithApp(<PlatformProspects />, { role: "owner" });
    expect(await screen.findAllByTestId("prospect-row")).toHaveLength(12);
    await user.type(screen.getByRole("searchbox", { name: "Search prospects" }), "0785424553");
    expect(screen.getAllByTestId("prospect-row").map((row) => row.textContent)).toEqual([expect.stringContaining("Body Life Gym and Boxing")]);
    await user.clear(screen.getByRole("searchbox", { name: "Search prospects" }));
    await user.type(screen.getByRole("searchbox", { name: "Search prospects" }), "nothing like this");
    expect(screen.getByText("No gyms match")).toBeInTheDocument();
  }, 20_000);

  it("reads in Arabic", async () => {
    await renderWithApp(<LocaleProvider initialLocale="ar"><PlatformProspects /></LocaleProvider>, { role: "owner" });
    expect(await screen.findByRole("heading", { level: 1, name: "الأندية المحتملة للتجربة" })).toBeInTheDocument();
    expect(screen.getAllByText("لم يتم التواصل").length).toBeGreaterThan(0);
  });
});
