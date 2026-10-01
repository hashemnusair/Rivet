# Complete Arabic support — implementation plan

Status: **approved language baseline; implementation planned**. Created 2026-10-01 on `arabic-localisation`. This checkpoint changes documentation only. None of the work packages below is marked complete by this planning pass.

## 1. Evidence and starting point

| Baseline | Inspected revision |
| --- | --- |
| Elias’s Arabic work | `f98e324de34d8925619ec0c3250f42ec879abe9a` |
| Current main | `45c504b778a136f25f979d0260ed9cea8e641bd2` |
| Common ancestor | `e8c884a817f8f9b66c6c90164a3dd2e2916ea224` |
| Approved wording | Catalog `2026-09-30-v1`, revision `607`, all 247 agreed, Elias and Hashem approved |

At inspection, the histories diverged by **11 Arabic-only commits and 483 main-only commits**. Elias’s tip is from 17 August 2026. His 11 commits change 66 files; **40 files were also changed on main**. Git overlap does not necessarily mean a textual conflict. See [COVERAGE.md](COVERAGE.md) and [baseline-inventory.json](baseline-inventory.json).

The Arabic branch’s previous `CURRENT_STATE.md` described an August release and is not current production truth. Obtain the latest main handoff and release runbook during integration. Preserve all of Elias’s commits and their intent while bringing the current product forward. Do not deploy this old branch as-is or treat its English dictionary as the current product specification.

### Keep and extend Elias’s implementation

| Existing work | Evidence in the Arabic branch | Required next work |
| --- | --- | --- |
| Typed English/Arabic catalogs | `apps/web/src/lib/i18n/messages/{en,ar}/` contains common, nav, domain, marketing, dashboard, reception, members, crm | Reuse this structure; align existing Arabic and add namespaces for missing areas. Reconcile English with current main. |
| Translation core and plural selection | `src/lib/i18n/dictionary.ts`; English-derived key paths; Arabic catalog checked against English; `Intl.PluralRules` | Add placeholder parity, misuse detection and complete Arabic plural tests. The plural brand is a TypeScript construct; runtime resolution still recognizes `other`, so test enum groups and invalid branch paths explicitly. |
| Locale provider and toggle | `src/lib/i18n/provider.tsx`, `components/shared/language-toggle.tsx` | Keep one switch, same route and unsaved form state. Add robust persistence and identity handling. |
| Initial document language/direction | `src/app/layout.tsx` reads `rivet_locale`; provider mirrors cookie/localStorage and applies Arabic font | Preserve server-first direction. Resolve cookie/localStorage disagreement and storage failures; test direct visits, reload, sign-in and cross-host navigation. |
| Formatters | `src/lib/i18n/{config,format}.ts`, `src/lib/utils/money.ts` | Keep Latin-digit and sign-aware money work; change `h23` to approved 12-hour display and currency `code` to selected JOD notation. Pin Gregorian/month behavior. |
| Translated navigation, marketing, dashboards, reception, members and CRM | Pages, feature components and their eight catalogs | Substantial partial coverage, not completion. For example `member-tabs.tsx` still contains English empty states, “pending”, “due” and “Upcoming invoice”. Audit nested dialogs and all states. |
| Bidi fixes | `f98e324`: shared money, pagination, ranks, chart ticks, branch-scope keys | Carry these forward when resolving overlaps. Do not reintroduce forced LTR around a full Arabic money expression or manually prepend signs. |
| RTL capture audit | `apps/web/e2e/rtl-audit.spec.ts` walks 11 staff screens and checks overflow | Adapt old login selectors; expand to current routes, member/platform/public flows, mobile and assertions beyond overflow. Existing captures are not evidence of complete translation. |

No paid translation service or replacement i18n framework is required by this plan. Reuse the repository’s implementation. Add a dependency only for a demonstrated missing capability, such as correct PDF shaping, with runtime and licensing evidence.

### Concrete differences from the approved standard

