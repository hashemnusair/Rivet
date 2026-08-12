"use client";

import { Eye, Globe2, History, ImagePlus, Save, Send, Undo2 } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/misc";
import { ErrorState } from "@/components/ui/states";
import { qk } from "@/lib/api/keys";
import type { MediaAsset, MediaAssetOwnerType, UpdateGymPublicProfileInput } from "@/lib/domain/types";
import { useApiMutation, useApiQuery, useInvalidate } from "@/lib/hooks/use-api";
import { useRealtimeApiQuery } from "@/lib/hooks/use-realtime-api";
import { useUnsavedChanges } from "@/lib/providers/unsaved-changes-provider";
import { formatDateTime } from "@/lib/utils/dates";

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

function profileSnapshot(form: UpdateGymPublicProfileInput, amenities: string): string {
  return JSON.stringify({ ...form, amenities });
}

export function GymPublicProfileSection() {
  const invalidate = useInvalidate();
  const { setGuard } = useUnsavedChanges();
  const profile = useRealtimeApiQuery({ queryKey: qk.gymProfile, query: (api) => api.getGymPublicProfile(), subscribe: (api, onValue, onError) => api.subscribeGymPublicProfile(onValue, onError) });
  const versions = useApiQuery(qk.gymProfileVersions, (api) => api.listGymProfileVersions());
  const [form, setForm] = useState<UpdateGymPublicProfileInput>(emptyForm);
  const [amenities, setAmenities] = useState("");
  const [unpublishOpen, setUnpublishOpen] = useState(false);
  const [unpublishReason, setUnpublishReason] = useState("");
  const [uploadedAssets, setUploadedAssets] = useState<Record<string, MediaAsset>>({});
  const [draftAssetIds, setDraftAssetIds] = useState<string[]>([]);
  const [baseline, setBaseline] = useState<string>();

  // Incoming realtime snapshots must not overwrite an editor with local work.
  useEffect(() => {
    if (!profile.data) return;
    if (baseline && profileSnapshot(form, amenities) !== baseline) return;
    const nextForm = {
      shortName: profile.data.shortName,
      taglineEn: profile.data.taglineEn,
      taglineAr: profile.data.taglineAr ?? "",
      descriptionEn: profile.data.descriptionEn,
      descriptionAr: profile.data.descriptionAr ?? "",
      category: profile.data.category,
      audience: profile.data.audience,
      amenities: [...profile.data.amenities],
      contactEmail: profile.data.contactEmail ?? "",
      contactPhone: profile.data.contactPhone ?? "",
      websiteUrl: profile.data.websiteUrl ?? "",
      instagramUrl: profile.data.instagramUrl ?? "",
      accentColor: profile.data.accentColor,
      logoAssetId: profile.data.logo?.id,
      coverAssetId: profile.data.cover?.id,
      galleryAssetIds: profile.data.gallery.map((asset) => asset.id),
    };
    const nextAmenities = profile.data.amenities.join(", ");
    setForm(nextForm);
    setAmenities(nextAmenities);
    setBaseline(profileSnapshot(nextForm, nextAmenities));
  // The form snapshot is intentionally read only when the remote profile changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.data]);

  const dirty = baseline !== undefined && profileSnapshot(form, amenities) !== baseline;
  const save = useApiMutation((api) => api.saveGymPublicProfile({ ...form, amenities: amenities.split(",").map((item) => item.trim()).filter(Boolean) }), { onSuccess: async () => { setBaseline(profileSnapshot(form, amenities)); setDraftAssetIds([]); setUploadedAssets({}); toast.success("Public profile draft saved and audited."); await invalidate([qk.gymProfile]); } });
  const publish = useApiMutation((api) => api.publishGymPublicProfile(), { onSuccess: async () => { toast.success("Public profile published. Discovery will update in realtime when platform eligibility is active."); await invalidate([qk.gymProfile]); } });
  const unpublish = useApiMutation((api) => api.unpublishGymPublicProfile(unpublishReason), { onSuccess: async () => { toast.success("Public profile unpublished."); setUnpublishOpen(false); setUnpublishReason(""); await invalidate([qk.gymProfile]); } });
  const upload = useApiMutation((api, input: { ownerType: MediaAssetOwnerType; altText: string; file: File }) => api.uploadMediaAsset({ ...input, ownerId: profile.data?.organizationId ?? "" }), {
    onSuccess: (asset) => {
      setUploadedAssets((current) => ({ ...current, [asset.id]: asset }));
      setDraftAssetIds((current) => [...new Set([...current, asset.id])]);
      setForm((current) => asset.ownerType === "gym_logo" ? { ...current, logoAssetId: asset.id } : asset.ownerType === "gym_cover" ? { ...current, coverAssetId: asset.id } : { ...current, galleryAssetIds: [...current.galleryAssetIds, asset.id] });
      toast.success("Image sanitized and attached to this draft. Save the draft to keep the selection.");
    },
  });
  const discardDraft = useApiMutation(async (api) => { await Promise.all(draftAssetIds.map((assetId) => api.discardDraftMediaAsset(assetId))); }, { onSuccess: () => { if (!profile.data) return; const nextAmenities = profile.data.amenities.join(", "); const nextForm = { shortName: profile.data.shortName, taglineEn: profile.data.taglineEn, taglineAr: profile.data.taglineAr ?? "", descriptionEn: profile.data.descriptionEn, descriptionAr: profile.data.descriptionAr ?? "", category: profile.data.category, audience: profile.data.audience, amenities: [...profile.data.amenities], contactEmail: profile.data.contactEmail ?? "", contactPhone: profile.data.contactPhone ?? "", websiteUrl: profile.data.websiteUrl ?? "", instagramUrl: profile.data.instagramUrl ?? "", accentColor: profile.data.accentColor, logoAssetId: profile.data.logo?.id, coverAssetId: profile.data.cover?.id, galleryAssetIds: profile.data.gallery.map((asset) => asset.id) }; setForm(nextForm); setAmenities(nextAmenities); setDraftAssetIds([]); setUploadedAssets({}); setBaseline(profileSnapshot(nextForm, nextAmenities)); toast.success("Unsaved profile changes and unreferenced uploads were discarded."); } });
  const guardActions = useRef({ save: async () => {}, discard: async () => {} });

  useEffect(() => {
    guardActions.current = {
      save: async () => { await save.mutateAsync(); },
      discard: async () => { await discardDraft.mutateAsync(); },
    };
  });

  useEffect(() => {
    if (!dirty) {
      setGuard(null);
      return;
    }
    setGuard({
      save: () => guardActions.current.save(),
      discard: () => guardActions.current.discard(),
    });
    return () => setGuard(null);
  }, [dirty, setGuard]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (!dirty) return; event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  if (profile.isLoading) return <Skeleton className="h-[620px] w-full" />;
  if (profile.isError) return <ErrorState title="Public profile could not be loaded" onRetry={() => profile.refetch()} />;
  const value = profile.data!;
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,.8fr)]">
      <section className="panel p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><p className="eyebrow">Public gym profile</p><h2 className="mt-1 font-display text-[17px] font-semibold">Draft and publication</h2><p className="mt-1 text-[12px] text-ink-3">Owners and managers control the content. RIVET subscription eligibility controls final directory visibility.</p></div>
          <Badge variant={value.status === "published" ? "success" : value.status === "draft" ? "warning" : "neutral"}>{value.status} · v{value.version}</Badge>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <MediaUploadField label="Logo" current={form.logoAssetId ? uploadedAssets[form.logoAssetId] ?? value.logo : undefined} loading={upload.isPending} onUpload={(file, altText) => upload.mutate({ ownerType: "gym_logo", file, altText })} />
          <MediaUploadField label="Cover image" current={form.coverAssetId ? uploadedAssets[form.coverAssetId] ?? value.cover : undefined} loading={upload.isPending} onUpload={(file, altText) => upload.mutate({ ownerType: "gym_cover", file, altText })} />
          <Field label="Short name" required><Input value={form.shortName} maxLength={24} onChange={(event) => setForm((current) => ({ ...current, shortName: event.target.value }))} /></Field>
          <Field label="Category"><select className="h-10 w-full rounded-md border border-line-2 bg-surface px-3 text-[13px]" value={form.category} onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}>{PROFILE_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}</select></Field>
          <Field label="English tagline" required><Input value={form.taglineEn} maxLength={180} onChange={(event) => setForm((current) => ({ ...current, taglineEn: event.target.value }))} /></Field>
          <Field label="Arabic tagline"><Input dir="rtl" lang="ar" value={form.taglineAr} maxLength={180} onChange={(event) => setForm((current) => ({ ...current, taglineAr: event.target.value }))} /></Field>
          <Field label="English description" required className="sm:col-span-1"><Textarea className="min-h-32" maxLength={2000} value={form.descriptionEn} onChange={(event) => setForm((current) => ({ ...current, descriptionEn: event.target.value }))} /></Field>
          <Field label="Arabic description" className="sm:col-span-1"><Textarea dir="rtl" lang="ar" className="min-h-32" maxLength={2000} value={form.descriptionAr} onChange={(event) => setForm((current) => ({ ...current, descriptionAr: event.target.value }))} /></Field>
          <Field label="Audience"><select className="h-10 w-full rounded-md border border-line-2 bg-surface px-3 text-[13px]" value={form.audience} onChange={(event) => setForm((current) => ({ ...current, audience: event.target.value }))}>{PROFILE_AUDIENCES.map((audience) => <option key={audience} value={audience}>{audience}</option>)}</select></Field>
          <Field label="Amenities" hint="Choose the facilities members can expect."><div className="flex flex-wrap gap-2">{AMENITY_CHOICES.map((amenity) => <Button key={amenity} type="button" size="xs" variant={amenities.split(",").map((item) => item.trim()).includes(amenity) ? "primary" : "secondary"} onClick={() => setAmenities((current) => { const choices = new Set(current.split(",").map((item) => item.trim()).filter(Boolean)); if (choices.has(amenity)) choices.delete(amenity); else choices.add(amenity); return [...choices].join(", "); })}>{amenity}</Button>)}</div></Field>
          <Field label="Contact email"><Input type="email" value={form.contactEmail} onChange={(event) => setForm((current) => ({ ...current, contactEmail: event.target.value }))} /></Field>
          <Field label="Contact phone"><Input dir="ltr" value={form.contactPhone} onChange={(event) => setForm((current) => ({ ...current, contactPhone: event.target.value }))} /></Field>
          <Field label="Website"><Input type="url" value={form.websiteUrl} onChange={(event) => setForm((current) => ({ ...current, websiteUrl: event.target.value }))} placeholder="https://" /></Field>
          <Field label="Instagram"><Input type="url" value={form.instagramUrl} onChange={(event) => setForm((current) => ({ ...current, instagramUrl: event.target.value }))} placeholder="https://instagram.com/" /></Field>
          <Field label="Accent color"><div className="flex gap-2"><Input type="color" className="w-14 p-1" value={form.accentColor} onChange={(event) => setForm((current) => ({ ...current, accentColor: event.target.value }))} /><Input value={form.accentColor} onChange={(event) => setForm((current) => ({ ...current, accentColor: event.target.value }))} /></div></Field>
          <MediaUploadField label="Add gallery image" loading={upload.isPending} onUpload={(file, altText) => upload.mutate({ ownerType: "gym_gallery", file, altText })} />
        </div>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          {value.status === "published" ? <Button variant="secondary" onClick={() => setUnpublishOpen(true)}><Undo2 /> Unpublish</Button> : null}
          {dirty ? <Button variant="ghost" loading={discardDraft.isPending} onClick={() => discardDraft.mutate()}>Discard changes</Button> : null}
          <Button variant="secondary" loading={save.isPending} disabled={!dirty || !form.shortName.trim() || !form.taglineEn.trim() || !form.descriptionEn.trim()} onClick={() => save.mutate()}><Save /> Save draft</Button>
          <Button loading={publish.isPending} disabled={value.status !== "draft" || dirty || save.isPending || discardDraft.isPending} title={dirty ? "Save or discard the unsaved edits before publishing." : undefined} onClick={() => publish.mutate()}><Send /> Publish draft</Button>
        </div>
      </section>

      <div className="space-y-5">
        <section className="overflow-hidden rounded-lg border border-line bg-surface">
          <header className="flex items-center gap-2 border-b border-line px-4 py-3"><Eye className="size-4 text-ink-3" /><div><p className="eyebrow">Preview</p><p className="text-[12px] text-ink-3">Content preview; final visibility still depends on RIVET eligibility.</p></div></header>
          <div className="h-32 bg-cover bg-center" style={{ backgroundColor: form.accentColor, backgroundImage: (form.coverAssetId ? uploadedAssets[form.coverAssetId]?.url ?? value.cover?.url : undefined) ? `url(${form.coverAssetId ? uploadedAssets[form.coverAssetId]?.url ?? value.cover?.url : undefined})` : undefined }} />
          <div className="p-5"><p className="font-mono text-[9px] uppercase tracking-[.14em] text-ink-3">{form.category || "Gym"} · {form.audience || "All members"}</p><h3 className="mt-2 font-display text-[25px] font-semibold">{form.shortName || "Gym name"}</h3><p className="mt-3 text-[13px] leading-relaxed text-ink-2">{form.taglineEn || "Add the gym's public tagline."}</p><div className="mt-4 flex flex-wrap gap-1.5">{amenities.split(",").map((item) => item.trim()).filter(Boolean).map((item) => <span key={item} className="rounded-full border border-line px-2 py-1 text-[10px]">{item}</span>)}</div><div className="mt-5 border-t border-line pt-4 text-[11.5px] text-ink-3">{value.trainers.length} published trainer{value.trainers.length === 1 ? "" : "s"} · {value.ptPackages.length} active PT package{value.ptPackages.length === 1 ? "" : "s"}</div></div>
        </section>

        <section className="overflow-hidden rounded-lg border border-line bg-surface">
          <header className="flex items-center gap-2 border-b border-line px-4 py-3"><History className="size-4 text-ink-3" /><div><p className="eyebrow">Version history</p><p className="text-[12px] text-ink-3">Published snapshots remain available for audit.</p></div></header>
          {versions.isLoading ? <Skeleton className="m-4 h-24" /> : versions.data?.length ? <div className="divide-y divide-line">{versions.data.map((item) => <article key={item.id} className="flex items-center justify-between gap-3 px-4 py-3"><div><p className="text-[12.5px] font-medium">Version {item.version}</p><p className="mt-0.5 text-[10.5px] text-ink-3">{formatDateTime(item.publishedAt ?? item.updatedAt)}</p></div><Badge variant={item.status === "published" ? "success" : "neutral"}>{item.status}</Badge></article>)}</div> : <p className="p-5 text-[12px] text-ink-3">No profile version has been published yet.</p>}
        </section>
        <div className="flex items-start gap-2 rounded-lg border border-line bg-sunken p-4 text-[11.5px] text-ink-2"><Globe2 className="mt-0.5 size-4 shrink-0" /><p>Published trainers and active PT packages are read from their authoritative records; this form cannot fabricate ratings, member totals, or popularity.</p></div>
      </div>

      <Dialog open={unpublishOpen} onOpenChange={setUnpublishOpen}><DialogContent><DialogHeader><DialogTitle>Unpublish gym profile?</DialogTitle><DialogDescription>The gym disappears from public discovery, while its subscription and operational records remain intact.</DialogDescription></DialogHeader><DialogBody><Field label="Reason" required><Textarea value={unpublishReason} onChange={(event) => setUnpublishReason(event.target.value)} placeholder="Why is this profile being unpublished?" /></Field></DialogBody><DialogFooter><Button variant="secondary" onClick={() => setUnpublishOpen(false)}>Cancel</Button><Button variant="danger" loading={unpublish.isPending} disabled={unpublishReason.trim().length < 3} onClick={() => unpublish.mutate()}>Unpublish profile</Button></DialogFooter></DialogContent></Dialog>
    </div>
  );
}

