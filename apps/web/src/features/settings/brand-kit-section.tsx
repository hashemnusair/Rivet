"use client";
import { useT } from "@/lib/i18n/provider";

import { ImagePlus, Lock } from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/misc";
import { ErrorState, StatePanel } from "@/components/ui/states";
import { qk } from "@/lib/api/keys";
import { isApiError } from "@/lib/api/errors";
import { BRAND_PALETTE_PRESETS, deriveBrandTokens, normalizeBrandHex, type BrandPaletteKey } from "@/lib/domain/brand";
import type { BrandKit, OrganizationSettings, UpdateBrandKitInput } from "@/lib/domain/types";
import { useApiMutation, useApiQuery, useInvalidate } from "@/lib/hooks/use-api";
import { useApp } from "@/lib/providers/app-providers";
import { cn } from "@/lib/utils/cn";
import { SettingsPanel, SettingsSaveBar, SettingsSection } from "@/features/settings/settings-layout";

type PendingLogo = { file: File; altText: string; previewUrl: string };


function previewUrl(file: File): string {
  return typeof URL !== "undefined" && typeof URL.createObjectURL === "function" ? URL.createObjectURL(file) : "";
}

function revokePreview(url?: string) {
  if (url?.startsWith("blob:") && typeof URL !== "undefined") URL.revokeObjectURL(url);
}

function initials(name?: string): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  const letters = parts.length >= 2 ? `${parts[0]![0]}${parts[1]![0]}` : (parts[0] ?? "RV").slice(0, 2);
  return letters.toUpperCase();
}

function initialForm(brand?: BrandKit): UpdateBrandKitInput {
  return { paletteKey: brand?.paletteKey ?? "rivet", primaryColor: brand?.primaryColor ?? BRAND_PALETTE_PRESETS.rivet, logoAssetId: brand?.logoAssetId };
}

