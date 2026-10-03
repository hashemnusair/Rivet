/** Presentation descriptors only. Original accounting reasons stay immutable. */
export const ACCOUNTING_REASON_KEYS = {
  "A pending membership discount approval cannot be posted.": "accountingMessages.pendingDiscount",
  "A rejected membership discount cannot be posted.": "accountingMessages.rejectedDiscount",
  "Supplier payment amount is not a positive safe integer minor-unit amount.": "accountingMessages.supplierBadAmount",
  "This supplier payment has not been reversed, so there is no reversal to post.": "accountingMessages.notReversed",
  "The reversed supplier payment was never posted to the ledger, so the reversal has no ledger effect.": "accountingMessages.neverPostedReversal",
  "This supplier payment was reversed before it reached the ledger, so nothing is posted.": "accountingMessages.reversedBeforePosting",
  "The source fact does not match the requested accounting source type or lifecycle status.": "accountingMessages.sourceLifecycle",
  "The source fact has no positive amount.": "accountingMessages.sourceNoAmount",
  "The voided payment was never posted to the ledger, so the void has no ledger effect to reverse.": "accountingMessages.voidNeverPosted",
  "This membership was posted as immediate revenue; no recognition schedule exists.": "accountingMessages.immediateRevenue",
  "Membership cancellation date is invalid.": "accountingMessages.invalidCancellation",
  "Future membership service months cannot be recognized.": "accountingMessages.futureService",
  "Membership service start and end dates must be valid calendar dates.": "accountingMessages.invalidServiceDates",
  "Membership net amount is not a safe non-negative integer minor-unit amount.": "accountingMessages.invalidMembershipNet",
  "Membership discount approval is not complete.": "accountingMessages.discountApproval",
  "The original membership sale or renewal must be posted in the same branch and currency before revenue can be recognized.": "accountingMessages.postSaleFirst",
  "This service month has no positive amount to recognize.": "accountingMessages.noServiceAmount",
  "Membership recognition source is not configured.": "accountingMessages.recognitionNotConfigured",
  "The membership lifecycle does not match the requested sale or renewal source type.": "accountingMessages.saleLifecycle",
  "Membership discount is missing, negative, or exceeds the sale price.": "accountingMessages.invalidDiscount",
  "Membership sale net amount is not a safe non-negative integer minor-unit amount.": "accountingMessages.invalidSaleNet",
  "Retired or replaced equipment needs an audited effective retirement date before its depreciation schedule can continue.": "accountingMessages.retirementDate",
  "Future equipment service months cannot be depreciated.": "accountingMessages.futureDepreciation",
  "Equipment needs a valid placed-in-service date or purchase date before depreciation can be configured.": "accountingMessages.depreciationDate",
  "Equipment purchase cost must be a positive integer minor-unit amount before depreciation can be configured.": "accountingMessages.depreciationCost",
  "The equipment acquisition must be posted in the same branch and currency before depreciation can be recorded.": "accountingMessages.postAcquisitionFirst",
  "Equipment depreciation service month is not configured.": "accountingMessages.missingServiceMonth",
  "Equipment depreciation service month falls outside the useful-life schedule.": "accountingMessages.outsideUsefulLife",
  "Equipment depreciation amount is not a positive integer minor-unit amount.": "accountingMessages.invalidDepreciationAmount",
  "Equipment depreciation source is not configured.": "accountingMessages.depreciationNotConfigured",
  "Purchase order receipt cost is not a safe integer minor-unit amount.": "accountingMessages.invalidReceiptCost",
  "Cancelled purchase orders are excluded from the ledger.": "accountingMessages.cancelledPurchase",
  "Purchase order inventory must be fully received before posting.": "accountingMessages.receiveFully",
  "No receiving fact is recorded on this purchase order.": "accountingMessages.noReceiving",
  "Received purchase order cost is zero.": "accountingMessages.zeroReceiptCost",
  "Purchase-order-linked stock movements are excluded because the purchase receipt owns inventory and AP posting.": "accountingMessages.linkedStock",
  "Internal branch transfers move stock within the organization and do not create a journal entry.": "accountingMessages.internalTransfer",
  "Stock movement unit cost is not configured.": "accountingMessages.missingUnitCost",
  "Stock movement cost is not a positive integer minor-unit amount.": "accountingMessages.invalidStockCost",
  "Facility supplies are posted only after the task is completed.": "accountingMessages.suppliesAfterCompletion",
  "Facility supplies cost is not a configured safe integer minor-unit amount.": "accountingMessages.invalidSuppliesCost",
  "Equipment purchase date is not configured as a real calendar date.": "accountingMessages.invalidPurchaseDate",
  "Equipment purchase cost is not a configured safe integer minor-unit amount.": "accountingMessages.invalidPurchaseCost",
  "Equipment repair is posted only after the work order is completed.": "accountingMessages.repairAfterCompletion",
  "Equipment repair cost is not a configured safe integer minor-unit amount.": "accountingMessages.invalidRepairCost",
  "Source fact is missing its historical branch.": "accountingMessages.missingBranch",
  "Historical source belongs to an inactive branch and cannot receive a new posting.": "accountingMessages.inactiveBranch",
  "The source posting policy is not configured.": "accountingMessages.missingPolicy",
  "Posted from the management-ledger source queue.": "accountingMessages.sourceQueueReason",
  "Supplier payment currency does not match organization currency.": "accountingMessages.supplierCurrency",
  "Payment currency does not match organization currency.": "accountingMessages.paymentCurrency",
  "Payment lifecycle does not match the requested accounting source type.": "accountingMessages.paymentLifecycle",
  "Payment source has no positive amount.": "accountingMessages.paymentNoAmount",
  "Membership currency does not match organization currency.": "accountingMessages.membershipCurrency",
  "Membership lifecycle does not match the requested sale or renewal source type.": "accountingMessages.mockMembershipLifecycle",
  "Membership discount approval or currency is not configured.": "accountingMessages.discountCurrency",
  "Membership sale net amount is not a safe non-negative integer.": "accountingMessages.mockSaleNet",
  "Equipment cost currency does not match organization currency.": "accountingMessages.equipmentCurrency",
  "Stock movement currency does not match organization currency.": "accountingMessages.stockCurrency",
  "Purchase-order-linked stock movements are excluded to prevent duplicate inventory and AP posting.": "accountingMessages.mockLinkedStock",
  "Purchase order currency does not match organization currency.": "accountingMessages.purchaseCurrency",
  "Cancelled purchase orders are excluded.": "accountingMessages.mockCancelledPurchase",
  "No receiving cost is recorded.": "accountingMessages.noReceivingCost",
  "Facility supplies currency does not match organization currency.": "accountingMessages.suppliesCurrency",
  "Facility supplies post only after completion.": "accountingMessages.mockSuppliesAfterCompletion",
  "Equipment acquisition currency does not match organization currency.": "accountingMessages.acquisitionCurrency",
  "Equipment purchase date is not configured.": "accountingMessages.mockPurchaseDate",
  "Equipment repair currency does not match organization currency.": "accountingMessages.repairCurrency",
  "Equipment repairs post only after completion.": "accountingMessages.mockRepairAfterCompletion"
} as const;
type StaticKey = (typeof ACCOUNTING_REASON_KEYS)[keyof typeof ACCOUNTING_REASON_KEYS];
export interface AccountingReasonMessage {
  key: StaticKey | "accountingMessages.currencyMismatch" | "accountingMessages.sourceCurrencyMismatch" | "accountingMessages.supplierCurrencyMismatch" | "accountingMessages.serviceLimit" | "accountingMessages.usefulLifeLimit" | "accountingMessages.noEarnedMonth" | "accountingMessages.noMovementPolicy";
  params?: Record<string, string | number>;
}
export function describeAccountingReason(reason: string): AccountingReasonMessage | undefined {
  const key = Object.hasOwn(ACCOUNTING_REASON_KEYS, reason) ? ACCOUNTING_REASON_KEYS[reason as keyof typeof ACCOUNTING_REASON_KEYS] : undefined;
  if (key) return { key };
  let match = /^(Membership|Equipment cost|Purchase order|Stock movement|Facility supplies|Equipment acquisition|Equipment repair) currency does not match organization currency ([A-Z]{3})\.$/.exec(reason);
  if (match) return { key: "accountingMessages.currencyMismatch", params: { source: match[1]!, currency: match[2]! } };
  match = /^(Source|Supplier payment) currency ([A-Z]{3}) does not match organization currency ([A-Z]{3})\.$/.exec(reason);
  if (match) return { key: match[1] === "Source" ? "accountingMessages.sourceCurrencyMismatch" : "accountingMessages.supplierCurrencyMismatch", params: { sourceCurrency: match[2]!, currency: match[3]! } };
  match = /^Membership service schedules cannot exceed (\d+) months\.$/.exec(reason);
  if (match) return { key: "accountingMessages.serviceLimit", params: { count: Number(match[1]) } };
  match = /^Equipment expected useful life must be between 1 and (\d+) months\.$/.exec(reason);
  if (match) return { key: "accountingMessages.usefulLifeLimit", params: { count: Number(match[1]) } };
  match = /^No positive earned amount exists for (\d{4}-(?:0[1-9]|1[0-2]))\.$/.exec(reason);
  if (match) return { key: "accountingMessages.noEarnedMonth", params: { month: match[1]! } };
  match = /^No accounting policy exists for stock movement type ([a-z_]+)\.$/.exec(reason);
  if (match) return { key: "accountingMessages.noMovementPolicy", params: { type: match[1]! } };
  return undefined;
}
