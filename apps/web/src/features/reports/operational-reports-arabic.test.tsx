import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LocaleProvider, useLocale } from "@/lib/i18n/provider";
import type { Locale } from "@/lib/i18n/locale";
import { createTranslator, type TKey } from "@/lib/i18n/core";
import { BRANCH_ABD } from "@/lib/mock/seed";
import { MockGymOSApi } from "@/lib/mock/MockGymOSApi";
import { renderWithApp, resetApiForTests } from "@/test/harness";
import { downloadTextFile } from "@/lib/exports/download";
import { classUtilizationReport, peakHoursReport, retentionReport, renewalForecastReport, type CollectionsReport, type CrmFunnelReport, type ControlTrendsReport } from "@/lib/analytics/operational-reports";
import { OperationalReports, type OperationalReportKind } from "./operational-reports";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), useSearchParams: () => new URLSearchParams() }));
vi.mock("@/lib/exports/download", () => ({ downloadTextFile: vi.fn() }));
afterEach(() => { resetApiForTests(); vi.restoreAllMocks(); vi.mocked(downloadTextFile).mockClear(); });
let changeLocale: (locale: Locale) => void;
function Probe() { const { setLocale } = useLocale(); useEffect(() => { changeLocale = setLocale; }, [setLocale]); return null; }
const range = { from: "2026-08-02", to: "2026-08-31" };
const peak = peakHoursReport([{ occurredAt: "2026-08-30T12:00:00Z", decision: "allowed" }, { occurredAt: "2026-08-30T12:00:00Z", decision: "blocked" }], range, "Asia/Amman");
const classes = classUtilizationReport([{ id: "class-001", templateId: "template-1", name: "=Yoga / ٠٠٧", startsAt: "2026-08-30T12:00:00Z", capacity: 20, status: "completed" }], [{ occurrenceId: "class-001", status: "attended" }, { occurrenceId: "class-001", status: "no_show" }], range, "Asia/Amman");
const retention = retentionReport([{ memberId: "member-001", startDate: "2026-01-01", endDate: "2026-12-31" }], "2026-08-31");
const renewals = renewalForecastReport([{ id: "membership-001", memberId: "member-001", planId: "plan-001", startDate: "2026-08-01", endDate: "2026-09-03" }], new Map([["member-001", "أحمد / ٠٠٧"]]), new Map([["plan-001", { name: "Original plan", priceMinor: 12345 }]]), "2026-08-31");
const collections: CollectionsReport = { chargedCount: 3, chargedMinor: 30000, collectedCount: 2, collectedMinor: 12345, refundedCount: 1, refundedMinor: 123, voidedCount: 1, voidedMinor: 4000, outstandingNowMinor: 89000 };
const crm: CrmFunnelReport = { leadsCreated: 3, leadsContacted: 2, medianFirstResponseHours: 1.5, trialsBooked: 2, trialsAttended: 2, membershipsSold: 1, trialToSaleRate: 0.5 };
const controls: ControlTrendsReport = { refunds: { count: 1, amountMinor: 12345 }, voids: { count: 0, amountMinor: 0 }, discounts: { count: 1, amountMinor: 500 }, priceOverrides: { count: 0, amountMinor: 0 }, staffOverrides: { count: 0 }, recent: [{ id: "audit-001", action: "payment.refund", occurredAt: "2026-08-31T12:30:45Z", summary: "Original audit / ٠٠٧", actorName: "سارة", reason: "=سبب أصلي", entityPublicId: "payment-001" }] };
const cases: Array<{ view: OperationalReportKind; title: TKey; setup: () => void; arabic: string[]; english: string[] }> = [
  { view: "peak-hours", title: "reportsWorkspace.peakHours", setup: () => { vi.spyOn(MockGymOSApi.prototype, "getPeakHoursReport").mockResolvedValue(peak); }, arabic: ["الأحد,3:00 م,1", "آب 2026"], english: ["Sunday,15:00,1"] },
  { view: "classes", title: "reportsWorkspace.classUtilization", setup: () => { vi.spyOn(MockGymOSApi.prototype, "getClassUtilizationReport").mockResolvedValue(classes); }, arabic: ["'=Yoga / ٠٠٧", "قائمة الانتظار", "لم يحضر"], english: ["'=Yoga / ٠٠٧", "Waiting list"] },
  { view: "retention", title: "reportsWorkspace.retentionTitle", setup: () => { vi.spyOn(MockGymOSApi.prototype, "getRetentionReport").mockResolvedValue(retention); }, arabic: ["كانون الثاني 2026", "بعد 12 شهرًا: المشمولون"], english: ["January 2026"] },
  { view: "renewals", title: "reportsWorkspace.renewalsTitle", setup: () => { vi.spyOn(MockGymOSApi.prototype, "getRenewalForecastReport").mockResolvedValue(renewals); }, arabic: ["خلال 7 أيام,أحمد / ٠٠٧,Original plan,3 أيلول 2026,12.345,JOD"], english: ["Next 7 days,أحمد / ٠٠٧,Original plan,3 Sept 2026,12.345,JOD"] },
  { view: "collections", title: "reportsWorkspace.collections", setup: () => { vi.spyOn(MockGymOSApi.prototype, "getCollectionsReport").mockResolvedValue(collections); }, arabic: ["المبالغ المحصّلة,2,12.345,JOD", "المبالغ المستردّة,1,0.123,JOD"], english: ["Collected,2,12.345,JOD", "Refunded,1,0.123,JOD"] },
  { view: "crm", title: "reportsWorkspace.crmTitle", setup: () => { vi.spyOn(MockGymOSApi.prototype, "getCrmFunnelReport").mockResolvedValue(crm); }, arabic: ["المدة حتى أول تواصل", "اشتركوا بعد التجربة,50%"], english: ["Time to first contact", "Joined after trial,50%"] },
  { view: "controls", title: "reportsWorkspace.controlsTitle", setup: () => { vi.spyOn(MockGymOSApi.prototype, "getControlTrendsReport").mockResolvedValue(controls); }, arabic: ["31 آب 2026 3:30:45 م,استرداد مبلغ,Original audit / ٠٠٧,سارة,'=سبب أصلي", "12.345,JOD"], english: ["2026-08-31 15:30:45,Refund,Original audit / ٠٠٧,سارة,'=سبب أصلي"] },
];

