import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LogContactForm } from "@/features/crm/contact-work-panel";
import type { MockGymOSApi } from "@/lib/mock/MockGymOSApi";
import type { MemberSummary } from "@/lib/domain/types";
import { addDays, todayISODate } from "@/lib/utils/dates";
import { renderWithApp, resetApiForTests } from "@/test/harness";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }), usePathname: () => "/members", useParams: () => ({}), useSearchParams: () => new URLSearchParams() }));

afterEach(() => resetApiForTests());

async function activeMember(api: MockGymOSApi): Promise<MemberSummary> {
  const page = await api.listMembers({ status: "active", pageSize: 60 });
  const member = page.items.find((candidate) => candidate.membershipStatus === "active");
  if (!member) throw new Error("seed should contain an active member");
  return member;
}

const enableAssist = async (api: MockGymOSApi) => { await api.updateAssistPreference({ enabled: true }); };

describe("contact note review", () => {
  it("never turns a conversation with a relative into an outcome, and keeps the note as typed", async () => {
    const user = userEvent.setup();
    let member: MemberSummary | undefined;
    await renderWithApp(<Probe />, { prepare: async (api) => { await enableAssist(api); member = await activeMember(api); window.sessionStorage.setItem("test.member", member.id); } });
    expect(member).toBeDefined();
    const note = screen.getByRole("textbox", { name: "Notes" });
    await user.type(note, "Spoke to her brother, she is travelling until Thursday and he thinks she wants to renew");
    await user.click(screen.getByRole("button", { name: "Review note" }));
    const card = await screen.findByTestId("contact-note-review");
    expect(within(card).getByTestId("contact-note-third-party")).toHaveTextContent("someone other than the member");
    expect(within(card).queryByRole("button", { name: /^Use “/ })).not.toBeInTheDocument();
    expect(screen.getAllByRole("radio").every((radio) => radio.getAttribute("aria-checked") === "false")).toBe(true);
    expect(note).toHaveValue("Spoke to her brother, she is travelling until Thursday and he thinks she wants to renew");
  });

  it("previews what the outcome does to tasks and dates, applies only the outcome, and drops the review when the note changes", async () => {
    const user = userEvent.setup();
    let member: MemberSummary | undefined;
    let taskTitle = "";
    await renderWithApp(<Probe />, {
      prepare: async (api) => {
        await enableAssist(api);
        member = await activeMember(api);
        window.sessionStorage.setItem("test.member", member.id);
        const session = await api.getSession();
        taskTitle = `Follow up — ${member.fullName} · test`;
        await api.createFollowUp({ type: "follow_up", title: taskTitle, ownerId: session.user.id, dueAt: `${addDays(todayISODate(session.organization.timezone), -1)}T07:00:00.000Z`, memberId: member.id });
      },
    });
    const today = todayISODate("Asia/Amman");
    const typedDate = addDays(today, 9);
    const date = screen.getByTestId("contact-next-followup") as HTMLInputElement;
    await user.clear(date);
    await user.type(date, typedDate);
    const note = screen.getByRole("textbox", { name: "Notes" });
    await user.type(note, "No answer, went to voicemail twice");
    await user.click(screen.getByRole("button", { name: "Review note" }));
    const card = await screen.findByTestId("contact-note-review");
    expect(card).toHaveTextContent("Reads as No answer");
    const consequences = within(card).getByTestId("contact-note-consequences");
    await waitFor(() => expect(consequences).toHaveTextContent(`Moves “${taskTitle}”`));
    expect(consequences).toHaveTextContent("(your date, kept)");

    await user.click(within(card).getByRole("button", { name: "Use “No answer”" }));
    expect(screen.getByRole("radio", { name: "No answer" })).toHaveAttribute("aria-checked", "true");
    expect(date.value).toBe(typedDate);
    expect(note).toHaveValue("No answer, went to voicemail twice");
    expect(screen.queryByTestId("contact-note-review")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Review note" }));
    await screen.findByTestId("contact-note-review");
    await user.type(note, " and then she called back");
    await waitFor(() => expect(screen.queryByTestId("contact-note-review")).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Review note" })).toHaveTextContent("Review note");
  });

  it("is absent while suggestions are off for the gym", async () => {
    await renderWithApp(<Probe />, { prepare: async (api) => { const member = await activeMember(api); window.sessionStorage.setItem("test.member", member.id); } });
    expect(screen.getByRole("textbox", { name: "Notes" })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("button", { name: "Review note" })).not.toBeInTheDocument());
  });
});

function Probe() {
  const memberId = window.sessionStorage.getItem("test.member") ?? "";
  return <LogContactForm subject="member" memberId={memberId} />;
}
