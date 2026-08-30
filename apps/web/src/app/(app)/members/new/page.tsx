"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, ArrowLeft, CheckCircle2, ChevronDown, ReceiptText, UserRound, WalletCards } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { isApiError } from "@/lib/api/errors";
import { useApiMutation, useApiQuery, useInvalidate } from "@/lib/hooks/use-api";
import type { CreateMemberInput, CreateMemberMembershipSaleInput, CreateMemberMembershipSaleResult, DuplicateMatch, LeadSource } from "@/lib/domain/types";
import { useApp, usePermissions } from "@/lib/providers/app-providers";
import { Breadcrumbs, PageHeader } from "@/components/shared/chrome";
import { LEAD_SOURCE_LABELS } from "@/components/shared/status-chip";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { getApi } from "@/lib/api/client";
import { qk } from "@/lib/api/keys";
import { visibleBranchId } from "@/lib/domain/branch-scope";
import { MoneyText } from "@/components/shared/data-display";
import { QuickMembershipStep } from "./quick-membership-step";

const schema = z.object({
  fullName: z.string().min(3, "Full name is required"),
  fullNameAr: z.string().optional(),
  phone: z
    .string()
    .min(9, "Phone is required")
    .regex(/^\+?[\d\s()-]{9,18}$/, "Enter a valid phone number"),
  email: z.string().email("Enter a valid email").or(z.literal("")).optional(),
  gender: z.enum(["male", "female"]).optional(),
  dateOfBirth: z.string().optional(),
  homeBranchId: z.string().min(1, "Choose a home branch"),
  preferredLanguage: z.enum(["en", "ar"]),
  emergencyContactName: z.string().optional(),
  emergencyContactPhone: z.string().optional(),
  source: z.enum(["instagram", "walk_in", "referral", "whatsapp", "google", "phone_call", "other"]).optional(),
  assignedSalespersonId: z.string().optional(),
  notes: z.string().optional(),
  marketingOptIn: z.boolean(),
  marketingPreferenceSource: z.enum(["system_default", "staff_selected", "member_selected", "imported"]).optional(),
});

type FormValues = z.infer<typeof schema>;

