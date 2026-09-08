import { beforeEach, describe, expect, it } from "vitest";
import { addDays, todayISODate } from "@/lib/utils/dates";
import { MockGymOSApi } from "./MockGymOSApi";

let api: MockGymOSApi;
beforeEach(async () => { api = new MockGymOSApi(); api.setBehavior({ latencyMs: 0 }); await api.switchDemoRole("owner"); });

describe("operational workflow parity", () => {
  it("keeps dated gym cancellations separate from the weekly schedule", async () => {
    const session = await api.getSession();
    const branchId = session.branches[0]!.id;
    const date = addDays(todayISODate(session.organization.timezone), 2);
    const template = await api.upsertClassSession({ branchId, name: "Cancellation test", dayOfWeek: new Date(`${date}T12:00:00Z`).getUTCDay(), startMinute: 1380, durationMinutes: 30, capacity: 2, audience: "mixed" });
    const occurrenceId = `occ:${template.id}:${date}`;
    const result = await api.cancelClassOccurrence({ occurrenceId, reason: "Coach unavailable" });
    expect(result).toMatchObject({ status: "cancelled", cancelReason: "Coach unavailable", bookedCount: 0, waitlistCount: 0 });
    expect(await api.cancelClassOccurrence({ occurrenceId, reason: "Repeat" })).toMatchObject({ cancelReason: "Coach unavailable" });
    expect((await api.listClassOccurrences({ branchId, fromDate: addDays(date, 7), toDate: addDays(date, 7) })).find(row => row.templateId === template.id)?.status).toBe("scheduled");
    await expect(api.finalizeClassOccurrenceAttendance({ occurrenceId })).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("keeps delivery-date changes independent of purchase value and stock receipt", async () => {
    const branchId = (await api.getSession()).branches[0]!.id;
    const product = (await api.listProducts())[0]!;
    const order = await api.createPurchaseOrder({ branchId, sourceType: "private", expectedDeliveryDate: "2020-01-01", lines: [{ productId: product.id, quantity: 2, unitCost: { amount: 500, currency: "JOD" } }] });
    await api.approvePurchaseOrder(order.id);
    expect((await api.listPurchaseOrders({ branchId })).find(row => row.id === order.id)?.overdue).toBe(true);
    expect(await api.updatePurchaseOrderDeliveryDate({ purchaseOrderId: order.id })).toMatchObject({ overdue: false, total: { amount: 1000 } });
    await expect(api.updatePurchaseOrderDeliveryDate({ purchaseOrderId: order.id, expectedDeliveryDate: "2026-02-30" })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(await api.receivePurchaseOrder({ purchaseOrderId: order.id, idempotencyKey: "delivery-parity" })).toMatchObject({ status: "received", total: { amount: 1000 } });
  });

  it("retains day-specific ownership and historical work after template changes", async () => {
    const session = await api.getSession();
    const branchId = session.branches[0]!.id;
    const template = (await api.listChecklistTemplates({ branchId }))[0]!;
    const date = addDays(todayISODate(session.organization.timezone), -1);
    await api.assignChecklistRun({ templateId: template.id, date, assignedUserId: session.user.id });
    await api.upsertChecklistTemplate({ ...template, templateId: template.id, assignedUserId: undefined });
    const day = await api.getChecklistDay({ branchId });
    expect(day.carryover?.find(run => run.templateId === template.id)).toMatchObject({ assignedUserId: session.user.id, localDate: date });
    expect(day.runs.find(run => run.templateId === template.id)?.assignedUserId).toBeUndefined();
    await expect(api.assignChecklistRun({ templateId: template.id, assignedUserId: "not-in-gym" })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
});
