import { errorValues as arValues } from "./messages/ar/errorValues";
import { errorValues as enValues } from "./messages/en/errorValues";
import { makeFormatters } from "./formatters";
import { isolate, isolateLtr } from "./bidi";
import type { MessageVars } from "./dictionary";
import type { Locale } from "./locale";

const normalize = (value: string) => value.replace(/[_\s-]/g, "").toLowerCase();
const names = new Map<string, string>();
for (const [key, value] of Object.entries(enValues.field)) {
  const arabic = arValues.field[key as keyof typeof arValues.field];
  names.set(normalize(key), arabic); names.set(normalize(value), arabic);
}
for (const [alias, target] of Object.entries({ branchId: "branch", memberId: "member", leadId: "lead", productId: "product", supplierId: "supplier", durationMinutes: "duration", startMinute: "startTime", dayOfWeek: "weekday", websiteUrl: "website", instagramUrl: "instagram", workOrder: "repair", equipmentAsset: "equipment", facilityTask: "maintenance" })) names.set(normalize(alias), arValues.field[target as keyof typeof arValues.field]);

function choice(values: Record<string, string>, value: string, fallback: string): string {
  const key = Object.keys(values).find(key => normalize(key) === normalize(value));
  return key ? values[key]! : fallback;
}

/** Only named system parameters are translated. User names, references and source facts
 * are isolated verbatim; canonical values in errors/details/storage are never changed.
 */
export function localizeErrorParameters(params: MessageVars | undefined, locale: Locale): MessageVars | undefined {
  if (!params || locale !== "ar") return params;
  const format = makeFormatters(locale, "", "UTC");
  return Object.fromEntries(Object.entries(params).map(([key, raw]) => {
    if (typeof raw === "number") return [key, raw];
    let value = raw;
    if (key === "field" || key === "entity") value = names.get(normalize(raw)) ?? (/[\u0600-\u06ff]/.test(raw) ? raw : key === "entity" ? arValues.field.record : arValues.field.field);
    else if (["status", "fromStatus", "toStatus"].includes(key)) value = choice(arValues.status, raw, arValues.field.unknownStatus);
    else if (key === "role") value = choice(arValues.role, raw === "receptionist" ? "reception" : raw, arValues.field.unknownRole);
    else if (key === "method") value = choice(arValues.method, raw === "bank" ? "bank_transfer" : raw, arValues.field.method);
    else if (key === "audience") value = choice(arValues.audience, raw, arValues.audience.mixed);
    else if (key === "modules") value = raw.split(/,\s*/).map(module => choice(arValues.module, module, arValues.field.unknownModule)).join("، ");
    else if (key === "module") value = choice(arValues.module, raw, arValues.field.unknownModule);
    else if (key === "currency" && raw === "JOD") value = "د.أ";
    else if (key === "weekday") {
      const day = Object.keys(arValues.weekday).find(day => day.startsWith(raw.toLowerCase())) ?? Object.keys(arValues.weekday)[Number(raw)];
      value = day ? arValues.weekday[day as keyof typeof arValues.weekday] : arValues.field.weekday;
    } else if (key === "date" && /^\d{4}-\d{2}-\d{2}$/.test(raw)) value = format.date(raw);
    else if (key === "dates") value = raw.split(/,\s*/).map(date => /^\d{4}-\d{2}-\d{2}$/.test(date) ? format.date(date) : date).join("، ");
    else if (key === "time" && /^\d{2}:\d{2}$/.test(raw)) value = format.time(`1970-01-01T${raw}:00Z`);
    return [key, /^[+-]?[0-9,.]+$/.test(value) || key === "reference" || key === "account" ? isolateLtr(value) : isolate(value)];
  }));
}
