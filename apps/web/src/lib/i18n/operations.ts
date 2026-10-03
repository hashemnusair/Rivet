import type { TFunction } from "./core";
import type { Formatters } from "./formatters";
import type { EquipmentRationaleMessage } from "../domain/equipment-rationale";
import { localDateTimeToISO, partsInTimeZone } from "../utils/dates";

export function equipmentRationaleText(t: TFunction, f: Formatters, message: EquipmentRationaleMessage): string {
  switch (message.key) {
    case "operationsWorkspace.rationaleProblems":
      return t(message.key, { problems: t("operationsWorkspace.reportedProblems", { count: message.params.count }) + ".", days: t("operationsWorkspace.days", { count: message.params.days }) });
    case "operationsWorkspace.rationaleAge": return t(message.key, { age: f.number(message.params.age), life: f.number(message.params.life) });
    case "operationsWorkspace.rationalePercent": return t(message.key, { percent: typeof message.params.percent === "number" ? f.number(message.params.percent) : message.params.percent });
    default: return t(message.key);
  }
}

export function maintenanceDateTimeInput(iso: string | undefined, timeZone: string): string {
  if (!iso) return "";
  const parts = partsInTimeZone(new Date(iso), timeZone);
  return `${parts.date}T${parts.time.slice(0, 5)}`;
}

/** Reject invalid/gap wall times instead of silently changing a maintenance deadline. */
export function maintenanceDueInstant(value: string, timeZone: string): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return undefined;
  try {
    const iso = localDateTimeToISO(value.slice(0, 10), value.slice(11), timeZone);
    return maintenanceDateTimeInput(iso, timeZone) === value ? iso : undefined;
  } catch { return undefined; }
}
