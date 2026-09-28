"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { qk } from "@/lib/api/keys";
import { isApiError } from "@/lib/api/errors";
import { useApiMutation, useApiQuery, useInvalidate } from "@/lib/hooks/use-api";
import { ROLE_LABELS } from "@/lib/domain/permissions";
import { useApp } from "@/lib/providers/app-providers";
import type { UserProfile } from "@/lib/domain/types";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/misc";
import { ErrorState } from "@/components/ui/states";
import { SettingsPanel, SettingsSaveBar, SettingsSection } from "@/features/settings/settings-layout";

const DESCRIPTION = "Update the name and phone number your gym team sees. Your sign-in email and access role are managed separately.";

type ProfileForm = Pick<UserProfile, "name" | "phone">;

function errorMessage(error: unknown): string {
  return isApiError(error) ? error.message : "Your profile could not be saved. Try again.";
}

export function MyProfileSection() {
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
      <SettingsPanel title="Account details" description="These details are personal to your RIVET account and do not change anyone else’s access.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Display name" required error={nameInvalid ? "Enter a display name between 2 and 160 characters." : undefined}>
            <Input value={form.name} autoComplete="name" aria-invalid={nameInvalid || undefined} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
          </Field>
          <Field label="Phone" hint="Optional. Used for internal contact details." error={phoneInvalid ? "Use 40 characters or fewer." : undefined}>
            <Input dir="ltr" type="tel" inputMode="tel" autoComplete="tel" value={form.phone} aria-invalid={phoneInvalid || undefined} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} />
          </Field>
          <Field label="Sign-in email" hint="Change this through your sign-in provider.">
            <Input value={profileQuery.data.email} readOnly aria-readonly="true" />
          </Field>
          <Field label="Workspace role" hint="Access roles are managed by staff with the Manage staff permission.">
            <Input value={role ? ROLE_LABELS[role] : "—"} readOnly aria-readonly="true" />
          </Field>
        </div>
      </SettingsPanel>
      <SettingsSaveBar
        dirty={dirty}
        saving={save.isPending}
        saveDisabled={nameInvalid || phoneInvalid}
        saveDisabledReason={nameInvalid ? "Enter a valid display name before saving." : phoneInvalid ? "Use 40 characters or fewer for the phone number." : undefined}
        error={save.isError ? errorMessage(save.error) : undefined}
        onSave={commit}
        onDiscard={() => { if (baseline) setForm(baseline); }}
        saveLabel="Save profile"
      />
    </SettingsSection>
  );
}