describe("operational reports in both languages", () => {
  it.each(cases)("localizes the $view view and download without altering report facts", async entry => {
    entry.setup();
    const originals = JSON.stringify({ peak, classes, retention, renewals, collections, crm, controls });
    const onScopeChange = vi.fn();
    await renderWithApp(<LocaleProvider initialLocale="en"><Probe /><OperationalReports view={entry.view} scope={{ rangeDays: 30, to: range.to, branchId: BRANCH_ABD }} branches={[{ id: BRANCH_ABD, name: "Original branch / ٠٠٧" }]} onScopeChange={onScopeChange} /></LocaleProvider>, { role: "owner", branchId: BRANCH_ABD });
    const user = userEvent.setup();
    for (const locale of ["en", "ar"] as const) {
      const t = createTranslator(locale);
      if (locale === "ar") act(() => changeLocale(locale));
      expect(await screen.findByRole("heading", { name: t(entry.title) })).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: t("common.action.download") }));
      const exported = vi.mocked(downloadTextFile).mock.lastCall![0];
      expect(exported.content.startsWith(`\uFEFF${t("documents.csvTitle")},`)).toBe(true);
      for (const part of locale === "ar" ? entry.arabic : entry.english) expect(exported.content).toContain(part);
      expect(exported.mimeType).toBe("text/csv;charset=utf-8");
      expect(exported.fileName).toMatch(/^rivet-.*\.csv$/);
    }
    expect(onScopeChange).not.toHaveBeenCalled();
    expect(JSON.stringify({ peak, classes, retention, renewals, collections, crm, controls })).toBe(originals);
  });
});
