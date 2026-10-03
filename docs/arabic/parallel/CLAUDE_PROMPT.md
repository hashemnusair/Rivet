# Claude task: recipient-safe Arabic communications and system events

You are working alongside Codex on complete Arabic support for RIVET. The user explicitly authorized you to own this packet. Implement it, test it, and commit reviewable changes; do not merely audit or propose a plan.

## Exact checkout and branch

Work ONLY in:

`/Users/eliashreish/.codex/worktrees/arabic-comms-claude/Rivet2`

Branch: `codex/arabic-comms-claude`

Starting commit: `843824f4f3ff97d96bdb22901dbfa78f1eb8f512`

This is an isolated checkout of the integrated Arabic/current-main history. Do not work in `/Users/eliashreish/Rivet2` or in Codex's `complete-arabic-support` checkout. Do not pull/rebase/reset, merge new main, force-push or overwrite partner changes. Codex will review and cherry-pick your commits. You may create local commits on your assigned branch, but do not push or deploy.

## Read before implementing

Read root `AGENTS.md`, applicable nested instructions, `docs/arabic/{README,STANDARD,DECISIONS,IMPLEMENTATION_PLAN,COVERAGE,EXECUTION}.md`, `CURRENT_STATE.md`, `docs/22_PLAIN_LANGUAGE_GUIDE.md`, and the release runbook. Read the full locked `docs/arabic/approved-decisions.v1.json`, then run `python3 docs/arabic/verify-lock.py`.

The locked standard is catalog `2026-09-30-v1`, revision 607, all 247 decisions agreed by Elias and Hashem. Preserve it and frozen `FRONTEND_HANDOFF.md`. Some planning/status documents deliberately describe historical baselines; the current code and EXECUTION checkpoints contain the integrated implementation. Do not undo completed product behavior to match an older handoff.

## Your two connected deliverables

### 1. Finish outgoing Arabic communications end to end

Inventory and complete all email, SMS, WhatsApp draft/provider templates and their builders/jobs, including subjects, preheaders, body text/HTML, buttons, footers, generated placeholders and attachment naming/content. Start with:

- `apps/web/convex/emailTemplate.ts`
- `operationalEmail.ts`, `legalAgreementEmail.ts`
- `messagingTemplates.ts`, `messagingQueue.ts`, `messagingWorker.ts`
- `followupAssist.ts`
- Existing membership, renewal, PT, billing/invoice and support jobs that call these builders
- Existing tests and preview fixtures for each of these paths

Reuse current main's existing Arabic templates and preference/consent behavior. Make recipient language selection explicit, with the recipient's stored communication preference and the existing gym/default fallback. An operator's UI locale MUST NOT change an unrelated recipient's message language. Capture language and template version for queued delivery so retries preserve the original selected content. Preserve all consent, quiet hours, opt-out, disabled/paused modes, provider settings, tenant/branch authorization, deduplication, retry identities and suppression. WhatsApp handoff is a draft; generating it must not mark it sent.

Cover both English and Arabic across each real template path, including mixed Arabic/Latin names, URLs, phones, references, exact positive/negative JOD values and dates. Do not invent capabilities, promises or legal terms. Keep original authored/custom templates and sent-message history; do not replace user-authored content with translations.

### 2. Add compatible localization descriptors to system notifications/events

Inventory `notificationDelivery.ts` and system-generated notification/timeline creators. Add stable message keys and parameters alongside original text, with optional backwards-compatible fields. Preserve canonical event IDs/source facts, original stored strings, immutable audit records and authorization. Historical string-only records may be projected only when structured context unambiguously establishes the exact event; otherwise keep their original text and document the limitation. Never guess a translation for arbitrary notes/errors/history.

Provide small pure shared descriptor/types/helpers and tests so Codex can consume the descriptors in the UI. New known events should carry descriptors at creation/projection. Unknown or authored content remains original. Include a concise list of frontend rendering points that need consumption; those UI files are owned by Codex/Luna, so do not edit them in this packet.

## Boundaries and shared infrastructure

Your ownership is server communications, notification/timeline descriptors, their pure shared helpers, necessary additive schema/domain contract fields and focused tests. You may adjust specific event-creation callsites outside the initial filenames only when needed for these deliverables; document every such file. Do not localize entire unrelated backend modules or take over UI routes.

Your paired catalog namespace is already registered:

- `apps/web/src/lib/i18n/messages/en/communicationCompletion.ts`
- `apps/web/src/lib/i18n/messages/ar/communicationCompletion.ts`

Fill those files as needed. Do not edit `messages/{en,ar}/index.ts` or another agent's namespace. Prefer existing suitable approved keys where they already exist. Do not add unused translations just to satisfy a coverage count.

Existing infrastructure that must be reused:

- Pure `src/lib/i18n/core.ts`: `createTranslator`, `TFunction`, `TKey`.
- Pure `src/lib/i18n/formatters.ts`: `makeFormatters`; React hooks stay out of Convex/shared server modules.
- True `plural()` messages with all Arabic zero/one/two/few/many/other cases.
- `src/lib/utils/text.ts` comparison/input helpers, canonical money minor units and strict money parsing.
- Existing stable optional error descriptors and compatible error envelopes; do not replace them with broad translated error strings.
- Arabic Unicode PDF rendering is ALREADY implemented in `convex/pdfDocument.ts` using embedded IBM Plex Arabic, shaping and bidi, with independent viewer checks. Reuse it for any missing emailed attachment integration. Do not redesign or replace it with screenshots or WinAnsi.
- Arabic agreement v1.2 is implemented; old signed agreement versions/hashes/original bytes remain immutable. Never make an already-signed document follow a viewer's current language.

The existing font/PDF packages are available in the lockfile. No paid translation service or new dependency is required. If node_modules is absent, run `pnpm install --frozen-lockfile`; do not change dependencies or lockfiles merely to bootstrap the checkout.

## Language requirements

Use clear Modern Standard Arabic and nominal action labels. Specific approved decisions override general style. Latin digits, Gregorian dates with Jordanian month names, Arabic 12-hour time, and `25.000 د.أ`; RIVET stays unchanged. Exact contextual terms include:

- Cash method: `كاش`; cash drawer accounting uses the approved `الصندوق` phrases.
- Receipt: `وصل دفع`; receipt email subject: `إيصال دفعتك`.
- Membership: `اشتراك`; membership plans: `أنواع الاشتراكات`.
- Contextual `الأعضاء` / `المشترك` as approved; read the actual context in the lock.
- Freeze request: `طلب تجميد الاشتراك`; pending request: `الطلب قيد المراجعة`.
- Group class: `حصة جماعية`; waitlist: `قائمة الانتظار`; no-show: `لم يحضر`.
- Personal training: `حصة تدريب شخصي`; trainer: `مدرّب`; PT package: `باقة تدريب شخصي`.
- Supplier: `مورّد`; supplier payment: `تسجيل دفعة للمورّد`.

This list is not a substitute for reading all approved decisions.

## Safety and verification

Use mocks, dry local renders, fake providers and preview files only. DO NOT SEND REAL EMAIL, SMS OR WHATSAPP MESSAGES. Do not deploy to staging or production, set provider secrets, print environment values or touch production data. Respect the root secret-safe Convex wrappers; never use raw Convex deploy or verbose/debug/env-secret commands.

Run appropriate focused unit/integration tests for all affected templates, queue language/version snapshots, preference precedence, retries/deduplication, suppression/consent, old/new records and tenant isolation. Prove that switching UI locale does not change recipient language and that retries after preference changes retain the queued version/language. Verify downloaded/emailed attachment content through the existing shared renderer and test fixtures without live delivery. Run `pnpm typecheck`, `pnpm convex:typecheck`, focused lint or full lint, catalog parity/lock checks and `git diff --check`. Existing unrelated failures should be reported with evidence rather than hidden.

## Completion handoff

Create `docs/arabic/parallel/claude-communications.md` with:

1. What changed and every edited file.
2. Template/event inventory, language selection and version/retry behavior.
3. Stable descriptors and the UI consumers Codex must wire.
4. Applicable approved decision IDs and real keys/tested rules.
5. Test commands and actual results; preview/document evidence paths.
6. Intentional original-history/custom-content exceptions and remaining blockers.
7. Your branch, base commit and ordered commit SHAs to cherry-pick.

Do not edit `CURRENT_STATE.md`, global decision-coverage/EXECUTION ledgers or the release runbook; Codex will consolidate them after review. Finish both deliverables in bounded reviewable commits, then report the commit SHAs and handoff path to the user. Codex remains responsible for integration and final whole-product verification.