- `ar/nav.ts`: `لوحة التحكم` → `الرئيسية` for dashboard; `سجل التدقيق` → `سجل التغييرات` for activity log. Lead labels need context-specific `مهتم بالاشتراك`.
- `ar/domain.ts` and members/CRM copy use عضوية for purchased subscriptions. Align that meaning with `اشتراك`, products with `أنواع الاشتراكات`, and statuses with `فعّال`, `منتهي`, `ملغي`, `مجمّد`, `اشتراك قادم` in their voted contexts. Keep technical enum values unchanged and inflect new sentences correctly.
- `ar/domain.ts` cash method is `نقدًا`; approved label is `كاش`. Branch comments in common/marketing/reception assert that الكاش and شيفت should win globally. Remove or correct that outdated guidance. Approved drawer phrases use الصندوق and other cash phrases use النقد.
- `ar/common.ts` contains `remove: إزالة`; use `حذف` for the reviewed unsaved-sale context. Keep semantic-specific keys instead of forcing every generic action to one translation.
- Existing marketing uses the three-part “كل عضو…” line. Use exact custom `marketing-promise` where that promise appears, including shared brand copy and assets.
- Hardcoded Arabic-Indic `٣٠` occurs in catalog labels despite Latin-number formatting. Audit static numerals too.
- `format.ts` forces `hourCycle: h23`; money formatter uses `currencyDisplay: code`; neither meets the selected examples fully.
- `parseMoneyInput` currently strips non-ASCII digits. Implement safe digit normalization before parsing, with ambiguous/invalid input rejected rather than silently changing amounts.

### Current-main work to preserve and reconcile

Arabic exists outside Elias’s branch too. Current main already has bilingual email rendering (`convex/emailTemplate.ts`), `operationalEmail.ts` copy, `legalAgreementEmail.ts`, `messagingTemplates.ts`, `messagingWorker.ts`, `followupAssist.ts`, member preferred-language fields and organization default-language behavior. Review and align these; do not rebuild them or reset their preferences.

Current main’s `convex/pdfDocument.ts` explicitly replaces characters outside WinAnsi, including Arabic, with `?`. It embeds Latin fonts in a custom PDF writer and is shared with browser document generation. **An Arabic font in the webpage is insufficient.** Fixing PDF text encoding, shaping, bidi, measurement and line wrapping is a release requirement.

Current `convex/notificationDelivery.ts` stores title/body strings, while frontend API errors have stable codes and details in `src/lib/api/errors.ts`. Localization must cross these server/client boundaries without breaking old records or clients.

## 2. Execution order and deliverables

Implement in reviewable commits. Dependencies: A precedes B–G; B is the foundation for C–G; prototype PDF support in F early because it can affect runtime architecture; H closes all packages. A pilot proves the foundation but is not the final deliverable.

### A — Integrate the current product and establish coverage

1. Fetch, inspect working-tree changes and partner advancement. Record fresh Arabic/main SHAs. Run `python3 docs/arabic/verify-lock.py`.
2. Continue on `arabic-localisation` or an integration branch rooted at its latest tip. Merge current `origin/main` into that history in an isolated checkout. Preserve the full Arabic ancestry. Do not reset it onto main, blanket-select “ours/theirs”, force push or overwrite a teammate’s uncommitted changes.
3. Resolve overlaps by preserving main’s current workflows, design, auth, data semantics and dependencies while applying Elias’s language hooks and RTL fixes to the current components. Do not resurrect removed auditor roles, old navigation, obsolete pricing, old marketing screens or a removed translation service. Resolve `CURRENT_STATE.md` using current main release truth plus this Arabic checkpoint; preserve the frozen `FRONTEND_HANDOFF.md`.
4. When the docs added here overlap main’s Arabic-room docs, retain the review-room operational instructions and source inventory, but use this approved standard and agent prompt as the implementation entry point. Refresh `apps/web/public/arabic-implementation-prompt.txt` accordingly. Do not touch saved votes or change the public profile picker.
5. Regenerate the source inventory after integration. Seed the execution ledger from all 76 page files in COVERAGE and add new routes found on updated main. Inventory components, client pages, error/loading/not-found boundaries, API/server text, emails, message templates, PDF/print, accessible labels, metadata and text-bearing assets.
6. Record per surface: path and actor, keys/strings, applicable decision IDs, current Arabic state, missing behavior, implementation commit, tests and visual evidence. Use statuses `pending`, `in progress`, `verified`, or `blocked` with a specific reason. A file having `useT()` does not make it complete.

