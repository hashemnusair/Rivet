import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LocaleProvider, useLocale } from "@/lib/i18n/provider";
import type { Locale } from "@/lib/i18n/locale";
import { createTranslator } from "@/lib/i18n/core";
import { ApiError } from "@/lib/api/errors";
import type { DuplicateCase } from "@/lib/domain/qol";
import { money } from "@/lib/utils/money";
import { BRANCH_ABD } from "@/lib/mock/seed";
import { renderWithApp, resetApiForTests } from "@/test/harness";
import MemberImportPage from "@/app/(app)/members/import/page";
import DuplicateMembersPage from "@/app/(app)/members/duplicates/page";
import { inferMemberImportMapping, mappedMemberCsv, rejectedMemberRowsCsv } from "./member-import";
import { describeMemberImportError, memberImportErrors } from "./member-import-errors";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }), usePathname: () => "/members/import", useSearchParams: () => new URLSearchParams() }));
vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
HTMLElement.prototype.hasPointerCapture = () => false;
HTMLElement.prototype.scrollIntoView = () => undefined;
afterEach(resetApiForTests);
let changeLocale: (locale: Locale) => void;
function LocaleProbe() { const { setLocale } = useLocale(); useEffect(() => { changeLocale = setLocale; }, [setLocale]); return null; }
const arabic = (children: ReactNode) => <LocaleProvider initialLocale="ar"><LocaleProbe />{children}</LocaleProvider>;
const ar = createTranslator("ar");

