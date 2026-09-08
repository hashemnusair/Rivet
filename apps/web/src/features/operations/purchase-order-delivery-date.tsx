"use client";

import { qk } from "@/lib/api/keys";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import type { PurchaseOrder } from "@/lib/domain/types";
import { useApiMutation, useInvalidate } from "@/lib/hooks/use-api";

export function PurchaseOrderDeliveryDate({ order, editable }: { order: PurchaseOrder; editable: boolean }) {
  const [editing, setEditing] = useState(false);
  const [date, setDate] = useState(order.expectedDeliveryDate ?? "");
  const invalidate = useInvalidate();
  const update = useApiMutation(api => api.updatePurchaseOrderDeliveryDate({ purchaseOrderId: order.id, expectedDeliveryDate: date || undefined }), {
    successMessage: "Expected delivery updated.",
    onSuccess: async () => { setEditing(false); await invalidate([qk.operations()]); },
  });
  const canEdit = editable && ["draft", "approved", "partially_received"].includes(order.status);
  if (editing) return <form className="flex flex-wrap items-end gap-2" onSubmit={event => { event.preventDefault(); update.mutate(); }}>
    <Field label="Expected delivery date"><Input type="date" value={date} onChange={event => setDate(event.target.value)} /></Field>
    <Button type="submit" size="sm" loading={update.isPending}>Save date</Button><Button size="sm" variant="ghost" disabled={update.isPending} onClick={() => { setDate(order.expectedDeliveryDate ?? ""); setEditing(false); }}>Cancel</Button>
  </form>;
  return <div className="flex flex-wrap items-center gap-2 text-xs">
    <span className={order.overdue ? "font-medium text-warning-deep" : "text-ink-3"}>{order.overdue ? "Delivery overdue" : "Expected delivery"}: {order.expectedDeliveryDate ?? "Not set"}</span>
    {canEdit ? <Button size="xs" variant="ghost" onClick={() => setEditing(true)}>{order.expectedDeliveryDate ? "Change date" : "Set date"}</Button> : null}
  </div>;
}
