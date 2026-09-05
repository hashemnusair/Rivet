"use client";

import { Check } from "lucide-react";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/shared/chrome";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { CustomerCommunicationPreferences } from "@/components/public/customer-communication-preferences";
import type { CustomerProfileInput } from "@/lib/public/experience-data";
import { useMemberGate } from "@/lib/hooks/use-member-gate";
import { useCustomerPersona, useExperience } from "@/lib/providers/experience-provider";

const EMPTY_PROFILE: CustomerProfileInput = {
  fullName: "",
  phone: "",
  dateOfBirth: "",
  addressLine1: "",
  city: "",
  emergencyContactName: "",
  emergencyContactRelationship: "",
  emergencyContactPhone: "",
  preferredLanguage: "en",
};

const FIELD = "h-11 sm:h-9";
const SELECT_CLASS = "h-11 w-full rounded-md border border-line-2 bg-surface px-3 text-[13.5px] text-ink transition-colors hover:border-line-3 focus:border-[var(--tenant-brand-primary)] sm:h-9";

export default function MemberProfilePage() {
  const customer = useCustomerPersona();
  const { updateCustomerProfile } = useExperience();
  const { ready, identitySignedIn, profileSelected } = useMemberGate();
  const [form, setForm] = useState<CustomerProfileInput>(EMPTY_PROFILE);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!customer) return;
    setForm({
      fullName: customer.name,
      phone: customer.phone,
      dateOfBirth: customer.dateOfBirth ?? "",
      gender: customer.gender,
      preferredLanguage: customer.preferredLanguage ?? "en",
      addressLine1: customer.addressLine1 ?? "",
      city: customer.city ?? "",
      emergencyContactName: customer.emergencyContactName ?? "",
      emergencyContactRelationship: customer.emergencyContactRelationship ?? "",
      emergencyContactPhone: customer.emergencyContactPhone ?? "",
    });
  }, [customer]);

  if (!ready || !identitySignedIn) return <ProfileLoading />;
  if (!profileSelected || !customer) return null;

  const update = (field: keyof CustomerProfileInput, value: string) => {
    setSaved(false);
    setForm((current) => ({ ...current, [field]: value }));
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setSaved(false);
    setError(undefined);
    if (form.gender !== "female" && form.gender !== "male") {
      setError("Choose female or male before saving your profile.");
      setSaving(false);
      return;
    }
    try {
      await updateCustomerProfile({ ...form, fullName: form.fullName?.trim(), phone: form.phone?.trim() });
      setSaved(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Profile could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="mx-auto max-w-[900px] px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
      <PageHeader sectionLabel="Your account" title="Profile" description="Keep your contact and emergency details current. The same member-owned information is shared with every gym you join." />

      <form onSubmit={submit} className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-5">
        <div className="space-y-4">
          <section className="panel p-4 sm:p-5" aria-labelledby="profile-personal-title">
            <h2 id="profile-personal-title" className="text-[15px] font-semibold">Personal information</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Full name" htmlFor="profile-name" required className="sm:col-span-2"><Input id="profile-name" className={FIELD} value={form.fullName ?? ""} onChange={(event) => update("fullName", event.target.value)} autoComplete="name" required /></Field>
              <Field label="Email" htmlFor="profile-email" hint="Your sign-in email cannot be changed here."><Input id="profile-email" className={FIELD} value={customer.email} disabled readOnly autoComplete="email" /></Field>
              <Field label="Phone" htmlFor="profile-phone"><Input id="profile-phone" className={FIELD} type="tel" inputMode="tel" value={form.phone ?? ""} onChange={(event) => update("phone", event.target.value)} autoComplete="tel" /></Field>
              <Field label="Birth date" htmlFor="profile-birth-date"><Input id="profile-birth-date" className={FIELD} type="date" value={form.dateOfBirth ?? ""} onChange={(event) => update("dateOfBirth", event.target.value)} autoComplete="bday" /></Field>
              <Field label="Gender" htmlFor="profile-gender" required>
                <select id="profile-gender" value={form.gender ?? ""} onChange={(event) => update("gender", event.target.value)} className={SELECT_CLASS} required>
                  <option value="" disabled>Choose female or male</option><option value="female">Female</option><option value="male">Male</option>
                </select>
              </Field>
              <Field label="Preferred language" htmlFor="profile-language" hint="Changes the language of service messages only." className="sm:col-span-2">
                <select id="profile-language" value={form.preferredLanguage ?? "en"} onChange={(event) => update("preferredLanguage", event.target.value)} className={SELECT_CLASS}>
                  <option value="en">English</option><option value="ar">العربية</option>
                </select>
              </Field>
            </div>
          </section>

          <section className="panel p-4 sm:p-5" aria-labelledby="profile-address-title">
            <h2 id="profile-address-title" className="text-[15px] font-semibold">Address</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Address" htmlFor="profile-address" className="sm:col-span-2"><Input id="profile-address" className={FIELD} value={form.addressLine1 ?? ""} onChange={(event) => update("addressLine1", event.target.value)} autoComplete="street-address" /></Field>
              <Field label="City" htmlFor="profile-city"><Input id="profile-city" className={FIELD} value={form.city ?? ""} onChange={(event) => update("city", event.target.value)} autoComplete="address-level2" /></Field>
            </div>
          </section>

          <section className="panel p-4 sm:p-5" aria-labelledby="profile-emergency-title">
            <h2 id="profile-emergency-title" className="text-[15px] font-semibold">Emergency contact</h2>
            <p className="mt-1 text-[13px] text-ink-2">Only share someone you trust your gyms to contact if needed.</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Name" htmlFor="emergency-name"><Input id="emergency-name" className={FIELD} value={form.emergencyContactName ?? ""} onChange={(event) => update("emergencyContactName", event.target.value)} autoComplete="off" /></Field>
              <Field label="Relationship" htmlFor="emergency-relationship"><Input id="emergency-relationship" className={FIELD} value={form.emergencyContactRelationship ?? ""} onChange={(event) => update("emergencyContactRelationship", event.target.value)} autoComplete="off" placeholder="Parent, spouse…" /></Field>
              <Field label="Phone" htmlFor="emergency-phone"><Input id="emergency-phone" className={FIELD} type="tel" inputMode="tel" value={form.emergencyContactPhone ?? ""} onChange={(event) => update("emergencyContactPhone", event.target.value)} autoComplete="off" /></Field>
            </div>
          </section>

          {error ? <p role="alert" className="rounded-md border border-danger/30 bg-danger-bg px-3 py-2.5 text-[13px] text-danger">{error}</p> : null}
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" loading={saving} className="w-full sm:w-auto">Save profile</Button>
            {saved ? <span role="status" className="inline-flex items-center gap-1.5 text-[13px] text-success-deep"><Check className="size-4" aria-hidden /> Saved and shared with linked gyms</span> : null}
          </div>
        </div>

        <aside className="space-y-4">
          <div className="panel p-4 sm:p-5">
            <h2 className="text-[13px] font-semibold">Privacy boundary</h2>
            <p className="mt-2 text-[13px] leading-relaxed text-ink-2">Your email, phone, personal details and emergency contact are member-owned. Each gym sees only your synchronized record in that gym.</p>
            <p className="mt-2 text-[12.5px] leading-relaxed text-ink-3">Gym staff still control operational notes, tags, branch assignment and membership details. Medical records are not collected here.</p>
          </div>
          <CustomerCommunicationPreferences />
        </aside>
      </form>
    </main>
  );
}

function ProfileLoading() {
  return <main className="flex min-h-[60vh] items-center justify-center px-4" role="status" aria-label="Loading profile"><div className="h-1 w-40 animate-pulse rounded-full bg-sunken-2" /></main>;
}
