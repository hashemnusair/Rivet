import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { REMINDER_STORAGE_KEY } from "@/lib/pwa/member-app-install";
import { resetMemberAppForTests } from "@/lib/pwa/use-member-app";
import { MemberAppProvider, MemberAppReminder, useMemberAppInstall } from "./member-app";

const state = vi.hoisted(() => ({ pathname: "/customer/my-gyms" }));
vi.mock("next/navigation", () => ({ usePathname: () => state.pathname }));

const UA = {
  iphoneSafari: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1",
  iphoneInstagram: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 390.0.0.28.85",
  androidChrome: "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36",
  macChrome: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
};
const DAY = 24 * 60 * 60 * 1000;
let now = Date.parse("2026-10-29T09:00:00Z");
let standalone = false;

function device(userAgent: string, touchPoints = 5) {
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue(userAgent);
  // jsdom has no maxTouchPoints; iPadOS detection reads it.
  Object.defineProperty(navigator, "maxTouchPoints", { configurable: true, get: () => touchPoints });
  act(() => resetMemberAppForTests());
}

function StartButton() {
  const { start } = useMemberAppInstall();
  return <button type="button" onClick={start}>Open guide</button>;
}

function renderApp() {
  return render(<MemberAppProvider><MemberAppReminder /><StartButton /></MemberAppProvider>);
}

const reminder = () => document.querySelector("[data-member-app-reminder]");

beforeEach(() => {
  state.pathname = "/customer/my-gyms";
  standalone = false;
  now = Date.parse("2026-10-29T09:00:00Z");
  vi.spyOn(Date, "now").mockImplementation(() => now);
  window.localStorage.clear();
  window.matchMedia = vi.fn((query: string) => ({ matches: standalone && query.includes("standalone"), media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() })) as unknown as typeof window.matchMedia;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("member app reminder", () => {
  it("asks iPhone members and opens the Safari steps", async () => {
    device(UA.iphoneSafari);
    renderApp();
    const bar = reminder() as HTMLElement;
    expect(within(bar).getByText("Add RIVET to your home screen")).toBeInTheDocument();

    await userEvent.click(within(bar).getByRole("button", { name: "Show me how" }));
    const guide = await screen.findByRole("dialog", { name: "Add RIVET to your home screen" });
    expect(within(guide).getByRole("tab", { name: "iPhone" })).toHaveAttribute("aria-selected", "true");
    const steps = within(guide).getByRole("list", { name: "Steps" });
    expect(within(steps).getAllByRole("listitem").map((item) => item.querySelector("p")?.textContent)).toEqual(["Tap the Share button", "Tap Add to Home Screen", "Tap Add"]);
    expect(within(steps).getByText(/bottom of Safari/)).toBeInTheDocument();

    await userEvent.click(within(guide).getByRole("tab", { name: "Android" }));
    expect(within(guide).getByText("Tap the menu button")).toBeInTheDocument();
  });

  it("comes back after Not now: 3 days, then 7", async () => {
    device(UA.iphoneSafari);
    renderApp();
    await userEvent.click(screen.getByRole("button", { name: "Not now" }));
    expect(reminder()).toBeNull();

    now += 3 * DAY - 60_000;
    act(() => resetMemberAppForTests());
    expect(reminder()).toBeNull();
    now += 60_000;
    act(() => resetMemberAppForTests());
    expect(reminder()).not.toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Not now" }));
    now += 6 * DAY;
    act(() => resetMemberAppForTests());
    expect(reminder()).toBeNull();
    now += DAY;
    act(() => resetMemberAppForTests());
    expect(reminder()).not.toBeNull();
  });

  it("stays away inside the installed app, on computers and on the guide page", () => {
    standalone = true;
    device(UA.iphoneSafari);
    const { unmount } = renderApp();
    expect(reminder()).toBeNull();
    unmount();

    standalone = false;
    device(UA.macChrome, 0);
    renderApp().unmount();
    expect(reminder()).toBeNull();

    state.pathname = "/customer/getting-started";
    device(UA.androidChrome);
    renderApp();
    expect(reminder()).toBeNull();
  });

  it("uses Android's own install prompt in one tap and then stops asking", async () => {
    device(UA.androidChrome);
    renderApp();
    const prompt = vi.fn(async () => undefined);
    const offer = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), { prompt, userChoice: Promise.resolve({ outcome: "accepted" as const }) });
    act(() => { window.dispatchEvent(offer); });
    expect(offer.defaultPrevented).toBe(true);

    await userEvent.click(within(reminder() as HTMLElement).getByRole("button", { name: "Add" }));
    expect(prompt).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(reminder()).toBeNull();
    expect(JSON.parse(window.localStorage.getItem(REMINDER_STORAGE_KEY) ?? "{}")).toMatchObject({ added: true });
  });

  it("tells members in Instagram to open a real browser first", async () => {
    device(UA.iphoneInstagram);
    renderApp();
    await userEvent.click(screen.getByRole("button", { name: "Show me how" }));
    const guide = await screen.findByRole("dialog");
    expect(within(guide).getByText("Open this page in your browser first")).toBeInTheDocument();
    expect(within(guide).getByRole("button", { name: "Copy link" })).toBeInTheDocument();
    // Instagram is not Safari: the share button sits by the address bar.
    expect(within(guide).getByText(/next to the address bar/)).toBeInTheDocument();
  });

  it("shows a computer a code to open RIVET on the phone", async () => {
    device(UA.macChrome, 0);
    renderApp();
    await userEvent.click(screen.getByRole("button", { name: "Open guide" }));
    const guide = await screen.findByRole("dialog");
    expect(within(guide).getByRole("img", { name: "QR code that opens RIVET on your phone" })).toBeInTheDocument();
    expect(within(guide).getByText("Open RIVET on your phone")).toBeInTheDocument();
  });

  it("stops reminding on this browser when the member says it is already added", async () => {
    device(UA.androidChrome);
    renderApp();
    await userEvent.click(screen.getByRole("button", { name: "Show me how" }));
    await userEvent.click(await screen.findByRole("button", { name: "I already added it" }));
    expect(reminder()).toBeNull();
    now += 400 * DAY;
    act(() => resetMemberAppForTests());
    expect(reminder()).toBeNull();
  });
});
