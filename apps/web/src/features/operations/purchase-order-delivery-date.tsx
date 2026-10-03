"use client";
import { useLocale } from "@/lib/i18n/provider";

import { qk } from "@/lib/api/keys";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import type { PurchaseOrder } from "@/lib/domain/types";
import { useApiMutation, useInvalidate } from "@/lib/hooks/use-api";
import { useFormat } from "@/lib/i18n/format";

export function PurchaseOrderDeliveryDate({ order, editable }: { order: PurchaseOrder; editable: boolean }) {
  const { t, locale } = useLocale();
  const f = useFormat();
  const [editing, setEditing] = useState(false);
  const [date, setDate] = useState(order.expectedDeliveryDate ?? "");
  const invalidate = useInvalidate();
  const update = useApiMutation(api => api.updatePurchaseOrderDeliveryDate({ purchaseOrderId: order.id, expectedDeliveryDate: date || undefined }), {
    successMessage: t("stockWorkspace.deliveryDateSaved"),
    onSuccess: async () => { setEditing(false); await invalidate([qk.operations()]); },
  });
  const canEdit = editable && ["draft", "approved", "partially_received"].includes(order.status);
  if (editing) return <form className="flex flex-wrap items-end gap-2" onSubmit={event => { event.preventDefault(); update.mutate(); }}>
    <Field label={t("stockWorkspace.deliveryDate")}><Input type="date" lang={locale} dir="ltr" value={date} onChange={event => setDate(event.target.value)} /></Field>
    <Button type="submit" size="sm" loading={update.isPending}>{t("stockWorkspace.saveDate")}</Button><Button size="sm" variant="ghost" disabled={update.isPending} onClick={() => { setDate(order.expectedDeliveryDate ?? ""); setEditing(false); }}>{t("common.action.cancel")}</Button>
  </form>;
  return <div className="flex flex-wrap items-center gap-2 text-xs">
    <span className={order.overdue ? "font-medium text-warning-deep" : "text-ink-3"}>{order.overdue ? t("stockWorkspace.deliveryOverdue") : t("stockWorkspace.expectedDelivery")}: {order.expectedDeliveryDate ? f.date(order.expectedDeliveryDate) : t("common.state.notSet")}</span>
    {canEdit ? <Button size="xs" variant="ghost" onClick={() => setEditing(true)}>{order.expectedDeliveryDate ? t("stockWorkspace.changeDate") : t("stockWorkspace.setDate")}</Button> : null}
  </div>;
}
