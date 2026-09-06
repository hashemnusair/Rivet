"use client";

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

const DESCRIPTION = "The colour and mark of this gym's own workspace. The public page keeps its separate accent.";

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
      toast.success("Brand Kit saved and audited.");
      await invalidate([qk.settings]);
      // A successful brand mutation must not be reported as failed only
      // because the follow-up shell refresh briefly lost connectivity.
      await refreshSession().catch(() => undefined);
    },
    onError: (error) => toast.error(isApiError(error) ? error.message : "The Brand Kit could not be saved."),
  });

  const selectLogo = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!( ["image/jpeg", "image/png", "image/webp"] as string[]).includes(file.type) || file.size > 5 * 1024 * 1024) {
      toast.error("Choose a JPEG, PNG, or WebP image up to 5 MB.");
      event.currentTarget.value = "";
      return;
    }
    revokePreview(pendingLogo?.previewUrl);
    setPendingLogo({ file, altText: brand?.logoAltText ?? `${session?.organization.name ?? "Gym"} logo`, previewUrl: previewUrl(file) });
  };

  const removeLogo = () => {
    revokePreview(pendingLogo?.previewUrl);
    setPendingLogo(undefined);
    if (logoInputRef.current) logoInputRef.current.value = "";
    setForm((current) => ({ ...current, logoAssetId: null }));
  };

  if (settingsQuery.isLoading) {
    return <SettingsSection title="Brand Kit" description={DESCRIPTION}><Skeleton className="h-80 w-full" /></SettingsSection>;
  }
  if (settingsQuery.isError || !brand) {
    return <SettingsSection title="Brand Kit" description={DESCRIPTION}><ErrorState layout="section" title="Brand Kit could not be loaded" onRetry={() => settingsQuery.refetch()} /></SettingsSection>;
  }

  const color = normalizeBrandHex(form.primaryColor) ?? BRAND_PALETTE_PRESETS[form.paletteKey];
  const previewTokens = deriveBrandTokens(color);
  const logo = pendingLogo ? pendingLogo.previewUrl : (form.logoAssetId === null ? undefined : brand.logoUrl);
  const logoAlt = pendingLogo?.altText || brand.logoAltText || `${session?.organization.name ?? "Gym"} logo`;
  const hexInvalid = Boolean(form.primaryColor) && !normalizeBrandHex(form.primaryColor);
  const saveDisabledReason = !isOwner
    ? "Only the organization owner can save Brand Kit changes."
    : !dirty
      ? "Change a palette, color, or logo to enable saving."
      : hexInvalid
        ? "Use a six-digit hex color before saving."
        : pendingLogo && pendingLogo.altText.trim().length < 3
          ? "Add at least three characters of alt text for the logo."
          : undefined;
  const discard = () => {
    revokePreview(pendingLogo?.previewUrl);
    setPendingLogo(undefined);
    setForm(initialForm(brand));
    if (logoInputRef.current) logoInputRef.current.value = "";
  };
  return (
    <SettingsSection title="Brand Kit" description={DESCRIPTION} testId="brand-kit-section">
      {!isOwner ? <StatePanel icon={Lock} layout="inline" title="Owner only" description="Only the organization owner can save Brand Kit changes. You can review the current palette and logo here." /> : null}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px] lg:items-start">
        <SettingsPanel title="Palette and logo">
          <div className="space-y-5">
            <Field label="Workspace palette" hint="Choose a constrained palette; RIVET derives readable text and hover tones from it.">
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Workspace palette">
                {(Object.keys(BRAND_PALETTE_PRESETS) as BrandPaletteKey[]).map((key) => (
                  <button
                    key={key}
                    type="button"
                    role="radio"
                    aria-checked={form.paletteKey === key}
                    aria-label={`${key} palette`}
                    disabled={!isOwner}
                    data-touch-target
                    onClick={() => setForm((current) => ({ ...current, paletteKey: key, primaryColor: BRAND_PALETTE_PRESETS[key] }))}
                    className={cn(
                      "inline-flex h-9 items-center gap-2 rounded-md border px-3 text-[13px] capitalize transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                      form.paletteKey === key ? "border-ink bg-sunken font-medium text-ink" : "border-line-2 text-ink-2 hover:border-line-3 hover:text-ink",
                    )}
                  >
                    <span className="size-3 rounded-full border border-black/10" style={{ backgroundColor: BRAND_PALETTE_PRESETS[key] }} aria-hidden />
                    {key}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Primary color" hint="Six-digit hex, for example #b88a2b." error={hexInvalid ? "Use a six-digit hex color such as #b88a2b." : undefined}>
              <div className="flex gap-2">
                <Input aria-label="Primary color picker" type="color" className="w-14 shrink-0 p-1" value={color} disabled={!isOwner} onChange={(event) => setForm((current) => ({ ...current, primaryColor: event.target.value.toLowerCase() }))} />
                <Input aria-label="Primary color hex" dir="ltr" className="font-mono" value={form.primaryColor ?? ""} disabled={!isOwner} aria-invalid={hexInvalid || undefined} onChange={(event) => setForm((current) => ({ ...current, primaryColor: event.target.value }))} placeholder="#b88a2b" />
              </div>
            </Field>
            <Field label="Workspace logo" hint="JPEG, PNG or WebP up to 5 MB. The same sanitized asset is reused for the public page.">
              {logo ? (
                <div className="mb-2 flex items-center gap-3 rounded-md bg-sunken p-2">
                  <span role="img" aria-label={logoAlt} className="size-12 shrink-0 rounded-sm bg-surface bg-contain bg-center bg-no-repeat" style={{ backgroundImage: `url(${logo})` }} />
                  <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-2">{pendingLogo ? pendingLogo.file.name : "Current logo"}</span>
                  {isOwner ? <Button type="button" size="sm" variant="secondary" onClick={removeLogo}>Remove</Button> : null}
                </div>
              ) : null}
              <div className="flex items-center gap-2"><ImagePlus className="size-4 shrink-0 text-ink-3" aria-hidden /><Input ref={logoInputRef} aria-label="Upload workspace logo" type="file" accept="image/jpeg,image/png,image/webp" disabled={!isOwner || save.isPending} onChange={selectLogo} className="py-1.5 file:me-2 file:rounded-sm file:border file:border-line file:bg-surface file:px-2 file:py-0.5 file:text-[12px]" /></div>
            </Field>
            {pendingLogo ? (
              <Field label="Logo description" hint="Read aloud by screen readers wherever the logo appears." required>
                <Input aria-label="Workspace logo alt text" value={pendingLogo.altText} onChange={(event) => setPendingLogo((current) => current ? { ...current, altText: event.target.value } : current)} placeholder="Forge Fitness Club logo" />
              </Field>
            ) : null}
          </div>
        </SettingsPanel>
        <SettingsPanel title="Preview" description="How the sidebar and the primary action read with these choices.">
          <div className="rounded-md border border-line p-4" style={{ borderColor: color }}>
            <div className="flex items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-md" style={{ backgroundColor: color, color: previewTokens.primaryForeground }}>
                {logo ? <span role="img" aria-label={logoAlt} className="size-8 rounded-sm bg-contain bg-center bg-no-repeat" style={{ backgroundImage: `url(${logo})` }} /> : <span className="font-display text-sm font-semibold">{initials(session?.organization.name)}</span>}
              </span>
              <span className="min-w-0"><span className="block truncate text-[13px] font-medium">{session?.organization.name ?? "Your gym"}</span><span className="block text-[12px] text-ink-3">Staff workspace</span></span>
            </div>
            <button type="button" className="mt-5 inline-flex h-9 w-full items-center justify-center rounded-md px-3 text-[13.5px] font-medium" style={{ backgroundColor: color, color: previewTokens.primaryForeground }}>Primary action</button>
          </div>
          <p className="mt-3 text-[12px] leading-5 text-ink-3">Palette version {brand.version}. Changes affect the gym workspace only.</p>
        </SettingsPanel>
      </div>
      <SettingsSaveBar
        dirty={dirty}
        saving={save.isPending}
        saveDisabled={Boolean(saveDisabledReason)}
        saveDisabledReason={dirty ? saveDisabledReason : undefined}
        error={save.isError ? (isApiError(save.error) ? save.error.message : "The Brand Kit could not be saved. Try again.") : undefined}
        onSave={async () => { await save.mutateAsync(); }}
        onDiscard={discard}
        saveLabel="Save Brand Kit"
        guardTitle="Unsaved Brand Kit changes"
      />
    </SettingsSection>
  );
}
