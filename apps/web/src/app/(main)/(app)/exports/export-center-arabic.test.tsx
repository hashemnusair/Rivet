import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LocaleProvider, useLocale } from "@/lib/i18n/provider";
import type { Locale } from "@/lib/i18n/locale";
import { renderWithApp, resetApiForTests } from "@/test/harness";
import ExportCenterClient from "./export-center.client";

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(), useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }), usePathname: () => "/exports" }));
vi.mock("@/lib/exports/download", () => ({ downloadTextFile: vi.fn() }));

let changeLocale: (locale: Locale) => void;
function LocaleProbe() {
  const { setLocale } = useLocale();
  useEffect(() => { changeLocale = setLocale; }, [setLocale]);
  return null;
}

afterEach(() => { resetApiForTests(); vi.restoreAllMocks(); });

describe("export content locale", () => {
  it("sends the selected export language and keeps that language visible in job history", async () => {
    const rendered = await renderWithApp(<LocaleProvider initialLocale="ar"><LocaleProbe /><ExportCenterClient /></LocaleProvider>, { role: "owner" });
    const user = userEvent.setup();
    const exportSpy = vi.spyOn(rendered.api, "requestExport");
    const membersRow = screen.getByRole("heading", { name: "الأعضاء" }).closest("li");
    expect(membersRow).not.toBeNull();
    await user.click(within(membersRow!).getByRole("button", { name: "تنزيل ملف CSV" }));

    await waitFor(() => expect(exportSpy).toHaveBeenCalledWith(expect.objectContaining({ kind: "members", locale: "ar" })));
    expect(await screen.findByText(/محتوى الملف: العربية/)).toBeInTheDocument();
    await act(async () => changeLocale("en"));
    expect(await screen.findByText(/File content: Arabic/)).toBeInTheDocument();
  });
});
