"use client";
import { useT } from "@/lib/i18n/provider";

import { Archive, Trash2 } from "lucide-react";
import { useState } from "react";
import type {
  CreatePurchaseOrderInput,
  DeleteProductInput,
  EquipmentAsset,
  EquipmentIssue,
  EquipmentWorkOrder,
  InventoryTransferInput,
  UpdateEquipmentIssueInput,
  UpsertEquipmentAssetInput,
  UpsertEquipmentWorkOrderInput,
  UpsertProductInput,
  UpsertSupplierInput,
} from "@/lib/domain/types";
import { qk } from "@/lib/api/keys";
import { useApiMutation, useInvalidate } from "@/lib/hooks/use-api";
import { fromMajor, money } from "@/lib/utils/money";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/misc";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Boxes } from "lucide-react";

export const CURRENCY_FALLBACK = "JOD";

export function newKey(prefix: string): string {
  return prefix + "-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);
}

export function minorValue(value: string, currency: string): ReturnType<typeof money> | undefined {
  if (!value.trim()) return undefined;
  const major = Number(value);
  return Number.isFinite(major) && major >= 0 ? fromMajor(major, currency) : undefined;
}

export function statusVariant(status: string): "neutral" | "success" | "warning" | "danger" {
  if (["completed", "received", "active"].includes(status)) return "success";
  if (["approved", "partially_received", "blocked"].includes(status)) return "warning";
  if (["cancelled", "archived"].includes(status)) return "danger";
  return "neutral";
}

/** Plain words for the stored status codes shown on orders, suppliers, machines, problems and repair jobs. */
const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  approved: "Approved",
  partially_received: "Partially received",
  received: "Received",
  cancelled: "Cancelled",
  active: "Active",
  archived: "Archived",
  maintenance: "In maintenance",
  retired: "Retired",
  replaced: "Replaced",
  open: "Open",
  in_progress: "In progress",
  resolved: "Fixed",
  completed: "Done",
  blocked: "On hold",
  unknown: "Not checked yet",
  safe_to_operate: "Safe to use",
  out_of_service: "Do not use",
};

export function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status.replaceAll("_", " ");
}

export function StatusBadge({ status }: { status: string }) {
  return <Badge variant={statusVariant(status)} dot>{statusLabel(status)}</Badge>;
}

export const SEVERITY_LABELS: Record<EquipmentIssue["severity"], string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

export function severityLabel(severity: string): string {
  return (SEVERITY_LABELS as Record<string, string>)[severity] ?? severity;
}

export const ASSET_STATUS_LABELS: Record<EquipmentAsset["status"], string> = {
  active: "Active",
  maintenance: "In maintenance",
  retired: "Retired",
  replaced: "Replaced",
};

export const WORK_ORDER_STATUS_LABELS: Record<EquipmentWorkOrder["status"], string> = {
  draft: "Draft",
  approved: "Approved",
  in_progress: "In progress",
  completed: "Done",
  cancelled: "Cancelled",
};

