# Arabic review room

Route: **https://www.rivetjo.com/arabic-room**. Choose **Elias** or **Hashem** when opening the page. No account or sign-in is required. The old `/platform/arabic-room` link redirects here, preserving the selected question. This page sits outside the platform console and is not added to gym/member navigation.

## How Hashem and Elias use it

1. Choose a section or start at the first unanswered question. There are **247 multiple-choice questions in 13 sections**. Each has a meaning/context, two or three Arabic drafts, “None of these”, an optional custom answer and a comment.
2. Choose an option and press **Save answer** or **Save & next**. Selection alone is an unsaved draft; the page explicitly labels it. A save is only acknowledged after the server commits it. Refreshing retains saved answers, and fresh visits resume at the first unanswered question unless a `?card=` link specifies one.
3. Answers and comments belong to the selected name. Saved answers sync live through Convex. The other person's answer is visually revealed after your own first save, as an aid to independent judgment, not a confidentiality boundary between reviewers.
4. Filter **Discuss together** to resolve different answers. Each person edits their own answer to the agreed wording. Identical custom answers count as agreement; two “None of these” votes never do. The agent never resolves disagreements automatically.
5. Presence shows who is active; **Follow their questions** follows a partner's selected card while they are active. Editing pauses following so a draft is not interrupted. The presence timeout is 90 seconds, checked on a 30-second heartbeat. It is an approximate activity indicator.
6. Once every question agrees, each reviewer presses **Approve agreed wording**. Any answer/comment change clears all approvals. The reviewer roster is fixed to Elias and Hashem. A stale tab cannot overwrite another tab's newer answer.
7. Download **Export approved choices**, then download **Agent prompt**. Supply both to a fresh implementation session. The prompt also contains a read-only command for fetching the current production preferences directly.

## Scope and evidence

The repository-wide static inventory scanned **414 TS/TSX source files**, including staff/member/platform/public routes, shared UI and Convex code. It contains **13,179 candidate strings** with source locations in `source-inventory.json`. Candidates deliberately include some implementation strings; this is a discovery aid, not a claim that every entry needs translation. It excludes tests, generated bindings, mock/seed fixtures and the review tool itself. Regenerate from `apps/web` using `node scripts/inventory-arabic-copy.mjs` and inspect dynamic, external-provider, image and document text separately.

The 247 editorial questions sample recurring and exceptional language decisions across:

- Voice, grammatical address, politeness, button form, digits, calendars, month names, currency and time, product name and borrowed terms.
- Navigation, common actions, members/subscriptions, reception/access, payments/cash.
- Leads/follow-ups, classes/PT, stock/purchasing, repairs/checklists.
- Financial reports/bookkeeping, roles/access, errors and unusual failure states.
- Member app, marketing/public/auth/legal surfaces, platform/support and notifications.

178 cards link related source wording; the rest are explicitly labeled editorial scenarios or formatting choices. Source links are context evidence, not claims of exact copy on every matching screen. All options remain drafts until the founders choose them. Review-card coverage is not translation coverage. The implementation prompt requires a fresh full-product audit, including backend text, provider UI, accessibility labels, email/WhatsApp, receipts/PDFs, images, offline states and true RTL behavior.

## Data and security

- `arabicReviewVotes`: current answer per catalog version/card/selected name.
- `arabicReviewHistory`: append-only answer/comment changes. UI shows latest 30 per card; older history remains stored.
- `arabicReviewRooms`: revision and approvals tied to the two named reviewers.
- `arabicReviewPresence`: last active question/time per selected name. No chat or third-party messaging.
- On 1 October 2026, Hashem explicitly requested unauthenticated access with a two-name picker. All review queries and mutations are deliberately public. Anyone with the link can view the review content and choose either name to edit or approve it; the names are not authenticated identities. No gym, account, money or platform-admin API permission is granted by choosing a name.
- Only the literal reviewer keys `elias` and `hashem` are accepted. Inputs, catalog version, stale writes and approval state are still validated server-side. Mutations have bounded per-name write/presence rate limits. These are traffic controls, not identity verification.
- Legacy account-owned review answers, comments, history and approvals can be preserved by the internal, idempotent `migrateNamedReviewers` mutation. It verifies the supplied legacy accounts, remaps only review-table ownership to stable names and refuses duplicate answer conflicts. It never modifies the accounts themselves.
- Version `2026-09-30-v1` binds votes to the questionnaire. Bump the version whenever meanings/options change after release; never repurpose option IDs under an existing version. Prior versions remain stored and are not treated as current approvals.
- The production UI never falls back to local/demo persistence. The picker appears on each opening/reload; choosing a name restores its saved progress, and “Switch name” changes the current reviewer after drafts are saved. The existing guarded mock preview uses visibly labeled in-memory sample answers for UI tests only.

## Agent handoff

Read `IMPLEMENTATION_PROMPT.md`, the current approved JSON export, `CURRENT_STATE.md`, `DESIGN.md`, and `docs/22_PLAIN_LANGUAGE_GUIDE.md`. The public download at `apps/web/public/arabic-implementation-prompt.txt` matches the Markdown prompt. The prompt requires full Arabic implementation based on actual approved choices and keeps unresolved or stale exports from silently becoming a language specification.

This release only adds the review tool and future implementation prompt. It does not enable Arabic in the product or merge `origin/arabic-localisation`. No runtime translation service or new paid dependency is used.
