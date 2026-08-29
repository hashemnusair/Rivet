"use client";

import { Bookmark, BookmarkPlus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/switch";
import { qk } from "@/lib/api/keys";
import type { SavedView, SavedViewSurface } from "@/lib/domain/qol";
import { useApiMutation, useApiQuery, useInvalidate } from "@/lib/hooks/use-api";

export function SavedViewControls({ surface, state, onApply }: { surface: SavedViewSurface; state: Record<string, unknown>; onApply: (state: Record<string, unknown>) => void }) {
  const invalidate = useInvalidate();
  const views = useApiQuery(qk.savedViews(surface), (api) => api.listSavedViews(surface));
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const selected = views.data?.find((view) => view.id === selectedId);
  const save = useApiMutation((api) => api.saveSavedView({ surface, name: name.trim(), state, isDefault }), {
    onSuccess: async (view) => {
      await invalidate();
      setSelectedId(view.id);
      setDialogOpen(false);
      setName("");
      setIsDefault(false);
      toast.success(`Saved “${view.name}”.`);
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
    <div className="flex items-center gap-1.5">
      <Select value={selectedId || "none"} onValueChange={(value) => {
        if (value === "none") { setSelectedId(""); return; }
        const view = views.data?.find((item) => item.id === value);
        if (view) { setSelectedId(value); onApply(view.state); }
      }}>
        <SelectTrigger sizeVariant="sm" className="w-44" aria-label="Saved view"><Bookmark className="size-3.5" /><SelectValue placeholder="Saved views" /></SelectTrigger>
        <SelectContent><SelectItem value="none">Saved views</SelectItem>{(views.data ?? []).map((view) => <SelectItem key={view.id} value={view.id}>{view.name}{view.isDefault ? " · default" : ""}</SelectItem>)}</SelectContent>
      </Select>
      <Button type="button" size="sm" variant="secondary" onClick={() => setDialogOpen(true)}><BookmarkPlus /> Save</Button>
      {selected ? <Button type="button" size="icon" variant="ghost" aria-label={`Delete saved view ${selected.name}`} loading={remove.isPending} onClick={() => remove.mutate(selected)}><Trash2 /></Button> : null}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Save this view</DialogTitle></DialogHeader>
          <DialogBody className="space-y-4">
            <label className="grid gap-1.5 text-[12.5px] font-medium">View name<Input autoFocus value={name} onChange={(event) => setName(event.target.value)} maxLength={60} placeholder="e.g. Expiring in 14 days" /></label>
            <label className="flex items-center gap-2 text-[12.5px]"><Checkbox checked={isDefault} onCheckedChange={(checked) => setIsDefault(checked === true)} />Use this as my default view</label>
          </DialogBody>
          <DialogFooter><Button variant="secondary" onClick={() => setDialogOpen(false)}>Cancel</Button><Button disabled={!name.trim()} loading={save.isPending} onClick={() => save.mutate()}>Save view</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
