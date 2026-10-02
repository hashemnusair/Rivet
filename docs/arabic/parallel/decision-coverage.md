# Approved Arabic decision coverage packet

## Authority and result

This packet uses the locked `2026-09-30-v1` revision 607 in `approved-decisions.v1.json`; the approval export, checksum, and source registry were not changed. `decision-coverage.json` now has one row for each of the 247 approved IDs, with no pending rows and no decision marked complete. The tracker has 233 `in progress` rows and 14 `verified` rows. The 14 verified rows consist of two tested global style rules (`voice`, `address`) and 12 source-audited contexts that do not exist in current behavior. The latter are explicitly marked `notApplicable:true`; this is a statement about current product scope, not a claim that their exact wording was implemented.

For rows with `keys`, the existing approved-wording test compares the current Arabic leaf to the exact v1 wording. `composedKeys` keep surrounding product wording and variables visible while checking that the approved term remains exact; the rule is `messages.test.ts#preserves exact approved terms inside composed labels`. Style-only decisions point to concrete current examples in that test file. `candidateOccurrences` remain source locations for review, not a blanket assertion that every route state or occurrence is complete. The tracker deliberately leaves no decision at `complete`.

The coverage also has explicit evidence for nine rows that previously contained only source leads: `all-branches`, `retention`, `problem`, `collections`, `receivables`, `incomplete-report`, `offline`, `my-gyms`, and `signature`. In particular, `problem` maps the approved equipment-fault sense to the existing equipment report form; the checklist “Problem?” action is a distinct result prompt. `collections` maps to the report navigation label while `reportsWorkspace.collections` remains the separate combined charged-and-paid report heading (`charged-paid`). The `signature` mapping is the current signing-step label; versioned agreement source and signed records remain unchanged.

## Current not-applicable contexts

The exact v1 phrases remain untouched in the approval source. Each row retains a current source/test reference and explains why adding a translation key or feature would misstate existing behavior.

| ID and approved phrase | Current-scope evidence |
| --- | --- |
| `ends-tomorrow` — `ينتهي اشتراكك غدًا.` | Membership detail displays the dynamic expiry date and status; current reminders say “soon,” with no next-day-specific notice. See `membership-detail.client.tsx` and its test. |
| `unlimited` — `زيارات غير محدودة` | Plan names and terms are authored content; membership detail has no generated unlimited-visit badge. See `membership-detail.client.tsx` and its test. |
| `check-out` — `تسجيل المغادرة` | Reception records entry/check-in and has no visit check-out operation. See the reception route and `checkin-copy.test.ts`. |
| `inside` — `الأعضاء داخل النادي` | Visits have no open/closed state or currently-inside roster. See the reception route test. |
| `cash-in` — `إيداع في الصندوق` | Cash shifts track opening float, eligible source payments/refunds, and closing count; there is no standalone cash-deposit adjustment. See `shift-dialogs.ui.test.tsx`. |
| `cash-out` — `سحب من الصندوق` | Supplier payments/refunds stay in their source workflows; there is no generic drawer-withdrawal adjustment. See `shift-dialogs.ui.test.tsx` and `payables-arabic.test.tsx`. |
| `message-failed` — `لم تُرسل الرسالة. أعد المحاولة.` | After delivery retries are exhausted, the notice gives the attempt count and alternate contact direction; it has no retry action. See `system-messages.ts` and `system-messages.test.ts`. |
| `in-transit` — `قيد النقل` | Branch stock transfer updates both sides in one operation and has no pending receipt/transit status. See `inventory-tab.tsx` and `stock-arabic.test.tsx`. |
| `pass-check` — `لا توجد مشكلة` | Checklist results are completed, failed, or skipped; completed means the task was done, not that an inspection passed. See the checklist route test. |
| `not-applicable` — `لا ينطبق` | Checklist has no N/A result; “skipped today” is a different action. See the checklist route test. |
| `handover` — `ملاحظات التسليم` | Unfinished checklist items carry into a handover summary, but staff do not enter shift/team notes there. See branch-ops and checklist tests. |
| `join` — `اشترك في هذا النادي` | Public directory supports gym discovery and trial requests; it has no direct membership purchase/join operation. See `gym-detail.client.tsx` and signup tests. |

## Wording and key changes

The narrow changes below resolve exact approved terms in existing, used contexts. Placeholders and plural forms were preserved; no unused keys or new workflows were added.

