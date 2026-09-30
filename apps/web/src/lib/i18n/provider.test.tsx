import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { LanguageButton } from "@/components/shared/language-switch";
import { MembershipStatusChip } from "@/components/shared/status-chip";
import { LocaleProvider, useLocale, useT } from "./provider";

afterEach(() => {
  document.cookie = "rivet_locale=; path=/; max-age=0";
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
