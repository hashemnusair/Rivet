import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WhatsAppHandoff } from "./whatsapp-handoff";

const mutate = vi.fn();

vi.mock("@/lib/hooks/use-api", () => ({
  useApiMutation: () => ({ mutate, isPending: false }),
  useInvalidate: () => vi.fn(),
}));

vi.mock("@/lib/providers/app-providers", () => ({
  useApp: () => ({ session: { organization: { name: "Forge", timezone: "Asia/Amman", phoneCountryCallingCode: "962" } } }),
}));

describe("WhatsAppHandoff", () => {
  beforeEach(() => {
    mutate.mockReset();
    vi.spyOn(window, "open").mockReturnValue(null);
  });

  it("opens an editable Jordan-default handoff and records the attempt", async () => {
    const user = userEvent.setup();
    render(<WhatsAppHandoff subject="lead" subjectId="lead-1" recipientName="Ahmad Saleh" phone="079 123 4567" />);

    await user.click(screen.getByRole("button", { name: "WhatsApp" }));
    expect(screen.getByRole("dialog", { name: "Message Ahmad Saleh" })).toBeInTheDocument();
    expect((screen.getByRole("textbox", { name: "WhatsApp message" }) as HTMLTextAreaElement).value).toContain("Hi Ahmad");

    await user.click(screen.getByRole("button", { name: "Open WhatsApp" }));

    expect(window.open).toHaveBeenCalledWith(expect.stringMatching(/^https:\/\/wa\.me\/962791234567\?text=/), "_blank", "noopener,noreferrer");
    expect(mutate).toHaveBeenCalledTimes(1);
  });

  it("preserves an explicit foreign country code", async () => {
    const user = userEvent.setup();
    render(<WhatsAppHandoff subject="member" subjectId="member-1" recipientName="Jamie Lee" phone="+44 20 7946 0958" />);

    await user.click(screen.getByRole("button", { name: "WhatsApp" }));
    await user.click(screen.getByRole("button", { name: "Open WhatsApp" }));

    expect(window.open).toHaveBeenCalledWith(expect.stringMatching(/^https:\/\/wa\.me\/442079460958\?text=/), "_blank", "noopener,noreferrer");
  });
});
