"use client";

import { Bookmark, BookmarkPlus, Copy, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/switch";
import { qk } from "@/lib/api/keys";
import type { SavedView, SavedViewSurface } from "@/lib/domain/qol";
import { useApiMutation, useApiQuery, useInvalidate } from "@/lib/hooks/use-api";
import { useLocale } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils/cn";

export function SavedViewControls({ surface, state, onApply, hasExplicitState = false, compact = false, className }: { surface: SavedViewSurface; state: Record<string, unknown>; onApply: (state: Record<string, unknown>) => void; hasExplicitState?: boolean; compact?: boolean; className?: string }) {
  const { t, isolate } = useLocale();
  const invalidate = useInvalidate();
  const views = useApiQuery(qk.savedViews(surface), (api) => api.listSavedViews(surface));
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<"create" | "edit" | "duplicate">("create");
  const [name, setName] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const selected = views.data?.find((view) => view.id === selectedId);
  const onApplyRef = useRef(onApply);
  const appliedDefaultRef = useRef(false);
  useEffect(() => { onApplyRef.current = onApply; }, [onApply]);
  useEffect(() => {
    if (appliedDefaultRef.current || hasExplicitState || !views.data) return;
    appliedDefaultRef.current = true;
    const defaultView = views.data.find((view) => view.isDefault);
    if (defaultView) { setSelectedId(defaultView.id); onApplyRef.current(defaultView.state); }
  }, [hasExplicitState, views.data]);

  const openDialog = (mode: "create" | "edit" | "duplicate") => {
    setDialogMode(mode);
    setName(mode === "edit" ? selected?.name ?? "" : mode === "duplicate" ? t("members.savedViews.copyName", { name: selected?.name ?? t("members.savedViews.fallbackName") }) : "");
    setIsDefault(mode === "edit" ? Boolean(selected?.isDefault) : false);
    setDialogOpen(true);
  };
  const save = useApiMutation((api) => api.saveSavedView({ id: dialogMode === "edit" ? selected?.id : undefined, surface, name: name.trim(), state, isDefault }), {
    onSuccess: async (view) => {
      await invalidate();
      setSelectedId(view.id);
      setDialogOpen(false);
      setName("");
      setIsDefault(false);
      toast.success(dialogMode === "edit" ? t("members.savedViews.toast.updated", { name: isolate(view.name) }) : t("members.savedViews.toast.saved", { name: isolate(view.name) }));
    },
  });
  const remove = useApiMutation((api, view: SavedView) => api.deleteSavedView(view.id), {
    onSuccess: async (_result, view) => {
      await invalidate();
      setSelectedId("");
      toast.success(t("members.savedViews.toast.deleted", { name: isolate(view.name) }));
    },
  });

  return (
    <div className={cn("flex min-w-0 items-center gap-1.5", className)}>
      <Select value={selectedId || "none"} onValueChange={(value) => {
        if (value === "none") { setSelectedId(""); return; }
        const view = views.data?.find((item) => item.id === value);
        if (view) { setSelectedId(value); onApply(view.state); }
      }}>
        <SelectTrigger sizeVariant="sm" className={compact ? "h-11 min-w-0 flex-1 min-[1180px]:h-8 min-[1180px]:w-28 rtl:min-[1180px]:w-40 min-[1180px]:flex-none" : "w-44"} aria-label={t("members.savedViews.ariaLabel")}><Bookmark className="size-3.5" /><SelectValue placeholder={t("members.savedViews.placeholder")} /></SelectTrigger>
        <SelectContent><SelectItem value="none">{t("members.savedViews.placeholder")}</SelectItem>{(views.data ?? []).map((view) => <SelectItem key={view.id} value={view.id}><bdi>{view.name}</bdi>{view.isDefault ? t("members.savedViews.defaultSuffix") : ""}</SelectItem>)}</SelectContent>
      </Select>
      <Button type="button" size={compact ? "icon-sm" : "sm"} className={compact ? "size-11 min-[1180px]:size-7" : undefined} variant="secondary" aria-label={compact ? t("members.savedViews.saveCurrent") : undefined} title={compact ? t("members.savedViews.saveCurrent") : undefined} onClick={() => openDialog("create")}><BookmarkPlus />{compact ? null : t("common.action.save")}</Button>
      {selected && compact ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button type="button" size="icon-sm" className="size-11 min-[1180px]:size-7" variant="ghost" aria-label={t("members.savedViews.manage", { name: isolate(selected.name) })}><MoreHorizontal /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => openDialog("edit")}><Pencil /> {t("members.savedViews.updateMenu")}</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => openDialog("duplicate")}><Copy /> {t("members.savedViews.copyMenu")}</DropdownMenuItem>
            <DropdownMenuItem destructive disabled={remove.isPending} onSelect={() => remove.mutate(selected)}><Trash2 /> {t("members.savedViews.deleteMenu")}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
      {selected && !compact ? <Button type="button" size="icon" variant="ghost" aria-label={t("members.savedViews.updateNamed", { name: isolate(selected.name) })} onClick={() => openDialog("edit")}><Pencil /></Button> : null}
      {selected && !compact ? <Button type="button" size="icon" variant="ghost" aria-label={t("members.savedViews.copyNamed", { name: isolate(selected.name) })} onClick={() => openDialog("duplicate")}><Copy /></Button> : null}
      {selected && !compact ? <Button type="button" size="icon" variant="ghost" aria-label={t("members.savedViews.deleteNamed", { name: isolate(selected.name) })} loading={remove.isPending} onClick={() => remove.mutate(selected)}><Trash2 /></Button> : null}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{dialogMode === "edit" ? t("members.savedViews.dialog.updateTitle") : dialogMode === "duplicate" ? t("members.savedViews.dialog.copyTitle") : t("members.savedViews.dialog.createTitle")}</DialogTitle></DialogHeader>
          <DialogBody className="space-y-4">
            <label className="grid gap-1.5 text-[12.5px] font-medium">{t("members.savedViews.dialog.name")}<Input autoFocus value={name} onChange={(event) => setName(event.target.value)} maxLength={60} placeholder={t("members.savedViews.dialog.namePlaceholder")} dir="auto" /></label>
            <label className="flex items-center gap-2 text-[12.5px]"><Checkbox checked={isDefault} onCheckedChange={(checked) => setIsDefault(checked === true)} />{t("members.savedViews.dialog.makeDefault")}</label>
          </DialogBody>
          <DialogFooter><Button variant="secondary" onClick={() => setDialogOpen(false)}>{t("common.action.cancel")}</Button><Button disabled={!name.trim()} loading={save.isPending} onClick={() => save.mutate()}>{dialogMode === "edit" ? t("members.savedViews.dialog.updateConfirm") : t("members.savedViews.dialog.saveConfirm")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