describe("Arabic import and duplicate review", () => {
  it("matches Arabic headings for comparison without rewriting source headers, names or CSV contract", () => {
    const matrix = [["إسم العضو", "رَقْم الهاتف", "الجنس", "البريد الإلكتروني"], ["أَحمد Saleh", "٠٧٩۱۲۳۴۵۶۷", "ذكر", "member@example.com"]];
    const original = structuredClone(matrix);
    const mapping = inferMemberImportMapping(matrix[0]!);
    expect(mapping).toEqual({ fullName: 0, phone: 1, gender: 2, email: 3 });
    expect(mappedMemberCsv(matrix, mapping)).toContain("full_name,phone,gender,email");
    expect(mappedMemberCsv(matrix, mapping)).toContain("أَحمد Saleh,٠٧٩۱۲۳۴۵۶۷,ذكر,member@example.com");
    expect(matrix).toEqual(original);
  });

  it("translates new and legacy row errors and human CSV headers while retaining source evidence and safe cells", () => {
    const errors = ["Enter a valid phone number", "Map source plan “باقة Plus” to a RIVET plan", "JOD amounts can have at most 3 decimal places"];
    const row = { rowNumber: 2, fullName: "=HYPERLINK(1)", phone: "+96279", gender: "female" as const, status: "invalid" as const, errors, duplicateMemberIds: [], sourcePlanName: "باقة Plus", membershipStartDate: "wrong-date", openingBalanceMinor: 25123 };
    const original = structuredClone(row);
    const projected = { ...row, errorMessages: errors.map(describeMemberImportError) };
    expect(memberImportErrors(ar, projected)).toEqual(memberImportErrors(ar, row));
    expect(memberImportErrors(ar, row).join(" ")).toContain("«باقة Plus»");
    const csv = rejectedMemberRowsCsv([projected], "JOD", "ar");
    expect(csv).toContain("تصدير RIVET");
    expect(csv).toContain("صف المصدر,الاسم الكامل,الهاتف");
    expect(csv).toContain("'=HYPERLINK(1)");
    expect(csv).toContain("25.123,JOD");
    expect(csv).toContain("wrong-date");
    expect(csv).not.toContain("Enter a valid");
    expect(row).toEqual(original);
  });

  it("keeps a pasted Arabic source and translates a failed file read when switching language", async () => {
    const user = userEvent.setup();
    const { api } = await renderWithApp(arabic(<MemberImportPage />), { branchId: BRANCH_ABD });
    const preview = vi.spyOn(api, "previewMemberImport");
    await user.click(screen.getByRole("button", { name: "لصق نص CSV" }));
    const csv = "الاسم,الهاتف,الجنس\nليان Saleh,٠٧٩۹۰۰۰۶۶۶,أنثى";
    fireEvent.change(screen.getByRole("textbox", { name: "محتوى ملف CSV للأعضاء" }), { target: { value: csv } });
    const file = new File(["bad"], "members.csv", { type: "text/csv" });
    Object.defineProperty(file, "text", { value: vi.fn().mockRejectedValue(new Error("private provider diagnostic")) });
    await user.upload(screen.getByLabelText("اختيار ملف الأعضاء"), file);
    expect(await screen.findByRole("alert")).toHaveTextContent("تعذّرت قراءة الملف");
    act(() => changeLocale("en"));
    expect(screen.getByRole("alert")).toHaveTextContent("This file could not be read");
    expect(screen.getByRole("textbox", { name: "Member CSV content" })).toHaveValue(csv);
    await user.click(screen.getByRole("button", { name: "Check members" }));
    await waitFor(() => expect(preview).toHaveBeenCalledOnce());
    expect(preview.mock.calls[0]![0]).toMatchObject({ sourceKind: "pasted", sourceHeaders: ["الاسم", "الهاتف", "الجنس"], columnMapping: { fullName: 0, phone: 1, gender: 2 } });
    const batch = await preview.mock.results[0]!.value;
    expect(batch.rows[0]).toMatchObject({ fullName: "ليان Saleh", gender: "female", phone: "+962799000666", status: "valid" });
  });

  it("keeps the reviewed duplicate, survivor, field choices and reason across a failed merge and locale change", async () => {
    const member = { memberNumber: "MAIN-12", fullName: "أحمد Saleh", phone: "+962790000123", homeBranchId: BRANCH_ABD, status: "active" as const, balance: money(0), membershipCount: 2, visitCount: 3, timelineCount: 5, version: "v1" };
    const item: DuplicateCase = { id: "case-12", status: "open", reasons: ["phone"], confidence: "strong", primary: { ...member, id: "primary" }, candidate: { ...member, id: "candidate", memberNumber: "MAIN-13", fullName: "أحمد سليم", version: "v2" }, createdAt: "2026-10-02T10:00:00Z", updatedAt: "2026-10-02T10:00:00Z" };
    const user = userEvent.setup();
    const { api } = await renderWithApp(arabic(<DuplicateMembersPage />), { role: "owner", branchId: BRANCH_ABD, prepare: async api => { vi.spyOn(api, "listDuplicateCases").mockResolvedValue({ items: [item], page: 1, pageSize: 20, totalItems: 1, totalPages: 1 }); } });
    const merge = vi.spyOn(api, "mergeDuplicateMembers").mockRejectedValue(ApiError.of("CONFLICT", "The record changed."));
    await user.click(await screen.findByRole("button", { name: "مراجعة ودمج سجل المشتركين" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("button", { name: "دمج سجل المشتركين" })).toBeDisabled();
    await user.type(within(dialog).getByRole("textbox"), "تأكدنا من هوية المشترك");
    await user.click(within(dialog).getAllByRole("radio")[1]!);
    await user.click(within(dialog).getByRole("button", { name: "دمج سجل المشتركين" }));
    await waitFor(() => expect(merge).toHaveBeenCalledOnce());
    const original = merge.mock.calls[0]![0];
    expect(original).toMatchObject({ caseId: "case-12", survivingMemberId: "primary", mergedMemberId: "candidate", primaryVersion: "v1", candidateVersion: "v2", fieldSourceMemberIds: { fullName: "candidate" }, reason: "تأكدنا من هوية المشترك" });
    act(() => changeLocale("en"));
    expect(within(dialog).getByRole("textbox")).toHaveValue("تأكدنا من هوية المشترك");
    await user.click(within(dialog).getByRole("button", { name: "Combine records" }));
    await waitFor(() => expect(merge).toHaveBeenCalledTimes(2));
    expect(merge.mock.calls[1]![0]).toEqual(original);
  });
});