export default function NewMemberPage() {
  const { session } = useApp();
  const { can } = usePermissions();
  const router = useRouter();
  const searchParams = useSearchParams();
  const invalidate = useInvalidate();
  const [duplicates, setDuplicates] = useState<DuplicateMatch[]>([]);
  const [confirmedDuplicateMemberIds, setConfirmedDuplicateMemberIds] = useState<string[]>([]);
  const [checkingDupes, setCheckingDupes] = useState(false);
  const [duplicateCheckError, setDuplicateCheckError] = useState<string | null>(null);
  const [duplicateCheckOverride, setDuplicateCheckOverride] = useState(false);
  const duplicateCheckRequest = useRef(0);
  const saleRequestKey = useRef<string | null>(null);
  const [saleDraft, setSaleDraft] = useState<FormValues | null>(null);
  const [completed, setCompleted] = useState<CreateMemberMembershipSaleResult | null>(null);
  const activeBranchId = visibleBranchId(session?.branches, session?.activeBranchId) ?? "";
  const prefilledName = searchParams.get("name")?.trim().slice(0, 120) ?? "";

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      fullName: prefilledName,
      fullNameAr: "",
      phone: "",
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
    const phone = form.getValues("phone");
    const email = form.getValues("email");
    if (!phone && !email) return;
    const request = ++duplicateCheckRequest.current;
    setCheckingDupes(true);
    setDuplicateCheckError(null);
    setDuplicateCheckOverride(false);
    setDuplicates([]);
    setConfirmedDuplicateMemberIds([]);
    try {
      const matches = await getApi().checkMemberDuplicates({ phone: phone || undefined, email: email || undefined });
      if (request !== duplicateCheckRequest.current) return;
      setDuplicates(matches);
    } catch {
      if (request !== duplicateCheckRequest.current) return;
      setDuplicateCheckError("RIVET could not check for an existing member. Retry before saving, or explicitly continue without the pre-check.");
    } finally {
      if (request === duplicateCheckRequest.current) setCheckingDupes(false);
    }
  };

  const contactChanged = () => {
    duplicateCheckRequest.current += 1;
    setCheckingDupes(false);
    setDuplicateCheckError(null);
    setDuplicateCheckOverride(false);
    setDuplicates([]);
    setConfirmedDuplicateMemberIds([]);
  };

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const phoneField = form.register("phone");
  const emailField = form.register("email");

  const submitMember = async (values: FormValues) => {
    setErrorMsg(null);
    if (duplicateCheckError && !duplicateCheckOverride) {
      setErrorMsg("Retry the duplicate check or choose “Continue without pre-check” before saving.");
      return;
    }
    try {
      const selectedBranchId = visibleBranchId(session?.branches, values.homeBranchId);
      if (!selectedBranchId) {
        form.setError("homeBranchId", { message: "Choose a visible branch" });
        return;
      }
      const result = await createMember.mutateAsync({ ...values, homeBranchId: selectedBranchId });
      await invalidate();
      toast.success(`${result.member.fullName} added — ${result.member.memberNumber}.`);
      router.push(`/members/${result.member.id}`);
    } catch (error) {
      setErrorMsg(isApiError(error) ? error.message : "Could not create the member.");
    }
  };

  const startSale = (values: FormValues) => {
    setErrorMsg(null);
    if (duplicateCheckError && !duplicateCheckOverride) {
      setErrorMsg("Retry the duplicate check or choose “Continue without pre-check” before continuing.");
      return;
    }
    if (duplicates.length > 0 && confirmedDuplicateMemberIds.length !== duplicates.length) {
      setErrorMsg("Open the matching member, or confirm these results belong to a different person before continuing.");
      return;
    }
    const selectedBranchId = visibleBranchId(session?.branches, values.homeBranchId);
    if (!selectedBranchId) {
      form.setError("homeBranchId", { message: "Choose a visible branch" });
      return;
    }
    setSaleDraft({ ...values, homeBranchId: selectedBranchId });
    setErrorMsg(null);
  };

  const finishSale = async (sale: CreateMemberMembershipSaleInput["sale"]) => {
    if (!saleDraft) return;
    setErrorMsg(null);
    try {
      const result = await createMemberSale.mutateAsync({
        member: memberInput(saleDraft),
        sale,
        confirmedDuplicateMemberIds,
        idempotencyKey: saleRequestKey.current ?? (saleRequestKey.current = crypto.randomUUID()),
      });
      await invalidate();
      setCompleted(result);
      toast.success(`${result.member.fullName}'s membership is ready.`);
    } catch (error) {
      setErrorMsg(isApiError(error) ? error.message : "The member and membership could not be created. Nothing was saved; try again.");
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) router.push("/members"); }}>
      <DialogContent className="max-w-3xl p-0">
        <DialogTitle className="sr-only">{completed ? "Sale complete" : saleDraft ? "Choose membership and payment" : "Add member"}</DialogTitle>
        <DialogDescription className="sr-only">Create a member profile and optionally complete their first membership sale.</DialogDescription>
        <div className="space-y-5 p-5">
      <Breadcrumbs items={[{ label: "Members", href: "/members" }, { label: "New member" }]} />
      <PageHeader
        eyebrow="Operations"
        title={completed ? "Member ready" : saleDraft ? "Finish membership sale" : "Add member"}
        description={completed ? "The profile, membership, balance, and receipt are all in place." : saleDraft ? "Review the money story once, then confirm everything together." : "Save a profile on its own, or complete the first membership and payment in one guided flow."}
        actions={
          <Button asChild variant="secondary">
            <Link href="/members">
              <ArrowLeft /> Back to members
            </Link>
          </Button>
        }
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
          onBack={() => { setSaleDraft(null); setErrorMsg(null); }}
          onSubmit={(sale) => { void finishSale(sale); }}
        />
      ) : (
      <>
      {duplicates.length > 0 ? (
        <div className="flex items-start gap-3 rounded-lg border border-warning/50 bg-warning-bg/60 p-4" role="alert">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warning-deep" aria-hidden />
          <div className="flex-1">
            <p className="text-[13.5px] font-semibold text-warning-deep">Possible duplicate — same phone or email exists</p>
            <ul className="mt-1.5 space-y-1 text-[13px] text-ink-2">
              {duplicates.map((d) => (
                <li key={d.memberId}>
                  <Link href={`/members/${d.memberId}`} className="font-medium underline decoration-line-3 underline-offset-2 hover:text-ink">
                    {d.fullName} · {d.memberNumber}
                  </Link>{" "}
                  <span className="text-ink-3">(matched on {d.matchedOn})</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[12px] text-ink-3">You can still save — but confirm this is really a different person.</p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => setConfirmedDuplicateMemberIds(duplicates.map((duplicate) => duplicate.memberId))} disabled={confirmedDuplicateMemberIds.length === duplicates.length}>
            {confirmedDuplicateMemberIds.length === duplicates.length ? "Confirmed different person" : "This is a different person"}
          </Button>
        </div>
      ) : null}

      <form
        onSubmit={form.handleSubmit((values) => submitMember(values))}
        className="space-y-5"
      >
        <section className="panel p-5">
          <h2 className="mb-4 font-display text-[15px] font-semibold">Identity</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name" required error={form.formState.errors.fullName?.message}>
              <Input autoFocus placeholder="e.g. Layan Al-Masri" data-testid="member-name" {...form.register("fullName")} />
            </Field>
            <Field label="Name (Arabic)" hint="Optional — used on receipts and messages.">
              <Input dir="rtl" placeholder="ليان المصري" {...form.register("fullNameAr")} />
            </Field>
            <Field label="Phone" required error={form.formState.errors.phone?.message}>
              <Input
                dir="ltr"
                placeholder="+962 79 …"
                data-testid="member-phone"
                {...phoneField}
                onChange={(event) => { void phoneField.onChange(event); contactChanged(); }}
                onBlur={(event) => { void phoneField.onBlur(event); void checkDuplicates(); }}
              />
            </Field>
            <Field label="Email" error={form.formState.errors.email?.message}>
              <Input
                type="email"
                placeholder="name@example.com"
                {...emailField}
                onChange={(event) => { void emailField.onChange(event); contactChanged(); }}
                onBlur={(event) => { void emailField.onBlur(event); void checkDuplicates(); }}
              />
            </Field>
            <Field label="Gender">
              <Controller
                control={form.control}
                name="gender"
                render={({ field }) => (
                  <Select value={field.value ?? ""} onValueChange={(v) => field.onChange(v || undefined)}>
                    <SelectTrigger aria-label="Gender">
                      <SelectValue placeholder="Not specified" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="female">Female</SelectItem>
                      <SelectItem value="male">Male</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
            <Field label="Date of birth">
              <Input type="date" {...form.register("dateOfBirth")} />
            </Field>
          </div>
          {checkingDupes ? <p className="mt-2 text-[12px] text-ink-3">Checking for duplicates…</p> : null}
          {duplicateCheckError ? (
            <div role="alert" className="mt-3 rounded-md border border-warning/40 bg-warning-bg/60 px-3 py-3 text-[12.5px] text-warning-deep">
              <p>{duplicateCheckError}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="secondary" onClick={() => { void checkDuplicates(); }}>Retry check</Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setDuplicateCheckOverride(true)} disabled={duplicateCheckOverride}>
                  {duplicateCheckOverride ? "Continuing without pre-check" : "Continue without pre-check"}
                </Button>
              </div>
            </div>
          ) : null}
        </section>

        <details className="group panel overflow-hidden" open={!activeBranchId || undefined}>
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-5 text-[13px] font-medium text-ink-2">
            <span>
              Add membership context, emergency contact or notes
              <span className="ms-2 font-normal text-ink-3">Optional · branch and language already selected</span>
            </span>
            <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden />
          </summary>
          <div className="space-y-5 border-t border-line p-5">
          <section>
          <h2 className="mb-4 font-display text-[15px] font-semibold">Membership context</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Home branch" required error={form.formState.errors.homeBranchId?.message}>
              <Controller
                control={form.control}
                name="homeBranchId"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger aria-label="Home branch" data-testid="member-branch">
                      <SelectValue placeholder="Choose branch…" />
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
            <Field label="Preferred language">
              <Controller
                control={form.control}
                name="preferredLanguage"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger aria-label="Preferred language">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="en">English</SelectItem>
                      <SelectItem value="ar">العربية</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
            <Field label="Source">
              <Controller
                control={form.control}
                name="source"
                render={({ field }) => (
                  <Select value={field.value ?? ""} onValueChange={(v) => field.onChange((v || undefined) as LeadSource | undefined)}>
                    <SelectTrigger aria-label="Source">
                      <SelectValue placeholder="How did they find us?" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(LEAD_SOURCE_LABELS).map(([key, label]) => (
                        <SelectItem key={key} value={key}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
            <Field label="Assigned salesperson">
              <Controller
                control={form.control}
                name="assignedSalespersonId"
                render={({ field }) => (
                  <SalesSelect value={field.value} onChange={field.onChange} />
                )}
              />
            </Field>
          </div>
        </section>

        <section className="border-t border-line pt-5">
          <h2 className="mb-4 font-display text-[15px] font-semibold">Emergency & notes</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Emergency contact name">
              <Input {...form.register("emergencyContactName")} />
            </Field>
            <Field label="Emergency contact phone">
              <Input dir="ltr" placeholder="+962 7…" {...form.register("emergencyContactPhone")} />
            </Field>
          </div>
          <Field label="Notes" className="mt-4">
            <Textarea placeholder="Anything the team should know — schedule preferences, goals, payment habits…" {...form.register("notes")} />
          </Field>
          <label className="mt-4 flex items-center justify-between gap-3 cursor-pointer">
            <span>
              <span className="block text-[13px] font-medium">Marketing messages</span>
              <span className="block text-[12px] text-ink-3">RIVET starts this preference on, but records it as a system default—not member consent. Marketing remains suppressed until staff or the member confirms it. Service messages are separate.</span>
            </span>
            <Controller
              control={form.control}
              name="marketingOptIn"
              render={({ field }) => <Switch checked={field.value} onCheckedChange={(checked) => { field.onChange(checked); form.setValue("marketingPreferenceSource", "staff_selected"); }} aria-label="Marketing opt-in" />}
            />
          </label>
        </section>
          </div>
        </details>

        <div className="flex items-center justify-end gap-2 border-t border-line pt-4">
          {errorMsg ? <p role="alert" className="me-auto text-[13px] text-danger">{errorMsg}</p> : null}
          <Button asChild variant="secondary">
            <Link href="/members">Cancel</Link>
          </Button>
          <Button type="submit" variant={can("memberships.sell") ? "secondary" : "primary"} loading={createMember.isPending} data-testid="save-member">
            Create member
          </Button>
          {can("memberships.sell") ? (
            <Button type="button" loading={createMember.isPending} onClick={form.handleSubmit(startSale)} data-testid="save-member-and-sell">
              <WalletCards /> Create &amp; sell membership
            </Button>
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
    phone: values.phone,
    email: values.email || undefined,
    gender: values.gender,
    dateOfBirth: values.dateOfBirth || undefined,
    homeBranchId: values.homeBranchId,
    preferredLanguage: values.preferredLanguage,
    emergencyContactName: values.emergencyContactName || undefined,
    emergencyContactPhone: values.emergencyContactPhone || undefined,
    source: values.source,
    assignedSalespersonId: values.assignedSalespersonId || undefined,
    notes: values.notes || undefined,
    marketingOptIn: values.marketingOptIn,
    marketingPreferenceSource: values.marketingPreferenceSource,
  };
}

function SaleComplete({ result, onReset }: { result: CreateMemberMembershipSaleResult; onReset: () => void }) {
  const remaining = result.sale.charge.outstandingAmount;
  return (
    <section className="panel overflow-hidden" aria-live="polite">
      <div className="grid gap-5 bg-success-bg/55 p-5 sm:grid-cols-[auto_1fr_auto] sm:items-center">
        <span className="grid size-12 place-items-center rounded-full bg-success text-white"><CheckCircle2 className="size-6" /></span>
        <div>
          <p className="eyebrow text-success-deep">Sale complete</p>
          <h2 className="mt-1 font-display text-xl font-semibold">{result.member.fullName} is ready</h2>
          <p className="mt-1 text-[13px] text-ink-2"><span className="font-mono">{result.member.memberNumber}</span> · membership begins {result.sale.membership.startDate}</p>
        </div>
        <Button asChild><Link href={`/members/${result.member.id}`}>Open member</Link></Button>
      </div>
      <div className="grid gap-px border-y border-line bg-line sm:grid-cols-3">
        <CompletionFact icon={<UserRound className="size-4" />} label="Membership" value={`${result.sale.membership.startDate} → ${result.sale.membership.endDate}`} />
        <CompletionFact icon={<WalletCards className="size-4" />} label="Collected now" value={<MoneyText money={result.sale.payment?.amount} />} />
        <CompletionFact icon={<ReceiptText className="size-4" />} label={remaining.amount > 0 ? "Balance recorded" : "Receipt"} value={remaining.amount > 0 ? <MoneyText money={remaining} /> : result.sale.receipt?.receiptNumber ?? "Paid in full"} warning={remaining.amount > 0} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 p-5">
        <p className="text-[12.5px] text-ink-3">{result.sale.receipt ? `Receipt ${result.sale.receipt.receiptNumber} was issued automatically.` : "No payment was collected; the balance is available from the member profile."}</p>
        <Button type="button" variant="secondary" onClick={onReset}>Add another member</Button>
      </div>
    </section>
  );
}

function CompletionFact({ icon, label, value, warning }: { icon: React.ReactNode; label: string; value: React.ReactNode; warning?: boolean }) {
  return (
    <div className="flex gap-3 bg-paper px-5 py-4">
      <span className="mt-0.5 text-ink-3">{icon}</span>
      <div><p className="text-[11px] uppercase tracking-[0.12em] text-ink-3">{label}</p><p className={`mt-1 text-[13px] font-medium ${warning ? "text-warning-deep" : "text-ink"}`}>{value}</p></div>
    </div>
  );
}

function SalesSelect({ value, onChange }: { value?: string; onChange: (v: string | undefined) => void }) {
  const usersQuery = useApiQuery(qk.users({ role: "salesperson" }), (api) =>
    api.listUsers({ role: "salesperson", status: "active", pageSize: 20 }),
  );
  return (
    <Select value={value ?? ""} onValueChange={(v) => onChange(v || undefined)}>
      <SelectTrigger aria-label="Assigned salesperson">
        <SelectValue placeholder="Unassigned" />
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