- In `apps/web/src/lib/i18n/messages/ar/{memberProfile.ts,memberMigration.ts,deskCompletion.ts,memberExperience.ts,renewFlow.ts,domain.ts,crmCompletion.ts}`, the changed keys are `memberProfile.tabs.timeline`, `memberProfile.whatsapp.message`, `memberMigration.matchColumns`, `memberMigration.possibleMatch`, `deskCompletion.reception.verdict.blocked`, `deskCompletion.reception.message.visitsDepleted`, `memberExperience.showCode`, `renewFlow.payment.titleSaved`, `renewFlow.receipt.refund.description`, `domain.leadStage.lost`, and `crmCompletion.lead.trialStatus.converted`.
- In `apps/web/src/lib/i18n/messages/ar/{dashboard.ts,salesWorkspace.ts,statements.ts,payablesWorkspace.ts,customerPortal.ts}`, the changed keys are `dashboard.today.kind.at_risk`, `dashboard.sales.dueToday`, `salesWorkspace.sameArea`, `statements.cashCheck`, `payablesWorkspace.irreversible`, `payablesWorkspace.missingPurchaseSupplier`, `payablesWorkspace.missingRepairSupplier`, and `customerPortal.transactions`.
- In `apps/web/src/lib/i18n/messages/ar/{authErrors.ts,auth.ts,marketing.ts,platformFinance.ts}`, the changed keys are `authErrors.emailCode`, `authErrors.resend`, `auth.signIn.verify.resend`, `marketing.actions.findGym`, `marketing.actions.applyShort`, and `platformFinance.billing.paymentRecordedToast`. The signup test now queries the approved Arabic CTA while continuing to verify normalized phone digits and the captured locale.
- `apps/web/src/lib/i18n/messages/{en,ar}/communicationCompletion.ts` updates `communicationCompletion.email.kinds.renewal_reminder.body` to use the approved renewal opening while retaining the existing account, upcoming-invoice, and contact details.
- In `apps/web/src/lib/i18n/messages/ar/{statements.ts,reportsWorkspace.ts,navigationCatalogue.ts,accountingMessages.ts,customerPortal.ts,publicCompletion.ts,agreementFlow.ts}`, the additional aligned keys are `statements.allBranches`, `statements.incomplete`, `reportsWorkspace.retention`, `navigationCatalogue.report_retention.label`, `navigationCatalogue.report_collections.label`, `accountingMessages.account1200`, `customerPortal.staleNotice`, `publicCompletion.footer.myGyms`, and `agreementFlow.signature`. The distinct `reportsWorkspace.collections` label stays unchanged because it maps to the approved `charged-paid` decision.
- `messages.test.ts` includes direct assertions for formal concise staff-screen examples and polite gender-neutral member payment guidance. Its composed-label assertion now covers every `composedKeys` entry, not only money labels.

## Validation

- Focused catalog, reports, operations, legal-signing, and member-portal tests:
  `pnpm exec vitest run --configLoader runner src/lib/i18n/messages.test.ts src/features/reports/management-statements-workspace.test.tsx src/features/reports/operational-reports-arabic.test.tsx src/features/operations/operations-arabic.test.tsx src/features/legal/subscription-agreement-modal.test.tsx src/app/customer/my-gyms/page.test.tsx`
  Result: 6 files passed; 49 tests passed. jsdom prints its existing unimplemented canvas `getContext` diagnostic for signature-pad rendering; the two agreement-modal tests still pass.
- Catalog plus Arabic signup draft/action boundary tests:
  `pnpm exec vitest run --configLoader runner src/lib/i18n/messages.test.ts src/app/signup/page.test.tsx`
  Result: 2 files passed; 17 tests passed. The Arabic submission assertion checks the approved button name, normalized phone, selected plan/cadence, and captured locale.
- `python3 docs/arabic/verify-lock.py`: passed; revision 607, 247 exact agreements, both approvals, eight custom decisions, one note, checksum and registry match.
- Read-only coverage validator: 247 IDs matched the approval registry; all rule/source references exist and source line references are in range; 14 verified, 12 explicitly not applicable; 0 reference errors.
- Focused ESLint over the directly edited decision-copy catalogs and tests with `--max-warnings=0`: passed.

## Limits

The coverage status is implementation tracking, not certification of all 247 occurrences. All 233 `in progress` rows retain actual current catalog keys, composed-key tests, or explicit style rules; route locations in `candidateOccurrences` are leads where additional workflow review remains. No signed agreement, authored name/plan, stored event, financial behavior, permission, or server value was changed. The primary agent owns whole-repository build, browser review, and final acceptance.
