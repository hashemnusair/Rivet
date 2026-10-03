# Remaining Arabic source audit

Audit snapshot: 2026-10-03, in `/Users/eliashreish/.codex/worktrees/complete-arabic-support/Rivet2`. This is a read-only product-source audit; only this report was added. It reviews the current route inventory, `docs/arabic/COVERAGE.md`, package handoffs in `docs/arabic/parallel/`, shared UI components, `/dev/design-system`, and likely English candidates from `/private/tmp/rivet-remaining.cjs`.

The candidate script reported 174 source files and 1,075 literal candidates. That is a search inventory, **not** a count of untranslated copy: the script skips tests and does not resolve whether literals are rendered, canonical enum values, keys, examples, styles, comments, or intentional source text. The items below were checked in context. No route is certified completely translated by this audit.

## Actionable product/runtime finding

| Priority | File and excerpt | Finding and safe follow-up |
| --- | --- | --- |
| P2 | `apps/web/src/features/finance/management-ledger-workspace.tsx:560` submits the fixed reason `Posted from the management-ledger source queue.`. `apps/web/src/lib/domain/accounting-messages.ts:51` already maps that exact string to `accountingMessages.sourceQueueReason`. `apps/web/src/app/(app)/audit/page.tsx:276–280` currently renders `event.reason` directly in the expanded audit detail. | This known generated audit reason can appear in English in Arabic audit history. Project only this exact recognized value at display time (the existing accounting message key is available); leave the stored reason, every unknown reason, and authored audit history unchanged. This audit did not edit the page. |

## English found with a current scope or reuse explanation

- `apps/web/src/app/dev/design-system/design-system-gallery.tsx:67–260` contains static English labels and sample content. The route at `apps/web/src/app/dev/design-system/page.tsx:7–9` calls `notFound()` unless `designPreviewEnabled()` permits it. `apps/web/src/lib/design-preview.ts:8–19` describes this as a development artifact and excludes production. Treat it as a development-gallery scope exception, not evidence of localized production routes. If the gallery itself is included in Arabic preview acceptance, its sample copy remains to be localized.
- `apps/web/src/components/shared/chrome.tsx:41–58` gives the `Breadcrumbs` navigation landmark the hard-coded accessible name `Breadcrumb` at line 43. A source search found no current call sites beyond the component declaration, so no current route exposes it. Add a locale key if this reusable component is introduced to a route.
- `apps/web/src/features/finance/shift-dialogs.tsx:78` has a defensive `Error("Enter the starting cash.")`. It is not displayed verbatim: the component turns non-API errors into `t("salesWorkspace.openFailed")` at line 59, while the required-field validation at line 99 uses `salesWorkspace.enterFloat`. This is not a current visible English gap.

## Preserved source text and reviewed false positives

- Authored/member/gym names, notes, application rejection reasons, support replies, email subjects, original review evidence, and historical audit details stay as written by their authors. Unknown audit reasons likewise stay verbatim; the finding above is limited to one exact generated reason.
- Stable IDs, reason/status/action codes, enum keys, currency codes, routes, URLs, receipt metadata, and provider/error identifiers are data, not display copy. Unknown values should keep the existing source fallback.
- Candidate literals in `apps/web/src/features/settings/gym-public-profile-section.tsx` are source options passed through `publicProfileLabel(t, value)`; the rendered category/audience/amenity copy is mapped. In `apps/web/src/features/reports/operational-reports.tsx`, known bucket values map through `RENEWAL_BUCKET_LABELS` into `t()`; unknown server values remain raw intentionally.
- `apps/web/src/app/customer/discover/page.tsx` uses `"All gyms"` as a comparison sentinel, but renders `customerPortal.allGyms`. The class-membership validation fallback in `apps/web/src/app/(app)/classes/page.tsx:198` carries `apiErrors.classMembershipRequired`, and the exact default image alt `Class photo` is translated by the class-label presenter; custom alt text remains authored.
- `apps/web/src/components/shared/status-chip.tsx` has source label tables, but current lead-source and payment-method consumers pass canonical keys through typed translated label helpers. The English fallback for an unknown/raw stage is an intentional forward-compatible fallback; the current CRM UI uses `crm/crm-labels.ts` for known stages.
- `components/ui/*` candidates such as `Label`, `Input`, `Switch`, `Table`, and CSS/class-name matches are component identifiers or styling, not user-visible English.

## Route and integration test evidence in package handoffs

The following is the route/surface evidence recorded by each existing handoff, not a new run of those suites. It is test evidence only. No package handoff here marks browser QA as passed.

| Handoff | Route or shared surface evidence | Reported tests |
| --- | --- | --- |
| `public.md` | `/` and `/signup` pages; marketing/public shell components. Additional customer-shell, customer communication-preference, and experience-data-state component tests do not amount to coverage of all customer page routes. | 10 files, 49 tests. |
| `platform-console.md` | `/platform`, `/platform/applications`, `/platform/support`, `/platform/email-log`, agreements, and the shared platform shell. | 6 files, 18 tests. |
| `platform-finance.md` | `/platform/billing`, bill-gym wizard, gym subscriptions, `/platform/subscriptions`, `/platform/gyms`, `/platform/gyms/[gymId]`, plus billing projection helper. | 7 files, 51 tests; handoff also reports 10 catalog tests. |
| `staff-tools.md` | `/audit`, `/checklists`, automation editor/monitoring, `/support`, and export center. The report explicitly limits automation/support behavior to mocks; no real run or reply was performed. | 36 tests across 10 selected files. |
| `desk.md` | `/reception`, `/dashboard`, dashboard queues, reception reason/copy helpers and dashboard scope. Includes exact successful Arabic scan, scan-value and override-draft retention checks. | 7 files, 59 tests. |
| `system-text-ui.md` | Shared notification center and timeline feed, with member-profile and branch-ops consumers. This verifies descriptor presentation, not full route coverage. | 4 files, 16 tests; descriptor helper suite 13 tests. |
| `claude-communications.md` | Backend communication and system-event descriptor coverage, not route/browser coverage. | Full Vitest report: 306 files, 1,901 passed and 1 failed; the handoff says the `entry-pass-dialog` failure also occurs on the untouched base. Focused communication/i18n suites are listed as passing there. |
| CRM | `docs/arabic/parallel/README.md` lists a CRM packet owner, but no `crm.md` package handoff was present in the audited report directory. | No route/test result is inferred from the modified CRM source files. |

`docs/arabic/COVERAGE.md` retains historical baseline hashes and says no row is certified fully translated. Its page-entry table has 76 rows; the current source tree has 75 `page.tsx` files. The sole listed entry absent from the current tree is `apps/web/src/app/offline/page.tsx`; `apps/web/src/app/offline/route.ts` exists. Every current `page.tsx` path is listed. This is inventory drift, not evidence that offline browser QA ran.

The package handoffs record Vitest, ESLint, typecheck, lock/catalog checks and/or backend tests. None of those results should be relabeled as browser QA. A dedicated browser run and integrated route-by-route review remain separate acceptance evidence.

## Integration resolution

The primary integration addressed the generated accounting reason with `auditReasonMessageKey`, requiring both `accounting.source.post` and the exact generated reason, and preserving every authored/unknown value. The shared breadcrumb label now uses a translated accessible name. `crm.md` and the refreshed `COVERAGE.md` supply the later CRM handoff and corrected 75-page/offline-handler inventory. The observations above remain the original audit snapshot; final browser and repository results are recorded in `EXECUTION.md`.
