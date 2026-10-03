import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
import type { EquipmentAsset, EquipmentRecommendation, Zone } from "@/lib/domain/types";
import { describeEquipmentRationale } from "@/lib/domain/equipment-rationale";
import { createTranslator } from "@/lib/i18n/core";
import { makeFormatters } from "@/lib/i18n/formatters";
import { maintenanceDateTimeInput, maintenanceDueInstant, equipmentRationaleText } from "@/lib/i18n/operations";
import { LocaleProvider, useLocale } from "@/lib/i18n/provider";
import type { Locale } from "@/lib/i18n/locale";
import { BRANCH_ABD } from "@/lib/mock/seed";
import { renderWithApp, resetApiForTests } from "@/test/harness";
import { EquipmentAssetForm, EquipmentIssueForm, EquipmentRecommendationPanel, EquipmentWorkOrderForm } from "./equipment-tab";
import { FacilityTaskWorkspace } from "./facility-task-workspace";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }), usePathname: () => "/maintenance", useSearchParams: () => new URLSearchParams() }));
vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
beforeEach(() => {
  HTMLElement.prototype.scrollIntoView = vi.fn();
  HTMLElement.prototype.hasPointerCapture = vi.fn(() => false);
  HTMLElement.prototype.setPointerCapture = vi.fn();
  HTMLElement.prototype.releasePointerCapture = vi.fn();
});
afterEach(resetApiForTests);
let changeLocale: (locale: Locale) => void;
function LocaleProbe() { const { setLocale } = useLocale(); useEffect(() => { changeLocale = setLocale; }, [setLocale]); return null; }
const arabic = (children: ReactNode) => <LocaleProvider initialLocale="ar"><LocaleProbe />{children}</LocaleProvider>;
const ar = createTranslator("ar");
const asset: EquipmentAsset = { id: "machine", organizationId: "org", branchId: BRANCH_ABD, code: "TREAD-01", name: "جهاز Walking", status: "active", createdAt: "2026-10-01T10:00:00Z", updatedAt: "2026-10-01T10:00:00Z" };