export function BrandKitSection() {
  const t = useT();
  const palettes: Record<BrandPaletteKey, string> = { rivet: "RIVET", gold: t("settingsDetails.gold"), red: t("settingsDetails.red"), green: t("settingsDetails.green"), blue: t("settingsDetails.blue"), violet: t("settingsDetails.violet") };
  const DESCRIPTION = t("settingsDetails.text228");

  const { session, refreshSession } = useApp();
  const queryClient = useQueryClient();
  const invalidate = useInvalidate();
  const settingsQuery = useApiQuery(qk.settings, (api) => api.getOrganizationSettings());
  const brand = settingsQuery.data?.brand;
  const isOwner = session?.roles.includes("owner") ?? false;
  const [form, setForm] = useState<UpdateBrandKitInput>(() => initialForm(brand));
  const [pendingLogo, setPendingLogo] = useState<PendingLogo>();
  const [baseline, setBaseline] = useState("");
  const logoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!brand || pendingLogo) return;
    const next = initialForm(brand);
    const serialized = JSON.stringify(next);
    // A background settings refresh must not overwrite edits that are still
    // in the form. Only hydrate when the form is pristine or uninitialized.
    if (baseline && JSON.stringify(form) !== baseline) return;
    if (JSON.stringify(form) !== serialized) setForm(next);
    if (baseline !== serialized) setBaseline(serialized);
  }, [baseline, brand, form, pendingLogo]);

  const dirty = Boolean(pendingLogo) || (baseline !== "" && JSON.stringify(form) !== baseline);
  const save = useApiMutation(async (api) => {
    let uploadedId = form.logoAssetId;
    try {
      if (pendingLogo) {
        const asset = await api.uploadMediaAsset({ ownerType: "gym_logo", ownerId: brand?.organizationId ?? session?.organization.id ?? "", file: pendingLogo.file, altText: pendingLogo.altText.trim() });
        uploadedId = asset.id;
      }
      return await api.updateBrandKit({ ...form, logoAssetId: uploadedId });
    } catch (error) {
      if (pendingLogo && uploadedId && uploadedId !== form.logoAssetId) await Promise.allSettled([api.discardDraftMediaAsset(uploadedId)]);
      throw error;
    }
  }, {
    onSuccess: async (next) => {
      revokePreview(pendingLogo?.previewUrl);
      setPendingLogo(undefined);
      const nextForm = initialForm(next);
      setForm(nextForm);
      setBaseline(JSON.stringify(nextForm));
      // Keep the settings query and authenticated shell in sync immediately.
      // The shell session is not itself a TanStack query, so invalidating
      // qk.session alone cannot apply a saved palette/logo until a reload.
      queryClient.setQueryData<OrganizationSettings | undefined>(qk.settings, (current) => current
        ? { ...current, brand: next, organization: { ...current.organization, brand: next } }
        : current);
      toast.success(t("settingsDetails.text229"));
      await invalidate([qk.settings]);
      // A successful brand mutation must not be reported as failed only
      // because the follow-up shell refresh briefly lost connectivity.
      await refreshSession().catch(() => undefined);
    },
    onError: (error) => toast.error(isApiError(error) ? error.message : t("settingsDetails.text230")),
  });

  const selectLogo = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!( ["image/jpeg", "image/png", "image/webp"] as string[]).includes(file.type) || file.size > 5 * 1024 * 1024) {
      toast.error(t("settingsDetails.text231"));
      event.currentTarget.value = "";
      return;
    }
    revokePreview(pendingLogo?.previewUrl);
    setPendingLogo({ file, altText: brand?.logoAltText ?? t("settingsDetails.gymLogo", { gym: session?.organization.name ?? t("settingsPublic.gym") }), previewUrl: previewUrl(file) });
  };

  const removeLogo = () => {
    revokePreview(pendingLogo?.previewUrl);
    setPendingLogo(undefined);
    if (logoInputRef.current) logoInputRef.current.value = "";
    setForm((current) => ({ ...current, logoAssetId: null }));
  };

  if (settingsQuery.isLoading) {
    return <SettingsSection title={t("settingsCore.text180")} description={DESCRIPTION}><Skeleton className="h-80 w-full" /></SettingsSection>;
  }
  if (settingsQuery.isError || !brand) {
    return <SettingsSection title={t("settingsCore.text180")} description={DESCRIPTION}><ErrorState layout="section" title={t("settingsDetails.text232")} onRetry={() => settingsQuery.refetch()} /></SettingsSection>;
  }

  const color = normalizeBrandHex(form.primaryColor) ?? BRAND_PALETTE_PRESETS[form.paletteKey];
  const previewTokens = deriveBrandTokens(color);
  const logo = pendingLogo ? pendingLogo.previewUrl : (form.logoAssetId === null ? undefined : brand.logoUrl);
  const logoAlt = pendingLogo?.altText || brand.logoAltText || t("settingsDetails.gymLogo", { gym: session?.organization.name ?? t("settingsPublic.gym") });
  const hexInvalid = Boolean(form.primaryColor) && !normalizeBrandHex(form.primaryColor);
  const saveDisabledReason = !isOwner
    ? t("settingsDetails.text233")
    : !dirty
      ? t("settingsDetails.text234")
      : hexInvalid
        ? t("settingsDetails.text235")
        : pendingLogo && pendingLogo.altText.trim().length < 3
          ? t("settingsDetails.text236")
          : undefined;
  const discard = () => {
    revokePreview(pendingLogo?.previewUrl);
    setPendingLogo(undefined);
    setForm(initialForm(brand));
    if (logoInputRef.current) logoInputRef.current.value = "";
  };
  return (
    <SettingsSection title={t("settingsCore.text180")} description={DESCRIPTION} testId="brand-kit-section">
      {!isOwner ? <StatePanel icon={Lock} layout="inline" title={t("settingsDetails.text237")} description={t("settingsDetails.text238")} /> : null}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px] lg:items-start">
        <SettingsPanel title={t("settingsDetails.text239")}>
          <div className="space-y-5">
            <Field label={t("settingsDetails.text240")} hint={t("settingsDetails.text241")}>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t("settingsDetails.text240")}>
                {(Object.keys(BRAND_PALETTE_PRESETS) as BrandPaletteKey[]).map((key) => (
                  <button
                    key={key}
                    type="button"
                    role="radio"
                    aria-checked={form.paletteKey === key}
                    aria-label={t("settingsDetails.paletteLabel", { palette: palettes[key] })}
                    disabled={!isOwner}
                    data-touch-target
                    onClick={() => setForm((current) => ({ ...current, paletteKey: key, primaryColor: BRAND_PALETTE_PRESETS[key] }))}
                    className={cn(
                      "inline-flex h-9 items-center gap-2 rounded-md border px-3 text-[13px] capitalize transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                      form.paletteKey === key ? "border-ink bg-sunken font-medium text-ink" : "border-line-2 text-ink-2 hover:border-line-3 hover:text-ink",
                    )}
                  >
                    <span className="size-3 rounded-full border border-black/10" style={{ backgroundColor: BRAND_PALETTE_PRESETS[key] }} aria-hidden />
                    {palettes[key]}
                  </button>
                ))}
              </div>
            </Field>
            <Field label={t("settingsDetails.text242")} hint={t("settingsDetails.text243")} error={hexInvalid ? t("settingsDetails.text244") : undefined}>
              <div className="flex gap-2">
                <Input aria-label={t("settingsDetails.text245")} type="color" className="w-14 shrink-0 p-1" value={color} disabled={!isOwner} onChange={(event) => setForm((current) => ({ ...current, primaryColor: event.target.value.toLowerCase() }))} />
                <Input aria-label={t("settingsDetails.text246")} dir="ltr" className="font-mono" value={form.primaryColor ?? ""} disabled={!isOwner} aria-invalid={hexInvalid || undefined} onChange={(event) => setForm((current) => ({ ...current, primaryColor: event.target.value }))} placeholder="#b88a2b" />
              </div>
            </Field>
            <Field label={t("settingsDetails.text247")} hint={t("settingsDetails.text248")}>
              {logo ? (
                <div className="mb-2 flex items-center gap-3 rounded-md bg-sunken p-2">
                  <span role="img" aria-label={logoAlt} className="size-12 shrink-0 rounded-sm bg-surface bg-contain bg-center bg-no-repeat" style={{ backgroundImage: `url(${logo})` }} />
                  <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-2">{pendingLogo ? pendingLogo.file.name : t("settingsDetails.text249")}</span>
                  {isOwner ? <Button type="button" size="sm" variant="secondary" onClick={removeLogo}>{t("common.action.remove")}</Button> : null}
                </div>
              ) : null}
              <div className="flex items-center gap-2"><ImagePlus className="size-4 shrink-0 text-ink-3" aria-hidden /><Input ref={logoInputRef} aria-label={t("settingsDetails.text250")} type="file" accept="image/jpeg,image/png,image/webp" disabled={!isOwner || save.isPending} onChange={selectLogo} className="py-1.5 file:me-2 file:rounded-sm file:border file:border-line file:bg-surface file:px-2 file:py-0.5 file:text-[12px]" /></div>
            </Field>
            {pendingLogo ? (
              <Field label={t("settingsDetails.text251")} hint={t("settingsDetails.text252")} required>
                <Input aria-label={t("settingsDetails.text251")} value={pendingLogo.altText} onChange={(event) => setPendingLogo((current) => current ? { ...current, altText: event.target.value } : current)} placeholder={t("settingsDetails.text253")} />
              </Field>
            ) : null}
          </div>
        </SettingsPanel>
        <SettingsPanel title={t("settingsDetails.text254")} description={t("settingsDetails.text255")}>
          <div className="rounded-md border border-line p-4" style={{ borderColor: color }}>
            <div className="flex items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-md" style={{ backgroundColor: color, color: previewTokens.primaryForeground }}>
                {logo ? <span role="img" aria-label={logoAlt} className="size-8 rounded-sm bg-contain bg-center bg-no-repeat" style={{ backgroundImage: `url(${logo})` }} /> : <span className="font-display text-sm font-semibold">{initials(session?.organization.name)}</span>}
              </span>
              <span className="min-w-0"><span className="block truncate text-[13px] font-medium">{session?.organization.name ?? t("settingsDetails.text256")}</span><span className="block text-[12px] text-ink-3">{t("settingsDetails.text257")}</span></span>
            </div>
            <button type="button" className="mt-5 inline-flex h-9 w-full items-center justify-center rounded-md px-3 text-[13.5px] font-medium" style={{ backgroundColor: color, color: previewTokens.primaryForeground }}>{t("settingsDetails.text258")}</button>
          </div>
          <p className="mt-3 text-[12px] leading-5 text-ink-3">{t("settingsDetails.text259")}</p>
        </SettingsPanel>
      </div>
      <SettingsSaveBar
        dirty={dirty}
        saving={save.isPending}
        saveDisabled={Boolean(saveDisabledReason)}
        saveDisabledReason={dirty ? saveDisabledReason : undefined}
        error={save.isError ? (isApiError(save.error) ? save.error.message : t("settingsDetails.text260")) : undefined}
        onSave={async () => { await save.mutateAsync(); }}
        onDiscard={discard}
        saveLabel={t("settingsDetails.text261")}
        guardTitle={t("settingsDetails.text262")}
      />
    </SettingsSection>
  );
}
