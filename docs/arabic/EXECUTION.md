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