describe("Arabic equipment and maintenance", () => {
  it("normalizes machine counts and parses its currency without losing invalid money or authored codes", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    await renderWithApp(arabic(<EquipmentAssetForm currency="USD" zones={[]} branchId={BRANCH_ABD} pending={false} onCancel={() => undefined} onSubmit={onSubmit} />));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByRole("textbox", { name: "رمز الجهاز" }), { target: { value: "MACHINE-01" } });
    fireEvent.change(within(dialog).getByRole("textbox", { name: "اسم الجهاز" }), { target: { value: "جهاز Walking" } });
    fireEvent.change(within(dialog).getByRole("textbox", { name: "الرقم التسلسلي" }), { target: { value: "Serial ٠٠١-A" } });
    const price = within(dialog).getByRole("textbox", { name: /تكلفة الشراء/ });
    fireEvent.change(price, { target: { value: "١٢٥٫٥٠٥" } });
    expect(price).toHaveAttribute("aria-invalid", "true");
    expect(within(dialog).getByRole("button", { name: "إضافة جهاز" })).toBeDisabled();
    fireEvent.change(price, { target: { value: "١٢٥٫٥٠" } });
    fireEvent.change(within(dialog).getByRole("textbox", { name: /عدد الأيام بين فحوص الصيانة/ }), { target: { value: "٩٠" } });
    const life = within(dialog).getByRole("textbox", { name: /العمر المتوقع/ });
    fireEvent.change(life, { target: { value: "٦٠١" } });
    expect(within(dialog).getByRole("button", { name: "إضافة جهاز" })).toBeDisabled();
    fireEvent.change(life, { target: { value: "۸۴" } });
    act(() => changeLocale("en"));
    expect(within(dialog).getByRole("textbox", { name: "Machine name" })).toHaveValue("جهاز Walking");
    expect(within(dialog).getByRole("textbox", { name: /Purchase cost/ })).toHaveValue("١٢٥٫٥٠");
    await user.click(within(dialog).getByRole("button", { name: "Add machine" }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ code: "MACHINE-01", name: "جهاز Walking", serialNumber: "Serial ٠٠١-A", expectedServiceIntervalDays: 90, expectedUsefulLifeMonths: 84, purchaseCost: { amount: 12550, currency: "USD" }, branchId: BRANCH_ABD, status: "active" }));
  });

  it("passes canonical safety/severity and normalized days from the Arabic issue form", async () => {
    const user = userEvent.setup(); const onSubmit = vi.fn();
    await renderWithApp(arabic(<EquipmentIssueForm assets={[asset]} branchId={BRANCH_ABD} pending={false} onCancel={() => undefined} onSubmit={onSubmit} />));
    await user.type(screen.getByRole("textbox", { name: "ما العطل؟" }), "صوت احتكاك عند زيادة السرعة");
    fireEvent.change(screen.getByRole("textbox", { name: /عدد أيام التوقف/ }), { target: { value: "٣" } });
    await user.click(screen.getByRole("combobox", { name: "ما درجة خطورة العطل؟" }));
    await user.click(screen.getByRole("option", { name: "مرتفعة" }));
    await user.click(screen.getByRole("combobox", { name: "هل الجهاز صالح للاستخدام؟" }));
    await user.click(screen.getByRole("option", { name: "غير صالح للاستخدام" }));
    await user.click(screen.getByRole("button", { name: "الإبلاغ عن عطل" }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ branchId: BRANCH_ABD, assetId: asset.id, severity: "high", safetyStatus: "out_of_service", downtimeDays: 3, title: "صوت احتكاك عند زيادة السرعة" }));
  });

  it("retains repair costs and the draft status across a language switch", async () => {
    const user = userEvent.setup(); const onSubmit = vi.fn();
    await renderWithApp(arabic(<EquipmentWorkOrderForm currency="JOD" assets={[asset]} issues={[]} branchId={BRANCH_ABD} pending={false} onCancel={() => undefined} onSubmit={onSubmit} />));
    fireEvent.change(screen.getByRole("textbox", { name: "ما العمل المطلوب؟" }), { target: { value: "فحص السير Motor A" } });
    fireEvent.change(screen.getByRole("textbox", { name: /تكلفة القطع/ }), { target: { value: "١٢٫٥٠٠" } });
    fireEvent.change(screen.getByRole("textbox", { name: /تكلفة العمل/ }), { target: { value: "٧٫٢٥٠" } });
    fireEvent.change(screen.getByRole("textbox", { name: /تكلفة الاستبدال/ }), { target: { value: "۲۰۰" } });
    act(() => changeLocale("en"));
    expect(screen.getByRole("combobox", { name: "Repair job status" })).toHaveTextContent("Draft");
    await user.click(screen.getByRole("button", { name: "Add repair job" }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ description: "فحص السير Motor A", status: "draft", partsCost: { amount: 12500, currency: "JOD" }, laborCost: { amount: 7250, currency: "JOD" }, replacementEstimate: { amount: 200000, currency: "JOD" } }));
  });

  it("renders legacy recommendation reasons without changing source facts", async () => {
    const rationale = ["Repair cost has not been recorded.", "An open problem means this machine cannot be used.", "3 problems reported. Out of use for 14 days.", "The machine is 24 months old. Its expected lifespan is 84 months.", "Repairs cost 60% of the estimated replacement cost."];
    const recommendation: EquipmentRecommendation = { assetId: asset.id, decision: "replace", confidence: "recorded_inputs_only", issueCount: 3, downtimeDays: 14, assetAgeMonths: 24, expectedUsefulLifeMonths: 84, rationale };
    const before = structuredClone(recommendation);
    await renderWithApp(arabic(<EquipmentRecommendationPanel asset={asset} recommendation={recommendation} loading={false} />));
    expect(screen.getByText("قد يكون الاستبدال أفضل")).toBeInTheDocument();
    expect(screen.getByText("يوجد عطل مفتوح يجعل الجهاز غير صالح للاستخدام.")).toBeInTheDocument();
    expect(screen.getByText(/تبلغ تكاليف الإصلاح 60%/)).toBeInTheDocument();
    expect(screen.queryByText(/Repair cost has not/)).not.toBeInTheDocument();
    expect(recommendation).toEqual(before);
    const infinite = describeEquipmentRationale("Repairs cost Infinity% of the estimated replacement cost.");
    expect(infinite).not.toBeNull();
    expect(equipmentRationaleText(ar, makeFormatters("ar", "الآن"), infinite!)).toContain("∞%");
    for (const count of [0, 1, 2, 3, 11, 102]) expect(ar("operationsWorkspace.reportedProblems", { count })).toContain(String(count));
  });

  it("keeps a failed maintenance draft and the same tenant-local UTC deadline when the locale changes", async () => {
    const user = userEvent.setup(); let zones: Zone[] = [];
    function Probe() { return <FacilityTaskWorkspace branchId={BRANCH_ABD} zones={zones} writeEnabled />; }
    const { api } = await renderWithApp(arabic(<Probe />), { role: "manager", branchId: BRANCH_ABD, prepare: async api => { zones = await api.listZones({ branchId: BRANCH_ABD }); } });
    const save = vi.spyOn(api, "upsertFacilityTask").mockRejectedValue(ApiError.of("CONFLICT", "The record changed."));
    await user.click(await screen.findByRole("button", { name: "إضافة مهمة" }));
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "يلزم تنظيف" }));
    fireEvent.change(within(dialog).getByRole("textbox", { name: "ما العمل المطلوب؟" }), { target: { value: "تنظيف القسم A" } });
    fireEvent.change(within(dialog).getByLabelText("الموعد النهائي"), { target: { value: "2026-10-09T14:30" } });
    await user.click(within(dialog).getByRole("button", { name: "إضافة مهمة" }));
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    const first = save.mock.calls[0]![0];
    expect(first).toMatchObject({ title: "تنظيف القسم A", kind: "cleaning", status: "open", severity: "medium", branchId: BRANCH_ABD, dueAt: "2026-10-09T11:30:00.000Z" });
    act(() => changeLocale("en"));
    expect(within(dialog).getByLabelText("Due by")).toHaveValue("2026-10-09T14:30");
    expect(within(dialog).getByRole("textbox", { name: "What needs doing?" })).toHaveValue("تنظيف القسم A");
    await user.click(within(dialog).getByRole("button", { name: "Add job" }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect(save.mock.calls[1]![0]).toEqual(first);
  });

  it("preserves the exact original deadline, including seconds, when an existing job is saved without changing its time", async () => {
    const user = userEvent.setup(); let zones: Zone[] = [];
    function Probe() { return <FacilityTaskWorkspace branchId={BRANCH_ABD} zones={zones} writeEnabled />; }
    const originalDueAt = "2026-10-08T23:30:12.999Z";
    const { api } = await renderWithApp(arabic(<Probe />), { role: "manager", branchId: BRANCH_ABD, prepare: async api => {
      zones = await api.listZones({ branchId: BRANCH_ABD });
      await api.upsertFacilityTask({ branchId: BRANCH_ABD, zoneId: zones[0]!.id, kind: "inspection", severity: "medium", status: "open", title: "فحص الموعد الأصلي", dueAt: originalDueAt });
    } });
    const save = vi.spyOn(api, "upsertFacilityTask");
    await user.click(within(await screen.findByRole("article", { name: "فحص الموعد الأصلي" })).getByRole("button", { name: "تعديل" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByLabelText("الموعد النهائي")).toHaveValue("2026-10-09T02:30");
    act(() => changeLocale("en"));
    await user.click(within(dialog).getByRole("button", { name: "Save job" }));
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(save.mock.calls[0]![0].dueAt).toBe(originalDueAt);
  });

  it("keeps an area QR payload and its pixels unchanged when its accessible title switches language", async () => {
    const user = userEvent.setup(); let zones: Zone[] = [];
    function Probe() { return <FacilityTaskWorkspace branchId={BRANCH_ABD} zones={zones} writeEnabled />; }
    await renderWithApp(arabic(<Probe />), { role: "manager", branchId: BRANCH_ABD, prepare: async api => { zones = await api.listZones({ branchId: BRANCH_ABD }); } });
    await user.click(await screen.findByRole("button", { name: "رمز QR للقسم" }));
    const dialog = screen.getByRole("dialog");
    const svg = dialog.querySelector("svg#facility-zone-qr")!;
    const paths = [...svg.querySelectorAll("path")].map(path => path.getAttribute("d"));
    expect(svg.querySelector("title")).toHaveTextContent("رمز QR لإضافة مهمة في");
    const clipboard = vi.spyOn(navigator.clipboard, "writeText");
    await user.click(within(dialog).getByRole("button", { name: "نسخ الرابط" }));
    await waitFor(() => expect(clipboard).toHaveBeenCalledOnce());
    expect(clipboard.mock.calls[0]![0]).toBe(`${window.location.origin}/maintenance?branch=${encodeURIComponent(BRANCH_ABD)}&zone=${encodeURIComponent(zones[0]!.id)}&action=new-task`);
    act(() => changeLocale("en"));
    expect(svg.querySelector("title")).toHaveTextContent("QR code to add a job in");
    expect([...svg.querySelectorAll("path")].map(path => path.getAttribute("d"))).toEqual(paths);
  });

  it("round-trips gym-local deadlines and rejects invalid calendars and daylight-saving gaps", () => {
    expect(maintenanceDateTimeInput("2026-10-08T23:30:12.999Z", "Asia/Amman")).toBe("2026-10-09T02:30");
    expect(maintenanceDueInstant("2026-10-09T02:30", "Asia/Amman")).toBe("2026-10-08T23:30:00.000Z");
    expect(maintenanceDueInstant("2026-03-08T02:30", "America/New_York")).toBeUndefined();
    expect(maintenanceDueInstant("2026-02-30T14:30", "Asia/Amman")).toBeUndefined();
    expect(maintenanceDueInstant("bad", "Asia/Amman")).toBeUndefined();
  });
});
