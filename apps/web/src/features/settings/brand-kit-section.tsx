"use client";

import { ImagePlus, Palette } from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/misc";
import { ErrorState } from "@/components/ui/states";
import { qk } from "@/lib/api/keys";
import { isApiError } from "@/lib/api/errors";
import { BRAND_PALETTE_PRESETS, deriveBrandTokens, normalizeBrandHex, type BrandPaletteKey } from "@/lib/domain/brand";
import type { BrandKit, OrganizationSettings, UpdateBrandKitInput } from "@/lib/domain/types";
import { useApiMutation, useApiQuery, useInvalidate } from "@/lib/hooks/use-api";
import { useApp } from "@/lib/providers/app-providers";
import { SettingsSaveBar } from "@/features/settings/settings-layout";

type PendingLogo = { file: File; altText: string; previewUrl: string };

function previewUrl(file: File): string {
  return typeof URL !== "undefined" && typeof URL.createObjectURL === "function" ? URL.createObjectURL(file) : "";
}

function revokePreview(url?: string) {
  if (url?.startsWith("blob:") && typeof URL !== "undefined") URL.revokeObjectURL(url);
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

  if (settingsQuery.isLoading) return <Skeleton className="h-80 w-full" />;
  if (settingsQuery.isError || !brand) return <ErrorState title="Brand Kit could not be loaded" onRetry={() => settingsQuery.refetch()} />;

  const color = normalizeBrandHex(form.primaryColor) ?? BRAND_PALETTE_PRESETS[form.paletteKey];
  const previewTokens = deriveBrandTokens(color);
  const logo = pendingLogo ? pendingLogo.previewUrl : (form.logoAssetId === null ? undefined : brand.logoUrl);
  const saveDisabledReason = !isOwner
    ? "Only the organization owner can save Brand Kit changes."
    : !dirty
      ? "Change a palette, color, or logo to enable saving."
      : form.primaryColor && !normalizeBrandHex(form.primaryColor)
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
    <div className="max-w-3xl pb-4">
    <section className="panel p-5" data-testid="brand-kit-section">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 rounded-md bg-sunken p-2"><Palette className="size-4 text-ink-2" aria-hidden /></span>
        <div>
          <h2 className="font-display text-[15px] font-semibold">Brand Kit</h2>
          <p className="mt-1 text-[12.5px] text-ink-3">Customize the authenticated gym workspace. Public profile colors remain separate.</p>
        </div>
      </div>
      <div className="mt-5 grid gap-5 sm:grid-cols-[minmax(0,1fr)_220px]">
        <div className="space-y-4">
          <Field label="Workspace palette" hint="Choose a constrained palette; the system derives accessible foreground and hover tokens.">
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Workspace palette">
              {(Object.keys(BRAND_PALETTE_PRESETS) as BrandPaletteKey[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={form.paletteKey === key}
                  aria-label={`${key} palette`}
                  disabled={!isOwner}
                  onClick={() => setForm((current) => ({ ...current, paletteKey: key, primaryColor: BRAND_PALETTE_PRESETS[key] }))}
                  className={`inline-flex items-center gap-2 rounded-md border px-2.5 py-2 text-[12px] capitalize transition-colors ${form.paletteKey === key ? "border-ink bg-sunken font-medium" : "border-line hover:border-line-3"}`}
                >
                  <span className="size-3 rounded-full border border-black/10" style={{ backgroundColor: BRAND_PALETTE_PRESETS[key] }} aria-hidden />
                  {key}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Primary color" hint="Use six-digit hex only. Derived tokens are computed on the server.">
            <div className="flex gap-2">
              <Input aria-label="Primary color picker" type="color" className="w-14 p-1" value={color} disabled={!isOwner} onChange={(event) => setForm((current) => ({ ...current, primaryColor: event.target.value.toLowerCase() }))} />
              <Input aria-label="Primary color hex" dir="ltr" value={form.primaryColor ?? ""} disabled={!isOwner} onChange={(event) => setForm((current) => ({ ...current, primaryColor: event.target.value }))} placeholder="#b88a2b" />
            </div>
            {form.primaryColor && !normalizeBrandHex(form.primaryColor) ? <p className="mt-1 text-[11px] text-danger">Use a six-digit hex color such as #b88a2b.</p> : null}
          </Field>
          <Field label="Workspace logo" hint="Reuses the sanitized public gym logo asset. A descriptive alt text is required.">
            {logo ? <div className="mb-2 flex items-center gap-3 rounded-md border border-line bg-sunken p-2"><span role="img" aria-label={pendingLogo?.altText || brand.logoAltText || `${session?.organization.name ?? "Gym"} logo`} className="size-12 rounded-sm bg-cover bg-center" style={{ backgroundImage: `url(${logo})` }} /><span className="min-w-0 flex-1 truncate text-[12px] text-ink-2">{pendingLogo ? pendingLogo.file.name : "Current logo"}</span>{isOwner ? <Button type="button" size="xs" variant="secondary" onClick={removeLogo}>Remove</Button> : null}</div> : null}
            <div className="flex items-center gap-2"><ImagePlus className="size-4 text-ink-3" aria-hidden /><Input ref={logoInputRef} aria-label="Upload workspace logo" type="file" accept="image/jpeg,image/png,image/webp" disabled={!isOwner || save.isPending} onChange={selectLogo} /></div>
            {pendingLogo ? <Input aria-label="Workspace logo alt text" className="mt-2" value={pendingLogo.altText} onChange={(event) => setPendingLogo((current) => current ? { ...current, altText: event.target.value } : current)} placeholder="Accessible image description" /> : null}
          </Field>
        </div>
        <div className="rounded-lg border border-line bg-surface p-4" style={{ borderColor: color }}>
          <p className="context-label">Preview</p>
          <div className="mt-3 flex items-center gap-3"><span className="flex size-10 items-center justify-center rounded-md" style={{ backgroundColor: color, color: previewTokens.primaryForeground }}>{logo ? <span role="img" aria-label={pendingLogo?.altText || brand.logoAltText || `${session?.organization.name ?? "Gym"} logo`} className="size-8 rounded-sm bg-contain bg-center bg-no-repeat" style={{ backgroundImage: `url(${logo})` }} /> : <span className="font-display text-sm font-semibold">{session?.organization.name?.slice(0, 2).toUpperCase() ?? "RV"}</span>}</span><span className="min-w-0"><span className="block truncate text-[12.5px] font-medium">{session?.organization.name ?? "Your gym"}</span><span className="block text-[12px] text-ink-3">Staff workspace</span></span></div>
          <button type="button" className="mt-5 inline-flex w-full items-center justify-center rounded-md px-3 py-2 text-[12px] font-medium" style={{ backgroundColor: color, color: previewTokens.primaryForeground }}>Primary action</button>
          <p className="mt-3 text-[12px] text-ink-3">Palette v{brand.version}. Changes affect the gym shell only.</p>
        </div>
      </div>
      {!isOwner ? <p className="mt-4 rounded-md border border-warning/30 bg-warning-bg px-3 py-2 text-[11.5px] text-warning-deep" role="status">Only the organization owner can save Brand Kit changes.</p> : null}
      {save.isError ? <p className="mt-4 rounded-md border border-danger/30 bg-danger-bg px-3 py-2 text-[11.5px] text-danger" role="alert">{isApiError(save.error) ? save.error.message : "The Brand Kit could not be saved. Try again."}</p> : null}
    </section>
    <SettingsSaveBar dirty={dirty} saving={save.isPending} saveDisabled={Boolean(saveDisabledReason)} saveDisabledReason={dirty ? saveDisabledReason : undefined} onSave={async () => { await save.mutateAsync(); }} onDiscard={discard} saveLabel="Save Brand Kit" />
    </div>
  );
}
