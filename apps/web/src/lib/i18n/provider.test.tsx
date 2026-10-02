import { useEffect, useState } from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LanguageButton } from "@/components/shared/language-switch";
import { MembershipStatusChip } from "@/components/shared/status-chip";
import { LocaleProvider, useLocale, useT } from "./provider";
import { encodeUiPreference, parseUiPreference } from "./preference";

afterEach(() => {
  document.cookie = "rivet_locale=; path=/; max-age=0";
  document.cookie = "rivet_ui_locale_v1=; path=/; max-age=0";
  localStorage.clear();
  document.documentElement.lang = "en";
  document.documentElement.dir = "ltr";
  document.documentElement.classList.remove("rtl-font");
});

function Probe() {
  const t = useT();
  const { locale, dir } = useLocale();
  return <p data-testid="probe">{`${locale}|${dir}|${t("common.action.save")}`}</p>;
}

describe("LocaleProvider", () => {
  it("renders English without a provider, exactly as the app did before Arabic", () => {
    render(<MembershipStatusChip status="expiring" />);
    expect(screen.getByText("Ending soon")).toBeInTheDocument();
  });

  it("renders Arabic catalogue text in an Arabic provider", () => {
    render(
      <LocaleProvider initialLocale="ar">
        <MembershipStatusChip status="expiring" />
        <Probe />
      </LocaleProvider>,
    );
    expect(screen.getByText("تنتهي قريبًا")).toBeInTheDocument();
    expect(screen.getByTestId("probe")).toHaveTextContent("ar|rtl|حفظ");
  });

  it("switches language, direction, font class and cookie together", async () => {
    render(
      <LocaleProvider initialLocale="en">
        <Probe />
        <LanguageButton />
      </LocaleProvider>,
    );
    expect(screen.getByTestId("probe")).toHaveTextContent("en|ltr|Save");
    await act(async () => {
      await userEvent.click(screen.getByRole("button", { name: "Switch to Arabic" }));
    });
    expect(screen.getByTestId("probe")).toHaveTextContent("ar|rtl|حفظ");
    expect(document.documentElement.lang).toBe("ar");
    expect(document.documentElement.dir).toBe("rtl");
    expect(document.documentElement.classList.contains("rtl-font")).toBe(true);
    expect(document.cookie).toContain("rivet_locale=ar");
    await act(async () => {
      await userEvent.click(screen.getByRole("button", { name: "التبديل إلى English" }));
    });
    expect(document.documentElement.dir).toBe("ltr");
    expect(document.cookie).toContain("rivet_locale=en");
  });
});

function PreferenceProbe({ owner, saved, save }: { owner: string | null; saved?: "en" | "ar"; save?: (locale: "en" | "ar") => Promise<unknown> }) {
  const { bindAccount, preferenceStatus, setLocale, locale } = useLocale();
  const [draft, setDraft] = useState("");
  useEffect(() => bindAccount(owner, saved, save), [bindAccount, owner, saved, save]);
  return <><input aria-label="Draft" value={draft} onChange={event => setDraft(event.target.value)} /><button onClick={() => setLocale("ar")}>Arabic</button><button onClick={() => setLocale("en")}>English</button><output>{locale}|{preferenceStatus}</output></>;
}

describe("preference persistence lifecycle", () => {
  it("keeps a form draft during a language change and ignores stale localStorage at hydration", async () => {
    localStorage.setItem("rivet.uiLocale.v1", encodeUiPreference({ version: 1, locale: "ar", owner: null }));
    render(<LocaleProvider initialLocale="en"><PreferenceProbe owner={null} /></LocaleProvider>);
    expect(screen.getByRole("status")).toHaveTextContent("en|device");
    await userEvent.type(screen.getByLabelText("Draft"), "unsaved member note");
    await userEvent.click(screen.getByText("Arabic"));
    expect(screen.getByLabelText("Draft")).toHaveValue("unsaved member note");
  });
  it("retains an offline choice and retries after reconnection", async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({ locale: "ar" });
    render(<LocaleProvider initialOwner="a"><PreferenceProbe owner="a" saved="en" save={save} /></LocaleProvider>);
    await userEvent.click(screen.getByText("Arabic"));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("ar|pending"));
    await act(async () => { window.dispatchEvent(new Event("online")); });
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("ar|saved"));
    expect(save).toHaveBeenCalledTimes(2);
  });
  it("ignores a previous account's late acknowledgement", async () => {
    let acknowledge!: () => void;
    const save = vi.fn(() => new Promise<void>(resolve => { acknowledge = resolve; }));
    const view = render(<LocaleProvider initialOwner="a"><PreferenceProbe owner="a" saved="en" save={save} /></LocaleProvider>);
    await userEvent.click(screen.getByText("Arabic"));
    view.rerender(<LocaleProvider initialOwner="a"><PreferenceProbe owner="b" saved="en" /></LocaleProvider>);
    await act(async () => { acknowledge(); });
    expect(screen.getByRole("status")).toHaveTextContent("en|saved");
    expect(parseUiPreference(decodeURIComponent(document.cookie.split("rivet_ui_locale_v1=")[1]!.split(";")[0]!))?.owner).toBe("b");
  });
  it("accepts another tab's same-account choice and rejects another account's choice", async () => {
    render(<LocaleProvider initialOwner="a"><PreferenceProbe owner="a" saved="en" /></LocaleProvider>);
    for (const owner of ["b", "a"]) {
      await act(async () => { window.dispatchEvent(new StorageEvent("storage", { key: "rivet.uiLocale.v1", newValue: encodeUiPreference({ version: 1, locale: "ar", owner }) })); });
      expect(screen.getByRole("status")).toHaveTextContent(owner === "a" ? "ar|saved" : "en|saved");
    }
  });
  it("works when the browser denies persistent storage", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("Denied", "SecurityError"); });
    try {
      render(<LocaleProvider><PreferenceProbe owner={null} /></LocaleProvider>);
      await userEvent.click(screen.getByText("Arabic"));
      expect(screen.getByRole("status")).toHaveTextContent("ar|device");
    } finally { setItem.mockRestore(); }
  });
});
