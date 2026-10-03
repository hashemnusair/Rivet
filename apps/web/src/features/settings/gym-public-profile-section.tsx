"use client";
import { useLocale, useT } from "@/lib/i18n/provider";

import { ArrowDown, ArrowUp, Send, X } from "lucide-react";
import { useEffect, useId, useState, type ChangeEvent } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/misc";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ErrorState } from "@/components/ui/states";
import { qk } from "@/lib/api/keys";
import { isApiError } from "@/lib/api/errors";
import type { GymPublicProfile, MediaAsset, MediaAssetOwnerType, UpdateGymPublicProfileInput } from "@/lib/domain/types";
import { useApiMutation, useApiQuery, useInvalidate } from "@/lib/hooks/use-api";
import { useRealtimeApiQuery } from "@/lib/hooks/use-realtime-api";
import { useApp } from "@/lib/providers/app-providers";
import { cn } from "@/lib/utils/cn";
import { useFormat } from "@/lib/i18n/format";
import { latinDigits } from "@/lib/utils/text";
import { publicProfileLabel } from "@/lib/i18n/public-profile";
import { SettingsPanel, SettingsSaveBar, SettingsSection } from "@/features/settings/settings-layout";

const PROFILE_CATEGORIES = ["Gym", "Strength & conditioning", "Women-only fitness", "Combat sports", "Wellness studio"] as const;
const PROFILE_AUDIENCES = ["All members", "Women", "Men", "Families", "Students"] as const;
const AMENITY_CHOICES = ["Free weights", "Cardio", "Showers", "Parking", "Group studio", "Personal training"] as const;


const emptyForm: UpdateGymPublicProfileInput = {
  shortName: "",
  taglineEn: "",
  taglineAr: "",
  descriptionEn: "",
  descriptionAr: "",
  category: "Gym",
  audience: "All members",
  amenities: [],
  contactEmail: "",
  contactPhone: "",
  websiteUrl: "",
  instagramUrl: "",
  accentColor: "#15140f",
  galleryAssetIds: [],
};

type MediaDraftKind = "logo" | "cover" | "gallery";

type PendingMedia = {
  file: File;
  altText: string;
  previewUrl: string;
};

type PendingMediaState = {
  logo?: PendingMedia;
  cover?: PendingMedia;
  gallery: PendingMedia[];
};

function emptyPendingMedia(): PendingMediaState {
  return { gallery: [] };
}

function formFromProfile(profile: GymPublicProfile): UpdateGymPublicProfileInput {
  return {
    shortName: profile.shortName,
    taglineEn: profile.taglineEn,
    taglineAr: profile.taglineAr ?? "",
    descriptionEn: profile.descriptionEn,
    descriptionAr: profile.descriptionAr ?? "",
    category: profile.category,
    audience: profile.audience,
    amenities: [...profile.amenities],
    contactEmail: profile.contactEmail ?? "",
    contactPhone: profile.contactPhone ?? "",
    websiteUrl: profile.websiteUrl ?? "",
    instagramUrl: profile.instagramUrl ?? "",
    accentColor: profile.accentColor,
    logoAssetId: profile.logo?.id,
    coverAssetId: profile.cover?.id,
    galleryAssetIds: profile.gallery.map((asset) => asset.id),
  };
}

function createLocalMediaPreview(file: File): string {
  return typeof URL !== "undefined" && typeof URL.createObjectURL === "function" ? URL.createObjectURL(file) : "";
}

function revokeLocalMediaPreview(previewUrl?: string) {
  if (previewUrl?.startsWith("blob:") && typeof URL !== "undefined" && typeof URL.revokeObjectURL === "function") URL.revokeObjectURL(previewUrl);
}

function revokePendingMedia(pending: PendingMediaState) {
  [pending.logo, pending.cover, ...pending.gallery].forEach((item) => revokeLocalMediaPreview(item?.previewUrl));
}

function profileSnapshot(form: UpdateGymPublicProfileInput, amenities: string): string {
  return JSON.stringify({ ...form, amenities });
}

