"use client";

import { useState, type FormEvent } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { getApi } from "@/lib/api/client";
import type { RivetIdentity } from "@/lib/auth/rivet-identity";

const profileSchema = z.object({
  fullName: z.string().trim().min(3, "Enter your full name").max(120),
  email: z.string().trim().email("Your account needs a valid email address"),
  phone: z.string().trim().min(9, "Enter your mobile number").max(30).regex(/^\+?[\d\s()\-]{9,30}$/, "Enter a valid mobile number"),
  gender: z.enum(["female", "male"], { message: "Choose female or male" }),
});

/** Reached only after an authenticated member query confirms a missing profile. */
export function MemberProfileCompletion({ identity, onComplete }: { identity: RivetIdentity; onComplete: () => Promise<void> }) {
  const [fullName, setFullName] = useState(identity.fullName ?? "");
  const [phone, setPhone] = useState("");
  const [gender, setGender] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    const parsed = profileSchema.safeParse({ fullName, email: identity.email ?? "", phone, gender });
    if (!parsed.success) { setError(parsed.error.issues[0]?.message); return; }
    setBusy(true);
    setError(undefined);
    try {
      await getApi().registerCustomer(parsed.data);
      await onComplete();
    } catch {
      setError("We could not finish your member setup. Your account is still signed in. Please try again.");
    } finally { setBusy(false); }
  };

  return <form onSubmit={submit} className="space-y-4" noValidate>
    <h1 className="font-display text-[23px] font-semibold">Finish your member profile</h1>
    <p className="text-[13px] text-ink-2">You are signed in as {identity.email}. Add these details to open your member dashboard.</p>
    <Field label="Full name" htmlFor="member-setup-name" required><Input id="member-setup-name" value={fullName} onChange={(event) => setFullName(event.target.value)} autoComplete="name" /></Field>
    <Field label="Mobile number" htmlFor="member-setup-phone" required><Input id="member-setup-phone" type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} autoComplete="tel" /></Field>
    <Field label="Gender" htmlFor="member-setup-gender" required><select id="member-setup-gender" value={gender} onChange={(event) => setGender(event.target.value)} className="h-11 w-full rounded-md border border-line-2 bg-surface px-3 text-[13.5px]" required>
      <option value="" disabled>Choose female or male</option><option value="female">Female</option><option value="male">Male</option>
    </select></Field>
    {error ? <p role="alert" className="text-[12px] text-danger">{error}</p> : null}
    <Button type="submit" className="w-full" loading={busy}>Finish member setup</Button>
  </form>;
}
