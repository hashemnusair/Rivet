"use client";

import { useState, type FormEvent } from "react";
import { authMessage, renderAuthMessage } from "@/lib/auth/messages";
import type { MessageDescriptor } from "@/lib/i18n/core";
import { englishT } from "./english-t";
import { latinDigits } from "@/lib/utils/text";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { getApi } from "@/lib/api/client";
import type { RivetIdentity } from "@/lib/auth/rivet-identity";
import { useLocale, type TFunction } from "@/lib/i18n/provider";

const createProfileSchema = (t: TFunction) => z.object({
  fullName: z.string().trim().min(3, t("auth.validation.fullName")).max(120, t("authErrors.max120")),
  email: z.string().trim().email(t("auth.validation.emailInvalid")),
  phone: z.string().transform(latinDigits).pipe(z.string().trim().min(9, t("auth.validation.mobileRequired")).max(30, t("authErrors.max30")).regex(/^\+?[\d\s()\-]{9,30}$/, t("auth.validation.mobileInvalid"))),
  gender: z.enum(["female", "male"], { message: t("auth.validation.genderRequired") }),
});

/** Reached only after an authenticated member query confirms a missing profile. */
export function MemberProfileCompletion({ identity, onComplete }: { identity: RivetIdentity; onComplete: () => Promise<void> }) {
  const { t, isolate } = useLocale();
  const profileSchema = createProfileSchema(englishT);
  const [fullName, setFullName] = useState(identity.fullName ?? "");
  const [phone, setPhone] = useState("");
  const [gender, setGender] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<MessageDescriptor>();
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    const parsed = profileSchema.safeParse({ fullName, email: identity.email ?? "", phone, gender });
    if (!parsed.success) { setError(authMessage({ message: parsed.error.issues[0]?.message }, "authErrors.checkDetails")); return; }
    setBusy(true);
    setError(undefined);
    try {
      await getApi().registerCustomer(parsed.data);
      await onComplete();
    } catch {
      setError({ key: "auth.memberSetup.saveFailed" });
    } finally { setBusy(false); }
  };

  return <form onSubmit={submit} className="space-y-4" noValidate>
    <h1 className="font-display text-[23px] font-semibold">{t("auth.memberSetup.title")}</h1>
    <p className="text-[13px] text-ink-2">{t("auth.memberSetup.intro", { email: isolate(identity.email ?? "") })}</p>
    <Field label={t("auth.memberSetup.fullName")} htmlFor="member-setup-name" required><Input id="member-setup-name" value={fullName} onChange={(event) => setFullName(event.target.value)} autoComplete="name" dir="auto" /></Field>
    <Field label={t("auth.memberSetup.mobile")} htmlFor="member-setup-phone" required><Input id="member-setup-phone" type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} autoComplete="tel" dir="ltr" /></Field>
    <Field label={t("auth.memberSetup.gender")} htmlFor="member-setup-gender" required><select id="member-setup-gender" value={gender} onChange={(event) => setGender(event.target.value)} className="h-11 w-full rounded-md border border-line-2 bg-surface px-3 text-[13.5px]" required>
      <option value="" disabled>{t("auth.memberSetup.genderChoose")}</option><option value="female">{t("auth.memberSetup.female")}</option><option value="male">{t("auth.memberSetup.male")}</option>
    </select></Field>
    {error ? <p role="alert" className="text-[12px] text-danger">{renderAuthMessage(error, t)}</p> : null}
    <Button type="submit" className="w-full" loading={busy}>{t("auth.memberSetup.submit")}</Button>
  </form>;
}
