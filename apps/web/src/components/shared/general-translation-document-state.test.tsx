import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GeneralTranslationDocumentState } from "./general-translation-document-state";

const gtState = vi.hoisted(() => ({
  locale: "en",
  direction: "ltr" as "ltr" | "rtl",
}));

const appState = vi.hoisted(() => ({
  setDir: vi.fn((nextDir: "ltr" | "rtl") => {
    document.documentElement.dir = nextDir;
  }),
}));

vi.mock("gt-next", () => ({
  useLocale: () => gtState.locale,
  useLocaleDirection: () => gtState.direction,
}));

vi.mock("@/lib/providers/app-providers", () => ({
  useApp: () => appState,
}));

describe("GeneralTranslationDocumentState", () => {
  beforeEach(() => {
    gtState.locale = "en";
    gtState.direction = "ltr";
    appState.setDir.mockClear();
    document.documentElement.lang = "en";
    document.documentElement.dir = "ltr";
    window.sessionStorage.clear();
  });

  it("synchronizes html metadata and direction when the locale changes", async () => {
    const { rerender } = render(<GeneralTranslationDocumentState />);

    await waitFor(() => {
      expect(document.documentElement.lang).toBe("en");
      expect(document.documentElement.dir).toBe("ltr");
    });
    expect(appState.setDir).toHaveBeenCalledWith("ltr");

    gtState.locale = "ar";
    gtState.direction = "rtl";
    rerender(<GeneralTranslationDocumentState />);

    await waitFor(() => {
      expect(document.documentElement.lang).toBe("ar");
      expect(document.documentElement.dir).toBe("rtl");
    });
    expect(appState.setDir).toHaveBeenLastCalledWith("rtl");
  });

  it("preserves an explicitly stored manual direction on first mount", async () => {
    window.sessionStorage.setItem("rivet.demo.dir", "rtl");
    document.documentElement.dir = "rtl";

    render(<GeneralTranslationDocumentState />);

    await waitFor(() => expect(document.documentElement.lang).toBe("en"));
    expect(document.documentElement.dir).toBe("rtl");
    expect(appState.setDir).not.toHaveBeenCalled();
  });
});
