# Arabic implementation execution record

**Later release status:** Hashem authorized an audit and main-branch release for founder testing on 3 October. See [the release audit](AUDIT_2026-10-03.md) and the newest `CURRENT_STATE.md` entry. The candidate-only status below records the original implementation handoff.

The implementation is integrated on `codex/complete-arabic-support`. This document records implementation and verification, not release approval. Production has not been deployed and no real messages have been sent.

## Integrated history

- Refreshed `origin/arabic-localisation`: `901150a7d3863358893ec399b4203277a88d88fe`.
- Refreshed `origin/main`: `7cd509e8a9c488fe864ec1c1c248e39bf8a57cab`.
- Preserved local `arabic-foundation`: `9fbd53c1d5a1ef2569cfc7f655e818f1f8faea91`.
- Merge commits `ae4b481` and `b38a02f` retain both Arabic histories and current main. Current main business logic wins at workflow overlaps; matching older translation hooks were carried into the current components. The frozen frontend handoff and locked decision export remain unchanged.
- The original checkout remains on `arabic-foundation`; implementation is in the attached isolated worktree.

## Package status

| Package | State | Evidence and remaining work |
| --- | --- | --- |
| A integration | Integrated | Current main, Arabic history and local foundation are preserved; final branch is isolated from the original checkout. Frozen historical handoff and v1 review evidence are unchanged. |
| B foundation | Implemented; external acceptance open | Account-scoped UI preference, server-first locale, scoped cross-host presentation cookies, offline retry, account-race guard, format/input/search and typed plurals have local tests. Real Clerk/cross-host staging checks remain external gates. |
| C staff | Implemented; local checks passed | Staff routes, dialogs, statuses, permissions, errors, data projections and human exports are covered by catalogs and focused workflow tests. The expanded RTL audit and regression suite provide final local evidence below. |
| D other surfaces | Implemented; local checks passed | Member, public, platform and auth routes, public metadata/documents and application flows use current catalogs. Original review evidence and production-excluded development samples are explicit exceptions. |
| E server/messages | Implemented; provider acceptance open | Static/dynamic errors, optional notification/timeline descriptors, recipient-language templates and frozen retries preserve original values. Current Meta approval and inbound opt-out handling remain live-delivery gates. |
| F documents | Implemented; local checks passed | Shared Unicode shaping/bidi/fonts cover browser and server PDFs, frozen agreement versions, receipts/invoices and legal downloads. Human CSV jobs retain file language and numeric contracts. Independent PDF viewers and browser download evidence are recorded below. |
| G RTL/accessibility | Local checks passed; user acceptance open | Logical layouts, bidi isolation, portals, keyboard language switching and viewport/reflow checks are exercised locally. A full assistive-technology/user acceptance review is not implied by automated checks. |
| H closure | Local evidence consolidated; external gates open | All 247 decisions have keys or explicit tested-rule/context evidence; current route inventory is 75 pages plus offline. Root records exact integrated gate results and external limits below. No production release is authorized or claimed. |

## Locale policy

The UI setting is optional `users.uiLocale`, independent of member communication preferences and organization defaults. Only an authenticated active account can update its own setting. Requests carry the expected Clerk account subject so a late request after account switching cannot affect a different account. The browser owner marker is a presentation hint, never authorization.

Precedence is an explicit pending choice for the current account (or made anonymously during sign-in), the saved authenticated UI setting, an eligible cookie, then English. A stale localStorage mirror never overrides server hydration. Sign-out or account switching discards an earlier account's choice. Failed saves remain pending and retry on reconnection; edits in open forms are retained. Only presentation cookies use `rivetjo.com` domain scope on recognized RIVET hosts. Auth cookies are unchanged. Preview/localhost cookies remain host-only.

Arabic formatting uses Latin digits, fixed Jordanian Gregorian month names, `h12`, JOD three-decimal amounts, and the session organization's timezone for instants. Date-only values retain their calendar day. Compact Arabic amounts use ألف/مليون, with the full amount available on hover. Other currencies retain their ISO code and existing minor-unit exponent. Search normalization folds Arabic diacritics, tatweel, alef variants and final alif maqsura for comparison only; stored names are preserved. Arabic/Persian phone digits normalize through the existing country-aware phone rules.

## PDF architecture and evidence

The custom writer is retained. `@pdf-lib/fontkit` supplies contextual GSUB/GPOS shaping; `bidi-js` supplies Unicode bidi run order and mirrored punctuation. The renderer embeds the original IBM Plex Sans Arabic regular/semibold TrueType fonts as Type0/CID fonts, adds ToUnicode maps and logical ActualText, measures shaped advances, wraps against measured widths and reflects layout for Arabic without reflecting images/signatures. English-only runs retain the existing fonts and layout. Both dependencies run as bundled JavaScript in browser and Convex; no Node-only font loading or paid service is needed.