function MediaUploadField({ label, current, loading, onUpload }: { label: string; current?: MediaAsset; loading: boolean; onUpload: (file: File, altText: string) => void }) {
  const [altText, setAltText] = useState(current?.altText ?? "");
  const [file, setFile] = useState<File>();
  const fieldId = useId();
  return (
    <div className="rounded-md border border-line p-3">
      <div className="flex items-center gap-2"><ImagePlus className="size-4 text-ink-3" /><label htmlFor={`${fieldId}-file`} className="text-[12.5px] font-medium">{label}</label></div>
      {current?.url ? <div role="img" aria-label={current.altText ?? "Uploaded profile image"} className="mt-3 h-24 w-full rounded-sm bg-cover bg-center" style={{ backgroundImage: `url(${current.url})` }} /> : null}
      <input id={`${fieldId}-file`} className="mt-3 block w-full text-[11px] file:me-2 file:rounded-sm file:border file:border-line file:bg-surface file:px-2 file:py-1" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setFile(event.target.files?.[0])} />
      <label htmlFor={`${fieldId}-alt`} className="mt-2 block text-[11px] font-medium text-ink-2">Accessible image description</label><Input id={`${fieldId}-alt`} className="mt-1" value={altText} maxLength={180} onChange={(event) => setAltText(event.target.value)} placeholder="Required accessible image description" />
      <Button className="mt-2" type="button" size="sm" variant="secondary" loading={loading} disabled={!file || altText.trim().length < 3} onClick={() => file && onUpload(file, altText.trim())}>Upload and sanitize</Button>
      <p className="mt-2 text-[9.5px] text-ink-3">JPEG, PNG, or WebP · 5 MB maximum · metadata is removed server-side.</p>
    </div>
  );
}
