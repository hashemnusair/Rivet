"use client";

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
import { formatDateTime } from "@/lib/utils/dates";
import { SettingsPanel, SettingsSaveBar, SettingsSection } from "@/features/settings/settings-layout";

const PROFILE_CATEGORIES = ["Gym", "Strength & conditioning", "Women-only fitness", "Combat sports", "Wellness studio"] as const;
const PROFILE_AUDIENCES = ["All members", "Women", "Men", "Families", "Students"] as const;
const AMENITY_CHOICES = ["Free weights", "Cardio", "Showers", "Parking", "Group studio", "Personal training"] as const;

const DESCRIPTION = "The page visitors see in Find gyms. Save changes as a draft first; publishing is a separate, explicit step.";

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

const PROFILE_STATUS: Record<string, { label: string; variant: "success" | "warning" | "neutral" }> = {
  published: { label: "Published", variant: "success" },
  draft: { label: "Draft", variant: "warning" },
  unpublished: { label: "Unpublished", variant: "neutral" },
};

export function GymPublicProfileSection() {
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
    toast.success("Public profile draft saved and audited.");
    await invalidate([qk.gymProfile]);
  } });
  const publish = useApiMutation((api) => api.publishGymPublicProfile(), { onSuccess: async () => { toast.success("Public page published. Later changes are reviewed by RIVET before going live."); await invalidate([qk.gymProfile]); } });
  const requestReview = useApiMutation((api) => api.createSupportCase({
    email: session?.user.email ?? "",
    subject: `Public page update — review draft v${profile.data?.version ?? ""}`,
    body: `${reviewMessage.trim() ? `${reviewMessage.trim()}\n\n` : ""}The gym saved public page draft v${profile.data?.version ?? "?"} and asks RIVET to review and publish it.`,
    priority: "normal",
    requestType: "general",
  }), {
    onSuccess: async () => {
      setReviewOpen(false);
      setReviewMessage("");
      toast.success("Sent to RIVET. The team reviews your draft and publishes it for you.");
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
    toast.success("Unsaved profile changes and local image previews were discarded.");
  };

  if (profile.isLoading) return <SettingsSection title="Public profile" description={DESCRIPTION}><Skeleton className="h-[620px] w-full" /></SettingsSection>;
  if (profile.isError) return <SettingsSection title="Public profile" description={DESCRIPTION}><ErrorState layout="section" title="Public profile could not be loaded" onRetry={() => profile.refetch()} /></SettingsSection>;
  const value = profile.data!;
  const status = PROFILE_STATUS[value.status] ?? { label: value.status, variant: "neutral" as const };
  const currentLogo = form.logoAssetId ? uploadedAssets[form.logoAssetId] ?? value.logo : undefined;
  const currentCover = form.coverAssetId ? uploadedAssets[form.coverAssetId] ?? value.cover : undefined;
  const logoPreviewUrl = pendingMedia.logo ? pendingMedia.logo.previewUrl : currentLogo?.url;
  const coverPreviewUrl = pendingMedia.cover ? pendingMedia.cover.previewUrl : currentCover?.url;
  const selectedAmenities = splitAmenities(amenities);
  const missingRequired = !form.shortName.trim() ? "Add a short name before saving." : !form.taglineEn.trim() ? "Add an English tagline before saving." : !form.descriptionEn.trim() ? "Add an English description before saving." : undefined;
  const saveDisabledReason = !pendingMediaReady ? "Add an accessible description to each selected image before saving." : missingRequired;
  const publishBlocked = dirty ? "Save or discard the unsaved edits first." : value.status !== "draft" ? "Save a draft first — your published page has no pending changes." : undefined;
  const publishAction = value.publishLocked
    ? <Button disabled={Boolean(publishBlocked) || save.isPending} title={publishBlocked} onClick={() => setReviewOpen(true)}><Send /> Send to RIVET for review</Button>
    : <Button loading={publish.isPending} disabled={Boolean(publishBlocked) || save.isPending} title={publishBlocked} onClick={() => publish.mutate()}><Send /> Publish draft</Button>;

  return (
    <SettingsSection
      title="Public profile"
      description={DESCRIPTION}
      actions={<><Badge variant={status.variant} dot>{status.label} · v{value.version}</Badge>{publishAction}</>}
    >
      {value.publishLocked ? (
        <p className="text-[12.5px] leading-5 text-ink-2">Your page is live. Save changes as a draft, then send them to RIVET — the team reviews and publishes them for you.</p>
      ) : null}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,.8fr)] xl:items-start">
        <div className="space-y-4">
          <SettingsPanel title="Page content" description="Owners and managers control the content. RIVET subscription eligibility controls final directory visibility.">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Short name" required hint="Up to 24 characters; the name shown on cards."><Input value={form.shortName} maxLength={24} onChange={(event) => setForm((current) => ({ ...current, shortName: event.target.value }))} /></Field>
              <Field label="Category">
                <Select value={form.category} onValueChange={(category) => setForm((current) => ({ ...current, category }))}>
                  <SelectTrigger aria-label="Category"><SelectValue /></SelectTrigger>
                  <SelectContent>{PROFILE_CATEGORIES.map((category) => <SelectItem key={category} value={category}>{category}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="English tagline" required><Input value={form.taglineEn} maxLength={180} onChange={(event) => setForm((current) => ({ ...current, taglineEn: event.target.value }))} /></Field>
              <Field label="Arabic tagline"><Input dir="rtl" lang="ar" value={form.taglineAr} maxLength={180} onChange={(event) => setForm((current) => ({ ...current, taglineAr: event.target.value }))} /></Field>
              <Field label="English description" required><Textarea className="min-h-32" maxLength={2000} value={form.descriptionEn} onChange={(event) => setForm((current) => ({ ...current, descriptionEn: event.target.value }))} /></Field>
              <Field label="Arabic description"><Textarea dir="rtl" lang="ar" className="min-h-32" maxLength={2000} value={form.descriptionAr} onChange={(event) => setForm((current) => ({ ...current, descriptionAr: event.target.value }))} /></Field>
              <Field label="Audience">
                <Select value={form.audience} onValueChange={(audience) => setForm((current) => ({ ...current, audience }))}>
                  <SelectTrigger aria-label="Audience"><SelectValue /></SelectTrigger>
                  <SelectContent>{PROFILE_AUDIENCES.map((audience) => <SelectItem key={audience} value={audience}>{audience}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="Amenities" hint="Choose the facilities members can expect.">
                <div className="flex flex-wrap gap-2" role="group" aria-label="Amenities">
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
                        {amenity}
                      </Button>
                    );
                  })}
                </div>
              </Field>
              <Field label="Contact email"><Input type="email" inputMode="email" dir="ltr" value={form.contactEmail} onChange={(event) => setForm((current) => ({ ...current, contactEmail: event.target.value }))} /></Field>
              <Field label="Contact phone"><Input dir="ltr" type="tel" inputMode="tel" value={form.contactPhone} onChange={(event) => setForm((current) => ({ ...current, contactPhone: event.target.value }))} /></Field>
              <Field label="Website"><Input type="url" inputMode="url" dir="ltr" value={form.websiteUrl} onChange={(event) => setForm((current) => ({ ...current, websiteUrl: event.target.value }))} placeholder="https://" /></Field>
              <Field label="Instagram"><Input type="url" inputMode="url" dir="ltr" value={form.instagramUrl} onChange={(event) => setForm((current) => ({ ...current, instagramUrl: event.target.value }))} placeholder="https://instagram.com/" /></Field>
              <Field label="Accent color" hint="Used on the public page only; the workspace palette lives in Brand Kit."><div className="flex gap-2"><Input type="color" aria-label="Accent color picker" className="w-14 shrink-0 p-1" value={form.accentColor} onChange={(event) => setForm((current) => ({ ...current, accentColor: event.target.value }))} /><Input aria-label="Accent color hex" dir="ltr" className="font-mono" value={form.accentColor} onChange={(event) => setForm((current) => ({ ...current, accentColor: event.target.value }))} /></div></Field>
            </div>
          </SettingsPanel>

          <SettingsPanel title="Images" description="JPEG, PNG or WebP up to 5 MB each. Images preview locally and upload when the draft is saved.">
            <div className="grid gap-4 sm:grid-cols-2">
              <MediaUploadField label="Logo" current={currentLogo} draft={pendingMedia.logo} loading={save.isPending} onRemove={currentLogo || pendingMedia.logo ? () => removeAsset("logo", form.logoAssetId) : undefined} onSelect={(file, altText) => prepareMedia("logo", file, altText)} onAltTextChange={(altText) => updatePendingAltText("logo", altText)} />
              <MediaUploadField label="Cover image" current={currentCover} draft={pendingMedia.cover} loading={save.isPending} onRemove={currentCover || pendingMedia.cover ? () => removeAsset("cover", form.coverAssetId) : undefined} onSelect={(file, altText) => prepareMedia("cover", file, altText)} onAltTextChange={(altText) => updatePendingAltText("cover", altText)} />
            </div>
            <div className="mt-5 border-t border-line pt-4">
              <p className="text-[13.5px] font-medium text-ink">Gallery</p>
              <p className="mt-0.5 text-[12px] leading-5 text-ink-3">Up to a handful of photos, shown in this order.</p>
              {form.galleryAssetIds.length || pendingMedia.gallery.length ? (
                <ol className="mt-3 divide-y divide-line">
                  {form.galleryAssetIds.map((assetId, index) => {
                    const asset = uploadedAssets[assetId] ?? value.gallery.find((item) => item.id === assetId);
                    return (
                      <li key={assetId} className="flex items-center gap-3 py-2">
                        <span className="size-12 shrink-0 rounded-sm bg-sunken bg-cover bg-center" role="img" aria-label={asset?.altText ?? `Gallery image ${index + 1}`} style={{ backgroundImage: asset?.url ? `url(${asset.url})` : undefined }} />
                        <span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-medium">Image {index + 1}</span><span className="block truncate text-[12px] text-ink-3">{asset?.altText ?? "Saved image"}</span></span>
                        <Button type="button" size="icon" variant="ghost" aria-label={`Move image ${index + 1} earlier`} disabled={index === 0} onClick={() => setForm((current) => { const ids = [...current.galleryAssetIds]; [ids[index - 1], ids[index]] = [ids[index]!, ids[index - 1]!]; return { ...current, galleryAssetIds: ids }; })}><ArrowUp /></Button>
                        <Button type="button" size="icon" variant="ghost" aria-label={`Move image ${index + 1} later`} disabled={index === form.galleryAssetIds.length - 1} onClick={() => setForm((current) => { const ids = [...current.galleryAssetIds]; [ids[index], ids[index + 1]] = [ids[index + 1]!, ids[index]!]; return { ...current, galleryAssetIds: ids }; })}><ArrowDown /></Button>
                        <Button type="button" size="icon" variant="ghost" aria-label={`Remove image ${index + 1}`} onClick={() => removeAsset("gallery", assetId)}><X /></Button>
                      </li>
                    );
                  })}
                  {pendingMedia.gallery.map((draft, index) => (
                    <li key={`${draft.file.name}-${index}`} className="flex items-center gap-3 py-2">
                      <span className="size-12 shrink-0 rounded-sm border border-dashed border-line-2 bg-sunken bg-cover bg-center" role="img" aria-label={draft.altText || `Pending gallery image ${index + 1}`} style={{ backgroundImage: draft.previewUrl ? `url(${draft.previewUrl})` : undefined }} />
                      <span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-medium">Pending image {index + 1}</span><span className={cn("block truncate text-[12px]", draft.altText.trim().length >= 3 ? "text-ink-3" : "text-danger")}>{draft.altText.trim().length >= 3 ? "Preview ready · save draft to upload" : "Add an accessible image description"}</span></span>
                      <Button type="button" size="icon" variant="ghost" aria-label={`Remove pending image ${index + 1}`} onClick={() => removePendingGallery(index)}><X /></Button>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="mt-3 text-[12.5px] text-ink-3">No gallery images yet.</p>
              )}
              <div className="mt-3">
                <MediaUploadField label="Add gallery image" draft={pendingMedia.gallery.at(-1)} loading={save.isPending} onSelect={(file, altText) => prepareMedia("gallery", file, altText)} onAltTextChange={(altText) => updatePendingAltText("gallery", altText)} onRemove={pendingMedia.gallery.length ? () => removePendingGallery(pendingMedia.gallery.length - 1) : undefined} />
              </div>
            </div>
          </SettingsPanel>
        </div>

        <div className="space-y-4">
          <SettingsPanel title="Preview" description="How the page reads with the current edits. Final visibility still depends on RIVET eligibility." bodyClassName="p-0">
            <div className="h-28 bg-cover bg-center" style={{ backgroundColor: form.accentColor, backgroundImage: coverPreviewUrl ? `url(${coverPreviewUrl})` : undefined }} />
            <div className="p-4 sm:p-5">
              <div className="flex items-center gap-3">
                <span className="size-12 shrink-0 rounded-full border border-line bg-cover bg-center" role="img" aria-label={pendingMedia.logo || form.logoAssetId ? "Gym logo preview" : "Gym logo placeholder"} style={{ backgroundColor: form.accentColor, backgroundImage: logoPreviewUrl ? `url(${logoPreviewUrl})` : undefined }} />
                <div className="min-w-0">
                  <p className="text-[12px] font-medium text-ink-3">{form.category || "Gym"} · {form.audience || "All members"}</p>
                  <p className="mt-0.5 truncate font-display text-[22px] font-semibold leading-tight tracking-tight">{form.shortName || "Gym name"}</p>
                </div>
              </div>
              <p className="mt-3 text-[13px] leading-relaxed text-ink-2">{form.taglineEn || "Add the gym's public tagline."}</p>
              {selectedAmenities.length ? <div className="mt-3 flex flex-wrap gap-1.5">{selectedAmenities.map((item) => <Badge key={item} variant="outline">{item}</Badge>)}</div> : null}
              <p className="mt-4 border-t border-line pt-3 text-[12px] text-ink-3">{pendingMedia.logo || pendingMedia.cover ? "Local image preview · save draft to upload" : `${value.trainers.length} published trainer${value.trainers.length === 1 ? "" : "s"} · ${value.ptPackages.length} active PT package${value.ptPackages.length === 1 ? "" : "s"}`}</p>
            </div>
          </SettingsPanel>

          <SettingsPanel title="Version history" description="Published snapshots remain available for audit." bodyClassName="p-0">
            {versions.isLoading ? <Skeleton className="m-4 h-24" /> : versions.data?.length ? (
              <ul className="divide-y divide-line">
                {versions.data.map((item) => {
                  const itemStatus = PROFILE_STATUS[item.status] ?? { label: item.status, variant: "neutral" as const };
                  return (
                    <li key={item.id} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
                      <div><p className="text-[13px] font-medium">Version {item.version}</p><p className="mt-0.5 text-[12px] text-ink-3">{formatDateTime(item.publishedAt ?? item.updatedAt)}</p></div>
                      <Badge variant={itemStatus.variant}>{itemStatus.label}</Badge>
                    </li>
                  );
                })}
              </ul>
            ) : <p className="p-4 text-[12.5px] text-ink-3 sm:p-5">No profile version has been published yet.</p>}
          </SettingsPanel>
          <p className="text-[12px] leading-5 text-ink-3">Published trainers and active PT packages are read from their authoritative records. A published profile can still be absent from Find gyms when the platform directory eligibility switch is disabled.</p>
        </div>
      </div>

      <SettingsSaveBar
        dirty={dirty}
        saving={save.isPending}
        saveDisabled={Boolean(saveDisabledReason)}
        saveDisabledReason={saveDisabledReason}
        error={save.isError ? (isApiError(save.error) ? save.error.message : "The draft could not be saved. Try again.") : undefined}
        onSave={async () => { await save.mutateAsync(); }}
        onDiscard={discardChanges}
        saveLabel="Save draft"
        guardTitle="Unsaved public profile changes"
        guardDescription="Save the draft before leaving, discard the local edits and unreferenced uploads, or stay on this page."
      />

      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}><DialogContent><DialogHeader><DialogTitle>Send draft v{value.version} to RIVET?</DialogTitle><DialogDescription>The RIVET team reviews your saved draft and publishes it for you. You can add a note for the reviewer.</DialogDescription></DialogHeader><DialogBody><Field label="Note for the reviewer (optional)"><Textarea value={reviewMessage} onChange={(event) => setReviewMessage(event.target.value)} placeholder="What changed and why?" /></Field></DialogBody><DialogFooter><Button variant="secondary" onClick={() => setReviewOpen(false)}>Cancel</Button><Button loading={requestReview.isPending} onClick={() => requestReview.mutate()}><Send /> Send to RIVET</Button></DialogFooter></DialogContent></Dialog>
    </SettingsSection>
  );
}

function MediaUploadField({ label, current, draft, loading, onSelect, onAltTextChange, onRemove }: { label: string; current?: MediaAsset; draft?: PendingMedia; loading: boolean; onSelect: (file: File, altText: string) => void; onAltTextChange?: (altText: string) => void; onRemove?: () => void }) {
  const [altText, setAltText] = useState(draft?.altText ?? current?.altText ?? "");
  const fieldId = useId();
  useEffect(() => { setAltText(draft?.altText ?? current?.altText ?? ""); }, [draft?.file, draft?.altText, current?.id, current?.altText]);
  const previewUrl = draft ? draft.previewUrl : current?.url;
  const previewLabel = draft ? draft.altText || `${label} local preview` : current?.altText ?? "Uploaded profile image";
  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!( ["image/jpeg", "image/png", "image/webp"] as string[]).includes(file.type) || file.size > 5 * 1024 * 1024) {
      toast.error("Choose a JPEG, PNG, or WebP image up to 5 MB.");
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
        <div className="relative mb-2"><div role="img" aria-label={previewLabel} className="h-24 w-full rounded-md bg-sunken bg-cover bg-center" style={{ backgroundImage: `url(${previewUrl})` }} />{onRemove ? <Button type="button" size="xs" variant="secondary" className="absolute end-2 top-2" onClick={onRemove}>Remove</Button> : null}</div>
      ) : draft ? (
        <div className="relative mb-2 flex h-24 items-center justify-center rounded-md border border-dashed border-line-2 bg-sunken px-3 text-center text-[12px] text-ink-2"><span className="truncate">Preview ready: {draft.file.name}</span>{onRemove ? <Button type="button" size="xs" variant="secondary" className="absolute end-2 top-2" onClick={onRemove}>Remove</Button> : null}</div>
      ) : null}
      <input id={`${fieldId}-file`} className="block h-9 w-full rounded-md border border-line-2 bg-surface px-3 py-1.5 text-[12.5px] text-ink-2 file:me-2 file:rounded-sm file:border file:border-line file:bg-surface file:px-2 file:py-0.5 file:text-[12px] file:text-ink disabled:cursor-not-allowed disabled:opacity-50" type="file" accept="image/jpeg,image/png,image/webp" disabled={loading} onChange={handleFileChange} />
      <label htmlFor={`${fieldId}-alt`} className="mt-3 block text-[13px] font-medium text-ink-2">Accessible image description</label>
      <Input id={`${fieldId}-alt`} className="mt-1.5" value={altText} maxLength={180} disabled={loading} aria-invalid={!altReady || undefined} onChange={(event) => handleAltTextChange(event.target.value)} placeholder="What the image shows, in a few words" />
      <p className={cn("mt-1.5 text-[12px] leading-5", altReady ? "text-ink-3" : "text-danger")}>
        {draft
          ? altReady ? "Local preview only. Save draft to upload and sanitize this image." : "Add an accessible image description before saving."
          : "Required for every image."}
      </p>
    </div>
  );
}