Font sources, SHA-256 hashes and OFL license are checked in under `apps/web/scripts/pdf-fonts`. `node apps/web/scripts/build-arabic-pdf-fonts.mjs` rebuilds the embedded module. Source: [fontkit](https://github.com/Hopding/fontkit), [bidi-js](https://github.com/lojjic/bidi-js), [Google Fonts IBM Plex Sans Arabic](https://github.com/google/fonts/tree/main/ofl/ibmplexsansarabic).

The prototype generated `/private/tmp/rivet-arabic-pdf/arabic-receipt-agreement.pdf` with 65 table rows, mixed names/references, negative amounts and a signature section over 3 pages. Pages 1 and 3 were visually inspected after Poppler rendering. PDFium extraction preserves the original Arabic strings, mixed references and signs. Poppler's text extractor emits directional control characters and visual-order Arabic; extraction tests use PDFium for logical text. This prototype is evidence for the renderer, not certification of every business document.

## Early integration validation checkpoint

- Locked v1 verification passed; the export remains catalog `2026-09-30-v1`, revision `607`, with 247 agreed decisions and both approvals.
- Integrated baseline: typecheck and lint passed; 1,735 regression tests passed plus 15 focused tests after correcting three integration expectations/spacing issues.
- Foundation/PDF/input targeted run: 107 tests passed across 11 files.
- UI preference lifecycle: 17 tests passed, including offline retry, blocked storage, form preservation, tabs, sign-out/account separation, late acknowledgement and inactive-account denial.
- Full current regression run: 1,756 passed, 5 failed due to outdated Arabic wording expectations; all 11 tests in those 3 affected workflow files passed after updating to the approved wording and new currency display. Full final rerun remains required.
- Invoice/catalog targeted run: 15 tests passed across 2 files.
- Web and Convex typechecks passed after separating the pure locale module; lint passed before the invoice edits. Final checks remain required after all edits.
- `pnpm install --frozen-lockfile` passed. The package manager deduplicated compatible existing transitive dependencies while adding the two PDF dependencies.

No browser/build/staging evidence is claimed by this checkpoint. Keep remaining work visible until every package passes its acceptance gates.

## Versioned Arabic agreement checkpoint

New signings can select `1.2-ar · 2 October 2026`; existing records always render their original version regardless of the viewer's UI language. The English 1.1 and 1.2 canonical SHA-256 hashes are regression tested unchanged. Switching the signing language preserves details and signature drafts but resets reading progress and declarations. Newly entered Arabic/Persian ID digits normalize before validation/storage. Only a published version is accepted; owner permissions, tenant isolation, idempotency, masking and queued-recipient languages are preserved.

New agreements freeze billing interval together with the already frozen fee. Browser downloads now carry the recorded fee and interval, matching attachment content. This optional schema field does not rewrite historical records. Historical records lacking the interval retain their existing fallback; their original interval cannot be reconstructed from a changed current plan with certainty.

The actual Arabic agreement is 3 pages. Poppler renders were inspected; PDFium extraction finds the exact Arabic title, mixed names and full annual fee. Inspection found and fixed missing punctuation mirroring (the installed bidi API takes the level array, unlike its README example), isolates crossing line breaks, orphan headings and missing repeated table headings. No image/signature pixels are mirrored.

Validation: 32 legal/signing/catalog tests passed; 23 PDF layout/document tests passed; both web and Convex typechecks passed. The test suite includes unpublished-version denial before writes, unchanged English hashes, Arabic signing/replay, owner/tenant boundaries, frozen annual terms, identical queued attachments, independent recipient language, and a full switch-language-mid-form signing journey.

## Shared error boundary checkpoint

The API envelope still carries English `message`, stable `code`, `requestId`, `details` and original field associations. It can additionally carry `messageKey`, `messageParams` and `fieldMessages`. A shared legacy registry supports older server responses; new explicit descriptors remain valid when English wording changes. Query caches retain original errors and recompute presentation on locale change. Unknown exceptions show a recovery message, not a stack or internal diagnostic. Mutation follow-up failures retain the distinction between a saved write and an unsuccessful screen refresh.

The reproducible audit (`node apps/web/scripts/inventory-arabic-errors.mjs`) maps all 933 static error messages found at `domainError`, `ApiError.of` and `requireField` calls, including conditional branches. The source ledger is `server-error-coverage.json`. Dynamic/forwarded messages, other exception boundaries, notification data and outgoing templates still need work; static coverage is not package-E completion.

Validation: 55 focused error/adapter/hook/catalog tests passed. Full regression: 1,776 passed, one outdated mock agreement-prefill expectation failed; its fixture now includes the frozen billing interval and its targeted suite passes. Web and Convex typechecks pass. Final full rerun remains required after the remaining packages.

## Dynamic error and class-reason checkpoint

All 116 dynamic calls in the shared error-source audit now carry a key or forward a typed/legacy descriptor (105 direct keys, 9 descriptor forwards, 2 validation helpers). Workspace selection errors retain their original English messages and restrictions while carrying stable keys. Class booking eligibility/cancellation reasons carry optional descriptors through both adapters; old responses remain readable. The member view translates these explanations without changing class names or cancellation notes. Mutation error state and asynchronous rejection presentation follow the current UI locale.

Named error parameters format dates, clocks, weekdays and known system enums in Arabic; names/references remain isolated and unchanged. Original field paths, values, source messages, codes and diagnostic details are preserved. This audit covers the domain error envelope, not every direct exception/provider or notification boundary.

Validation: 231 focused tests pass (class ownership/waitlists/cancellation, workspace entitlements, mock money/workflow regression, fields/parameters/catalog/hooks). Web/Convex typechecks and lint pass. No outbound messages or production writes were performed.

## Member home and gym-detail checkpoint

Member home, membership summaries, class booking/history/cancellation, PT package requests/booking/cancellation, referrals, freeze requests and the entry-code dialog now use typed Arabic copy for labels, prose, accessible names and transient states. Live locale changes retain a freeze draft; Arabic/Persian day input normalizes to the same numeric request. QR payloads and scanning orientation stay unchanged. Class navigation arrows and PT column dividers follow RTL. Existing English workflows retain their wording and behavior.

The authenticated membership projection now carries the gym timezone as optional display context. Its member detail and entry-code views use that context; expiry decisions use the same tenant calendar boundary in either language. Gregorian Jordanian dates and 12-hour Arabic clocks replace legacy English formatting in these views. System-generated historical activity titles are still preserved until the structured event pass; user-entered notes/names remain original.

Validation: 28 member/catalog tests pass, including existing English flows, Arabic late-cancellation disclosure before a write, Arabic-digit freeze input, draft preservation across locale switching, and timezone boundary/plural expiry checks. Web/Convex typechecks and lint pass. Browser/responsive verification remains in package G.

## Authentication checkpoint

Custom sign-in, password/MFA, sign-up, invitations, profile completion and identity panels now render known provider codes through typed messages. Unknown diagnostics/tickets do not become UI copy. Errors retranslate on locale switching while preserving entered values; Arabic/Persian OTP and phone digits normalize before the existing requests. Names and passwords are untouched. Existing Clerk finalization, role routing, invitation validation and return URLs are retained. The provider-owned CAPTCHA/verification-delivery language still requires isolated-provider verification; this checkpoint does not certify it.

Toast placement and accessible labels follow the live locale. Old unowned locale cookies no longer override an authenticated account, and pending changes received from another tab flush to the account preference.

Validation: 82 of 83 tests passed in the combined auth/preference/catalog run; the sole obsolete English-message assertion was updated, then all 11 sign-up/auth-message tests passed. New Arabic tests cover sign-up through verification/finalization/profile return, MFA, normalized requests, unknown provider text and language changes without data loss. Web typecheck and lint pass; diff whitespace check passes. No real verification messages were sent.

## Discovery, member account, finance and public-offer checkpoint

Gym discovery/trial requests, member profile/privacy explanations, recipient-language and marketing-consent controls, finance/receipt views, human-readable receipt downloads and public offer responses now use typed Arabic copy. Existing Arabic gym descriptions and trainer biographies are selected when present; unpublished/user-written text, names and reasons remain original. Search uses Arabic comparison normalization. Plan durations, visits, branches and package sessions use real plural categories. Local trial clocks use 12-hour Arabic presentation without treating wall times as UTC instants.

The receipt projection carries optional issuing-organization timezone through both adapters. Its print view/download retain original values and use scoped dates, currency and bidi isolation. System-generated transaction explanations derive from typed transaction states, without modifying recorded data. Live experience failures now render safe keyed recovery text and preserve a distinct timeout and stale-data state.

Validation: 61 targeted tests passed across the affected suites after catalog registration and obsolete raw-diagnostic expectations were corrected. New Arabic journeys verify trial draft preservation/normalized requests, unchanged receipt source objects and references, and explicit marketing consent independent of language. Final web and Convex typechecks and lint pass. Member onboarding/PWA guides and machine-readable personal-data export policy remain in the next packages; this checkpoint is not whole-member-area release certification.

## Setup, permissions and offline checkpoint

All current member/owner/staff setup tasks render from their stable keys, including role-aware instructions, unavailable-provider explanation, progress, restart/dismissal and PWA install/notification controls. Permission labels and hints use the same typed catalogue in the guide and settings matrix. Approved freeze/void/cash-period phrases are mapped to real permission fields; grants, limits and canonical task keys are unchanged.

The member manifest now uses request-scoped language while retaining its identity, scope and deep links. The offline route returns self-contained public HTML in both languages; its active language is selected before display. It bypasses the authenticated root layout so the service-worker cache cannot contain root hydration/account state. The worker keeps only the presentation locale beside the existing public shell/assets and never caches member data. Browser-owned installation and notification-permission dialogs remain controlled by browser/OS language. No push delivery was added or sent.

Validation: 55 focused tests pass, including permission parity, canonical setup writes, existing settings flows, provider preference lifecycle, manifest identity and offline language/privacy execution in a worker harness. Web typecheck and lint pass. Final browser/offline installation verification remains in package G.

## Public legal and metadata checkpoint

The published terms and privacy policy now render complete Arabic copy and download that rendered language through the Unicode PDF renderer. Their 19/15 sections, anchors, version identifiers, deadlines, legal references, retention periods and English-precedence clause are preserved; the original English catalogues keep the published wording. Root/public legal/offer metadata uses the request locale, with no fabricated language URLs. The Arabic social promise uses the exact approved line. Configurable registration/tax footer labels and support hours now have Arabic presentation.

Validation: 15 focused legal/PDF/catalogue tests pass; web and Convex typechecks and lint pass. Both actual public Arabic PDFs are four pages. Poppler render inspection and independent PDFium extraction confirm shaped/selectable text, tables, legal references, Latin numeric values and no replacement characters. Evidence is under `/private/tmp/rivet-arabic-pdf/arabic-{terms,privacy}*`. Social image and browser metadata switching remain assigned to the cross-cutting/browser package.

## Staff settings checkpoint

All settings sections and nested assignment, media and unsaved-change dialogs now use typed Arabic presentation. Organization details, operating hours, payment methods and limits, notification settings, email delivery controls, brand assets, staff profiles, checklists, subscription billing and public gym profiles retain their existing canonical values and authorization. Recipient language remains independent of UI language. Switching the UI preserves dirty form values and partial-save failures; invoice downloads receive the explicit locale and organization timezone. Public gym categories and amenities translate only recognized code-owned options, with authored descriptions and unknown custom text preserved. The published Arabic terms title now uses the exact approved شروط الاستخدام.

Validation: the 45-test settings/public-profile/legal/catalogue run passed, followed by 17 focused checks including two additional public-profile/schedule language-switch journeys. Web and Convex typechecks, lint and diff whitespace checks pass. Coverage includes normalized phone digits, permission-aware Arabic search, explicit saves, retained payment failures, both authored profile languages and unchanged canonical schedule/category writes. Browser layout and native numeric-input behavior remain in the cross-cutting verification package.

## Checkout, payment ledger and cash reconciliation checkpoint

Retail checkout, product/customer selection, desktop/mobile carts, payment references, completion states, branch selection failures, payment-ledger filters, receipt links, cash opening/counting/closure/approval and nested checklist handovers now use typed Arabic presentation. Stock badge behavior uses price data rather than an English label. Arabic search normalization affects comparisons only; names, SKUs, references and original reasons remain unchanged. Arabic/Persian phone digits normalize in the checkout request, and cash-note/return quantities accept Arabic digits while requiring whole counts. Errors retranslate without clearing drafts.

The cash calculation, server prices, stock writes, role/tenant gates, refunds/voids and retry keys remain authoritative. Receipt display and same-business-day controls now use the issuing organization timezone. All rendered amounts use the recorded currency; the existing 25,000-minor-unit review threshold is displayed without changing its rule. The existing denomination counter remains based on Jordanian denominations; this package does not invent new foreign-currency drawer rules.

Validation: 42 checkout/finance/receipt/catalogue/backend cash-lifecycle tests passed; a further 21 Arabic workflow/handover/catalogue checks passed (including 6 new Arabic journeys). Tests cover unchanged retry payload/key across locale changes, preserved bank references and recipient identity, Arabic quantities/amounts, currency precision, variance reasons, unknown-error redaction, receipt permission gates and original receipt facts. Both typechecks and lint pass. Browser/print layout and actual emailed receipt documents remain in their assigned verification/outgoing packages.

## Member enrollment, plans, import and duplicate-review checkpoint

Member creation, duplicate pre-checks, first-membership sales, plan creation/editing/archival, the membership ledger and freeze-request decisions now use typed Arabic presentation. Errors retranslate without clearing drafts. Dates, currency and duration/count plurals use the shared formatter; Arabic/Persian numeric inputs preserve integer, limit and currency-precision validation. Canonical statuses, sale transaction boundaries, original names/references, consent defaults and recipient language are unchanged.

Import file/mapping/preview/recovery/undo and duplicate-review dialogs now use typed presentation. Arabic source headers normalize for comparison only. Human rejection CSVs have localized headings, date/status/error presentation and preambles; machine template columns and stored source evidence stay canonical/original. New import row errors carry optional key/parameter descriptors. Legacy import reads project those descriptors without changing stored rows. Names, references, reasons, duplicate survivor/field choices, backend resume/undo cursors and authorization remain intact. No historical payment is recreated as a new receipt or cash movement.

Approved terms are wired to the real plan, merge and import controls. The decision ledger separately tests exact labels and approved phrases composed with a currency, amount or explanatory text. The approved cash-closing label no longer adds an ellipsis. The CSV instruction intentionally shows accepted source enum tokens (male/female) beside Arabic equivalents; CSV, Excel and the xlsx extension are technical format identifiers.

Validation: 50 of 51 combined workflow/backend/CSV/catalogue checks passed; the only failure exposed a coverage-test mismatch between an exact label and a composed currency/amount label. The new explicit composition check and all 17 dictionary/catalogue tests passed, followed by 18 catalogue/Arabic journey checks after final voice alignment. Eight new UI/pure Arabic tests plus a backend legacy-projection test cover drafts, original source data, phone/numeric normalization, consent defaults, canonical filters, safe CSV cells and merge retry payloads. Web and Convex typechecks, lint, diff whitespace and the locked 247-decision checksum pass. Full browser/native-control and final release gates remain open.

## Staff class schedule and attendance checkpoint

Weekly schedules, upcoming occurrences, coach management, capacity, images, roster search, waitlists, attendance and reason-gated cancellation/removal now use typed Arabic presentation. The timetable places classes from the inline start and reverses click coordinates in RTL, preserving half-hour snapping and the original weekly templates. Tenant-local dates and Arabic 12-hour clocks replace English-only display. Arabic/Persian capacity and phone digits normalize; class capacities remain whole numbers from 1 to 200. Authored names, notes and image descriptions remain original.

The existing booking limits, waitlist promotion, cancellation cutoff, attendance finalization and role/branch permissions remain authoritative. Locale switching preserves failed class/cancellation drafts and the same template ID. Approved class, waitlist, no-show and cancellation terms are mapped to their rendered controls.

Validation: 25 targeted Arabic workflow, class-domain/backend and catalogue tests pass. Web and Convex typechecks and lint pass. New checks cover mirrored click geometry, noon/midnight clocks, generated versus authored image descriptions, normalized capacity, failure/retry payload preservation, single-occurrence cancellation and receptionist permissions. Browser/printed timetable layout remains in package G.

## Staff personal-training checkpoint

The PT workspace, package editor, trainer profiles, weekly availability/time off, unpaid-order cancellation/deletion, trainer dashboard and booking-outcome confirmation now use typed Arabic presentation. Existing Arabic biographies are selected when present; authored names, specialties, notes and descriptions stay original. Untouched generated package names follow the UI language; editing a name makes it an authored draft that survives subsequent language switches. Arabic and Persian quantity digits normalize before the unchanged package limits and currency-aware amount parser. The client now enforces the server's existing 730-day validity limit when native numeric inputs are replaced.

Completion, no-show and cancellation consequences carry stable keys from the existing domain decision, with the original English text retained for compatibility. The exact cutoff, gym/member cancellation distinction, consumed/returned session credit, package price ladder, recorded currency and trainer/manager access remain unchanged. Availability retains canonical weekdays, native calendar values and prior rules/exceptions across failed saves and locale changes. Approved session/credit terminology and the completion action are connected to these rendered controls.

Validation: 52 existing PT workspace/dashboard/domain/backend/catalogue tests passed, including the complete credit lifecycle and trainer boundaries. Four new Arabic journeys passed; a subsequent 17-test Arabic member/PT/catalogue run also passed. Both typechecks, lint, locked-decision verification and whitespace checks pass. Coverage includes Arabic quantities and JOD precision, rejected saves/retries, branch payloads, untouched versus authored names, time-off reasons, exact cutoff boundaries and retained cancellation choice. Responsive/browser/provider verification remains in package G.

## Equipment and maintenance checkpoint

Equipment registration, problems, repair jobs/history/recommendations, maintenance tasks, area QR dialogs and the shared operations status/reason dialogs now use typed Arabic presentation. Canonical statuses, safety restrictions, repair transitions, posted costs and permission gates remain intact. Arabic/Persian counts and money pass through explicit field validation and the currency-aware amount parser; original names, serial numbers, repair descriptions and historical records stay unchanged. New generated recommendations include optional stable descriptors in both adapters, with strict legacy-text recognition for existing responses. Original rationale is retained; unrecognized historical prose is preserved as source text.

Maintenance deadlines now use the gym timezone in the native date/time field and UTC on write. Saving an unchanged deadline preserves its original timestamp, including seconds. Invalid calendar dates and DST gaps are rejected. QR titles and downloaded SVG filenames support Arabic; their authenticated destination, encoded pixels and orientation remain unchanged across locale changes.

Validation: 61 existing operations, branch-maintenance, backend and catalogue tests passed. A 30-test Arabic/backend run passed, followed by all eight expanded Arabic journeys and catalogue checks. Web and Convex typechecks, lint, locked-decision verification and whitespace checks pass. Tests cover USD/JOD precision, original serial numbers, safety/severity payloads, retained repair/maintenance drafts, tenant calendar rollover, unchanged timestamp precision, QR payload/pixels and unchanged recommendation facts. The remaining stock, purchasing and supplier-payment workspace copy is the next operations package; browser/responsive/print verification remains in package G.

## Stock and purchasing checkpoint

Stock lists, products, transfers, suppliers, purchase drafts/approval/receipt, and delivery dates now use typed English/Arabic messages. Counts and money accept Arabic/Persian input, preserve currency precision and canonical units/source types, and retain original supplier names/terms. Stock search normalizes only comparison text. Existing transfer retry keys remain stable across language changes and failed saves. Human date labels use the selected locale while calendar payloads stay ISO.

Validation: 32 existing stock/domain/catalog tests passed; four Arabic form/failed-transfer journeys passed. Web typecheck and full lint passed. Stock allocation, receipt, branch permissions and financial algorithms remain unchanged. Browser responsive/RTL acceptance remains part of the final whole-product pass; supplier payments and export localization follow next.

## Supplier payments and readable exports checkpoint

Supplier bills, aging, payment allocation, cash-shift notices, confirmation/print, reversal/history, reconciliation reasons and human CSV exports now support Arabic. Canonical payment methods, immutable originals, references, allocation minor units and retry keys stay intact. Known generated purchase/equipment wrappers are localized only in display projections. Unknown or authored history remains original. Invalid money allocation drafts explicitly block submission instead of silently becoming zero. Backend and mock supplier search use the shared comparison-only Arabic normalization.

Validation: 39 existing domain/mock/Convex/UI/catalog tests passed. Two Arabic failed-payment/reversal journeys and four CSV tests passed, including unchanged references, exact JOD precision, idempotent retry, cash/ledger separation, UTF-8/formula-safe export and retained originals. Both typechecks and full lint passed. Whole-product browser and print-layout review remain outstanding.

## Bookkeeping and ledger guide checkpoint

Bookkeeping controls, journals, source queues, month close/reopen, chart of accounts, ledger home and all seven tutorial steps now use the approved Arabic terms. Known system chart names display in Arabic; saved Arabic account names take precedence and renamed/custom accounts remain authored text. Optional source-reason descriptors are added in read projections while original records, journal history and audit reasons remain unchanged. Known source details display human labels, date/money formatting and bidi isolation; unknown diagnostic fields and technical policy/ID values stay exact. Manual journal amounts validate precision and retain the same retry key across failed saves and language changes. Open close/reopen dialogs store keys and a raw period, retaining the reason while translating their text.

Validation: 59 existing bookkeeping/home/catalog and accounting tests passed. Arabic journeys cover exact balanced amounts, failed submission/retry, unchanged calendar dates and period selection, retained closing reasons and all seven tutorial illustrations; pure tests cover source explanations, known chart names and original diagnostics. The final 38-test package gate, both typechecks, full lint and the locked approval checksum passed. Signed/historical journal text remains original. Financial statement bodies/reports and their export documents are the next package. Browser layout and keyboard acceptance remain outstanding.

## Financial statements checkpoint

Income, balance-sheet and cash-flow statements now localize every control, empty/error state, standard account name, date and reconciliation explanation. Shared report scope uses explicit tenant timezones; canonical calendar dates and branch URLs stay unchanged. Server/mock projections include optional stable message descriptors beside original warning, disclaimer and policy text. Counted posted-record drift and mixed-activity cash warnings retain counts and technical policy versions. Arithmetic agreement still does not imply complete accounting coverage.

Validation: 35 existing statement/scope/catalog and forensic accounting tests passed. Ten Arabic projection/journey tests cover all three statements, exact journal totals, locale changes without lost filters, failed background reloads, every registered warning and six plural categories. Both typechecks and full lint passed; package close also checks the new tests and locked decisions. Operational reports and their downloads follow next; browser presentation remains part of the final acceptance pass.

## Operational reports and CSV checkpoint

All seven operational reports and the finance overview now translate controls, definitions, totals, export titles/headers, known status/action labels and empty/refresh states. Weekday/hour charts use Arabic 12-hour labels; human exports use Jordanian dates and preserve timestamp seconds. CSV amounts and percentage cells stay spreadsheet-readable, with UTF-8/formula escaping and original member names, receipt references and audit text. Currency comes from the reporting context. In-flight overview exports retain their original date/branch snapshot even when filters or language change during the request.

Validation: 34 analytics/overview/CSV/catalog tests passed; seven dual-language report/download journeys and one in-flight overview scope/language journey passed. Web and Convex typechecks and full lint passed, with a final focused lint gate for the last test additions. Whole-product browser and accessibility verification remains outstanding.


## Shared numeric settings and deferred errors checkpoint

Operational rule fields, branch/area capacities and receipt tax use text controls so Arabic/Persian digits reach normalization before browser number-input sanitization. Empty, fractional, out-of-range and over-precision drafts remain visible and block saving. Switching language preserves those drafts; discarding resets even an invalid draft whose last valid underlying value never changed. Existing fee currency precision, integer policy limits, canonical payloads and original receipt/footer text remain intact. In-flight mutation refusals and post-save refresh warnings use the current UI language without resubmitting a write or losing its request/error envelope.

Validation: 22 focused settings/parser/shared-query tests pass, including five new numeric settings journeys and two delayed-response language-switch cases. Focused lint, the locked-decision checksum and whitespace checks pass. Whole-repository gates are deferred until the parallel packets have finished editing their owned namespaces.


## Shared navigation and search checkpoint

All 59 navigation catalogue entries have Arabic titles/descriptions and Arabic/English comparison aliases. Search removes Arabic diacritics and normalizes digit sets without rewriting the query, source names or stored references. Permission/module filtering still runs before searching; destination IDs, form flags and URLs remain canonical. Known server page/action results and recent destinations render in the current language. Optional source facts localize lead/payment statuses beside unchanged original search/recent subtitles; unknown historical subtitles stay original. The mock search now uses the same existing Arabic comparison helper as server search. Demo-only controls and role descriptions also follow the UI language.

Distinct timeline anchors restore direct follow-up evidence links. This does not modify event records.

Validation: 23 navigation, real palette, member timeline and backend tests pass, including normalized Arabic queries, unchanged source contracts, explicit module/permission exclusions, tenant isolation, Arabic phone search and per-user recent metadata. Focused lint and the decision lock pass. A mid-edit whole-web typecheck reported only other parallel packets' in-progress errors; those owners received the log and will resolve them before final integration gates.


## Parallel integration, communications and human exports — 3 October 2026

Six explicitly requested Luna Max packets and Claude's isolated communication packet are integrated in the same worktree. Their bounded reports live in `docs/arabic/parallel/`; packet test counts overlap and must not be added. The current route ledger covers all 75 page files plus the offline route handler. Original review material, authored text, the development-only design gallery and immutable historical documents have explicit scope treatment.

UI and recipient preferences stay separate. Member summaries carry the stored recipient preference; CRM handoffs use it, then the canonical gym default, then English. Lead records and gym staff have no separate message-language setting, so their existing gym default is used. Switching a staff UI language preserves edited handoff drafts and never silently chooses the recipient language. New system notifications and timeline events carry optional typed descriptors in both Convex and the mock adapter. Original text remains stored alongside descriptors, and unknown or authored history stays verbatim. The presenter validates keys, parameter types, dates and bounded nested messages before displaying them.

Outgoing email and WhatsApp copy resolves recipient language and freezes rendered content on the existing delivery boundary. Email bodies and attachment language are stored together. WhatsApp substitutions are frozen at the first lease, then reused on retries; they are not all resolved at enqueue time. Current catalogue 1.1 is an internal version, not Meta approval. The unreleased opt-out footer asks the recipient to contact the gym directly; it no longer promises that replying STOP works. Previously rendered bodies remain unchanged. Live sending still requires the current Meta-approved templates and an inbound opt-out handler; no such handler was introduced by localization.

Human staff CSV downloads and personal archives accept an explicit presentation locale. All seven staff datasets translate headings, known labels/statuses, dates, scope/filter explanations and booleans; references, names, notes, exact decimal amounts, ISO currency codes and formula escaping remain intact. Staff jobs freeze their file language and bytes across retries and later UI-language changes. Legacy jobs default to English. Personal archives use known descriptors for new generated event text without rewriting original records. Machine import headers and unknown source/audit values remain canonical.

The browser production build exposed a difference between fontkit's Node and browser exports. The shared PDF renderer now uses its default API in both runtimes. Arabic terms/privacy downloads were generated again and visually inspected with both Poppler and PDFium: joined glyphs, RTL layout, mixed Latin references, tables and multipage flow are intact. PDFium extraction finds the exact approved titles and no replacement glyphs. pypdf extraction emits visual-order Arabic and is not used as a logical-text acceptance check. The browser download journey separately exercises the actual generated file.

Final whole-repository and browser gates are recorded below after the parallel source packets stabilize. This checkpoint is implementation evidence, not production rollout or provider acceptance.


## Integrated local acceptance — 3 October 2026

Final runtime/source checkpoint: `f9f6f05` (documentation follows separately). The original Arabic, current-main and local-foundation tips are all ancestors of this branch; `FRONTEND_HANDOFF.md` is unchanged from current main.

The final full unit run passed **1,997 tests across 318 files**, plus **14 CLI/environment safety guards**. Both TypeScript targets, zero-warning ESLint/secret-output audit, locked-v1 verification and `git diff --check` passed. The approved mock production build completed with all current routes and the Arabic flag enabled. Later baseline-English corrections passed eight application component tests and 29 gym-directory/detail/billing tests, plus the rebuilt production bundle.

The credential-free browser regression passed **173 of 175** tests on the final production preview. Its two failures were English-copy/locator regressions: the billing preview's composed text and a platform-filter journey whose original Pending label and terminal period had drifted during catalog extraction. Both failed journeys passed separate focused reruns after restoring baseline English copy and correcting the billing-preview locator. The narrow gym-detail grid fix passed at 360px; settings passed at all six tested widths. Original screenshot baselines and tolerances are unchanged, including the CRM phone screenshot.

The separate Arabic run passed **36 of 36**: 31 staff route captures and five real browser invariants covering server-first locale, keyboard language switching, an unsent draft, persistence/reload, member and receipt screens at 390px, platform desktop/tablet, and the actual Arabic terms PDF download. Captures were inspected for joining, bidi and wrapping. The 720px viewport is a 200%-equivalent reflow test, not an actual OS/browser zoom or screen-reader certification. Reports: `parallel/browser-rtl.md`, `parallel/browser-regression.md`, `parallel/browser-platform.md`, and `parallel/browser-workflows.md`.

The final browser-downloaded terms file has four pages. Poppler and PDFium renderings were inspected. PDFium extraction finds the exact Arabic body heading `شروط الاستخدام`, the PDF metadata title is exactly `RIVET شروط الاستخدام`, and there are no replacement characters. The earlier receipt, invoice, privacy and signed-agreement renderer/attachment tests remain part of the passing full suite and recorded independent-viewer evidence. Fresh Arabic and English receipt/invoice HTML previews fit 390px and retain the 600px desktop frame. All external requests were blocked; this is local HTML evidence, not inbox-client delivery certification (`parallel/email-preview.md`).

All 247 approved IDs have real catalog mappings or explicit rule/context evidence. The map retains its evidence limits: 233 implemented source mappings await rendered release acceptance; 14 are verified rules/context checks, including 12 absent-workflow contexts and two style rules. There are no fabricated keys, founder votes or approval changes. The route inventory is 75 page files plus the offline handler. The known residual accounting-reason and breadcrumb findings have been resolved; original authored data, signed history, unknown diagnostics and the bilingual review room stay intact.

Reproduction from the integration root:

```sh
python3 docs/arabic/verify-lock.py
pnpm --dir apps/web typecheck
pnpm --dir apps/web exec tsc --noEmit --incremental false -p convex/tsconfig.json
pnpm lint
pnpm --dir apps/web test --maxWorkers=2
NEXT_PUBLIC_DATA_MODE=mock NEXT_PUBLIC_RIVET_DEMO_AUTH=1 NEXT_PUBLIC_RIVET_DEPLOYMENT_CLASS=preview NEXT_PUBLIC_RIVET_ARABIC=1 RIVET_DESIGN_PREVIEW=1 NEXT_DIST_DIR=.next-arabic-final pnpm --dir apps/web build
PLAYWRIGHT_SERVER_MODE=start PLAYWRIGHT_DIST_DIR=.next-arabic-final PLAYWRIGHT_PORT=3126 PLAYWRIGHT_WORKERS=1 pnpm --dir apps/web exec playwright test e2e/arabic-browser-verification.spec.ts e2e/rtl-audit.spec.ts
git diff --check
```

The 27-spec regression command is recorded in `parallel/browser-regression.md`. Unit/build/typecheck/lint logs use `/private/tmp/rivet-arabic-acceptance-*.log`. Browser evidence is under `/private/tmp/rivet-playwright-results-regression-final`, `/private/tmp/rivet-playwright-results-rtl-final-final` and `/private/tmp/rivet-arabic-rtl-evidence`; fresh email previews are under `/private/tmp/rivet-arabic-email-preview/fresh`.

**External acceptance remains open:** credentialed isolated Clerk/Convex staging, real account and cross-host persistence, provider-owned verification/CAPTCHA language, actual offline installation, assistive-technology/actual-zoom acceptance, and representative founder rendered review. Credential-gated `staging-*`/`convex-*` browser suites and target-dependent Convex code generation were not run. WhatsApp 1.1 still needs Meta re-approval, and the existing inbound opt-out release blocker is not implemented by localization. The footer now requests direct contact with the gym; it does not promise a working STOP handler. Staff and leads still use the gym default where no recipient preference exists. No production rollout or real outbound message was performed. Follow the backend-first and rollback instructions in the release runbook only after release authorization.
