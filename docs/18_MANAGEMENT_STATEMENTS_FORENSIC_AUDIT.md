# 18 — Management Statements Forensic Audit

**Living document.** First full audit executed 31 August 2026 against `main`
(base `2b0517f`). Update this file whenever accounting behavior, posting
policy, statement math, or a control changes.

This audit examined the management-ledger **system** — model, posting
pipelines, invariants, statements, controls, parity, authorization, and UX.
It did not reconcile or correct any tenant's books; existing tenant data was
inspected read-only for diagnosis and never treated as the expected answer.
All expected values in the regression evidence were hand-calculated from the
contract below.

---

## 1. The accounting contract

### 1.1 Model

- Double-entry management ledger. Money is **integer minor units** plus ISO
  currency; JOD has exponent **3** (fils), per ISO 4217. No floating point in
  any posting or statement path.
- Chart of accounts is code-owned (17 accounts, `convex/accounting.ts
  DEFAULT_ACCOUNT_DEFINITIONS`). `1550 Accumulated depreciation` is a
  credit-normal contra-asset inside `asset_noncurrent`.
- Journal entries are append-only. Every entry balances exactly (see
  `convex/accountingLedger.ts inspectLedgerBalance`): ≥ 2 lines, each line one
  positive safe-integer debit **or** credit in the organization currency,
  totals equal and non-zero, safe-integer overflow rejected.
- Corrections are owner-only **reversing entries** posted in the current open
  period, linked both ways (`reversalOfEntryPublicId` /
  `reversedByEntryPublicId`); originals become status `reversed` and stay
  immutable. Statements and the trial balance include both posted and
  reversed entries so a reversal nets rather than disappears.
- Periods are tenant-local calendar months. Posting dates are the
  **tenant-local** date of the source event (`localDate(occurredAt, tz)`);
  monthly facts (recognition, depreciation) are anchored so their timestamp's
  tenant-local date equals the stated month-end. Closed periods reject new
  postings; reopening is owner-only, latest-first, audited.
- Idempotency: journal keys are collision-safe JSON tuples
  (`sourcePostingIdempotencyKey`); manual journals and reversals persist a
  request fingerprint and reject material reuse of a key with `CONFLICT`;
  replays return the original result. A source has at most one posted journal
  per policy/version regardless of retries.

### 1.2 Source → ledger → statement matrix

| Source type | Recognition event | Amount | Dr / Cr | Reversal & notes |
|---|---|---|---|---|
| `membership_sale` / `membership_renewal` (**v2, current**) | record creation | net = salePrice − approved discount | 1200 / 4100 | **immediate whole-price revenue** (owner decision 2026-09-01, §7); blocked while discount approval pending/rejected, on cancellation, or lifecycle mismatch. Rows already queued under v1 stay pinned to v1 (1200 / 2200 deferred) |
| `membership_revenue_recognition` (`membership-revenue:{id}:{YYYY-MM}`) | tenant-local service-month end | monthly slice of `min(net, posted deferred)` by **daily-weighted-largest-remainder.v1** | 2200 / 4100 | **legacy-only**: exists solely for terms whose original posted under a deferred v1 policy, in the same branch+currency; never recognizes future months, frozen days, or days past the cancellation boundary. Immediate-revenue and unposted sales emit no schedule |
| `payment` (membership) | `occurredAt` | payment amount | 1100/1110/1120 / 1200 | method → cash account; voided payments cannot post as payments |
| `payment` (retail, `type=retail_sale`) | `occurredAt` | sale amount | cash / 4200 (`retail-sale-*.v2`) | v1 retail policies are frozen legacy (credit 4100) and only preserved on pre-existing rows |
| `refund` (membership) | `occurredAt` | abs(amount) | 1200 / cash | collection-side only; service value stops via cancellation, not refund |
| `refund` (retail, `retailSaleId`) | `occurredAt` | abs(amount) | 4200 / cash | revenue reversal; stock restoration is a separate `return` movement |
| `void` | `occurredAt` | original amount | 1200 (or 4200 retail) / cash | **requires the original payment source to be `posted`**; otherwise `excluded` — a void of a never-posted payment has no ledger effect (fixed in this audit) |
| `purchase_order_receipt` | fully received | Σ receivedQty × unitCost | 1300 / 2100 | partial/cancelled stay unconfigured; linked stock `receive` movements are excluded to prevent double posting |
| `stock_movement` `sale`/`consumption`/`waste` | `occurredAt` | qty × unitCost (or exact total) | 5100 / 1300 | COGS |
| `stock_movement` `return` (retail refund/void) | `occurredAt` | qty × unitCost | 1300 / 5100 | COGS restoration |
| `stock_movement` transfers | — | — | — | excluded: internal, no journal |
| `facility_supplies` | task completed | suppliesCost | 5300 / 2100 | |
| `equipment_acquisition` | purchase date (tenant-anchored) | purchase cost | 1500 / 2100 | |
| `equipment_depreciation` (`equipment-depreciation:{id}:{YYYY-MM}`) | tenant-local month end | **straight-line-monthly-remainder.v1** over `min(cost, posted acquisition)` | 5600 / 1550 | requires posted acquisition; retired/replaced assets stop and demand an audited effective date |
| `equipment_repair` | work order completed | total or parts+labor | 5200 / 2100 | |
| manual journal | stated posting date | arbitrary balanced lines | any | owner-only, reasoned, fingerprinted |

