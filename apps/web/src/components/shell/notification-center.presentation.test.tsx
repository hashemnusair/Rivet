import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OperationalNotification } from "@/lib/api/GymOSApi";
import { FormattingProvider } from "@/lib/i18n/format";
import { LocaleProvider } from "@/lib/i18n/provider";
import { systemMessage } from "@/lib/i18n/system-messages";
import { NotificationCenter } from "./notification-center";

const state = vi.hoisted(() => ({
  router: { push: vi.fn() },
  api: {
    listNotifications: vi.fn(),
    subscribeNotifications: vi.fn(),
    setNotificationRead: vi.fn(),
    markAllNotificationsRead: vi.fn(),
  },
}));

vi.mock("next/navigation", () => ({ useRouter: () => state.router }));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
vi.mock("@/lib/api/client", () => ({ getApi: () => state.api }));

const notification = (overrides: Partial<OperationalNotification> = {}): OperationalNotification => ({
  id: "notification-stable-17",
  kind: "renewal_reminder",
  title: "Membership renewal approaching",
  body: "Your current membership term ends 2026-10-12.",
  titleMessage: systemMessage("communicationCompletion.notifications.renewalApproaching"),
  bodyMessage: systemMessage("communicationCompletion.notifications.termEnds", { endDate: { date: "2026-10-12" } }),
  href: "/members/member-17",
  dedupeKey: "renewal:member-17",
  organizationId: "org-1",
  createdAt: "2026-10-03T09:00:00.000Z",
  ...overrides,
});

function renderCenter(locale: "en" | "ar") {
  return render(
    <FormattingProvider timeZone="Asia/Amman">
      <LocaleProvider initialLocale={locale}>
        <NotificationCenter />
      </LocaleProvider>
    </FormattingProvider>,
  );
}

async function openList(locale: "en" | "ar") {
  const user = userEvent.setup();
  const trigger = await screen.findByRole("button", { name: locale === "en" ? /unread notifications/ : /غير مقروء/ });
  await user.click(trigger);
  return user;
}

describe("notification center system-message presentation", () => {
  beforeEach(() => {
    state.router.push.mockReset();
    state.api.listNotifications.mockReset();
    state.api.listNotifications.mockResolvedValue([notification()]);
    state.api.subscribeNotifications.mockReset();
    state.api.subscribeNotifications.mockResolvedValue(vi.fn());
    state.api.setNotificationRead.mockReset();
    state.api.setNotificationRead.mockResolvedValue(undefined);
    state.api.markAllNotificationsRead.mockReset();
    state.api.markAllNotificationsRead.mockResolvedValue(undefined);
  });

  it("keeps the stored English title and body for an English reader", async () => {
    renderCenter("en");
    await openList("en");

    const row = await screen.findByTestId("notification-row");
    expect(within(row).getByText("Membership renewal approaching")).toBeInTheDocument();
    expect(within(row).getByText("Your current membership term ends 2026-10-12.")).toBeInTheDocument();
    expect(row).toHaveAttribute("data-notification-id", "notification-stable-17");
  });

  it("renders Arabic descriptors and a translated accessible action while keeping the notification identity and route", async () => {
    renderCenter("ar");
    const user = await openList("ar");

    const row = await screen.findByTestId("notification-row");
    expect(within(row).getByText("اقترب موعد تجديد الاشتراك")).toBeInTheDocument();
    expect(within(row).getByText("ينتهي اشتراكك الحالي في 12 تشرين الأول 2026.")).toBeInTheDocument();
    expect(row).toHaveAttribute("data-notification-id", "notification-stable-17");

    const openButton = within(row).getByRole("button", { name: /^عرض التفاصيل/ });
    await user.click(openButton);
    await waitFor(() => expect(state.router.push).toHaveBeenCalledWith("/members/member-17"));
    expect(state.api.setNotificationRead).toHaveBeenCalledWith("notification-stable-17", true);
  });

  it("leaves unknown descriptor records exactly as stored", async () => {
    const invalid = { key: "communicationCompletion.notifications.notShippedYet" } as unknown as OperationalNotification["titleMessage"];
    const stored = notification({
      kind: "future_notice_kind",
      title: "Authored future title",
      body: "Provider detail — ref-17",
      titleMessage: invalid,
      bodyMessage: invalid,
    });
    state.api.listNotifications.mockResolvedValue([stored]);

    renderCenter("ar");
    await openList("ar");
    const row = await screen.findByTestId("notification-row");

    expect(within(row).getByText("Authored future title")).toBeInTheDocument();
    expect(within(row).getByText("Provider detail — ref-17")).toBeInTheDocument();
    expect(row).toHaveAttribute("data-notification-id", "notification-stable-17");
  });
});