**Exit:** integrated branch builds against the current application; existing authorization/money regression tests pass; no old-feature resurrection; all source areas assigned to the ledger. Record any pre-existing broken test with reproducible evidence, never silently drop it.

### B — Harden the existing locale, dictionary and formatting layer

- Keep `en` and `ar`, existing domain catalogs and typed keys. Separate pure dictionary/formatter code from React hooks so Convex jobs, server routes and PDF generation can use the same rules. Avoid importing client-only providers into server bundles.
- Add catalog key and placeholder parity checks, required-variable validation/types, plural count tests and missing-translation reporting. Production fallback may remain a recovery mechanism, but an English fallback in a covered Arabic flow fails release verification. Distinguish valid named enum `other` keys from plural groups.
- Use complete messages with variables. Prefer voted count labels where appropriate; where full prose uses a count, handle zero/one/two/few/many/other. Exercise 0, 1, 2, 3, 11, 100 and meaningful decimals. Never implement Arabic as English singular/plural.
- Keep cookie-based first render and local persistence. Proposed UI preference precedence: explicit current user choice → saved authenticated UI preference → valid browser cookie → English default. Mirror consistently; localStorage must not override a newer cookie/user preference after hydration. Handle blocked storage, multiple tabs, sign-out and switching accounts without leaking the previous user’s setting.
- Reuse existing member communication-language and gym email-language fields. UI locale is a separate concern: changing the receptionist’s screen language must not switch a member’s email language or gym-wide defaults. Add a staff/platform UI preference only where no suitable field exists, through the authorized data boundary. Preserve old defaults for existing records.
- Define and test locale handoff between marketing, platform and gym/member hosts. A host-only cookie does not automatically travel across subdomains. Use a validated handoff or deliberately scoped preference cookie without widening authentication cookies. Keep business routes, record IDs and current query state intact.
- Localize Clerk/auth-facing surfaces using capabilities in the installed version; custom labels, errors, verification, invitation acceptance and member/gym handoffs need the same review. Do not assume provider defaults match the glossary.
- Make formatting explicit: Gregorian, Jordanian months, Latin digits, `2:30 م`, `25.000 د.أ`; test signs, zero, refund values, three-digit JOD minor units and other supported currencies. Use tenant timezones and separate date-only logic from instants. Avoid altering existing billing/date calculations.
- Normalize Arabic-Indic input digits before supported numeric, phone and money validation. Test Persian digits if accepted, Arabic decimal/group separators, pasted +962 phones, leading zeros, precision limits, negatives and invalid mixed input. Keep IDs and canonical phone/amount storage unchanged. Reuse main’s canonicalization rather than adding a competing parser.
- Search should find supported Arabic names and mixed Arabic/Latin entries. Apply normalization to search indexing/query matching, not destructively to stored names; test diacritics/tatweel and common alef variants without merging distinct identities. Preserve branch and tenant search authorization.

**Exit:** one complete pilot journey works in both languages: sign in → member search/create → sell subscription → collect → receipt → entry → timeline. Reload, switch language mid-form, render validation/server failures, and verify stored amounts/dates/permissions are identical. PDF work may run concurrently in time, but pilot completion requires the actual Arabic receipt output.

### C — Align existing translations and finish staff workflows

Apply STANDARD and every applicable item in DECISIONS. Keep current English copy and current visual hierarchy. Cover:

| Workflow | Starting paths (relative to `apps/web`) | Include beyond the page heading |
| --- | --- | --- |
| Shell, dashboards and Today | `src/components/shell/`, `src/features/dashboard/`, `src/app/(app)/dashboard/` | All roles, branch scope, command palette, shortcuts, counts, charts, notifications and empty/error states |
| Members and subscriptions | `src/features/members/`, `src/features/membership-actions/`, `src/app/(app)/members/`, `memberships/`, `plans/` | Import mapping/results, duplicates/merge, timeline, discounts, sale/renewal/extension/freeze, dates, consent and validation |
| Reception | `src/app/(app)/reception/` and imported features | QR/phone entry, no valid subscription, wrong branch, exhausted visits, existing visit, overrides and required reasons |
| Payments and sale | `src/app/(app)/payments/`, `checkout/`, `src/features/membership-actions/` | Tender/reference, refunds vs voids, unknown payment outcome, cash drawer counts/approval, receipts, recovery and idempotency |
| CRM and retention | `src/app/(app)/crm/`, `src/features/crm/`, relevant follow-up features | Lead stages/outcomes, trial vs free software trial, offer terms, assignment, WhatsApp draft vs sent, expiry/absence signals |
| Classes and PT | `src/app/(app)/classes/`, `pt/` and imported features | Calendar headings, time, capacity/waitlist, recurrence/one occurrence, cancellation, no-show, credits, trainer availability |
| Stock, purchasing, payables | `src/app/(app)/operations/` and `src/features/operations/` | Count corrections, purchase/partial delivery, transfers/in-transit, supplier bills/payments/reversals, reasons and remittances |
| Maintenance and daily work | `src/app/(app)/maintenance/`, `checklists/`, `src/features/branch-ops/` | Machines vs financial assets, areas, repair reasons, checks, pass/fail, handovers, linked supplier bills |
| Reports and bookkeeping | `src/app/(app)/reports/`, `finance/` and report features | Revenue vs collections, receivables/payables, debit/credit, posting, closed periods, incomplete data, statements and chart ticks |
| Settings and accountability | `src/app/(app)/settings/`, `audit/`, `exports/`, `getting-started/`, `support/`, `automations/` | Permission names and descriptions, invitations, branch policies, download states, setup, support and truthful paused states |

**Exit:** each workflow’s full interaction and failure paths render reviewed Arabic; domain actions, API IDs, permissions, branch scope and audit events retain their behavior. A translated table with English dialogs is unfinished.

### D — Member, public, platform and authentication surfaces

- Member: every `/customer` route, home/discovery/my gyms, subscription detail, entry pass, classes, freeze requests, payments/receipts, profile, referrals, onboarding and help. Ensure offline/cache freshness, service-worker fallback, install UI and reconnection actions are Arabic without cross-account cached-data leakage.
- Public: current homepage and marketing components, product illustrations/screenshots, demo login labels, public gym profiles, offers and expiry/unavailable states, signup, gym registration/onboarding, privacy and terms. Use the exact custom marketing promise. Do not invent legal promises, product capabilities or translated gym content.
- Platform: application approval/rejection, gyms, subscription/pricing/entitlements, billing and past-due states, agreements/countersigning, support, notifications and email logs. Preserve provisioning and authorization distinctions.
- Auth: all `/login` variants, invitations, verification/recovery and cross-portal redirects. Preserve focus, keyboard use and original destinations when switching language.
- Arabic review room: preserve evidence text and original options/English contexts exactly as review material. Its navigation/help can be localized, but translating stored choices or rewriting v1 evidence is out of scope. Document intentional bilingual content in the coverage allowlist.
- Metadata, browser titles, accessibility names, tooltip text and meaningful asset alt text require coverage. Decide public language URL/SEO behavior explicitly; default implementation keeps existing URLs with correct server-rendered locale and cache isolation. Do not fabricate `hreflang` alternatives for URLs that do not serve that language independently. Test crawler-visible defaults and social preview claims.

**Exit:** all product entry points and both signed-in audiences can finish their available tasks in Arabic; intentional English is a small reviewed allowlist (brand, identifiers, user content, review evidence), not fallback UI.

### E — Server wording, notifications and outgoing messages

- Inventory Convex handlers, policy/helper errors, validation, repair/supplier reasons, permission names and notification creators. Preserve the existing error envelope and stable codes, adding message keys/parameters compatibly when broad codes are insufficient. Map errors at a shared boundary, not repeated English-string comparisons in pages. Keep request IDs and field-error association.
- Do not translate arbitrary exception/log text for display or expose internal failure detail. Unknown errors get an approved generic recovery message while diagnostics retain code/request ID. Test old and new clients against optional localization fields.
- For system notifications/timeline events, carry stable event/message keys and variables so viewers can read their UI language. Keep source facts and tenant authorization intact. For legacy string-only records, derive localized presentation only when structured data unambiguously identifies the event; otherwise preserve the original and document that historical limit. Never rewrite immutable history or pretend old free text is translated.
- Align existing `emailTemplate.ts`, `operationalEmail.ts`, `legalAgreementEmail.ts`, `messagingTemplates.ts`, `messagingWorker.ts`, `followupAssist.ts`, membership/PT/renewal jobs and every builder using them. Include subject/preheader, text/HTML, buttons, footers, attachments and suppression/delivery status labels.
- Recipient language determines outgoing copy. Explicit member communication preference wins for member messages; preserve appropriate existing organization/default fallback. RIVET staff copies may have a different recipient preference. UI language alone must never control an unrelated recipient’s mail.
- Capture language and template version for queued delivery so retries are deterministic and do not unexpectedly switch language. Preserve consent, quiet hours, allowed delivery modes, tenant scopes, deduplication and disabled/paused features. WhatsApp handoff remains a draft until actually sent.