export function FormPanel({ title, description, onCancel, children, submitAction }: { title: string; description?: string; onCancel: () => void; children: React.ReactNode; submitAction?: React.ReactNode }) {
  const t = useT();
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onCancel(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <DialogBody>{children}</DialogBody>
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={onCancel}>{t("common.action.cancel")}</Button>
          {submitAction}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteDialog({ kind = "supplier", label, open, pending, onOpenChange, onConfirm }: { kind?: "product" | "supplier"; label: string; open: boolean; pending: boolean; onOpenChange: (open: boolean) => void; onConfirm: (reason: string, confirmation?: string) => void }) {
  const t = useT();
  const [reason, setReason] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const isProduct = kind === "product";
  const confirmed = !isProduct || confirmation.trim().toLowerCase() === label.trim().toLowerCase();
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) { setReason(""); setConfirmation(""); } onOpenChange(next); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isProduct ? "Delete " + label + " permanently?" : "Archive " + label + "?"}</DialogTitle>
          <DialogDescription>
            {isProduct
              ? "This removes the item for good, and its item code (SKU) can be used again. Past receipts, stock changes and orders are kept. This cannot be undone."
              : "Past orders stay as they are. You cannot choose this supplier for new orders or payments."}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-3">
          {isProduct ? <Field label={"Type " + label + " to confirm"} required><Input autoFocus value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder={label} /></Field> : null}
          <Field label={t("common.label.reason")} required><Textarea autoFocus={!isProduct} value={reason} onChange={(event) => setReason(event.target.value)} placeholder={isProduct ? "No longer sold, or added by mistake" : "No longer used, or added by mistake"} /></Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={pending}>{t("common.action.cancel")}</Button>
          <Button variant="danger" loading={pending} disabled={!confirmed || reason.trim().length < 3} onClick={() => onConfirm(reason.trim(), confirmation.trim() || undefined)}>
            {isProduct ? <Trash2 /> : <Archive />} {isProduct ? "Delete permanently" : "Archive"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function SectionHeader({ icon: Icon, title, description, actions }: { icon: typeof Boxes; title: string; description?: string; actions?: React.ReactNode }) {
  return <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3.5"><div className="flex min-w-0 items-start gap-2.5"><span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-sunken"><Icon className="size-3.5 text-ink-2" aria-hidden /></span><div><h2 className="font-display text-[14px] font-semibold">{title}</h2>{description ? <p className="mt-0.5 text-[12px] text-ink-3">{description}</p> : null}</div></div>{actions}</div>;
}

export function ReadOnlyNotice() {
  return <div className="rounded-md border border-line bg-sunken/50 px-3 py-2 text-[12px] text-ink-2" role="status">You can only view this page. Ask a manager to add or change items, suppliers, orders or machines.</div>;
}

export type OperationsMutations = {
  product: ReturnType<typeof useApiMutation<unknown, UpsertProductInput>>;
  deleteProduct: ReturnType<typeof useApiMutation<unknown, DeleteProductInput>>;
  supplier: ReturnType<typeof useApiMutation<unknown, UpsertSupplierInput>>;
  archiveSupplier: ReturnType<typeof useApiMutation<unknown, { id: string; reason: string }>>;
  purchaseOrder: ReturnType<typeof useApiMutation<unknown, CreatePurchaseOrderInput>>;
  approveOrder: ReturnType<typeof useApiMutation<unknown, { id: string; reason?: string }>>;
  receiveOrder: ReturnType<typeof useApiMutation<unknown, { purchaseOrderId: string; idempotencyKey: string }>>;
  transfer: ReturnType<typeof useApiMutation<unknown, InventoryTransferInput>>;
  asset: ReturnType<typeof useApiMutation<unknown, UpsertEquipmentAssetInput>>;
  issue: ReturnType<typeof useApiMutation<unknown, { branchId: string; assetId: string; title: string; description?: string; severity: EquipmentIssue["severity"]; downtimeDays?: number; safetyStatus: EquipmentIssue["safetyStatus"] }>>;
  issueUpdate: ReturnType<typeof useApiMutation<unknown, { id: string; input: UpdateEquipmentIssueInput }>>;
  workOrder: ReturnType<typeof useApiMutation<unknown, UpsertEquipmentWorkOrderInput>>;
};

export function useOperationsMutations(invalidate: ReturnType<typeof useInvalidate>): OperationsMutations {
  const options = { onSuccess: async () => { await invalidate([qk.operations()]); } };
  const product = useApiMutation((api, input: UpsertProductInput) => api.upsertProduct(input), { ...options, successMessage: "Stock item saved." });
  const deleteProduct = useApiMutation((api, input: DeleteProductInput) => api.deleteProduct(input), { ...options, successMessage: "Stock item deleted." });
  const supplier = useApiMutation((api, input: UpsertSupplierInput) => api.upsertSupplier(input), { ...options, successMessage: "Supplier saved." });
  const archiveSupplier = useApiMutation((api, input: { id: string; reason: string }) => api.archiveSupplier(input.id, input.reason), { ...options, successMessage: "Supplier archived." });
  const purchaseOrder = useApiMutation((api, input: Parameters<typeof api.createPurchaseOrder>[0]) => api.createPurchaseOrder(input), { ...options, successMessage: "Purchase order saved as a draft." });
  const approveOrder = useApiMutation((api, input: { id: string; reason?: string }) => api.approvePurchaseOrder(input.id, input.reason), { ...options, successMessage: "Purchase order approved." });
  const receiveOrder = useApiMutation((api, input: Parameters<typeof api.receivePurchaseOrder>[0]) => api.receivePurchaseOrder(input), { ...options, successMessage: "Order received. Stock updated." });
  const transfer = useApiMutation((api, input: InventoryTransferInput) => api.transferInventory(input), { ...options, successMessage: "Stock moved to the other branch." });
  const asset = useApiMutation((api, input: UpsertEquipmentAssetInput) => api.upsertEquipmentAsset(input), { ...options, successMessage: "Machine saved." });
  const issue = useApiMutation((api, input: Parameters<typeof api.reportEquipmentIssue>[0]) => api.reportEquipmentIssue(input), { ...options, successMessage: "Machine problem reported." });
  const issueUpdate = useApiMutation((api, input: { id: string; input: UpdateEquipmentIssueInput }) => api.updateEquipmentIssue(input.id, input.input), { ...options, successMessage: "Machine problem updated." });
  const workOrder = useApiMutation((api, input: UpsertEquipmentWorkOrderInput) => api.upsertEquipmentWorkOrder(input), { ...options, successMessage: "Repair job saved." });
  return { product, deleteProduct, supplier, archiveSupplier, purchaseOrder, approveOrder, receiveOrder, transfer, asset, issue, issueUpdate, workOrder } as OperationsMutations;
}

export function LoadingGrid() {
  return <div className="grid gap-3 sm:grid-cols-3"><Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" /></div>;
}
