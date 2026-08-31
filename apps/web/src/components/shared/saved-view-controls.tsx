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
import { cn } from "@/lib/utils/cn";

export function SavedViewControls({ surface, state, onApply, hasExplicitState = false, compact = false, className }: { surface: SavedViewSurface; state: Record<string, unknown>; onApply: (state: Record<string, unknown>) => void; hasExplicitState?: boolean; compact?: boolean; className?: string }) {
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
    setName(mode === "edit" ? selected?.name ?? "" : mode === "duplicate" ? `${selected?.name ?? "Saved view"} copy` : "");
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
      toast.success(dialogMode === "edit" ? `Updated “${view.name}”.` : `Saved “${view.name}”.`);
    },
  });
  const remove = useApiMutation((api, view: SavedView) => api.deleteSavedView(view.id), {
    onSuccess: async (_result, view) => {
      await invalidate();
      setSelectedId("");
      toast.success(`Deleted “${view.name}”.`);
    },
  });

  return (
    <div className={cn("flex min-w-0 items-center gap-1.5", className)}>
      <Select value={selectedId || "none"} onValueChange={(value) => {
        if (value === "none") { setSelectedId(""); return; }
        const view = views.data?.find((item) => item.id === value);
        if (view) { setSelectedId(value); onApply(view.state); }
      }}>
        <SelectTrigger sizeVariant="sm" className={compact ? "h-11 min-w-0 flex-1 min-[1180px]:h-8 min-[1180px]:w-28 min-[1180px]:flex-none" : "w-44"} aria-label="Saved view"><Bookmark className="size-3.5" /><SelectValue placeholder="Saved views" /></SelectTrigger>
        <SelectContent><SelectItem value="none">Saved views</SelectItem>{(views.data ?? []).map((view) => <SelectItem key={view.id} value={view.id}>{view.name}{view.isDefault ? " · default" : ""}</SelectItem>)}</SelectContent>
      </Select>
      <Button type="button" size={compact ? "icon-sm" : "sm"} className={compact ? "size-11 min-[1180px]:size-7" : undefined} variant="secondary" aria-label={compact ? "Save current view" : undefined} title={compact ? "Save current view" : undefined} onClick={() => openDialog("create")}><BookmarkPlus />{compact ? null : "Save"}</Button>
      {selected && compact ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button type="button" size="icon-sm" className="size-11 min-[1180px]:size-7" variant="ghost" aria-label={`Manage saved view ${selected.name}`}><MoreHorizontal /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => openDialog("edit")}><Pencil /> Update view</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => openDialog("duplicate")}><Copy /> Duplicate view</DropdownMenuItem>
            <DropdownMenuItem destructive disabled={remove.isPending} onSelect={() => remove.mutate(selected)}><Trash2 /> Delete view</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
      {selected && !compact ? <Button type="button" size="icon" variant="ghost" aria-label={`Update saved view ${selected.name}`} onClick={() => openDialog("edit")}><Pencil /></Button> : null}
      {selected && !compact ? <Button type="button" size="icon" variant="ghost" aria-label={`Duplicate saved view ${selected.name}`} onClick={() => openDialog("duplicate")}><Copy /></Button> : null}
      {selected && !compact ? <Button type="button" size="icon" variant="ghost" aria-label={`Delete saved view ${selected.name}`} loading={remove.isPending} onClick={() => remove.mutate(selected)}><Trash2 /></Button> : null}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{dialogMode === "edit" ? "Update saved view" : dialogMode === "duplicate" ? "Duplicate saved view" : "Save this view"}</DialogTitle></DialogHeader>
          <DialogBody className="space-y-4">
            <label className="grid gap-1.5 text-[12.5px] font-medium">View name<Input autoFocus value={name} onChange={(event) => setName(event.target.value)} maxLength={60} placeholder="e.g. Expiring in 14 days" /></label>
            <label className="flex items-center gap-2 text-[12.5px]"><Checkbox checked={isDefault} onCheckedChange={(checked) => setIsDefault(checked === true)} />Use this as my default view</label>
          </DialogBody>
          <DialogFooter><Button variant="secondary" onClick={() => setDialogOpen(false)}>Cancel</Button><Button disabled={!name.trim()} loading={save.isPending} onClick={() => save.mutate()}>{dialogMode === "edit" ? "Update view" : "Save view"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
