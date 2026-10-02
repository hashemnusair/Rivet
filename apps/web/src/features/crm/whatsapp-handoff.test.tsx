import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WhatsAppHandoff, whatsAppHandoffNotes } from "./whatsapp-handoff";
import { LocaleProvider, useLocale } from "@/lib/i18n/provider";

const mutate = vi.fn();
const mutationState = vi.hoisted(() => ({ onError: undefined as (() => void) | undefined }));
const appState = vi.hoisted(() => ({ defaultLanguage: "en" as "en" | "ar" }));

vi.mock("@/lib/hooks/use-api", () => ({
  useApiMutation: (_fn: unknown, options?: { onError?: () => void }) => {
    mutationState.onError = options?.onError;
    return { mutate, isPending: false };
  },
  useInvalidate: () => vi.fn(),
}));

vi.mock("@/lib/providers/app-providers", () => ({
  useApp: () => ({ session: { organization: { name: "Forge", timezone: "Asia/Amman", phoneCountryCallingCode: "962", defaultLanguage: appState.defaultLanguage } } }),
}));

const openedWindow = () => ({ opener: {} }) as unknown as Window;

function LocaleToggle() {
  const { locale, setLocale } = useLocale();
  const next = locale === "en" ? "ar" : "en";
  return <button type="button" onClick={() => setLocale(next)}>{next === "ar" ? "Switch to Arabic" : "Switch to English"}</button>;
}

describe("WhatsAppHandoff", () => {
  beforeEach(() => {
    mutate.mockReset();
    mutationState.onError = undefined;
    appState.defaultLanguage = "en";
  });

  it("opens an editable Jordan-default handoff and records the attempt with the prepared message", async () => {
    vi.spyOn(window, "open").mockReturnValue(openedWindow());
    const user = userEvent.setup();
    render(<WhatsAppHandoff subject="lead" subjectId="lead-1" recipientName="Ahmad Saleh" phone="079 123 4567" />);

    await user.click(screen.getByRole("button", { name: "WhatsApp" }));
    expect(screen.getByRole("dialog", { name: "Message Ahmad Saleh" })).toBeInTheDocument();
    expect((screen.getByRole("textbox", { name: "WhatsApp message" }) as HTMLTextAreaElement).value).toContain("Hi Ahmad");

    await user.click(screen.getByRole("button", { name: "Open WhatsApp" }));

    expect(window.open).toHaveBeenCalledWith(expect.stringMatching(/^https:\/\/wa\.me\/962791234567\?text=/), "_blank", "noopener,noreferrer");
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(whatsAppHandoffNotes("Hi Ahmad, see you soon")).toBe("Opened WhatsApp with this message ready: “Hi Ahmad, see you soon”. RIVET did not send it and cannot confirm delivery.");
  });

  it("preserves an explicit foreign country code", async () => {
    vi.spyOn(window, "open").mockReturnValue(openedWindow());
    const user = userEvent.setup();
    render(<WhatsAppHandoff subject="member" subjectId="member-1" recipientName="Jamie Lee" phone="+44 20 7946 0958" />);

    await user.click(screen.getByRole("button", { name: "WhatsApp" }));
    await user.click(screen.getByRole("button", { name: "Open WhatsApp" }));

    expect(window.open).toHaveBeenCalledWith(expect.stringMatching(/^https:\/\/wa\.me\/442079460958\?text=/), "_blank", "noopener,noreferrer");
  });

  it("logs nothing when the browser blocks the window and offers a manual link that logs on click", async () => {
    vi.spyOn(window, "open").mockReturnValue(null);
    const user = userEvent.setup();
    render(<WhatsAppHandoff subject="member" subjectId="member-1" recipientName="Lina Haddad" phone="079 555 0101" />);

    await user.click(screen.getByRole("button", { name: "WhatsApp" }));
    await user.click(screen.getByRole("button", { name: "Open WhatsApp" }));

    expect(mutate).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/blocked the WhatsApp window/);
    const manual = screen.getByRole("link", { name: "Open WhatsApp in a new tab" });
    expect(manual).toHaveAttribute("href", expect.stringMatching(/^https:\/\/wa\.me\/962795550101\?text=/));
    expect(screen.queryByRole("button", { name: "Open WhatsApp" })).not.toBeInTheDocument();

    await user.click(manual);
    expect(mutate).toHaveBeenCalledTimes(1);
  });

  it("keeps the draft and offers a retry when the handoff could not be logged", async () => {
    vi.spyOn(window, "open").mockReturnValue(openedWindow());
    const user = userEvent.setup();
    render(<WhatsAppHandoff subject="member" subjectId="member-1" recipientName="Lina Haddad" phone="079 555 0101" />);

    await user.click(screen.getByRole("button", { name: "WhatsApp" }));
    const textarea = screen.getByRole("textbox", { name: "WhatsApp message" }) as HTMLTextAreaElement;
    await user.clear(textarea);
    await user.type(textarea, "Custom draft that must survive");
    await user.click(screen.getByRole("button", { name: "Open WhatsApp" }));
    expect(mutate).toHaveBeenCalledTimes(1);

    act(() => mutationState.onError?.());

    expect(screen.getByRole("dialog", { name: "Message Lina Haddad" })).toBeInTheDocument();
    expect(textarea.value).toBe("Custom draft that must survive");
    expect(screen.getByRole("alert")).toHaveTextContent(/was not saved on the timeline/);
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(mutate).toHaveBeenCalledTimes(2);
    expect(window.open).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Close without saving" })).toBeInTheDocument();
  });

  it("uses the recipient language regardless of UI locale and preserves the date and edited draft", async () => {
    const user = userEvent.setup();
    render(<LocaleProvider initialLocale="en"><LocaleToggle /><WhatsAppHandoff subject="member" subjectId="member-1" recipientName="Lina Haddad" recipientPreferredLanguage="ar" phone="079 555 0101" /></LocaleProvider>);
    await user.click(screen.getByRole("button", { name: "WhatsApp" }));

    const textarea = screen.getByRole("textbox", { name: "WhatsApp message" }) as HTMLTextAreaElement;
    expect(textarea.value).toContain("مرحبًا");
    const dateInput = document.querySelector<HTMLInputElement>('input[type="date"]')!;
    fireEvent.change(dateInput, { target: { value: "2030-03-18" } });
    fireEvent.click(screen.getByText("Switch to Arabic"));
    expect(screen.getByRole("dialog", { name: /مراسلة/ })).toBeInTheDocument();
    expect(textarea.value).toContain("مرحبًا");
    expect(dateInput).toHaveValue("2030-03-18");

    await user.clear(textarea);
    await user.type(textarea, "رسالة مخصصة للمراجعة");
    fireEvent.click(screen.getByText("Switch to English"));
    expect(textarea.value).toBe("رسالة مخصصة للمراجعة");
    expect(dateInput).toHaveValue("2030-03-18");
  });

  it("uses the gym language when the recipient has no saved preference", async () => {
    appState.defaultLanguage = "ar";
    const user = userEvent.setup();
    render(<LocaleProvider initialLocale="en"><WhatsAppHandoff subject="member" subjectId="member-1" recipientName="Lina Haddad" phone="079 555 0101" /></LocaleProvider>);

    await user.click(screen.getByRole("button", { name: "WhatsApp" }));

    expect((screen.getByRole("textbox", { name: "WhatsApp message" }) as HTMLTextAreaElement).value).toContain("مرحبًا");
  });
});
