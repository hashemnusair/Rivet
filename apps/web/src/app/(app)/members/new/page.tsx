"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { isApiError } from "@/lib/api/errors";
import { useApiMutation, useApiQuery, useInvalidate } from "@/lib/hooks/use-api";
import type { DuplicateMatch, LeadSource } from "@/lib/domain/types";
import { useApp } from "@/lib/providers/app-providers";
import { Breadcrumbs, PageHeader } from "@/components/shared/chrome";
import { LEAD_SOURCE_LABELS } from "@/components/shared/status-chip";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { getApi } from "@/lib/api/client";
import { qk } from "@/lib/api/keys";

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
  const router = useRouter();
  const invalidate = useInvalidate();
  const [duplicates, setDuplicates] = useState<DuplicateMatch[]>([]);
  const [checkingDupes, setCheckingDupes] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      fullName: "",
      fullNameAr: "",
      phone: "",
      email: "",
      homeBranchId: session?.activeBranchId ?? session?.branches[0]?.id ?? "",
      preferredLanguage: "en",
      marketingOptIn: false,
    },
  });

  const createMember = useApiMutation(
    (api, values: FormValues) =>
      api.createMember({
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
      }),
    {
      onSuccess: async (result) => {
        await invalidate();
        toast.success(`${result.member.fullName} added — ${result.member.memberNumber}.`);
        router.push(`/members/${result.member.id}`);
      },
    },
  );

  const checkDuplicates = async () => {
    const phone = form.getValues("phone");
    const email = form.getValues("email");
    if (!phone && !email) return;
    setCheckingDupes(true);
    try {
      const matches = await getApi().checkMemberDuplicates({ phone: phone || undefined, email: email || undefined });
      setDuplicates(matches);
    } finally {
      setCheckingDupes(false);
    }
  };

  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Breadcrumbs items={[{ label: "Members", href: "/members" }, { label: "New member" }]} />
      <PageHeader
        eyebrow="Operations"
        title="Add member"
        description="Create the profile now; sell the membership right after from the member page."
        actions={
          <Button asChild variant="secondary">
            <Link href="/members">
              <ArrowLeft /> Back to members
            </Link>
          </Button>
        }
      />

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
          <Button variant="secondary" size="sm" onClick={() => setDuplicates([])}>
            Dismiss
          </Button>
        </div>
      ) : null}

      <form
        onSubmit={form.handleSubmit(async (values) => {
          setErrorMsg(null);
          try {
            await createMember.mutateAsync(values);
          } catch (e) {
            setErrorMsg(isApiError(e) ? e.message : "Could not create the member.");
          }
        })}
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
              <Input dir="ltr" placeholder="+962 79 …" data-testid="member-phone" {...form.register("phone", { onBlur: checkDuplicates })} />
            </Field>
            <Field label="Email" error={form.formState.errors.email?.message}>
              <Input type="email" placeholder="name@example.com" {...form.register("email", { onBlur: checkDuplicates })} />
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
        </section>

        <section className="panel p-5">
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

        <section className="panel p-5">
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
              <span className="block text-[12px] text-ink-3">No consent is assumed. Turn this on only after the member explicitly agrees; otherwise email, SMS, and WhatsApp marketing stay suppressed. Service messages are separate.</span>
            </span>
            <Controller
              control={form.control}
              name="marketingOptIn"
              render={({ field }) => <Switch checked={field.value} onCheckedChange={(checked) => { field.onChange(checked); form.setValue("marketingPreferenceSource", "staff_selected"); }} aria-label="Marketing opt-in" />}
            />
          </label>
        </section>

        <div className="flex items-center justify-end gap-2 border-t border-line pt-4">
          {errorMsg ? <p role="alert" className="me-auto text-[13px] text-danger">{errorMsg}</p> : null}
          <Button asChild variant="secondary">
            <Link href="/members">Cancel</Link>
          </Button>
          <Button type="submit" loading={createMember.isPending} data-testid="save-member">
            Create member
          </Button>
        </div>
      </form>
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
