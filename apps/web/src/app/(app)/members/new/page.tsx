"use client";
import { useLocale } from "@/lib/i18n/provider";
import { enrollmentErrorText, enrollmentKey, type EnrollmentMessageKey } from "@/lib/i18n/member-enrollment";


import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, CheckCircle2, ChevronDown, ReceiptText, UserRound, WalletCards } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { isApiError, localizeApiError } from "@/lib/api/errors";
import { useApiMutation, useApiQuery, useInvalidate } from "@/lib/hooks/use-api";
import type { CreateMemberInput, CreateMemberMembershipSaleInput, CreateMemberMembershipSaleResult, DuplicateMatch, LeadSource, MemberSummary } from "@/lib/domain/types";
import { useApp, usePermissions } from "@/lib/providers/app-providers";
import { PageHeader } from "@/components/shared/chrome";
import { LEAD_SOURCE_LABELS } from "@/components/shared/status-chip";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldGrid } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { getApi } from "@/lib/api/client";
import { qk } from "@/lib/api/keys";
import { visibleBranchId } from "@/lib/domain/branch-scope";
import { MoneyText } from "@/components/shared/data-display";
import { useFormat } from "@/lib/i18n/format";
import { latinDigits } from "@/lib/utils/text";
import { leadSourceLabel } from "@/lib/i18n/labels";
import { QuickMembershipStep } from "./quick-membership-step";

const schema = z.object({
  fullName: z.string().min(3, enrollmentKey("enterFullName")),
  fullNameAr: z.string().optional(),
  phone: z
    .string()
    .min(9, enrollmentKey("enterPhone"))
    .regex(/^\+?[\d\s()-]{9,18}$/, enrollmentKey("validPhone")),
  email: z.string().email(enrollmentKey("validEmail")).or(z.literal("")).optional(),
  gender: z.enum(["male", "female"], { message: enrollmentKey("chooseGender") }),
  dateOfBirth: z.string().optional(),
  homeBranchId: z.string().min(1, enrollmentKey("chooseHomeBranch")),
  preferredLanguage: z.enum(["en", "ar"]),
  emergencyContactName: z.string().optional(),
  emergencyContactPhone: z.string().optional(),
  source: z.enum(["instagram", "walk_in", "referral", "whatsapp", "google", "phone_call", "other"]).optional(),
  assignedSalespersonId: z.string().optional(),
  referredByMemberId: z.string().optional(),
  notes: z.string().optional(),
  marketingOptIn: z.boolean(),
  marketingPreferenceSource: z.enum(["system_default", "staff_selected", "member_selected", "imported"]).optional(),
});

type FormValues = z.infer<typeof schema>;

