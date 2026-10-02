import { describe, expect, it } from "vitest";
import { localizeErrorParameters } from "./error-parameters";
import { isolate, isolateLtr } from "./bidi";
import { renderDomainMessage } from "./domain-message";
import { classBookingBlockMessage } from "../domain/class-booking";
import { validateWorkspaceModuleSelection } from "../domain/workspace-modules";
import { workspaceModuleErrorMessage } from "../domain/workspace-module-error";

describe("dynamic system message presentation", () => {
  it("uses Jordanian calendar/clock presentation while leaving source values untouched", () => {
    const params = { date: "2026-10-02", time: "00:00", weekday: "fri", amount: "-7.125", reference: "INV-123", account: "1001", name: "إلياس Smith", count: 3 };
    expect(localizeErrorParameters(params, "en")).toBe(params);
    expect(localizeErrorParameters(params, "ar")).toMatchObject({ date: isolate("2 تشرين الأول 2026"), time: isolate("12:00 ص"), weekday: isolate("الجمعة"), amount: isolateLtr("-7.125"), reference: isolateLtr("INV-123"), account: isolateLtr("1001"), name: isolate("إلياس Smith"), count: 3 });
    expect(params.date).toBe("2026-10-02");
  });
  it("localizes enum values and unknown technical field names without translating user content", () => {
    expect(localizeErrorParameters({ fromStatus: "working", toStatus: "out_of_service", role: "receptionist", audience: "women", field: "unknownInternalName", modules: "foundation, reporting", name: "Working" }, "ar")).toEqual({ fromStatus: isolate("جاهز للاستخدام"), toStatus: isolate("غير صالح للاستخدام"), role: isolate("الاستقبال"), audience: isolate("النساء"), field: isolate("الحقل"), modules: isolate("أساسيات النادي، التقارير الإدارية"), name: isolate("Working") });
  });
  it("renders compatible old class reasons without changing the recorded English source", () => {
    const source = "This class is for women.";
    expect(renderDomainMessage(source, "ar", classBookingBlockMessage(source))).toContain("النساء");
    expect(renderDomainMessage(source, "en", classBookingBlockMessage(source))).toBe(source);
    const limit = "You already have 11 active class bookings.";
    expect(renderDomainMessage(limit, "ar", classBookingBlockMessage(limit))).toContain("11");
    expect(renderDomainMessage("This class was cancelled.", "ar")).toBe("أُلغيت هذه الحصة.");
  });
  it("retains workspace entitlement restrictions with a stable explanation", () => {
    let caught: unknown;
    try { validateWorkspaceModuleSelection(["foundation", "operations"], ["foundation"]); } catch (error) { caught = error; }
    expect(caught).toBeInstanceOf(Error);
    const source = (caught as Error).message;
    expect(source).toBe("Workspace module is not included in this plan: operations");
    expect(renderDomainMessage(source, "ar", workspaceModuleErrorMessage(caught))).toContain("العمليات");
  });
});
