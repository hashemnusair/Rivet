"use client";
import { useT } from "@/lib/i18n/provider";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { qk } from "@/lib/api/keys";
import { latinDigits } from "@/lib/utils/text";
import type { TFunction } from "@/lib/i18n/core";
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


type ProfileForm = Pick<UserProfile, "name" | "phone">;

function errorMessage(t: TFunction, error: unknown): string {
  return isApiError(error) ? error.message : t("settingsDetails.text104");
}

export function MyProfileSection() {
  const t = useT();
  const DESCRIPTION = t("settingsDetails.text103");

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
      toast.success(t("settingsDetails.text105"));
    },
  });

  if (profileQuery.isLoading) return <SettingsSection title={t("settingsCore.text178")} description={DESCRIPTION}><Skeleton className="h-72 w-full" /></SettingsSection>;
  if (profileQuery.isError || !profileQuery.data) return <SettingsSection title={t("settingsCore.text178")} description={DESCRIPTION}><ErrorState layout="section" onRetry={() => profileQuery.refetch()} /></SettingsSection>;

  const name = form.name.trim();
  const nameInvalid = name.length < 2 || name.length > 160;
  const phoneInvalid = form.phone.trim().length > 40;
  const role = session?.roles[0];
  const commit = async () => {
    await save.mutateAsync({ name, phone: latinDigits(form.phone) });
  };

  return (
    <SettingsSection title={t("settingsCore.text178")} description={DESCRIPTION}>
      <SettingsPanel title={t("settingsDetails.text106")} description={t("settingsDetails.text107")}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("settingsDetails.text108")} required error={nameInvalid ? t("settingsDetails.text109") : undefined}>
            <Input value={form.name} autoComplete="name" aria-invalid={nameInvalid || undefined} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
          </Field>
          <Field label={t("common.label.phone")} hint={t("settingsDetails.text110")} error={phoneInvalid ? t("settingsDetails.text111") : undefined}>
            <Input dir="ltr" type="tel" inputMode="tel" autoComplete="tel" value={form.phone} aria-invalid={phoneInvalid || undefined} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} />
          </Field>
          <Field label={t("settingsDetails.text112")} hint={t("settingsDetails.text113")}>
            <Input value={profileQuery.data.email} readOnly aria-readonly="true" />
          </Field>
          <Field label={t("settingsDetails.text114")} hint={t("settingsDetails.text115")}>
            <Input value={role ? roleLabel(t, role) : "—"} readOnly aria-readonly="true" />
          </Field>
        </div>
      </SettingsPanel>
      <SettingsSaveBar
        dirty={dirty}
        saving={save.isPending}
        saveDisabled={nameInvalid || phoneInvalid}
        saveDisabledReason={nameInvalid ? t("settingsDetails.text116") : phoneInvalid ? t("settingsDetails.text117") : undefined}
        error={save.isError ? errorMessage(t, save.error) : undefined}
        onSave={commit}
        onDiscard={() => { if (baseline) setForm(baseline); }}
        saveLabel={t("settingsDetails.text118")}
      />
    </SettingsSection>
  );
}
