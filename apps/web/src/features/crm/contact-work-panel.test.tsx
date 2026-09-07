import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { addDays, todayISODate } from "@/lib/utils/dates";
import { LogContactDialog, LogContactForm, recommendedLeadStage } from "./contact-work-panel";

const mutate = vi.fn();

vi.mock("@/lib/hooks/use-api", () => ({
  useApiMutation: () => ({ mutate, isPending: false }),
  useInvalidate: () => vi.fn(),
}));

vi.mock("@/lib/providers/app-providers", () => ({
  useApp: () => ({ session: { organization: { timezone: "Asia/Amman" } } }),
}));

describe("LogContactDialog", () => {
  beforeEach(() => mutate.mockReset());

  it("opens the contact form in a centered accessible dialog with the outcome as an explicit choice", async () => {
    const user = userEvent.setup();
    render(<LogContactDialog subject="lead" leadId="lead-1" currentStage="contacted" />);

    await user.click(screen.getByRole("button", { name: "Log contact" }));

    expect(screen.getByRole("dialog", { name: "Log contact" })).toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: "Contact outcome" })).toBeInTheDocument();
    expect(screen.getAllByRole("radio").every((radio) => radio.getAttribute("aria-checked") === "false")).toBe(true);
    expect(screen.getByRole("textbox", { name: "Notes" })).toBeInTheDocument();
  });

  it("can be driven from a deep link without rendering its own trigger", () => {
    const onOpenChange = vi.fn();
    render(<LogContactDialog subject="member" memberId="member-1" open hideTrigger onOpenChange={onOpenChange} />);
    const dialog = screen.getByRole("dialog", { name: "Log contact" });
    // The only "Log contact" button left is the form's submit inside the dialog.
    const buttons = screen.getAllByRole("button", { name: "Log contact" });
    expect(buttons).toHaveLength(1);
    expect(within(dialog).getByRole("button", { name: "Log contact" })).toBe(buttons[0]);
  });
});

describe("LogContactForm", () => {
  beforeEach(() => mutate.mockReset());

  it("refuses to log until an outcome is chosen and offers trial outcomes only for leads", async () => {
    const user = userEvent.setup();
    render(<LogContactForm subject="member" memberId="member-1" />);
    expect(screen.queryByRole("radio", { name: "Trial booked" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Log contact" }));
    expect(await screen.findByText("Choose what happened.")).toBeInTheDocument();
    expect(mutate).not.toHaveBeenCalled();
  });

  it("suggests a visible retry date for no answer and sends no stage for an attempt", async () => {
    const user = userEvent.setup();
    const today = todayISODate("Asia/Amman");
    render(<LogContactForm subject="lead" leadId="lead-1" currentStage="trial_booked" />);

    await user.click(screen.getByRole("radio", { name: "No answer" }));
    const date = screen.getByTestId("contact-next-followup") as HTMLInputElement;
    expect(date.value).toBe(addDays(today, 2));
    expect(screen.getByText(/Suggested: in 2 days/)).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Lead stage" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Log contact" }));
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate.mock.calls[0]![0]).toMatchObject({ outcome: "no_answer", nextFollowUp: addDays(today, 2) });
  });

  it("offers the stage only when the lead was reached and never overrides a date the person typed", async () => {
    const user = userEvent.setup();
    const today = todayISODate("Asia/Amman");
    render(<LogContactForm subject="lead" leadId="lead-1" currentStage="offer_sent" />);

    const date = screen.getByTestId("contact-next-followup") as HTMLInputElement;
    await user.clear(date);
    await user.type(date, addDays(today, 9));
    await user.click(screen.getByRole("radio", { name: "Interested" }));

    expect(screen.getByRole("combobox", { name: "Lead stage" })).toHaveTextContent("Offer sent");
    expect(date.value).toBe(addDays(today, 9));
    expect(screen.queryByText(/Suggested:/)).not.toBeInTheDocument();
  });

  it("rejects a follow-up in the past instead of scheduling work that is already overdue", async () => {
    const user = userEvent.setup();
    render(<LogContactForm subject="member" memberId="member-1" />);
    await user.click(screen.getByRole("radio", { name: "Asked for a callback" }));
    const date = screen.getByTestId("contact-next-followup") as HTMLInputElement;
    await user.clear(date);
    await user.type(date, "2020-01-01");
    expect(screen.getByText("Choose today or a later date.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Log contact" })).toBeDisabled();
  });
});

describe("recommendedLeadStage", () => {
  it("keeps a lead where it is when it is already past contacted, otherwise moves it to contacted", () => {
    expect(recommendedLeadStage("answered_interested", "new")).toBe("contacted");
    expect(recommendedLeadStage("answered_interested", "trial_booked")).toBe("trial_booked");
    expect(recommendedLeadStage("trial_completed", "contacted")).toBe("trial_completed");
  });
});
