# Arabic implementation execution record

Work continues on `codex/complete-arabic-support`. This document records progress, not release approval. Production has not been deployed and no real messages have been sent.

## Integrated history

- Refreshed `origin/arabic-localisation`: `901150a7d3863358893ec399b4203277a88d88fe`.
- Refreshed `origin/main`: `7cd509e8a9c488fe864ec1c1c248e39bf8a57cab`.
- Preserved local `arabic-foundation`: `9fbd53c1d5a1ef2569cfc7f655e818f1f8faea91`.
- Merge commits `ae4b481` and `b38a02f` retain both Arabic histories and current main. Current main business logic wins at workflow overlaps; matching older translation hooks were carried into the current components. The frozen frontend handoff and locked decision export remain unchanged.
- The original checkout remains on `arabic-foundation`; implementation is in the attached isolated worktree.

## Package status

| Package | State | Evidence and remaining work |
| --- | --- | --- |
| A integration | In progress | Both histories merged; original regression suite passed after fixing JSX whitespace and catalog audit expectations. Current source inventory: 464 files, 14,099 candidates. Route ledger and final build remain. |
| B foundation | In progress | Account-scoped UI preference, server-first resolution, cross-host presentation cookies, offline retry, account-race guard, pure translation/formatters, Latin input/search normalization. Browser SSR/auth handoff and complete auth-provider wording remain. |
| C staff | In progress | Existing namespaces aligned to 82 decisions across 168 keys; matching display labels connected across current UI. Substantial untranslated prose, dynamic labels and dialogs remain. |
| D other surfaces | In progress | Current public/member/platform business behavior retained; partial catalog reuse. Full translation and metadata/assets remain. |
| E server/messages | Pending | Existing recipient-aware mail behavior retained. Stable message descriptors and complete template alignment remain. |
| F documents | In progress | Shared Unicode renderer prototype passes shaping/multipage tests and independent rendering/extraction. Invoice builder now supports explicit locale. Agreement versioning, remaining documents and full attachment/download verification remain. |
| G RTL/accessibility | Pending | Existing logical layout/font and RTL audit preserved. Full mobile/desktop/zoom/a11y verification remains. |
| H closure | Pending | Decision coverage includes all 247 with honest pending states. Full ledger, final tests/build/browser/staging and founder rendered review remain. |

## Locale policy

The UI setting is optional `users.uiLocale`, independent of member communication preferences and organization defaults. Only an authenticated active account can update its own setting. Requests carry the expected Clerk account subject so a late request after account switching cannot affect a different account. The browser owner marker is a presentation hint, never authorization.

Precedence is an explicit pending choice for the current account (or made anonymously during sign-in), the saved authenticated UI setting, an eligible cookie, then English. A stale localStorage mirror never overrides server hydration. Sign-out or account switching discards an earlier account's choice. Failed saves remain pending and retry on reconnection; edits in open forms are retained. Only presentation cookies use `rivetjo.com` domain scope on recognized RIVET hosts. Auth cookies are unchanged. Preview/localhost cookies remain host-only.

Arabic formatting uses Latin digits, fixed Jordanian Gregorian month names, `h12`, JOD three-decimal amounts, and the session organization's timezone for instants. Date-only values retain their calendar day. Compact Arabic amounts use ألف/مليون, with the full amount available on hover. Other currencies retain their ISO code and existing minor-unit exponent. Search normalization folds Arabic diacritics, tatweel, alef variants and final alif maqsura for comparison only; stored names are preserved. Arabic/Persian phone digits normalize through the existing country-aware phone rules.

## PDF architecture and evidence

The custom writer is retained. `@pdf-lib/fontkit` supplies contextual GSUB/GPOS shaping; `bidi-js` supplies Unicode bidi run order and mirrored punctuation. The renderer embeds the original IBM Plex Sans Arabic regular/semibold TrueType fonts as Type0/CID fonts, adds ToUnicode maps and logical ActualText, measures shaped advances, wraps against measured widths and reflects layout for Arabic without reflecting images/signatures. English-only runs retain the existing fonts and layout. Both dependencies run as bundled JavaScript in browser and Convex; no Node-only font loading or paid service is needed.

Font sources, SHA-256 hashes and OFL license are checked in under `apps/web/scripts/pdf-fonts`. `node apps/web/scripts/build-arabic-pdf-fonts.mjs` rebuilds the embedded module. Source: [fontkit](https://github.com/Hopding/fontkit), [bidi-js](https://github.com/lojjic/bidi-js), [Google Fonts IBM Plex Sans Arabic](https://github.com/google/fonts/tree/main/ofl/ibmplexsansarabic).

The prototype generated `/private/tmp/rivet-arabic-pdf/arabic-receipt-agreement.pdf` with 65 table rows, mixed names/references, negative amounts and a signature section over 3 pages. Pages 1 and 3 were visually inspected after Poppler rendering. PDFium extraction preserves the original Arabic strings, mixed references and signs. Poppler's text extractor emits directional control characters and visual-order Arabic; extraction tests use PDFium for logical text. This prototype is evidence for the renderer, not certification of every business document.

## Validation record

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