**Exit:** preview/test evidence for every message template in both languages, including mixed names/amounts/links; old-record compatibility tested; no live recipients contacted as part of testing.

### F — Real Arabic documents, print and downloads

1. Prototype one multi-page Arabic receipt/agreement using the current `convex/pdfDocument.ts` contract and the browser callers `src/features/legal/{document-pdf,agreement-pdf}.ts` and `src/features/billing/invoice-pdf.ts`. Preserve current designed page structure and signatures.
2. Replace or extend the WinAnsi limitation with Unicode text, embedded licensed Arabic fonts, real shaping, bidi resolution, accurate text measurement, RTL table flow and line breaking. Evaluate a free library/runtime solution against actual Convex and browser constraints. A browser print preview or page font alone does not solve emailed server PDFs. Never reverse strings manually or accept disconnected letters/question marks.
3. Record the selected renderer and why it works in each runtime before broad migration. Keep existing document data contracts where possible; if a Node action is required, test action limits, font loading/bundling, storage, access controls and retry behavior. Reuse the shared document model for browser downloads and mailed attachments; ensure identical financial and legal content even if byte output differs.
4. Verify Arabic glyphs and extraction/copy-paste, punctuation, Latin references, negative amounts, multi-page tables, long gym names, legal sections and signature placement. Preserve signed historical bytes, hashes and agreement versions; new display translations do not retroactively alter a signed contract.
5. Translate printable schedules, reports, receipts, invoices, remittances and human-facing CSV headings/labels. Preserve UTF-8, spreadsheet formula-injection defenses and machine-import schemas. Where a download serves a machine integration, maintain stable canonical headers/codes and clearly separate a localized human report.

**Exit:** actual downloaded and attached files render correctly in independent viewers; inspect rendered pages and extracted Arabic text. Unicode font embedding alone is not acceptance. Evidence includes old English document regression checks.

### G — RTL, accessibility and responsive verification

- Use logical start/end properties through layouts, grid/table alignment, borders, rounded edges and padding. Inspect portals, drawers, menus, selects, calendars, tabs, pagination and sticky elements. Keep intentional physical directions where function requires them.
- Mirror directional navigation arrows and workflow progression; do not mirror logos, QR codes, images, media controls or every icon automatically. Test DOM reading/focus order as well as visual order; avoid reversing it twice.
- Use bidi isolation for names, IDs, email, phones, URLs and Latin product names. Keep a full currency expression under the formatter’s direction logic; isolate it as a unit. Check negative signs, parentheses, decimals, ranges and mixed-script sentences visually and by copy/paste.
- Keep IBM Plex Sans Arabic where already supplied; test connected shaping, line-height, diacritics, weight and fallbacks in web, print and mail. Preserve design-system minimum type sizes rather than shrinking Arabic to fit. Check 200% zoom and long content.
- Test keyboard controls, focus restoration, screen-reader labels, forms and announcements in both languages. Native date/time/number inputs may follow browser locale differently; inspect the actual control and accessible representation.
- Inspect at 390px and representative tablet/desktop widths, plus the narrowest supported viewport, with real Arabic and mixed names. Extend Elias’s overflow checks but also review truncation, chart legends/axes/tooltips, drag/drop, calendars, horizontal tables and touch gestures.

**Exit:** no lost controls, clipped meaningful text, page-level unintended horizontal scroll, broken Arabic shaping, misleading sign/order or accessibility regression. Store named evidence tied to commit, locale, viewport and fixture.

### H — Close coverage and release truthfully

