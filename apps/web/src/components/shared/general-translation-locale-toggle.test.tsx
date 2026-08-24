import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GeneralTranslationLocaleToggle } from "./general-translation-locale-toggle";

const gtState = vi.hoisted(() => ({
  locale: "en",
  setLocale: vi.fn(),
}));

vi.mock("gt-next", () => ({
  useLocale: () => gtState.locale,
  useSetLocale: () => gtState.setLocale,
}));

describe("GeneralTranslationLocaleToggle", () => {
  beforeEach(() => {
    gtState.locale = "en";
    gtState.setLocale.mockReset();
    document.documentElement.lang = "en";
    document.documentElement.dir = "ltr";
  });

  it("switches to Arabic and synchronizes the existing RTL state", () => {
    const setDir = vi.fn((nextDir: "ltr" | "rtl") => {
      document.documentElement.dir = nextDir;
    });
    render(<GeneralTranslationLocaleToggle dir="ltr" setDir={setDir} />);

    expect(screen.getByRole("button", { name: "Switch language to Arabic" })).toHaveTextContent("العربية");
    fireEvent.click(screen.getByTestId("gt-locale-toggle"));

    expect(gtState.setLocale).toHaveBeenCalledWith("ar");
    expect(setDir).toHaveBeenCalledWith("rtl");
    expect(document.documentElement.lang).toBe("ar");
    expect(document.documentElement.dir).toBe("rtl");
  });

  it("switches back to English and updates the direction to LTR", () => {
    gtState.locale = "ar-EG";
    document.documentElement.lang = "ar-EG";
    document.documentElement.dir = "rtl";
    const setDir = vi.fn((nextDir: "ltr" | "rtl") => {
      document.documentElement.dir = nextDir;
    });
    render(<GeneralTranslationLocaleToggle dir="rtl" setDir={setDir} />);

    expect(screen.getByRole("button", { name: "Switch language to English" })).toHaveTextContent("English");
    fireEvent.click(screen.getByTestId("gt-locale-toggle"));

    expect(gtState.setLocale).toHaveBeenCalledWith("en");
    expect(setDir).toHaveBeenCalledWith("ltr");
    expect(document.documentElement.lang).toBe("en");
    expect(document.documentElement.dir).toBe("ltr");
  });
});
