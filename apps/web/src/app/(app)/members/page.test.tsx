import { screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LocaleProvider } from "@/lib/i18n/provider";
import { renderWithApp, resetApiForTests } from "@/test/harness";
import MembersPage from "./page";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/members",
  useSearchParams: () => new URLSearchParams(),
}));

afterEach(() => {
  resetApiForTests();
  vi.clearAllMocks();
});

describe("members list", () => {
  it("renders in English outside a locale provider", async () => {
    await renderWithApp(<MembersPage />);
    expect(screen.getByRole("heading", { name: "Members" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Search members" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Sort members" })).toHaveTextContent("Name A–Z");
    await waitFor(() => expect(screen.getAllByTestId("member-card").length).toBeGreaterThan(0));
  });

  it("renders the page, filters and rows in Arabic with LTR phone numbers", async () => {
    await renderWithApp(<LocaleProvider initialLocale="ar"><MembersPage /></LocaleProvider>);
    expect(screen.getByRole("heading", { name: "الأعضاء" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "بحث في الأعضاء" })).toHaveAttribute("placeholder", "الاسم، الهاتف، رقم العضو…");
    expect(screen.getByRole("combobox", { name: "ترتيب الأعضاء" })).toHaveTextContent("الاسم (أ–ي)");
    expect(screen.getByRole("combobox", { name: "تصفية حسب حالة العضوية" })).toHaveTextContent("كل الحالات");
    expect(screen.getByRole("link", { name: /إضافة عضو/ })).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByTestId("member-card").length).toBeGreaterThan(0));
    expect(screen.getAllByText("المتبقي").length).toBeGreaterThan(0);
    expect(document.querySelector('bdi[dir="ltr"]')).not.toBeNull();
  });
});
