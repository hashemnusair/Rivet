import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { TimelineEvent } from "@/lib/domain/types";
import { FormattingProvider } from "@/lib/i18n/format";
import { LocaleProvider } from "@/lib/i18n/provider";
import { systemMessage } from "@/lib/i18n/system-messages";
import { TimelineFeed } from "./timeline-feed";

const stripIsolates = (value: string) => value.replace(/[\u2066-\u2069]/g, "");

const paymentEvent = (): TimelineEvent => ({
  id: "event-payment-72",
  organizationId: "org-1",
  memberId: "member-1",
  type: "payment_collected",
  title: "Payment collected — JOD 25.000 cash",
  titleMessage: systemMessage("communicationCompletion.timeline.paymentCollected", {
    amount: { amountMinor: 25_000, currency: "JOD" },
    method: { enum: "paymentMethod", value: "cash" },
  }),
  body: "Reason written by Eli: receipt shown at the desk",
  occurredAt: "2026-10-03T09:00:00.000Z",
  actorName: "Eli",
  meta: { receiptId: "receipt-meta-72", source: "desk", retained: true },
});

function renderFeed(locale: "en" | "ar", event: TimelineEvent) {
  return render(
    <FormattingProvider timeZone="Asia/Amman">
      <LocaleProvider initialLocale={locale}>
        <TimelineFeed events={[event]} />
      </LocaleProvider>
    </FormattingProvider>,
  );
}

describe("timeline system-message presentation", () => {
  it("keeps the stored English event text and its ID and metadata", () => {
    const { container } = renderFeed("en", paymentEvent());
    const row = container.querySelector("#timeline-event-event-payment-72");

    expect(row).toBeInTheDocument();
    expect(stripIsolates(row?.textContent ?? "")).toContain("Payment collected — JOD 25.000 cash");
    expect(stripIsolates(row?.textContent ?? "")).toContain("Reason written by Eli: receipt shown at the desk");
    expect(row?.querySelector("a")).toHaveAttribute("href", expect.stringContaining("receipt-meta-72"));
  });

  it("localizes the structured title while keeping the authored body, actor, event ID and receipt metadata", () => {
    const { container } = renderFeed("ar", paymentEvent());
    const row = container.querySelector("#timeline-event-event-payment-72");
    const text = stripIsolates(row?.textContent ?? "");

    expect(row).toBeInTheDocument();
    expect(text).toContain("تم استلام دفعة — 25.000 د.أ، كاش");
    expect(text).toContain("Reason written by Eli: receipt shown at the desk");
    expect(text).toContain("Eli");
    expect(row?.querySelector("a")).toHaveAttribute("href", expect.stringContaining("receipt-meta-72"));
  });

  it("keeps unknown future records and authored text unchanged", () => {
    const unknownDescriptor = { key: "communicationCompletion.timeline.eventNotShippedYet" } as never;
    const event = {
      ...paymentEvent(),
      id: "event-future-73",
      type: "future_timeline_type" as TimelineEvent["type"],
      title: "Gym export completed by RIVET",
      body: "Export ref-73 is ready for Eli.",
      titleMessage: unknownDescriptor,
      bodyMessage: unknownDescriptor,
      meta: { receiptId: "receipt-meta-73", exportId: "export-73" },
    } satisfies TimelineEvent;
    const { container } = renderFeed("ar", event);
    const row = container.querySelector("#timeline-event-event-future-73");
    const text = stripIsolates(row?.textContent ?? "");

    expect(row).toBeInTheDocument();
    expect(text).toContain("Gym export completed by RIVET");
    expect(text).toContain("Export ref-73 is ready for Eli.");
    expect(row?.querySelector("a")).toHaveAttribute("href", expect.stringContaining("receipt-meta-73"));
  });
});
