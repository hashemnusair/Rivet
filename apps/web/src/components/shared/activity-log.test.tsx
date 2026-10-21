import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FormattingProvider } from "@/lib/i18n/format";
import { LocaleProvider, useLocale } from "@/lib/i18n/provider";
import { activityActionLabel } from "@/lib/i18n/activity-log";
import { ActivityLog, ActivityRow } from "./activity-log";

const stripIsolates = (value: string) => value.replace(/[⁦-⁩]/g, "");

const event = {
  id: "audit-1",
  action: "gym.subscription.update",
  summary: "Updated gym subscription controls and issued INV-c234d937-c2c4-48f3-a0d9-6f1afd8f1121 for the new term",
  actorName: "Hashem Nusair",
  occurredAt: "2026-09-27T16:35:00.000Z",
};

function Row({ subject, action = event.action }: { subject?: string; action?: string }) {
  const { t, locale } = useLocale();
  return (
    <ActivityLog aria-label="Activity">
      <ActivityRow title={activityActionLabel(t, action, locale)} subject={subject} description={event.summary} actor={event.actorName} role={subject ? "Owner" : undefined} occurredAt={event.occurredAt} />
    </ActivityLog>
  );
}

function renderRow(locale: "en" | "ar", props: { subject?: string; action?: string } = {}) {
  return render(
    <FormattingProvider timeZone="Asia/Amman">
      <LocaleProvider initialLocale={locale}>
        <Row {...props} />
      </LocaleProvider>
    </FormattingProvider>,
  );
}

describe("ActivityRow", () => {
  it("shows a plain label, the sentence with a short invoice reference, and who and when", () => {
    renderRow("en");
    const row = within(screen.getByRole("list", { name: "Activity" })).getByRole("listitem");
    const text = stripIsolates(row.textContent ?? "");

    expect(text).toContain("Subscription changed");
    expect(text).not.toContain("gym.subscription.update");
    expect(text).toContain("issued INV-C234D937 for the new term");
    expect(text).not.toContain("c2c4-48f3");
    expect(within(row).getByText("INV-C234D937")).toHaveAttribute("title", "Full reference: INV-c234d937-c2c4-48f3-a0d9-6f1afd8f1121");
    expect(text).toContain("Hashem Nusair · 27 Sept, 19:35");
    expect(row.querySelector("time")).toHaveAttribute("dateTime", event.occurredAt);
  });

  it("lets long text wrap anywhere instead of overflowing a column", () => {
    renderRow("en");
    const entry = document.querySelector('[data-slot="activity-entry"]');
    expect(entry).toHaveClass("min-w-0", "[overflow-wrap:anywhere]");
  });

  it("names what the action was about, unless it is only an id", () => {
    const { unmount } = renderRow("en", { subject: "R-2479 · Nasser Najjar" });
    expect(stripIsolates(screen.getByRole("listitem").textContent ?? "")).toContain("Subscription changed · R-2479 · Nasser Najjar");
    expect(stripIsolates(screen.getByRole("listitem").textContent ?? "")).toContain("Hashem Nusair · Owner · 27 Sept, 19:35");
    unmount();

    renderRow("en", { subject: "10000000-0000-4a00-8a00-000000000669" });
    expect(screen.getByRole("listitem").textContent).not.toContain("10000000");
  });

  it("renders an unknown action as words, not as its code", () => {
    renderRow("en", { action: "gym.provisioning.dns_verified" });
    const text = screen.getByRole("listitem").textContent ?? "";
    expect(text).toContain("Gym provisioning dns verified");
    expect(text).not.toContain("gym.provisioning.dns_verified");
  });

  it("reads in Arabic: translated label and time, the stored English sentence kept and isolated", () => {
    renderRow("ar");
    const row = screen.getByRole("listitem");
    const text = stripIsolates(row.textContent ?? "");

    expect(text).toContain("تعديل اشتراك النادي");
    expect(text).toContain("27 أيلول");
    expect(text).toContain("issued INV-C234D937 for the new term");
    // The stored sentence keeps its own direction inside the right-to-left row.
    const sentence = within(row).getByText((_, element) => element?.tagName === "SPAN" && element.getAttribute("dir") === "auto" && (element.textContent ?? "").startsWith("Updated gym"));
    expect(sentence).toBeInTheDocument();
  });
});
