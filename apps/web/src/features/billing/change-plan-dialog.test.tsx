import { afterEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { LocaleProvider } from "@/lib/i18n/provider";
import { renderWithApp, resetApiForTests } from "@/test/harness";
import { ChangePlanDialog } from "./change-plan-dialog";
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), usePathname: () => "/settings/subscription" }));
class ResizeObserverMock { observe() {} unobserve() {} disconnect() {} }
vi.stubGlobal("ResizeObserver", ResizeObserverMock);
afterEach(resetApiForTests);
describe("owner upgrade capacity labels", () => {
  it.each(["en", "ar"] as const)("renders unlimited and finite capacities accessibly in %s", async locale => {
    const option = { monthlyPriceMinor: 199000, subtotalMinor: 199000, creditMinor: 0, creditDays: 0, onboardingFeeMinor: 0, amountMinor: 199000 };
    await renderWithApp(<LocaleProvider initialLocale={locale}><ChangePlanDialog open onOpenChange={() => {}} plans={{ plan: "Basic", status: "active", billingInterval: "monthly", options: [{ ...option, plan: "Pro" }, { ...option, plan: "Basic" }] }} /></LocaleProvider>);
    const pro = screen.getByRole("radio", { name: /Pro/ });
    expect(pro).toHaveTextContent(locale === "en" ? "Branches: Unlimited · Staff: Unlimited · Members: Unlimited" : "الفروع: غير محدود · فريق العمل: غير محدود · الأعضاء: غير محدود");
    expect(pro).not.toHaveTextContent("-1");
    expect(screen.getByRole("radio", { name: /Basic/ })).toHaveTextContent(/1.*5.*300/);
  });
});