Unsupported cases (`adjustment` movements, missing cost, missing branch,
foreign currency, pending approvals, invalid dates) become explicit
`unconfigured`/`excluded` queue rows with a reason — never silent zeros and
never invented entries.

### 1.3 Allocation policies (both proven by independent recomputation)

- **daily-weighted-largest-remainder.v1** — net amount ÷ inclusive
  non-frozen service days as `floor` quotient; the first `remainder` service
  days receive +1 minor unit. Allocations always sum exactly to the base;
  cancellation truncates *which* days are earned without repricing earlier
  days; freezes exclude days (product freezes also extend the end date, so
  the per-day rate is preserved). **This is why a whole-dinar membership
  legitimately shows fils in one month's earned revenue.**
- **straight-line-monthly-remainder.v1** — cost ÷ useful-life months, first
  `remainder` months +1; totals equal cost exactly.

### 1.4 Statements

- **Income statement**: period activity by posting date; revenue/other
  income credit-normal, costs debit-normal; net income = (revenue + other
  income) − (COGS + operating + other expenses).
- **Balance sheet**: cumulative through the as-of date.
  `cumulativeEarnings` (revenue − costs from ledger inception; there is no
  period-close roll-up yet) closes the equation
  `assets = liabilities + equity + cumulativeEarnings`. The equation balances
  **by construction** for any set of balanced entries, so `balanced: true` is
  an arithmetic identity, not a completeness claim — completeness lives in
  coverage/warnings. `currentEarnings` remains as a deprecated equal-valued
  alias for deploy-skew tolerance.
- **Cash flow** (`cashflow-classification.v2`): a classified cash-account
  movement report. "Cash" = 1100/1110/1120 (drawer + card/bank clearing —
  clearing balances are effectively cash equivalents in this model). Each
  entry's cash movement is classified by its non-cash counterparts: any
  non-current-asset counterpart → investing; else equity/non-current
  liability → financing; else operating. Entries whose lines are all cash
  accounts are **internal transfers, excluded** from the sections (their net
  cash effect is zero, so reconciliation is unchanged). Entries mixing
  counterpart activities are classified by priority **and produce a warning**
  naming the count and recommending split journals. Reconciliation shows
  opening + classified net vs. the independent as-of cash position and only
  claims `proven` under proven queue coverage.
- **Completeness ("proven")**: a report's coverage is proven only when a
  queue-run digest matches the freshly re-derived authoritative candidate
  set and every non-posted candidate's projection fingerprint is current.
  Posted rows are immutable, but if a posted row's **amount, currency, or
  branch** no longer matches the re-derived operational fact, every
  statement now carries a drift warning telling the owner to review for a
  reversal + corrected posting (new control, this audit).

### 1.5 Authorization

`reports.financial.read` gates every read; finance/reporting workspace
modules gate the surfaces; posting requires `accounting.post` + owner or
manager; manual journals, reversals, and period close/reopen are owner-only
with mandatory audited reasons. Branch-scoped actors never receive
unattributed (branch-less) ledger rows, consolidated journals, or another
branch's figures; consolidated journals require organization-wide scope.

