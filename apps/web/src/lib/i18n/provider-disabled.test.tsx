import { useEffect } from "react";
import { act, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { LocaleProvider, useLocale } from "./provider";
import { encodeUiPreference, UI_PREFERENCE_STORAGE } from "./preference";

vi.mock("./config", async importOriginal => ({
  ...await importOriginal<typeof import("./config")>(), ARABIC_ENABLED: false,
}));

const save = vi.fn().mockResolvedValue(undefined);
function Account() {
  const { bindAccount, locale, switchEnabled } = useLocale();
  useEffect(() => bindAccount("account-a", "ar", save), [bindAccount]);
  return <output>{locale}|{String(switchEnabled)}</output>;
}

afterEach(() => {
  document.cookie = "rivet_locale=; path=/; max-age=0";
  document.documentElement.lang = "en";
  document.documentElement.dir = "ltr";
  document.documentElement.classList.remove("rtl-font");
});

it.each(["en", "ar"] as const)("keeps a disabled rollout in English without overwriting the account's saved Arabic choice (initial %s)", async (initialLocale) => {
  document.cookie = "rivet_locale=ar; path=/";
  render(<LocaleProvider initialLocale={initialLocale}><Account /></LocaleProvider>);
  expect(screen.getByRole("status")).toHaveTextContent("en|false");
  await act(async () => window.dispatchEvent(new StorageEvent("storage", {
    key: UI_PREFERENCE_STORAGE,
    newValue: encodeUiPreference({ version: 1, owner: "account-a", locale: "ar", pending: "another-tab" }),
  })));
  expect(screen.getByRole("status")).toHaveTextContent("en|false");
  expect(document.cookie).toContain("rivet_locale=ar");
  expect(save).not.toHaveBeenCalled();
});