1. Finish the execution ledger for every current route and cross-cutting surface, including one-off server strings and assets. Run residual English/missing-key scans with a small explicit allowlist. Inspect results manually; code literals and user content are not automatically untranslated product copy.
2. Maintain a decision-to-key/occurrence map: all 247 IDs must be mapped to implementation or a documented rule/context with tests. Formatting and voice decisions are rules, not necessarily one catalog key each. No fabricated unused keys just to obtain a 247/247 metric.
3. Run the commands below against the integrated implementation. Verify both languages with mock flows, then credentialed isolated staging for actual authorization/persistence/mail/document boundaries where required. Keep screenshot baselines appropriate to OS/browser; do not blindly accept snapshots or use production for test data writes.
4. Hashem/Elias review representative rendered workflows and any materially new disputed wording. Their 247 approvals remain the standard; do not reopen settled choices merely because the agent prefers another phrase. Report exact release blockers instead of claiming full support if credentials/provider strings/PDFs remain unverified.
5. Release through the current runbook when release is authorized. Use only `pnpm convex:deploy` for Convex deploy/dry run; follow root secret-safe rules. Plan backward-compatible optional fields and backend-first rollout where needed. Verify the exact deployed commit, frontend/backend compatibility and read-only smoke. Keep a rollback path to prior runtime with additive schema compatibility and preserved preferences/history.
6. Update `CURRENT_STATE.md` and `docs/12_SYSTEM_MAPS_AND_RELEASE_RUNBOOK.md` with implementation state, tests, deployed SHAs/targets and limits. Preserve `FRONTEND_HANDOFF.md`.

**Full completion requires:** all current surfaces, persisted UI preferences, recipient-aware messages, Arabic PDFs/downloads, correct RTL/input/formatting, complete decision mapping and passing verification. A bilingual shell or the initial pilot is not sufficient.

## 3. Verification matrix and commands

| Layer | Required cases |
| --- | --- |
| Decision lock | Export checksum, version/revision, both approvals, unique 247 IDs, exact matching votes and all registry entries |
| Catalog | Missing/extra keys, placeholders, enum `other`, plural categories, approved labels and contextual exceptions |
| Preference/SSR | First byte lang/dir, cookie disagreement, storage denied, refresh, tabs, new account, cross-host transition, unsaved form |
| Formatting/input | 0/negative/large JOD, other precision, Gregorian dates/months, noon/midnight, tenant boundary, Arabic digits and invalid amounts |
| Money/auth | Same transactions and immutable audit outcomes in en/ar, tenant/branch isolation, refund/void, duplicate-submit and unknown outcome |
| Server/messages | Old/new payloads, field errors, role denials, legacy notification display, recipient locale, queued retry and suppression |
| Browser | Full staff/member/platform/public workflows; loading/empty/error/success; mobile, keyboard, mixed bidi and back-navigation |
| Documents | Server attachment plus browser file, shaping/Unicode extraction, long tables, signature/legal content, English regression |
| Release | Complete ledger, reviewed allowlist, baseline screenshots, exact commit/targets and no hidden fallback |

From the integrated repository root, inspect current scripts and run:

```sh
python3 docs/arabic/verify-lock.py
pnpm install --frozen-lockfile
pnpm typecheck
pnpm convex:typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:e2e
pnpm --filter web exec playwright test e2e/rtl-audit.spec.ts
git diff --check
```

Use the documented mock/local environment for browser tests and build; never print secrets. Generated Convex bindings, if changed, must be checked through the repository’s configured workflow against the intended non-production target. Code generation and deploy are not necessary for a documentation-only change. Add focused i18n and document tests as implementation proceeds; do not claim a command passed until it actually ran. The commands above are the implementation checklist, not results of this planning pass.

## 4. Decisions still to make during implementation

These are engineering details, not missing approval of the 247 choices:

- Exact Arabic PDF renderer/runtime and font embedding approach, proven by the early prototype.
- UI preference storage for staff/platform identities and the cross-host handoff, preserving existing member communication language.
- How to present legacy unstructured system messages without changing historical records; quantify any irreducible historical limitation.
- Public localized metadata/cache/SEO strategy within the existing routing constraints.
- Details with no explicit vote, such as compact money notation and non-JOD symbols: use consistent Arabic conventions, retain exact full-value access, document and test. Do not extend the JOD example into invented rules for every currency.

Agents can resolve these from code and evidence. Seek founder input only where a choice changes product meaning or an approved phrase. No paid translation provider or professional translator is assumed.