function splitAmenities(value: string): string[] {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}


export function GymPublicProfileSection() {
  const { t, locale } = useLocale();
  const f = useFormat();
  const PROFILE_STATUS: Record<string, { label: string; variant: "success" | "warning" | "neutral" }> = {
  published: { label: t("settingsPublic.text002"), variant: "success" },
  draft: { label: t("settingsDetails.text125"), variant: "warning" },
  unpublished: { label: t("settingsPublic.text003"), variant: "neutral" },
};

  const DESCRIPTION = t("settingsPublic.text001");

  const invalidate = useInvalidate();
  const { session } = useApp();
  const profile = useRealtimeApiQuery({ queryKey: qk.gymProfile, query: (api) => api.getGymPublicProfile(), subscribe: (api, onValue, onError) => api.subscribeGymPublicProfile(onValue, onError) });
  const versions = useApiQuery(qk.gymProfileVersions, (api) => api.listGymProfileVersions());
  const [form, setForm] = useState<UpdateGymPublicProfileInput>(emptyForm);
  const [amenities, setAmenities] = useState("");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewMessage, setReviewMessage] = useState("");
  const [uploadedAssets, setUploadedAssets] = useState<Record<string, MediaAsset>>({});
  const [pendingMedia, setPendingMedia] = useState<PendingMediaState>(() => emptyPendingMedia());
  const [baseline, setBaseline] = useState<string>();

  // Incoming realtime snapshots must not overwrite an editor with local work.
  useEffect(() => {
    if (!profile.data) return;
    if (baseline && profileSnapshot(form, amenities) !== baseline) return;
    const nextForm = formFromProfile(profile.data);
    const nextAmenities = profile.data.amenities.join(", ");
    setForm(nextForm);
    setAmenities(nextAmenities);
    setBaseline(profileSnapshot(nextForm, nextAmenities));
  // The form snapshot is intentionally read only when the remote profile changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.data]);

  const pendingMediaCount = (pendingMedia.logo ? 1 : 0) + (pendingMedia.cover ? 1 : 0) + pendingMedia.gallery.length;
  const pendingMediaReady = [pendingMedia.logo, pendingMedia.cover, ...pendingMedia.gallery].every((item) => !item || item.altText.trim().length >= 3);
  const dirty = baseline !== undefined && (profileSnapshot(form, amenities) !== baseline || pendingMediaCount > 0);
  const save = useApiMutation(async (api) => {
    const uploadedIds: string[] = [];
    const nextForm: UpdateGymPublicProfileInput = { ...form, galleryAssetIds: [...form.galleryAssetIds] };
    const uploadPending = async (draft: PendingMedia | undefined, ownerType: MediaAssetOwnerType) => {
      if (!draft) return undefined;
      const asset = await api.uploadMediaAsset({ ownerType, ownerId: profile.data?.organizationId ?? "", file: draft.file, altText: draft.altText.trim() });
      uploadedIds.push(asset.id);
      return asset;
    };
    try {
      const logo = await uploadPending(pendingMedia.logo, "gym_logo");
      const cover = await uploadPending(pendingMedia.cover, "gym_cover");
      if (logo) nextForm.logoAssetId = logo.id;
      if (cover) nextForm.coverAssetId = cover.id;
      for (const draft of pendingMedia.gallery) {
        const asset = await uploadPending(draft, "gym_gallery");
        if (asset) nextForm.galleryAssetIds.push(asset.id);
      }
      const saved = await api.saveGymPublicProfile({ ...nextForm, amenities: splitAmenities(amenities) });
      return { saved, nextForm };
    } catch (error) {
      await Promise.allSettled(uploadedIds.map((assetId) => api.discardDraftMediaAsset(assetId)));
      throw error;
    }
  }, { onSuccess: async ({ saved, nextForm }) => {
    revokePendingMedia(pendingMedia);
    setPendingMedia(emptyPendingMedia());
    setForm(nextForm);
    const nextUploadedAssets: Record<string, MediaAsset> = {};
    [saved.logo, saved.cover, ...saved.gallery].forEach((asset) => { if (asset) nextUploadedAssets[asset.id] = asset; });
    setUploadedAssets(nextUploadedAssets);
    setBaseline(profileSnapshot(nextForm, amenities));
    toast.success(t("settingsPublic.text004"));
    await invalidate([qk.gymProfile]);
  } });
  const publish = useApiMutation((api) => api.publishGymPublicProfile(), { onSuccess: async () => { toast.success(t("settingsPublic.text005")); await invalidate([qk.gymProfile]); } });
  const requestReview = useApiMutation((api) => api.createSupportCase({
    email: session?.user.email ?? "",
    subject: t("settingsPublic.reviewSubject", { version: profile.data?.version ?? "" }),
    body: `${reviewMessage.trim() ? `${reviewMessage.trim()}\n\n` : ""}${t("settingsPublic.reviewBody", { version: profile.data?.version ?? "?" })}`,
    priority: "normal",
    requestType: "general",
  }), {
    onSuccess: async () => {
      setReviewOpen(false);
      setReviewMessage("");
      toast.success(t("settingsPublic.text006"));
    },
  });
  const prepareMedia = (kind: MediaDraftKind, file: File, altText: string) => {
    const draft = { file, altText, previewUrl: createLocalMediaPreview(file) } satisfies PendingMedia;
    setPendingMedia((current) => {
      if (kind === "gallery") return { ...current, gallery: [...current.gallery, draft] };
      revokeLocalMediaPreview(current[kind]?.previewUrl);
      return { ...current, [kind]: draft };
    });
  };
  const updatePendingAltText = (kind: MediaDraftKind, altText: string) => {
    setPendingMedia((current) => {
      if (kind === "gallery") {
        if (!current.gallery.length) return current;
        const gallery = [...current.gallery];
        gallery[gallery.length - 1] = { ...gallery[gallery.length - 1]!, altText };
        return { ...current, gallery };
      }
      const draft = current[kind];
      return draft ? { ...current, [kind]: { ...draft, altText } } : current;
    });
  };
  const removePendingGallery = (index: number) => {
    const draft = pendingMedia.gallery[index];
    revokeLocalMediaPreview(draft?.previewUrl);
    setPendingMedia((current) => ({ ...current, gallery: current.gallery.filter((_, itemIndex) => itemIndex !== index) }));
  };
  const removeAsset = (kind: MediaDraftKind, assetId?: string) => {
    if (kind === "logo" || kind === "cover") {
      revokeLocalMediaPreview(pendingMedia[kind]?.previewUrl);
      setPendingMedia((current) => ({ ...current, [kind]: undefined }));
    }
    setForm((current) => kind === "logo"
      ? { ...current, logoAssetId: undefined }
      : kind === "cover"
        ? { ...current, coverAssetId: undefined }
        : { ...current, galleryAssetIds: current.galleryAssetIds.filter((id) => id !== assetId) });
  };
  const discardChanges = () => {
    if (!profile.data) return;
    revokePendingMedia(pendingMedia);
    const nextForm = formFromProfile(profile.data);
    const nextAmenities = profile.data.amenities.join(", ");
    setPendingMedia(emptyPendingMedia());
    setForm(nextForm);
    setAmenities(nextAmenities);
    setUploadedAssets({});
    setBaseline(profileSnapshot(nextForm, nextAmenities));
    toast.success(t("settingsPublic.text007"));
  };

  if (profile.isLoading) return <SettingsSection title={t("settingsCore.text181")} description={DESCRIPTION}><Skeleton className="h-[620px] w-full" /></SettingsSection>;
  if (profile.isError) return <SettingsSection title={t("settingsCore.text181")} description={DESCRIPTION}><ErrorState layout="section" title={t("settingsPublic.text008")} onRetry={() => profile.refetch()} /></SettingsSection>;
  const value = profile.data!;
  const status = PROFILE_STATUS[value.status] ?? { label: value.status, variant: "neutral" as const };
  const currentLogo = form.logoAssetId ? uploadedAssets[form.logoAssetId] ?? value.logo : undefined;
  const currentCover = form.coverAssetId ? uploadedAssets[form.coverAssetId] ?? value.cover : undefined;
  const logoPreviewUrl = pendingMedia.logo ? pendingMedia.logo.previewUrl : currentLogo?.url;
  const coverPreviewUrl = pendingMedia.cover ? pendingMedia.cover.previewUrl : currentCover?.url;
  const selectedAmenities = splitAmenities(amenities);
  const missingRequired = !form.shortName.trim() ? t("settingsPublic.text009") : !form.taglineEn.trim() ? t("settingsPublic.text010") : !form.descriptionEn.trim() ? t("settingsPublic.text011") : undefined;
  const saveDisabledReason = !pendingMediaReady ? t("settingsPublic.text012") : missingRequired;
  const publishBlocked = dirty ? t("settingsPublic.text013") : value.status !== "draft" ? t("settingsPublic.text014") : undefined;
  const publishAction = value.publishLocked
    ? <Button disabled={Boolean(publishBlocked) || save.isPending} title={publishBlocked} onClick={() => setReviewOpen(true)}><Send /> {" "}{t("settingsPublic.text015")}</Button>
    : <Button loading={publish.isPending} disabled={Boolean(publishBlocked) || save.isPending} title={publishBlocked} onClick={() => publish.mutate()}><Send /> {" "}{t("settingsPublic.text016")}</Button>;

  return (
    <SettingsSection
      title={t("settingsCore.text181")}
      description={DESCRIPTION}
      actions={<><Badge variant={status.variant} dot>{status.label} {" "}{t("settingsPublic.text017")}{" "}{value.version}</Badge>{publishAction}</>}
    >
      {value.publishLocked ? (
        <p className="text-[12.5px] leading-5 text-ink-2">{t("settingsPublic.text018")}</p>
      ) : null}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,.8fr)] xl:items-start">
        <div className="space-y-4">
          <SettingsPanel title={t("settingsPublic.text019")} description={t("settingsPublic.text020")}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("settingsPublic.text021")} required hint={t("settingsPublic.text022")}><Input value={form.shortName} maxLength={24} onChange={(event) => setForm((current) => ({ ...current, shortName: event.target.value }))} /></Field>
              <Field label={t("settingsPublic.text023")}>
                <Select value={form.category} onValueChange={(category) => setForm((current) => ({ ...current, category }))}>
                  <SelectTrigger aria-label={t("settingsPublic.text023")}><SelectValue /></SelectTrigger>
                  <SelectContent>{PROFILE_CATEGORIES.map((category) => <SelectItem key={category} value={category}>{publicProfileLabel(t, category)}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label={t("settingsPublic.text024")} required><Input data-profile-field="taglineEn" dir="ltr" lang="en" value={form.taglineEn} maxLength={180} onChange={(event) => setForm((current) => ({ ...current, taglineEn: event.target.value }))} /></Field>
              <Field label={t("settingsPublic.text025")}><Input data-profile-field="taglineAr" dir="rtl" lang="ar" value={form.taglineAr} maxLength={180} onChange={(event) => setForm((current) => ({ ...current, taglineAr: event.target.value }))} /></Field>
              <Field label={t("settingsPublic.text026")} required><Textarea data-profile-field="descriptionEn" dir="ltr" lang="en" className="min-h-32" maxLength={2000} value={form.descriptionEn} onChange={(event) => setForm((current) => ({ ...current, descriptionEn: event.target.value }))} /></Field>
              <Field label={t("settingsPublic.text027")}><Textarea data-profile-field="descriptionAr" dir="rtl" lang="ar" className="min-h-32" maxLength={2000} value={form.descriptionAr} onChange={(event) => setForm((current) => ({ ...current, descriptionAr: event.target.value }))} /></Field>
              <Field label={t("settingsPublic.text028")}>
                <Select value={form.audience} onValueChange={(audience) => setForm((current) => ({ ...current, audience }))}>
                  <SelectTrigger aria-label={t("settingsPublic.text028")}><SelectValue /></SelectTrigger>
                  <SelectContent>{PROFILE_AUDIENCES.map((audience) => <SelectItem key={audience} value={audience}>{publicProfileLabel(t, audience)}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label={t("settingsPublic.text029")} hint={t("settingsPublic.text030")}>
                <div className="flex flex-wrap gap-2" role="group" aria-label={t("settingsPublic.text029")}>
                  {AMENITY_CHOICES.map((amenity) => {
                    const selected = selectedAmenities.includes(amenity);
                    return (
                      <Button
                        key={amenity}
                        type="button"
                        size="sm"
                        variant={selected ? "primary" : "secondary"}
                        aria-pressed={selected}
                        data-touch-target
                        onClick={() => setAmenities((current) => { const choices = new Set(splitAmenities(current)); if (choices.has(amenity)) choices.delete(amenity); else choices.add(amenity); return [...choices].join(", "); })}
                      >
                        {publicProfileLabel(t, amenity)}
                      </Button>
                    );
                  })}
                </div>
              </Field>
              <Field label={t("settingsPublic.text031")}><Input type="email" inputMode="email" dir="ltr" value={form.contactEmail} onChange={(event) => setForm((current) => ({ ...current, contactEmail: event.target.value }))} /></Field>
              <Field label={t("settingsPublic.text032")}><Input dir="ltr" type="tel" inputMode="tel" value={form.contactPhone} onChange={(event) => setForm((current) => ({ ...current, contactPhone: latinDigits(event.target.value) }))} /></Field>
              <Field label={t("settingsPublic.text033")}><Input type="url" inputMode="url" dir="ltr" value={form.websiteUrl} onChange={(event) => setForm((current) => ({ ...current, websiteUrl: event.target.value }))} placeholder="https://" /></Field>
              <Field label={t("domain.leadSource.instagram")}><Input type="url" inputMode="url" dir="ltr" value={form.instagramUrl} onChange={(event) => setForm((current) => ({ ...current, instagramUrl: event.target.value }))} placeholder="https://instagram.com/" /></Field>
              <Field label={t("settingsPublic.text034")} hint={t("settingsPublic.text035")}><div className="flex gap-2"><Input type="color" aria-label={t("settingsPublic.text036")} className="w-14 shrink-0 p-1" value={form.accentColor} onChange={(event) => setForm((current) => ({ ...current, accentColor: event.target.value }))} /><Input aria-label={t("settingsPublic.text037")} dir="ltr" className="font-mono" value={form.accentColor} onChange={(event) => setForm((current) => ({ ...current, accentColor: event.target.value }))} /></div></Field>
            </div>
          </SettingsPanel>

          <SettingsPanel title={t("settingsPublic.text038")} description={t("settingsPublic.text039")}>
            <div className="grid gap-4 sm:grid-cols-2">
              <MediaUploadField label={t("settingsDetails.text247")} current={currentLogo} draft={pendingMedia.logo} loading={save.isPending} onRemove={currentLogo || pendingMedia.logo ? () => removeAsset("logo", form.logoAssetId) : undefined} onSelect={(file, altText) => prepareMedia("logo", file, altText)} onAltTextChange={(altText) => updatePendingAltText("logo", altText)} />
              <MediaUploadField label={t("settingsPublic.text040")} current={currentCover} draft={pendingMedia.cover} loading={save.isPending} onRemove={currentCover || pendingMedia.cover ? () => removeAsset("cover", form.coverAssetId) : undefined} onSelect={(file, altText) => prepareMedia("cover", file, altText)} onAltTextChange={(altText) => updatePendingAltText("cover", altText)} />
            </div>
            <div className="mt-5 border-t border-line pt-4">
              <p className="text-[13.5px] font-medium text-ink">{t("settingsPublic.text041")}</p>
              <p className="mt-0.5 text-[12px] leading-5 text-ink-3">{t("settingsPublic.text042")}</p>
              {form.galleryAssetIds.length || pendingMedia.gallery.length ? (
                <ol className="mt-3 divide-y divide-line">
                  {form.galleryAssetIds.map((assetId, index) => {
                    const asset = uploadedAssets[assetId] ?? value.gallery.find((item) => item.id === assetId);
                    return (
                      <li key={assetId} className="flex items-center gap-3 py-2">
                        <span className="size-12 shrink-0 rounded-sm bg-sunken bg-cover bg-center" role="img" aria-label={asset?.altText ?? t("settingsPublic.galleryImage", { number: index + 1 })} style={{ backgroundImage: asset?.url ? `url(${asset.url})` : undefined }} />
                        <span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-medium">{t("settingsPublic.imageNumber", { number: index + 1 })}</span><span className="block truncate text-[12px] text-ink-3">{asset?.altText ?? t("settingsPublic.text043")}</span></span>
                        <Button type="button" size="icon" variant="ghost" aria-label={t("settingsPublic.imageUp", { number: index + 1 })} disabled={index === 0} onClick={() => setForm((current) => { const ids = [...current.galleryAssetIds]; [ids[index - 1], ids[index]] = [ids[index]!, ids[index - 1]!]; return { ...current, galleryAssetIds: ids }; })}><ArrowUp /></Button>
                        <Button type="button" size="icon" variant="ghost" aria-label={t("settingsPublic.imageDown", { number: index + 1 })} disabled={index === form.galleryAssetIds.length - 1} onClick={() => setForm((current) => { const ids = [...current.galleryAssetIds]; [ids[index], ids[index + 1]] = [ids[index + 1]!, ids[index]!]; return { ...current, galleryAssetIds: ids }; })}><ArrowDown /></Button>
                        <Button type="button" size="icon" variant="ghost" aria-label={t("settingsPublic.imageRemove", { number: index + 1 })} onClick={() => removeAsset("gallery", assetId)}><X /></Button>
                      </li>
                    );
                  })}
                  {pendingMedia.gallery.map((draft, index) => (
                    <li key={`${draft.file.name}-${index}`} className="flex items-center gap-3 py-2">
                      <span className="size-12 shrink-0 rounded-sm border border-dashed border-line-2 bg-sunken bg-cover bg-center" role="img" aria-label={draft.altText || t("settingsPublic.newGalleryImage", { number: index + 1 })} style={{ backgroundImage: draft.previewUrl ? `url(${draft.previewUrl})` : undefined }} />
                      <span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-medium">{t("settingsPublic.newImageNumber", { number: index + 1 })}</span><span className={cn("block truncate text-[12px]", draft.altText.trim().length >= 3 ? "text-ink-3" : "text-danger")}>{draft.altText.trim().length >= 3 ? t("settingsPublic.text044") : t("settingsPublic.text045")}</span></span>
                      <Button type="button" size="icon" variant="ghost" aria-label={t("settingsPublic.newImageRemove", { number: index + 1 })} onClick={() => removePendingGallery(index)}><X /></Button>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="mt-3 text-[12.5px] text-ink-3">{t("settingsPublic.text046")}</p>
              )}
              <div className="mt-3">
                <MediaUploadField label={t("settingsPublic.text047")} draft={pendingMedia.gallery.at(-1)} loading={save.isPending} onSelect={(file, altText) => prepareMedia("gallery", file, altText)} onAltTextChange={(altText) => updatePendingAltText("gallery", altText)} onRemove={pendingMedia.gallery.length ? () => removePendingGallery(pendingMedia.gallery.length - 1) : undefined} />
              </div>
            </div>
          </SettingsPanel>
        </div>

        <div className="space-y-4">
          <SettingsPanel title={t("settingsDetails.text254")} description={t("settingsPublic.text048")} bodyClassName="p-0">
            <div className="h-28 bg-cover bg-center" style={{ backgroundColor: form.accentColor, backgroundImage: coverPreviewUrl ? `url(${coverPreviewUrl})` : undefined }} />
            <div className="p-4 sm:p-5">
              <div className="flex items-center gap-3">
                <span className="size-12 shrink-0 rounded-full border border-line bg-cover bg-center" role="img" aria-label={pendingMedia.logo || form.logoAssetId ? t("settingsPublic.text049") : t("settingsPublic.text050")} style={{ backgroundColor: form.accentColor, backgroundImage: logoPreviewUrl ? `url(${logoPreviewUrl})` : undefined }} />
                <div className="min-w-0">
                  <p className="text-[12px] font-medium text-ink-3">{publicProfileLabel(t, form.category || "Gym")} · {publicProfileLabel(t, form.audience || "All members")}</p>
                  <p className="mt-0.5 truncate font-display text-[22px] font-semibold leading-tight tracking-tight">{form.shortName || t("settingsCore.text009")}</p>
                </div>
              </div>
              <p className="mt-3 text-[13px] leading-relaxed text-ink-2">{(locale === "ar" && form.taglineAr ? form.taglineAr : form.taglineEn) || t("settingsPublic.text051")}</p>
              {selectedAmenities.length ? <div className="mt-3 flex flex-wrap gap-1.5">{selectedAmenities.map((item) => <Badge key={item} variant="outline">{publicProfileLabel(t, item)}</Badge>)}</div> : null}
              <p className="mt-4 border-t border-line pt-3 text-[12px] text-ink-3">{pendingMedia.logo || pendingMedia.cover ? t("settingsPublic.text052") : `${t("settingsPublic.trainerCount", { count: value.trainers.length })} · ${t("settingsPublic.packageCount", { count: value.ptPackages.length })}`}</p>
            </div>
          </SettingsPanel>

          <SettingsPanel title={t("settingsPublic.text053")} description={t("settingsPublic.text054")} bodyClassName="p-0">
            {versions.isLoading ? <Skeleton className="m-4 h-24" /> : versions.data?.length ? (
              <ul className="divide-y divide-line">
                {versions.data.map((item) => {
                  const itemStatus = PROFILE_STATUS[item.status] ?? { label: item.status, variant: "neutral" as const };
                  return (
                    <li key={item.id} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
                      <div><p className="text-[13px] font-medium">{t("settingsDetails.text101")}{" "}{item.version}</p><p className="mt-0.5 text-[12px] text-ink-3">{f.dateTime(item.publishedAt ?? item.updatedAt)}</p></div>
                      <Badge variant={itemStatus.variant}>{itemStatus.label}</Badge>
                    </li>
                  );
                })}
              </ul>
            ) : <p className="p-4 text-[12.5px] text-ink-3 sm:p-5">{t("settingsPublic.text055")}</p>}
          </SettingsPanel>
          <p className="text-[12px] leading-5 text-ink-3">{t("settingsPublic.text056")}</p>
        </div>
      </div>

      <SettingsSaveBar
        dirty={dirty}
        saving={save.isPending}
        saveDisabled={Boolean(saveDisabledReason)}
        saveDisabledReason={saveDisabledReason}
        error={save.isError ? (isApiError(save.error) ? save.error.message : t("settingsPublic.text057")) : undefined}
        onSave={async () => { await save.mutateAsync(); }}
        onDiscard={discardChanges}
        saveLabel={t("settingsPublic.text058")}
        guardTitle={t("settingsDetails.text263")}
        guardDescription={t("settingsPublic.text059")}
      />

      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}><DialogContent><DialogHeader><DialogTitle>{t("settingsPublic.sendVersion", { version: value.version })}</DialogTitle><DialogDescription>{t("settingsPublic.text060")}</DialogDescription></DialogHeader><DialogBody><Field label={t("settingsPublic.text061")}><Textarea value={reviewMessage} onChange={(event) => setReviewMessage(event.target.value)} placeholder={t("settingsPublic.text062")} /></Field></DialogBody><DialogFooter><Button variant="secondary" onClick={() => setReviewOpen(false)}>{t("common.action.cancel")}</Button><Button loading={requestReview.isPending} onClick={() => requestReview.mutate()}><Send /> {" "}{t("settingsPublic.text063")}</Button></DialogFooter></DialogContent></Dialog>
    </SettingsSection>
  );
}

function MediaUploadField({ label, current, draft, loading, onSelect, onAltTextChange, onRemove }: { label: string; current?: MediaAsset; draft?: PendingMedia; loading: boolean; onSelect: (file: File, altText: string) => void; onAltTextChange?: (altText: string) => void; onRemove?: () => void }) {
  const t = useT();
  const [altText, setAltText] = useState(draft?.altText ?? current?.altText ?? "");
  const fieldId = useId();
  useEffect(() => { setAltText(draft?.altText ?? current?.altText ?? ""); }, [draft?.file, draft?.altText, current?.id, current?.altText]);
  const previewUrl = draft ? draft.previewUrl : current?.url;
  const previewLabel = draft ? draft.altText || t("settingsPublic.labelPreview", { label }) : current?.altText ?? t("settingsPublic.text064");
  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!( ["image/jpeg", "image/png", "image/webp"] as string[]).includes(file.type) || file.size > 5 * 1024 * 1024) {
      toast.error(t("settingsDetails.text231"));
      event.currentTarget.value = "";
      return;
    }
    onSelect(file, altText.trim());
  };
  const handleAltTextChange = (value: string) => {
    setAltText(value);
    onAltTextChange?.(value);
  };
  const altReady = !draft || draft.altText.trim().length >= 3;
  return (
    <div className="min-w-0">
      <label htmlFor={`${fieldId}-file`} className="mb-1.5 block text-[13px] font-medium text-ink-2">{label}</label>
      {previewUrl ? (
        <div className="relative mb-2"><div role="img" aria-label={previewLabel} className="h-24 w-full rounded-md bg-sunken bg-cover bg-center" style={{ backgroundImage: `url(${previewUrl})` }} />{onRemove ? <Button type="button" size="xs" variant="secondary" className="absolute end-2 top-2" onClick={onRemove}>{t("common.action.remove")}</Button> : null}</div>
      ) : draft ? (
        <div className="relative mb-2 flex h-24 items-center justify-center rounded-md border border-dashed border-line-2 bg-sunken px-3 text-center text-[12px] text-ink-2"><span className="truncate">{t("settingsPublic.text065")}{" "}{draft.file.name}</span>{onRemove ? <Button type="button" size="xs" variant="secondary" className="absolute end-2 top-2" onClick={onRemove}>{t("common.action.remove")}</Button> : null}</div>
      ) : null}
      <input id={`${fieldId}-file`} className="block h-9 w-full rounded-md border border-line-2 bg-surface px-3 py-1.5 text-[12.5px] text-ink-2 file:me-2 file:rounded-sm file:border file:border-line file:bg-surface file:px-2 file:py-0.5 file:text-[12px] file:text-ink disabled:cursor-not-allowed disabled:opacity-50" type="file" accept="image/jpeg,image/png,image/webp" disabled={loading} onChange={handleFileChange} />
      <label htmlFor={`${fieldId}-alt`} className="mt-3 block text-[13px] font-medium text-ink-2">{t("settingsPublic.text066")}</label>
      <Input id={`${fieldId}-alt`} className="mt-1.5" value={altText} maxLength={180} disabled={loading} aria-invalid={!altReady || undefined} onChange={(event) => handleAltTextChange(event.target.value)} placeholder={t("settingsPublic.text067")} />
      <p className={cn("mt-1.5 text-[12px] leading-5", altReady ? "text-ink-3" : "text-danger")}>
        {draft
          ? altReady ? t("settingsPublic.text068") : t("settingsPublic.text069")
          : t("settingsPublic.text070")}
      </p>
    </div>
  );
}
