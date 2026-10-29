"use client";
import type { TKey } from "@/lib/i18n/core";
import { isApiError, localizeApiError } from "@/lib/api/errors";
import { latinDigits } from "@/lib/utils/text";
import { useLocale, useT } from "@/lib/i18n/provider";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { MEMBER_ACCOUNT_HREF, MemberAccountLoading, MemberAccountSubpage } from "@/components/public/member-account";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
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

export default function MemberProfileEditPage() {
  const t = useT();
  const { locale } = useLocale();
  const router = useRouter();
  const customer = useCustomerPersona();
  const { updateCustomerProfile } = useExperience();
  const { ready, identitySignedIn, profileSelected } = useMemberGate();
  const [form, setForm] = useState<CustomerProfileInput>(EMPTY_PROFILE);
  const [loadedFor, setLoadedFor] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<{ key: TKey } | { cause: unknown }>();

  // Fill the form once per member. A live update to the record while the
  // member is typing must not replace what they have typed.
  useEffect(() => {
    if (!customer || loadedFor === customer.id) return;
    setLoadedFor(customer.id);
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
  }, [customer, loadedFor]);

  if (!ready || !identitySignedIn) return <MemberAccountLoading />;
  if (!profileSelected || !customer) return null;

  const update = (field: keyof CustomerProfileInput, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError(undefined);
    if (form.gender !== "female" && form.gender !== "male") {
      setError({ key: "customerPortal.profileGender" });
      setSaving(false);
      return;
    }
    try {
      await updateCustomerProfile({ ...form, fullName: form.fullName?.trim(), phone: form.phone && latinDigits(form.phone.trim()), emergencyContactPhone: form.emergencyContactPhone && latinDigits(form.emergencyContactPhone.trim()) });
      toast.success(t("customerPortal.profileSaved"));
      router.replace(MEMBER_ACCOUNT_HREF);
    } catch (caught) {
      setError({ cause: caught });
      setSaving(false);
    }
  };

  return (
    <MemberAccountSubpage title={t("customerPortal.editInfo")} description={t("customerPortal.editInfoDescription")}>
      <form onSubmit={submit} className="space-y-4">
        <section className="panel p-4 sm:p-5" aria-labelledby="profile-personal-title">
          <h2 id="profile-personal-title" className="text-[15px] font-semibold">{t("customerPortal.personalInformation")}</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label={t("common.label.fullName")} htmlFor="profile-name" required className="sm:col-span-2"><Input dir="auto" id="profile-name" className={FIELD} value={form.fullName ?? ""} onChange={(event) => update("fullName", event.target.value)} autoComplete="name" required /></Field>
            <Field label={t("common.label.email")} htmlFor="profile-email" hint={t("customerPortal.emailReadOnly")}><Input dir="ltr" id="profile-email" className={FIELD} value={customer.email} disabled readOnly autoComplete="email" /></Field>
            <Field label={t("common.label.phone")} htmlFor="profile-phone"><Input dir="ltr" id="profile-phone" className={FIELD} type="tel" inputMode="tel" value={form.phone ?? ""} onChange={(event) => update("phone", event.target.value)} autoComplete="tel" /></Field>
            <Field label={t("customerPortal.birthDate")} htmlFor="profile-birth-date"><Input id="profile-birth-date" className={FIELD} type="date" value={form.dateOfBirth ?? ""} onChange={(event) => update("dateOfBirth", event.target.value)} autoComplete="bday" /></Field>
            <Field label={t("memberProfile.details.gender")} htmlFor="profile-gender" required>
              <select id="profile-gender" value={form.gender ?? ""} onChange={(event) => update("gender", event.target.value)} className={SELECT_CLASS} required>
                <option value="" disabled>{t("auth.validation.genderRequired")}</option><option value="female">{t("memberProfile.details.female")}</option><option value="male">{t("memberProfile.details.male")}</option>
              </select>
            </Field>
            <Field label={t("members.header.preferredLanguage")} htmlFor="profile-language" hint={t("customerPortal.recipientLanguageHint")} className="sm:col-span-2">
              <select id="profile-language" value={form.preferredLanguage ?? "en"} onChange={(event) => update("preferredLanguage", event.target.value)} className={SELECT_CLASS}>
                <option value="en">{t("common.language.english")}</option><option value="ar">{t("common.language.arabic")}</option>
              </select>
            </Field>
          </div>
        </section>

        <section className="panel p-4 sm:p-5" aria-labelledby="profile-address-title">
          <h2 id="profile-address-title" className="text-[15px] font-semibold">{t("memberProfile.details.address")}</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label={t("memberProfile.details.address")} htmlFor="profile-address" className="sm:col-span-2"><Input dir="auto" id="profile-address" className={FIELD} value={form.addressLine1 ?? ""} onChange={(event) => update("addressLine1", event.target.value)} autoComplete="street-address" /></Field>
            <Field label={t("customerPortal.city")} htmlFor="profile-city"><Input dir="auto" id="profile-city" className={FIELD} value={form.city ?? ""} onChange={(event) => update("city", event.target.value)} autoComplete="address-level2" /></Field>
          </div>
        </section>

        <section className="panel p-4 sm:p-5" aria-labelledby="profile-emergency-title">
          <h2 id="profile-emergency-title" className="text-[15px] font-semibold">{t("members.header.emergencyContact")}</h2>
          <p className="mt-1 text-[13px] text-ink-2">{t("customerPortal.emergencyHint")}</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label={t("common.label.name")} htmlFor="emergency-name"><Input dir="auto" id="emergency-name" className={FIELD} value={form.emergencyContactName ?? ""} onChange={(event) => update("emergencyContactName", event.target.value)} autoComplete="off" /></Field>
            <Field label={t("customerPortal.relationship")} htmlFor="emergency-relationship"><Input dir="auto" id="emergency-relationship" className={FIELD} value={form.emergencyContactRelationship ?? ""} onChange={(event) => update("emergencyContactRelationship", event.target.value)} autoComplete="off" placeholder={t("customerPortal.relationshipPlaceholder")} /></Field>
            <Field label={t("common.label.phone")} htmlFor="emergency-phone"><Input dir="ltr" id="emergency-phone" className={FIELD} type="tel" inputMode="tel" value={form.emergencyContactPhone ?? ""} onChange={(event) => update("emergencyContactPhone", event.target.value)} autoComplete="off" /></Field>
          </div>
        </section>

        {error ? <p role="alert" className="rounded-md border border-danger/30 bg-danger-bg px-3 py-2.5 text-[13px] text-danger">{"key" in error ? t(error.key) : isApiError(error.cause) ? localizeApiError(error.cause, locale).message : t("customerPortal.profileNotSaved")}</p> : null}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button asChild variant="secondary" className="h-11 w-full sm:h-9 sm:w-auto"><Link href={MEMBER_ACCOUNT_HREF}>{t("common.action.cancel")}</Link></Button>
          <Button type="submit" loading={saving} className="h-11 w-full sm:h-9 sm:w-auto">{t("members.header.saveProfile")}</Button>
        </div>
      </form>
    </MemberAccountSubpage>
  );
}
