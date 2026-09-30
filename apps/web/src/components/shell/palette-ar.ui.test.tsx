import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LocaleProvider } from "@/lib/i18n/provider";
import { renderWithApp, resetApiForTests } from "@/test/harness";
import { CommandPalette } from "./command-palette";
import { KeyboardShortcuts } from "./keyboard-shortcuts";

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal("ResizeObserver", ResizeObserverMock);
HTMLElement.prototype.scrollIntoView = () => undefined;

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/dashboard",
}));

afterEach(() => {
  resetApiForTests();
});

describe("keyboard shortcuts in Arabic", () => {
  it("translates the labels and keeps the key caps in Latin", async () => {
    const user = userEvent.setup();
    render(<LocaleProvider initialLocale="ar"><KeyboardShortcuts /></LocaleProvider>);
    await user.click(screen.getByRole("button", { name: "اختصارات لوحة المفاتيح" }));
    expect(await screen.findByText("فتح البحث")).toBeInTheDocument();
    expect(screen.getByText("Esc")).toBeInTheDocument();
  });

  it("stays English outside a provider", () => {
    render(<KeyboardShortcuts />);
    expect(screen.getByRole("button", { name: "Keyboard shortcuts" })).toBeInTheDocument();
  });
});

describe("command palette in Arabic", () => {
  it("shows the Arabic search label, groups and page list", async () => {
    await renderWithApp(<LocaleProvider initialLocale="ar"><CommandPalette open onOpenChange={() => undefined} /></LocaleProvider>);
    expect(screen.getByRole("combobox", { name: "البحث الشامل" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("الانتقال إلى")).toBeInTheDocument());
    expect(screen.getByText("إجراءات سريعة")).toBeInTheDocument();
    expect(screen.getByText("مهام اليوم")).toBeInTheDocument();
  });
});
