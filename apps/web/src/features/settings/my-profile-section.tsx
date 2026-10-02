"use client";
import { useT } from "@/lib/i18n/provider";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { qk } from "@/lib/api/keys";
import { isApiError } from "@/lib/api/errors";
import { useApiMutation, useApiQuery, useInvalidate } from "@/lib/hooks/use-api";
import { roleLabel } from "@/lib/i18n/labels";
import { useApp } from "@/lib/providers/app-providers";
import type { UserProfile } from "@/lib/domain/types";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/misc";
import { ErrorState } from "@/components/ui/states";
import { SettingsPanel, SettingsSaveBar, SettingsSection } from "@/features/settings/settings-layout";

const DESCRIPTION = "The name and phone number your team sees. You cannot change your email or role here.";

type ProfileForm = Pick<UserProfile, "name" | "phone">;

function errorMessage(error: unknown): string {
  return isApiError(error) ? error.message : "Your profile was not saved. Try again.";
}

export function MyProfileSection() {
  const t = useT();
  const { session, refreshSession } = useApp();
  const invalidate = useInvalidate();
  const profileQuery = useApiQuery(qk.myProfile, (api) => api.getMyProfile());
  const [form, setForm] = useState<ProfileForm>({ name: "", phone: "" });
  const [baseline, setBaseline] = useState<ProfileForm | null>(null);
  const dirty = Boolean(baseline && JSON.stringify(form) !== JSON.stringify(baseline));
  const dirtyRef = useRef(dirty);

  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);

  useEffect(() => {
    if (!profileQuery.data || dirtyRef.current) return;
    const next = { name: profileQuery.data.name, phone: profileQuery.data.phone };
    setForm(next);
    setBaseline(next);
  }, [profileQuery.data]);

  const save = useApiMutation((api, input: ProfileForm) => api.updateMyProfile(input), {
    onSuccess: async (profile) => {
      const next = { name: profile.name, phone: profile.phone };
      setForm(next);
      setBaseline(next);
      // Refresh both the profile projection and the app session so the
      // topbar, audit actor label, and identity-bound routes use the new name
      // immediately after a successful save.
      await invalidate([qk.myProfile, qk.session]);
      await refreshSession();
      toast.success("Your profile was updated.");
    },
  });

  if (profileQuery.isLoading) return <SettingsSection title="My profile" description={DESCRIPTION}><Skeleton className="h-72 w-full" /></SettingsSection>;
  if (profileQuery.isError || !profileQuery.data) return <SettingsSection title="My profile" description={DESCRIPTION}><ErrorState layout="section" onRetry={() => profileQuery.refetch()} /></SettingsSection>;

  const name = form.name.trim();
  const nameInvalid = name.length < 2 || name.length > 160;
  const phoneInvalid = form.phone.trim().length > 40;
  const role = session?.roles[0];
  const commit = async () => {
    await save.mutateAsync({ name, phone: form.phone });
  };

  return (
    <SettingsSection title="My profile" description={DESCRIPTION}>
      <SettingsPanel title="Account details" description="These details are only for your account. They do not change anyone else’s access.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Your name" required error={nameInvalid ? "Enter a name between 2 and 160 characters." : undefined}>
            <Input value={form.name} autoComplete="name" aria-invalid={nameInvalid || undefined} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
          </Field>
          <Field label={t("common.label.phone")} hint="Optional. Your team can see this number." error={phoneInvalid ? "Use 40 characters or fewer." : undefined}>
            <Input dir="ltr" type="tel" inputMode="tel" autoComplete="tel" value={form.phone} aria-invalid={phoneInvalid || undefined} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} />
          </Field>
          <Field label="Sign-in email" hint="You change this in your sign-in account, not here.">
            <Input value={profileQuery.data.email} readOnly aria-readonly="true" />
          </Field>
          <Field label="Your role" hint="Only staff with “Manage staff” access can change roles.">
            <Input value={role ? roleLabel(t, role) : "—"} readOnly aria-readonly="true" />
          </Field>
        </div>
      </SettingsPanel>
      <SettingsSaveBar
        dirty={dirty}
        saving={save.isPending}
        saveDisabled={nameInvalid || phoneInvalid}
        saveDisabledReason={nameInvalid ? "Enter a name with at least 2 letters before saving." : phoneInvalid ? "Use 40 characters or fewer for the phone number." : undefined}
        error={save.isError ? errorMessage(save.error) : undefined}
        onSave={commit}
        onDiscard={() => { if (baseline) setForm(baseline); }}
        saveLabel="Save profile"
      />
    </SettingsSection>
  );
}