export default function NewMemberPage() {
  const { t, locale, isolate, isolateLtr } = useLocale();
  const { session } = useApp();
  const { can } = usePermissions();
  const router = useRouter();
  const searchParams = useSearchParams();
  const invalidate = useInvalidate();
  const [duplicates, setDuplicates] = useState<DuplicateMatch[]>([]);
  const [confirmedDuplicateMemberIds, setConfirmedDuplicateMemberIds] = useState<string[]>([]);
  const [checkingDupes, setCheckingDupes] = useState(false);
  const [duplicateCheckFailed, setDuplicateCheckError] = useState(false);
  const duplicateCheckError = duplicateCheckFailed ? t("memberEnrollment.duplicateCheckFailed") : null;
  const [duplicateCheckOverride, setDuplicateCheckOverride] = useState(false);
  const duplicateCheckRequest = useRef(0);
  const saleRequestKey = useRef<string | null>(null);
  const [saleDraft, setSaleDraft] = useState<FormValues | null>(null);
  const [completed, setCompleted] = useState<CreateMemberMembershipSaleResult | null>(null);
  const activeBranchId = visibleBranchId(session?.branches, session?.activeBranchId) ?? "";
  const prefilledName = searchParams.get("name")?.trim().slice(0, 120) ?? "";
  // Reception hands over a phone number it could not match; that is the new
  // member's phone, never their name.
  const prefilledPhone = latinDigits(searchParams.get("phone")?.trim().slice(0, 40) ?? "");

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      fullName: prefilledName,
      fullNameAr: "",
      phone: prefilledPhone,
      email: "",
      homeBranchId: activeBranchId,
      preferredLanguage: "en",
      marketingOptIn: true,
      marketingPreferenceSource: "system_default",
    },
  });

  useEffect(() => {
    const current = form.getValues("homeBranchId");
    if (visibleBranchId(session?.branches, current)) return;
    form.setValue("homeBranchId", activeBranchId, { shouldValidate: false });
  }, [activeBranchId, form, session?.branches]);

  const createMember = useApiMutation((api, values: FormValues) => api.createMember(memberInput(values)));
  const createMemberSale = useApiMutation((api, input: Parameters<typeof api.createMemberMembershipSale>[0]) => api.createMemberMembershipSale(input));

  const checkDuplicates = async () => {
    const phone = latinDigits(form.getValues("phone"));
    const email = form.getValues("email");
    if (!phone && !email) return;
    const request = ++duplicateCheckRequest.current;
    setCheckingDupes(true);
    setDuplicateCheckError(false);
    setDuplicateCheckOverride(false);
    setDuplicates([]);
    setConfirmedDuplicateMemberIds([]);
    try {
      const matches = await getApi().checkMemberDuplicates({ phone: phone || undefined, email: email || undefined });
      if (request !== duplicateCheckRequest.current) return;
      setDuplicates(matches);
    } catch {
      if (request !== duplicateCheckRequest.current) return;
      setDuplicateCheckError(true);
    } finally {
      if (request === duplicateCheckRequest.current) {
        setCheckingDupes(false);
      }
    }
  };

  const contactChanged = () => {
    duplicateCheckRequest.current += 1;
    setCheckingDupes(false);
    setDuplicateCheckError(false);
    setDuplicateCheckOverride(false);
    setDuplicates([]);
    setConfirmedDuplicateMemberIds([]);
  };

  const [errorState, setErrorState] = useState<{ key: EnrollmentMessageKey; cause?: unknown } | null>(null);
  const errorMsg = errorState ? (isApiError(errorState.cause) ? localizeApiError(errorState.cause, locale).message : t(errorState.key)) : null;
  const phoneField = form.register("phone");
  const emailField = form.register("email");

  const duplicateCheckAllowsProgress = (action: "saving" | "continuing") => {
    if (checkingDupes) {
      setErrorState({ key: action === "saving" ? "memberEnrollment.waitSaving" : "memberEnrollment.waitContinuing" });
      return false;
    }
    if (duplicateCheckError && !duplicateCheckOverride) {
      setErrorState({ key: action === "saving" ? "memberEnrollment.retrySaving" : "memberEnrollment.retryContinuing" });
      return false;
    }
    if (duplicates.length > 0 && confirmedDuplicateMemberIds.length !== duplicates.length) {
      setErrorState({ key: "memberEnrollment.confirmPerson" });
      return false;
    }
    return true;
  };

  const submitMember = async (values: FormValues) => {
    setErrorState(null);
    if (!duplicateCheckAllowsProgress("saving")) return;
    try {
      const selectedBranchId = visibleBranchId(session?.branches, values.homeBranchId);
      if (!selectedBranchId) {
        form.setError("homeBranchId", { message: enrollmentKey("visibleBranch") });
        return;
      }
      const result = await createMember.mutateAsync({ ...values, homeBranchId: selectedBranchId });
      await invalidate();
      toast.success(t("memberEnrollment.memberAdded", { name: isolate(result.member.fullName), number: isolateLtr(result.member.memberNumber) }));
      router.push(`/members/${result.member.id}`);
    } catch (error) {
      setErrorState({ key: "memberEnrollment.memberSaveFailed", cause: error });
    }
  };

  const startSale = (values: FormValues) => {
    setErrorState(null);
    if (!duplicateCheckAllowsProgress("continuing")) return;
    const selectedBranchId = visibleBranchId(session?.branches, values.homeBranchId);
    if (!selectedBranchId) {
      form.setError("homeBranchId", { message: enrollmentKey("visibleBranch") });
      return;
    }
    setSaleDraft({ ...values, homeBranchId: selectedBranchId });
    setErrorState(null);
  };

  const finishSale = async (sale: CreateMemberMembershipSaleInput["sale"]) => {
    if (!saleDraft) return;
    setErrorState(null);
    try {
      const result = await createMemberSale.mutateAsync({
        member: memberInput(saleDraft),
        sale,
        confirmedDuplicateMemberIds,
        idempotencyKey: saleRequestKey.current ?? (saleRequestKey.current = crypto.randomUUID()),
      });
      await invalidate();
      setCompleted(result);
      toast.success(t("memberEnrollment.membershipReady", { name: isolate(result.member.fullName) }));
    } catch (error) {
      setErrorState({ key: "memberEnrollment.saleSaveFailed", cause: error });
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) router.push("/members"); }}>
      <DialogContent className="max-w-3xl p-0">
        <DialogTitle className="sr-only">{completed ? t("memberEnrollment.saleComplete") : saleDraft ? t("memberEnrollment.chooseMembershipPayment") : t("palette.actions.newMember.title")}</DialogTitle>
        <DialogDescription className="sr-only">{t("memberEnrollment.newMemberHint")}</DialogDescription>
        <div className="min-w-0 space-y-5 p-5">
      <PageHeader
        title={completed ? t("memberEnrollment.memberReady") : saleDraft ? t("memberEnrollment.finishSale") : t("palette.actions.newMember.title")}
        description={completed ? t("memberEnrollment.memberAndSaleSaved") : saleDraft ? t("memberEnrollment.choosePlanPayment") : t("memberEnrollment.mainDetailsHint")}
      />

      {completed ? (
        <SaleComplete result={completed} onReset={() => {
          setCompleted(null);
          setSaleDraft(null);
          saleRequestKey.current = null;
          form.reset({ fullName: "", fullNameAr: "", phone: "", email: "", homeBranchId: activeBranchId, preferredLanguage: "en", marketingOptIn: true, marketingPreferenceSource: "system_default" });
        }} />
      ) : saleDraft ? (
        <QuickMembershipStep
          memberName={saleDraft.fullName}
          branchId={saleDraft.homeBranchId}
          pending={createMemberSale.isPending}
          error={errorMsg}
          onBack={() => { setSaleDraft(null); setErrorState(null); }}
          onSubmit={(sale) => { void finishSale(sale); }}
        />
      ) : (
      <>
      {duplicates.length > 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-lg border border-warning/50 bg-warning-bg/60 p-4 sm:flex-row" role="alert">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warning-deep" aria-hidden />
          <div className="flex-1">
            <p className="text-[13.5px] font-semibold text-warning-deep">{t("memberEnrollment.possibleDuplicate")}</p>
            <ul className="mt-1.5 space-y-1 text-[13px] text-ink-2">
              {duplicates.map((d) => (
                <li key={d.memberId}>
                  <Link href={`/members/${d.memberId}`} className="font-medium underline decoration-line-3 underline-offset-2 hover:text-ink">
                    {d.fullName} · {d.memberNumber}
                  </Link>{" "}
                  <span className="text-ink-3">{t("memberEnrollment.sameDetail", { detail: d.matchedOn === "phone" ? t("common.label.phone") : d.matchedOn === "email" ? t("common.label.email") : t("members.list.columns.member") })}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[12px] text-ink-3">{t("memberEnrollment.checkExistingHint")}</p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => setConfirmedDuplicateMemberIds(duplicates.map((duplicate) => duplicate.memberId))} disabled={confirmedDuplicateMemberIds.length === duplicates.length}>
            {confirmedDuplicateMemberIds.length === duplicates.length ? t("memberEnrollment.confirmedDifferent") : t("memberEnrollment.differentPerson")}
          </Button>
        </div>
      ) : null}

      <form
        onSubmit={form.handleSubmit((values) => submitMember(values))}
        className="min-w-0 space-y-5"
      >
        <section className="panel min-w-0 p-5">
          <h2 className="mb-4 font-display text-[15px] font-semibold">{t("memberEnrollment.personalDetails")}</h2>
          <FieldGrid className="gap-4 sm:grid-cols-2">
            <Field label={t("members.header.fullName")} required error={enrollmentErrorText(t, form.formState.errors.fullName?.message)}>
              <Input autoFocus placeholder={t("memberEnrollment.nameExample")} data-testid="member-name" {...form.register("fullName")} />
            </Field>
            <Field label={t("memberEnrollment.arabicName")} hint={t("memberEnrollment.arabicNameHint")}>
              <Input dir="rtl" placeholder="ليان المصري" {...form.register("fullNameAr")} />
            </Field>
            <Field label={t("members.header.phone")} required error={enrollmentErrorText(t, form.formState.errors.phone?.message)}>
              <Input
                dir="ltr"
                placeholder="+962 79 …"
                data-testid="member-phone"
                {...phoneField}
                onChange={(event) => { event.target.value = latinDigits(event.target.value); void phoneField.onChange(event); contactChanged(); }}
                onBlur={(event) => { void phoneField.onBlur(event); void checkDuplicates(); }}
              />
            </Field>
            <Field label={t("members.header.email")} error={enrollmentErrorText(t, form.formState.errors.email?.message)}>
              <Input
                type="email"
                placeholder="name@example.com"
                {...emailField}
                onChange={(event) => { void emailField.onChange(event); contactChanged(); }}
                onBlur={(event) => { void emailField.onBlur(event); void checkDuplicates(); }}
              />
            </Field>
            <Field label={t("memberProfile.details.gender")} required error={enrollmentErrorText(t, form.formState.errors.gender?.message)}>
              <Controller
                control={form.control}
                name="gender"
                render={({ field }) => (
                  <Select value={field.value ?? ""} onValueChange={(v) => field.onChange(v || undefined)}>
                    <SelectTrigger aria-label={t("memberProfile.details.gender")}>
                      <SelectValue placeholder={t("memberEnrollment.chooseGender")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="female">{t("memberProfile.details.female")}</SelectItem>
                      <SelectItem value="male">{t("memberProfile.details.male")}</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
            <Field label={t("memberProfile.details.dateOfBirth")}>
              <Input type="date" {...form.register("dateOfBirth")} />
            </Field>
          </FieldGrid>
          {checkingDupes ? <p className="mt-2 text-[12px] text-ink-3">{t("memberEnrollment.checkingDuplicates")}</p> : null}
          {duplicateCheckError ? (
            <div role="alert" className="mt-3 rounded-md border border-warning/40 bg-warning-bg/60 px-3 py-3 text-[12.5px] text-warning-deep">
              <p>{duplicateCheckError}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="secondary" onClick={() => { void checkDuplicates(); }}>{t("memberEnrollment.checkAgain")}</Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setDuplicateCheckOverride(true)} disabled={duplicateCheckOverride}>
                  {duplicateCheckOverride ? t("memberEnrollment.continuingUnchecked") : t("memberEnrollment.continueUnchecked")}
                </Button>
              </div>
            </div>
          ) : null}
        </section>

        <details className="group panel overflow-hidden" open={!activeBranchId || undefined}>
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-5 text-[13px] font-medium text-ink-2">
            <span>
              {" "}{t("memberEnrollment.moreDetails")}{" "}<span className="ms-2 font-normal text-ink-3">{t("memberEnrollment.moreDetailsHint")}</span>
            </span>
            <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden />
          </summary>
          <div className="space-y-5 border-t border-line p-5">
          <section>
          <h2 className="mb-4 font-display text-[15px] font-semibold">{t("memberEnrollment.gymDetails")}</h2>
          <FieldGrid className="gap-4 sm:grid-cols-2">
            <Field label={t("members.header.homeBranch")} required error={enrollmentErrorText(t, form.formState.errors.homeBranchId?.message)}>
              <Controller
                control={form.control}
                name="homeBranchId"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger aria-label={t("members.header.homeBranch")} data-testid="member-branch">
                      <SelectValue placeholder={t("memberEnrollment.chooseBranch")} />
                    </SelectTrigger>
                    <SelectContent>
                      {session?.branches.map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
            <Field label={t("members.header.preferredLanguage")}>
              <Controller
                control={form.control}
                name="preferredLanguage"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger aria-label={t("members.header.preferredLanguage")}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="en">{t("members.header.english")}</SelectItem>
                      <SelectItem value="ar">{t("members.header.arabic")}</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
            <Field label={t("memberProfile.details.foundUs")}>
              <Controller
                control={form.control}
                name="source"
                render={({ field }) => (
                  <Select value={field.value ?? ""} onValueChange={(v) => field.onChange((v || undefined) as LeadSource | undefined)}>
                    <SelectTrigger aria-label={t("memberProfile.details.foundUs")}>
                      <SelectValue placeholder={t("memberEnrollment.chooseOne")} />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.keys(LEAD_SOURCE_LABELS).map((key) => (
                        <SelectItem key={key} value={key}>
                          {leadSourceLabel(t, key)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
            <Field label={t("memberProfile.details.salesperson")}>
              <Controller
                control={form.control}
                name="assignedSalespersonId"
                render={({ field }) => (
                  <SalesSelect value={field.value} onChange={field.onChange} />
                )}
              />
            </Field>
            <Field label={t("memberEnrollment.referredBy")} hint={t("memberEnrollment.referralHint")}>
              <Controller
                control={form.control}
                name="referredByMemberId"
                render={({ field }) => (
                  <ReferrerSearch value={field.value} onChange={field.onChange} />
                )}
              />
            </Field>
          </FieldGrid>
        </section>

        <section className="border-t border-line pt-5">
          <h2 className="mb-4 font-display text-[15px] font-semibold">{t("memberEnrollment.emergencyDetails")}</h2>
          <FieldGrid className="gap-4 sm:grid-cols-2">
            <Field label={t("memberEnrollment.emergencyName")}>
              <Input {...form.register("emergencyContactName")} />
            </Field>
            <Field label={t("memberEnrollment.emergencyPhone")}>
              <Input dir="ltr" placeholder="+962 7…" {...form.register("emergencyContactPhone")} />
            </Field>
          </FieldGrid>
          <Field label={t("crm.newLead.notes")} className="mt-4">
            <Textarea placeholder={t("memberEnrollment.notesHint")} {...form.register("notes")} />
          </Field>
          <label className="mt-4 flex items-center justify-between gap-3 cursor-pointer">
            <span>
              <span className="block text-[13px] font-medium">{t("members.header.marketingMessages")}</span>
              <span className="block text-[12px] text-ink-3">{t("memberEnrollment.marketingDefaultHint")}</span>
            </span>
            <Controller
              control={form.control}
              name="marketingOptIn"
              render={({ field }) => <Switch checked={field.value} onCheckedChange={(checked) => { field.onChange(checked); form.setValue("marketingPreferenceSource", "staff_selected"); }} aria-label={t("members.header.marketingMessages")} />}
            />
          </label>
        </section>
          </div>
        </details>

        <div className="flex flex-col gap-2 border-t border-line pt-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
          {errorMsg ? <p role="alert" className="me-auto text-[13px] text-danger">{errorMsg}</p> : null}
          <Button asChild variant="secondary" className="max-sm:w-full">
            <Link href="/members">{t("common.action.cancel")}</Link>
          </Button>
          <Button type="submit" className="max-sm:w-full" variant={can("memberships.sell") ? "secondary" : "primary"} loading={createMember.isPending} disabled={checkingDupes} data-testid="save-member">
            {" "}{t("memberEnrollment.saveMember")}{" "}</Button>
          {can("memberships.sell") ? (
            <Button type="button" className="max-sm:w-full" disabled={checkingDupes} onClick={form.handleSubmit(startSale)} data-testid="save-member-and-sell">
              <WalletCards /> {" "}{t("memberEnrollment.saveAndSell")}{" "}</Button>
          ) : null}
        </div>
      </form>
      </>
      )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function memberInput(values: FormValues): CreateMemberInput {
  return {
    fullName: values.fullName,
    fullNameAr: values.fullNameAr || undefined,
    phone: latinDigits(values.phone),
    email: values.email || undefined,
    gender: values.gender,
    dateOfBirth: values.dateOfBirth || undefined,
    homeBranchId: values.homeBranchId,
    preferredLanguage: values.preferredLanguage,
    emergencyContactName: values.emergencyContactName || undefined,
    emergencyContactPhone: values.emergencyContactPhone ? latinDigits(values.emergencyContactPhone) : undefined,
    source: values.source,
    assignedSalespersonId: values.assignedSalespersonId || undefined,
    referredByMemberId: values.referredByMemberId || undefined,
    notes: values.notes || undefined,
    marketingOptIn: values.marketingOptIn,
    marketingPreferenceSource: values.marketingPreferenceSource,
  };
}

function SaleComplete({ result, onReset }: { result: CreateMemberMembershipSaleResult; onReset: () => void }) {
  const { t, isolate, isolateLtr } = useLocale();
  const f = useFormat();
  const remaining = result.sale.charge.outstandingAmount;
  return (
    <section className="panel overflow-hidden" aria-live="polite">
      <div className="grid gap-5 bg-success-bg/55 p-5 sm:grid-cols-[auto_1fr_auto] sm:items-center">
        <span className="grid size-12 place-items-center rounded-full bg-success text-white"><CheckCircle2 className="size-6" /></span>
        <div>
          <p className="context-label text-success-deep">{t("memberEnrollment.saleComplete")}</p>
          <h2 className="mt-1 font-display text-xl font-semibold">{t("memberEnrollment.memberIsReady", { name: isolate(result.member.fullName) })}</h2>
          <p className="mt-1 text-[13px] text-ink-2">{t("memberEnrollment.starts", { number: isolateLtr(result.member.memberNumber), date: isolate(f.date(result.sale.membership.startDate)) })}</p>
        </div>
        <Button asChild><Link href={`/members/${result.member.id}`}>{t("crm.lead.openMember")}</Link></Button>
      </div>
      <div className="grid gap-px border-y border-line bg-line sm:grid-cols-3">
        <CompletionFact icon={<UserRound className="size-4" />} label={t("crm.lead.membership.heading")} value={t("memberEnrollment.dateRange", { start: isolate(f.date(result.sale.membership.startDate)), end: isolate(f.date(result.sale.membership.endDate)) })} />
        <CompletionFact icon={<WalletCards className="size-4" />} label={t("memberEnrollment.paidNow")} value={<MoneyText money={result.sale.payment?.amount} />} />
        <CompletionFact icon={<ReceiptText className="size-4" />} label={remaining.amount > 0 ? t("memberEnrollment.stillOwes") : t("members.tabs.payments.receipt")} value={remaining.amount > 0 ? <MoneyText money={remaining} /> : result.sale.receipt?.receiptNumber ?? t("memberEnrollment.paidFull")} warning={remaining.amount > 0} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 p-5">
        <p className="text-[12.5px] text-ink-3">{result.sale.receipt ? t("memberEnrollment.receiptCreated", { number: isolateLtr(result.sale.receipt.receiptNumber) }) : t("memberEnrollment.noPaymentTaken")}</p>
        <Button type="button" variant="secondary" onClick={onReset}>{t("memberEnrollment.anotherMember")}</Button>
      </div>
    </section>
  );
}

function CompletionFact({ icon, label, value, warning }: { icon: React.ReactNode; label: string; value: React.ReactNode; warning?: boolean }) {
  return (
    <div className="flex gap-3 bg-paper px-5 py-4">
      <span className="mt-0.5 text-ink-3">{icon}</span>
      <div><p className="text-[12px] text-ink-3">{label}</p><p className={`mt-1 text-[13px] font-medium ${warning ? "text-warning-deep" : "text-ink"}`}>{value}</p></div>
    </div>
  );
}

function SalesSelect({ value, onChange }: { value?: string; onChange: (v: string | undefined) => void }) {
  const { t } = useLocale();
  const usersQuery = useApiQuery(qk.users({ role: "salesperson" }), (api) =>
    api.listUsers({ role: "salesperson", status: "active", pageSize: 20 }),
  );
  return (
    <Select value={value ?? ""} onValueChange={(v) => onChange(v || undefined)}>
      <SelectTrigger aria-label={t("memberProfile.details.salesperson")}>
        <SelectValue placeholder={t("memberProfile.details.notAssigned")} />
      </SelectTrigger>
      <SelectContent>
        {(usersQuery.data?.items ?? []).map((u) => (
          <SelectItem key={u.id} value={u.id}>
            {u.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function ReferrerSearch({ value, onChange }: { value?: string; onChange: (value?: string) => void }) {
  const { t } = useLocale();
  const [search, setSearch] = useState("");
  const [selectedLabel, setSelectedLabel] = useState<string>();
  const normalizedSearch = search.trim();
  const lookup = useApiQuery(
    qk.members({ search: normalizedSearch, pageSize: 6 }),
    (api) => api.listMembers({ search: normalizedSearch, pageSize: 6 }),
    { enabled: normalizedSearch.length >= 2 },
  );
  const results: MemberSummary[] = lookup.data?.items.filter((member) => member.status !== "archived") ?? [];

  if (value) {
    return (
      <div className="flex h-10 items-center justify-between gap-2 rounded-md border border-line-2 bg-sunken px-3 text-[13px]">
        <span className="truncate">{selectedLabel ?? t("memberEnrollment.selectedMember")}</span>
        <button type="button" className="text-[12px] text-ink-3 hover:text-ink" onClick={() => { onChange(undefined); setSelectedLabel(undefined); setSearch(""); }}>{t("reception.lookup.clear")}</button>
      </div>
    );
  }
  return (
    <div className="relative">
      <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("memberEnrollment.searchMembers")} />
      {lookup.isLoading ? <p className="mt-1.5 text-[12px] text-ink-3" role="status">{t("memberEnrollment.searchingMembers")}</p> : lookup.isError ? (
        <div className="mt-1.5 flex items-center justify-between gap-3 border border-danger/30 bg-danger-bg px-3 py-2 text-[12px] text-danger" role="alert"><span>{t("memberEnrollment.searchMembersFailed")}</span><Button type="button" size="sm" variant="ghost" onClick={() => lookup.refetch()}>{t("common.action.retry")}</Button></div>
      ) : results.length > 0 ? (
        <div className="absolute z-10 mt-1 w-full divide-y divide-line rounded-md border border-line bg-surface shadow-dialog">
          {results.map((member) => (
            <button key={member.id} type="button" className="flex min-h-11 w-full items-center justify-between gap-2 px-3 py-2 text-start text-[12px] hover:bg-sunken" onClick={() => { onChange(member.id); setSelectedLabel(`${member.fullName} · ${member.memberNumber}`); }}>
              <span className="truncate">{member.fullName}</span>
              <span className="text-ink-3">{member.memberNumber}</span>
            </button>
          ))}
        </div>
      ) : normalizedSearch.length >= 2 ? <p className="mt-1.5 text-[12px] text-ink-3">{t("memberEnrollment.noMembers")}</p> : null}
    </div>
  );
}