---

## 2. Findings and corrections (severity-ordered)

### F1 — HIGH · A void of a never-posted payment fabricated a cash outflow
- **Where**: `convex/accounting.ts sourceFact` (void branch); mock
  `mockAccountingFact`.
- **Defect**: a payment voided *before* it was ever posted produced a
  `pending` void candidate. Posting it created `Dr 1200 / Cr cash` — a cash
  credit with no debit ever posted, permanently understating cash and
  inflating receivables (the voided payment itself can never post). Financial
  impact: any tenant that voided an unposted payment and then worked the
  queue would understate cash by the voided amount per occurrence.
- **Fix**: a void fact is `pending` only when the original `payment` source
  posting is `posted`; otherwise it is `excluded` with "The voided payment
  was never posted to the ledger, so the void has no ledger effect to
  reverse." Details expose `originalPaymentPostingStatus`. Applied
  symmetrically to retail voids and mirrored in the mock.
- **Evidence**: `convex/managementReports.forensic.test.ts` ("refuses to
  fabricate a cash outflow…") proves the excluded decision, the exact
  swapped-line journal when the original *was* posted, and that
  payment + void net to a zero trial balance. Verified live in the mock UI
  (seeded voided payment now shows the excluded reason).

### F2 — MEDIUM · `currentEarnings` mislabeled cumulative unclosed earnings
- **Where**: both adapters' balance sheet, `types.ts`, statement UI.
- **Defect**: the field is revenue − costs **from ledger inception** through
  the as-of date (there is no period close/retained-earnings roll-up), but
  was named "current earnings", and the UI equation strip said "current
  earnings" while the card said "Cumulative earnings" — a user could read a
  since-inception figure as this period's profit.
- **Fix**: canonical `cumulativeEarnings` field emitted by both adapters
  (equal-valued `currentEarnings` kept as a deprecated alias so a frontend
  and backend deployed minutes apart cannot disagree); equation copy now
  says "cumulative earnings"; the card explains the derivation; balance
  sheet scope strip now reads "As of {date}" instead of a period range.
- **Evidence**: forensic membership test asserts both fields and the exact
  hand-derived value (68,650 before reversal; 25,942 after).

### F3 — MEDIUM · Cash-flow classification hid transfer noise and mixed-entry ambiguity
- **Where**: both adapters' cash-flow statement.
- **Defects**: (a) an internal transfer between cash accounts (e.g., drawer →
  bank) appeared as offsetting operating lines — money the business never
  received or spent; (b) a compound entry pairing one cash movement with
  counterparts from multiple activities was silently classified whole by a
  single match; (c) the v1 policy description did not describe the actual
  priority rule.
- **Fix**: `cashflow-classification.v2` — all-cash entries are excluded from
  the classified sections (net cash effect is zero, reconciliation
  unchanged); mixed-counterpart entries stay priority-classified
  (investing → financing → operating) but add a statement warning
  recommending split journals; the policy text now states the cash
  definition, the priority rule, and the transfer exclusion. The statement
  is explicitly a classified cash-account movement report.
- **Evidence**: forensic cash-flow test (equity 100k financing, equipment
  −40k investing, 25k transfer excluded from every section's `entryIds`,
  mixed 3-line entry classified financing + warning, closing cash 70k with
  zero reconciliation difference). Mock parity test asserts the same
  numbers.

### F4 — MEDIUM · Changed operational facts left a posted amount looking current
- **Where**: `sourceQueueCoverageForReport` (Convex) / `mockSourceQueueCoverage`.
- **Defect**: coverage deliberately never re-projects posted rows (they are
  immutable decisions), but nothing surfaced the case where the operational
  record itself changed after posting (amount/currency/branch) — e.g., a
  cancellation shrinking an already-posted recognition month, or an edited
  equipment cost. Statements looked fully current while diverging from
  operational truth.
- **Fix**: coverage counts posted rows whose re-derived fact differs in
  amount, currency, or branch; every statement then warns: "N posted
  accounting source postings no longer match the current operational
  record… Review the source queue and use an owner reversal plus a corrected
  posting." Reversed rows are completed corrections and never flagged.
  Product freezes do not false-positive (they extend the end date, so
  already-posted months keep their per-day rate).
- **Evidence**: forensic membership test cancels mid-February after February
  was posted (hand-derived drift: 42,708 posted vs 22,883 earned), asserts
  the warning appears, then asserts it clears after the owner reversal.

### F5 — MEDIUM · Mock recognition ignored completed freeze history
- **Where**: `MockGymOSApi` recognition fact + candidate discovery.
- **Defect**: only `activeFreeze` fed the allocator; the `freezes` history
  array was ignored. Once a freeze completed (or was ended early), the mock
  re-included frozen days as earned service — over-recognizing in mock mode
  and diverging from Convex (which reads `freezes` + `activeFreeze`).
- **Fix**: `mockMembershipFreezeWindows` merges the history and the active
  flag; both call sites use it.
- **Evidence**: mock parity test freezes today, ends the freeze (active flag
  clears, completed row remains), and proves the current month's
  `serviceDays` drops by exactly one.

### F6 — LOW · Mock chart was missing account 5900
- Convex seeds 17 accounts including `5900 Other operating expense`; the
  mock seeded 16, so a manual journal to `acct-5900` worked in production
  and failed in mock/preview. Added; parity test posts through 5900 and the
  UI now lists 17 accounts in both modes.

### F7 — LOW · Mock GM cash-variance metric had no drill-downs
- `cash_variance` reported `sourceCount > 0` with empty `drilldownIds`,
  violating the drill-down invariant the Convex adapter satisfies. Fixed to
  emit shift ids; parity test asserts `drilldownIds.length ===
  min(sourceCount, 100)` for every metric.

### F8 — LOW · Statement UX gaps
- The income statement never explained why whole-dinar memberships produce
  fils → added a "Why fils appear" note (shown whenever recognition
  candidates exist) naming the allocation policy and the conservation
  guarantee.
- Net-income caption omitted other income → corrected.
- Balance sheet showed a period range instead of an as-of date → corrected.

---

## 3. Verified correct (no change needed)

- **The decimal behavior that triggered the audit is correct.** JOD's ISO
  exponent is 3; storage and statements are exact integer fils; monthly
  fils on whole-dinar memberships are the deterministic daily allocation and
  always re-sum to the exact net price. 17 hand-calculated allocator cases
  (`convex/accounting.allocation.test.ts`) cover leap/non-leap February,
  year crossing, full year, one-day terms, one-fil amounts, sub-day-count
  amounts, overlapping/duplicate/cancelled freezes, fully frozen terms,
  cancellation boundaries (before start / mid-term / after end), the
  120-month bound, and max-safe-integer conservation. Formatting
  (`money.ts`) renders all three decimals and never rounds statement values.
- Double-entry, idempotency/replay/`CONFLICT` semantics, reversal linkage,
  closed-period protection, tenant/branch/role authorization (including the
  refusal to leak unattributed rows to branch-scoped actors), tenant-local
  date anchoring, deferred→recognition conservation
  (`min(net, posted deferred)` cap), depreciation dependency on the posted
  acquisition, purchase-order/stock double-posting exclusion, and the
  balance-sheet identity — all confirmed by existing plus new tests.
- Statement math cross-checks: full membership lifecycle (sale → payment →
  two recognition months → refund → cancel → reversal) and full retail
  lifecycle (PO receipt → sale → COGS → refund → restock) reproduce every
  hand-derived line, subtotal, equation, and cash-flow figure exactly.
- The balance-sheet "balanced" flag is an identity, not a completeness
  claim; completeness is carried by coverage plus warnings, and reports
  refuse to claim reconciliation is proven while coverage is unproven.

---

## 4. Open policy decisions (owner/accountant)

Not defects; the system currently takes the safest documented behavior:

1. **No retained-earnings close.** Cumulative earnings never roll into
   equity. Acceptable for management reporting; a year-end close would need
   a policy and a closing-entry mechanism.
2. **Refund ordering.** A refund may post before its original payment
   (both remain visible in the queue; books are transiently asymmetric but
   converge). Voids are dependency-gated; refunds deliberately are not,
   because the refund's cash-out is a real standalone event.
3. **Refunds never touch deferred revenue.** Service value ends via
   cancellation only. If a gym wants refunds to shorten service, that is a
   commercial policy change.
4. **AP settlement is out of scope**: supplier payables (2100) accrue with
   no payment source type yet; equipment/PO purchases therefore never hit
   the cash-flow statement until such a source exists (owner manual journals
   can bridge).
5. **Legacy v1 retail policies** stay frozen on historical rows by design.

## 5. Known limitations

- A deleted operational record orphans its posted row silently (candidates
  are derived from live records). Deletion is not a supported flow for
  financial records; noted for imports.
- Drift detection compares amount/currency/branch only; memo-level edits
  are not flagged (immaterial to statements).
- An owner reversing a *payment* entry after its void was posted
  double-reverses cash; both actions are owner-only and audited.
- Coverage digests are recomputed per report request (full candidate scan);
  acceptable at pilot scale, revisit for large tenants.
- Recognition-row diagnostics label the original's amount
  `postedDeferredAmountMinor` even while the original is merely pending
  (validation itself correctly requires `posted`).

## 6. Verification (31 August 2026)

- New: `convex/accounting.allocation.test.ts` (17), forensic lifecycles
  `convex/managementReports.forensic.test.ts` (4), mock parity additions in
  `src/lib/mock/managementReports.test.ts` (3). Each new test fails against
  the pre-audit code and passes after the corrections.
- Full commands: `pnpm typecheck`, `pnpm convex:typecheck`,
  `pnpm convex:codegen`, `pnpm lint`, `pnpm test`, `pnpm build`,
  `git diff --check`, plus the credential-free Playwright suite — results in
  `CURRENT_STATE.md`.
- Mock-mode browser walkthrough (sanctioned `web-mock` config): hub, all
  three statements (desktop + mobile widths), ledger controls with a
  100-fact queue refresh, the excluded-void reason visible in the queue, the
  17-account chart, v2 policy copy, and no application console errors.

---

## 7. Addendum — owner policy change and review controls (1 September 2026)

The owner reviewed the audited system on live data and made the deferred
model's monthly fils and monthly clicks an explicit product decision:

- **Membership revenue policy v2 (owner decision).** `membership-sale.v2` /
  `membership-renewal.v2` post the full net price as revenue at sale
  (1200 → 4100, immediate). There is no deferral, no service-day split, and
  no recognition schedule for new sales — whole-dinar prices produce
  whole-dinar statements. v1 stays defined for history: already-posted
  deferred terms keep their recognition schedules until they run off or an
  owner reverses the v1 sale (and its posted recognition months) and
  re-posts the sale from the queue under v2. Queue rows previously projected
  under v1 stay pinned to v1 by policy preservation. Trade-offs accepted by
  the owner: revenue is front-loaded to the sale month, and a mid-term
  cancellation does not automatically claw back recognized revenue (a refund
  reverses cash only; any further adjustment is an owner manual journal).
- **Review exclusions.** `accounting.source.exclude` /
  `accounting.source.reconsider` (owner/manager, audited reason,
  `reviewExcludedAt`/`reviewExcludedByUserId` on the row — additive schema
  fields). A reviewed exclusion survives queue refreshes like a posted row,
  counts as resolved for coverage and schedule statuses, and is superseded
  by explicitly posting the source. This is the honest mechanism for
  clearing cancelled test data, unpriced movements, and other
  never-postable facts out of the completeness warnings without deleting
  anything.
- **Warning semantics.** `excluded` rows (system rules and reviewed
  decisions) no longer count toward the "source facts are not posted"
  warning; recognition/depreciation coverage ignores months whose
  tenant-anchored month end has not passed yet, so the current month stops
  nagging before it is completable.
- **UI.** Queue rows gained Exclude/Reconsider actions with audited reasons
  and a reviewed marker; the classes details popup reads booking counts from
  the dated class (the weekly template's standing roster had been shown,
  reporting 0 for booked events) and lists who booked, with the calendar
  chips corrected the same way.
- **Evidence.** Regression tests cover the immediate lifecycle across all
  three statements, the legacy deferred lifecycle via seeded v1 rows
  (recognition, cancellation drift, reversal), the no-schedule guarantee for
  v2 sales, and review-exclusion persistence/reconsideration in both
  adapters.
