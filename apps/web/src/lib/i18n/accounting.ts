import { describeAccountingReason, type AccountingReasonMessage } from "../domain/accounting-messages";
import { money } from "../utils/money";
import { isolate as isolateBidi } from "./bidi";
import type { Locale } from "./locale";
import type { Formatters } from "./formatters";
import type { TFunction, TKey } from "./core";

const STANDARD_ACCOUNTS: Record<string, readonly [string, TKey]> = {
  "1100": [
    "Cash on hand",
    "accountingMessages.account1100"
  ],
  "1110": [
    "Card clearing",
    "accountingMessages.account1110"
  ],
  "1120": [
    "Bank transfer clearing",
    "accountingMessages.account1120"
  ],
  "1200": [
    "Accounts receivable",
    "accountingMessages.account1200"
  ],
  "1300": [
    "Inventory",
    "accountingMessages.account1300"
  ],
  "1500": [
    "Gym equipment",
    "accountingMessages.account1500"
  ],
  "1550": [
    "Accumulated depreciation — equipment",
    "accountingMessages.account1550"
  ],
  "2100": [
    "Supplier payables",
    "accountingMessages.account2100"
  ],
  "2200": [
    "Deferred membership revenue",
    "accountingMessages.account2200"
  ],
  "3000": [
    "Owner equity",
    "accountingMessages.account3000"
  ],
  "4100": [
    "Membership revenue",
    "accountingMessages.account4100"
  ],
  "4200": [
    "Retail sales revenue",
    "accountingMessages.account4200"
  ],
  "5100": [
    "Cost of supplies and inventory",
    "accountingMessages.account5100"
  ],
  "5200": [
    "Repairs and maintenance",
    "accountingMessages.account5200"
  ],
  "5300": [
    "Facility supplies",
    "accountingMessages.account5300"
  ],
  "5600": [
    "Depreciation expense",
    "accountingMessages.account5600"
  ],
  "5900": [
    "Other operating expense",
    "accountingMessages.account5900"
  ]
};
/** A saved Arabic name wins. A renamed/custom account remains authored text. */
export function accountingAccountName(code: string, name: string, locale: Locale, t: TFunction, nameAr?: string): string {
  if (locale !== "ar") return name;
  if (nameAr) return nameAr;
  const standard = STANDARD_ACCOUNTS[code];
  return standard && name === standard[0] ? t(standard[1]) : name;
}

const DETAIL_KEYS = ["method", "supplierId", "supplierName", "reference", "paymentStatus", "allocationCount", "originalPaymentPostingStatus", "sourcePaymentType", "sourceStatus", "saleType", "membershipId", "serviceMonth", "serviceStart", "serviceEnd", "serviceDays", "netAmountMinor", "postedDeferredAmountMinor", "recognitionBaseMinor", "cancellationDate", "frozenServiceDaysExcluded", "allocatedAmountMinor", "allocationPolicy", "previousMembershipId", "startDate", "endDate", "salePriceMinor", "discountMinor", "discountApprovalStatus", "assetId", "assetCode", "assetName", "depreciationStartDate", "depreciationDateSource", "purchaseCostMinor", "postedAcquisitionAmountMinor", "depreciationBaseMinor", "usefulLifeMonths", "residualValueMinor", "monthIndex", "status", "receivedLines", "movementType", "productId", "quantity", "taskKind"] as const;
const DETAIL_LABELS: Partial<Record<string, TKey>> = Object.fromEntries(DETAIL_KEYS.map(key => [key, `accountingMessages.details.${key}` as TKey]));
const VALUE_KEYS = ["recorded", "reversed", "never_posted", "pending", "posted", "failed", "not_posted", "membership", "retail", "received", "partially_received", "cancelled", "approved", "completed", "draft", "active", "expired", "frozen", "unconfigured", "not_required", "rejected", "placed_in_service", "purchase_date", "purchaseDate", "placedInServiceDate", "sale", "refund", "void", "receive", "adjustment", "consume", "return", "transfer_in", "transfer_out", "damage", "write_off", "cleaning", "inspection", "repair", "supply", "other"] as const;
const VALUE_LABELS: Partial<Record<string, TKey>> = Object.fromEntries(VALUE_KEYS.map(key => [key, `accountingMessages.value.${key}` as TKey]));
const SOURCE_LABELS: Record<string, TKey> = {
  Membership: "accountingMessages.source.membership", "Equipment cost": "accountingMessages.source.equipmentCost", "Purchase order": "accountingMessages.source.purchaseOrder", "Stock movement": "accountingMessages.source.stockMovement", "Facility supplies": "accountingMessages.source.supplies", "Equipment acquisition": "accountingMessages.source.acquisition", "Equipment repair": "accountingMessages.source.repair",
};

export function accountingSourceReason(reason: string, t: TFunction, f?: Formatters, descriptor?: AccountingReasonMessage): string {
  const message = descriptor ?? describeAccountingReason(reason);
  if (!message) return reason;
  const params = { ...message.params };
  if (typeof params.source === "string" && SOURCE_LABELS[params.source]) params.source = t(SOURCE_LABELS[params.source]!);
  if (typeof params.type === "string" && VALUE_LABELS[params.type]) params.type = t(VALUE_LABELS[params.type]!);
  if (f && typeof params.month === "string") params.month = f.monthYear(`${params.month}-01`);
  return t(message.key, params);
}

/** Known fields carry human labels; IDs/policy codes and unknown diagnostics
 * remain exact. Money stays integer minor units in storage and only formats here. */
export function accountingDetailsLine(details: Record<string, unknown>, currency: string, locale: Locale, t: TFunction, f: Formatters): string {
  const enumFields = new Set(["paymentStatus", "originalPaymentPostingStatus", "sourcePaymentType", "sourceStatus", "saleType", "discountApprovalStatus", "depreciationDateSource", "status", "movementType", "taskKind"]);
  const render = (key: string, value: unknown): string => {
    if (key.endsWith("Minor") && typeof value === "number" && Number.isSafeInteger(value)) return f.money(money(value, currency));
    if (typeof value === "number") return f.number(value);
    if (typeof value === "string") {
      if (key === "method" && ["cash", "card", "bank_transfer", "cliq", "other"].includes(value)) return t(`domain.paymentMethod.${value}` as TKey);
      if (enumFields.has(key) && VALUE_LABELS[value]) return t(VALUE_LABELS[value]!);
      if (key === "serviceMonth" && /^\d{4}-\d{2}$/.test(value)) return f.monthYear(`${value}-01`);
      if (/^(?:serviceStart|serviceEnd|cancellationDate|startDate|endDate|depreciationStartDate)$/.test(key) && /^\d{4}-\d{2}-\d{2}$/.test(value)) return f.date(value);
      return value;
    }
    if (Array.isArray(value)) return value.map(item => typeof item === "object" && item !== null ? Object.entries(item).map(([k,v]) => render(k,v)).join(" – ") : render(key,item)).join(locale === "ar" ? "، " : ", ");
    return typeof value === "object" ? JSON.stringify(value) : String(value);
  };
  return Object.entries(details).filter(([,value]) => value != null && value !== "" && !(Array.isArray(value) && value.length === 0)).map(([key,value]) => t("accountingMessages.detailPair", { label: DETAIL_LABELS[key] ? t(DETAIL_LABELS[key]!) : key, value: isolateBidi(render(key,value)) })).join(" · ");
}
