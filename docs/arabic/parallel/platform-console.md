# Platform console Arabic support

## Scope

This packet localizes the platform overview, application review and provisioning, subscription agreement administration, support inbox, email log, shared platform shell and shared platform status/page components. The billing, subscription and gym route bodies remain with their assigned packet.

Changed files:

- `apps/web/src/app/platform/page.tsx` and `page.test.tsx`
- `apps/web/src/app/platform/applications/page.tsx` and `page.test.tsx`
- `apps/web/src/app/platform/agreements/platform-agreements.client.tsx` and `platform-agreements.test.tsx`
- `apps/web/src/app/platform/support/page.tsx` and `page.test.tsx`
- `apps/web/src/app/platform/email-log/platform-email-log.client.tsx` and `platform-email-log.test.tsx`
- `apps/web/src/components/platform/platform-shell.tsx`
- `apps/web/src/components/platform/platform-page.tsx`
- `apps/web/src/components/platform/platform-status.tsx`
- `apps/web/src/lib/i18n/messages/en/platformConsole.ts`
- `apps/web/src/lib/i18n/messages/ar/platformConsole.ts`

## Approved terminology and catalog mapping

The dedicated catalog pair covers `platformConsole.navigation`, `.shell`, `.status`, `.home`, `.applications`, `.agreements`, `.support`, `.emailLog`, and `.shared`. Known system states, email modes and operational email kinds have Arabic labels; unknown provider details and authored values remain intact.

Approved platform terms are used at their relevant controls and status displays:

- `gym-applications` → `platformConsole.navigation.applications`, `platformConsole.applications.title`
- `under-review` → `platformConsole.status.application.underReview` (also used by the application filter)
- `approve` → `platformConsole.applications.approve`
- `reject` → `platformConsole.applications.reject`
- `support-case` → `platformConsole.support.title` and the `openCount`/`urgentCount` case labels
- `support-reply` → `platformConsole.support.replyLabel`, `.replyToGym`, `.sendReply`
- `reopen` → `platformConsole.support.reopen`
- `email-log` → `platformConsole.navigation.emailLog`, `platformConsole.emailLog.title`

The signature flow reuses the approved electronic-signature vocabulary in the existing agreement/signature components. This packet changes only the console UI around the signed record. It does not rewrite or re-render signed agreement content, alter version/hash/signature semantics, or broaden ID-reveal and countersign permissions.

Application notes and rejection reasons, support conversation text and resolution summaries, email subjects and provider error codes remain source data. Locale switching keeps editable review, reply, countersign and void drafts; retrying an application review or countersign uses the same entered data, and the countersign idempotency key remains stable until success.

## Validation

- Focused console Vitest run: 6 test files passed, 18 tests passed. The focused group covers overview, application review, agreements, support, email log and shell.
- Arabic regression assertions cover a rejection reason surviving a locale switch and failed-action retry, countersign fields surviving locale switching and a countersign retry using the same idempotency key, support reply drafts surviving a locale switch, and preserving authored support/email history.
- Focused ESLint on the listed implementation, tests and catalog files passed with `--max-warnings 0`.
- Latest `pnpm exec tsc --noEmit --incremental false` reported no platform-console page/component errors. It still reports unrelated parallel-worktree errors in the audit page, export request/job locale types, WhatsApp handoff's missing `isolateLtr` import, and the shared Arabic message-index catalog type; the platform-console `as const` catalog typing issue found in an earlier run has been corrected.
- The latest `src/lib/i18n/messages.test.ts` run passed 9/10; the key-parity test currently reports the unrelated missing Arabic key `crmCompletion.pipeline.notSoldReasonRequired` from the parallel CRM catalog packet. The platform console empty plural form correction passes.

## Remaining limits

- The whole-web typecheck should be rerun after the other parallel packets resolve their listed errors.
- The full catalog parity suite should be rerun after the CRM packet restores `crmCompletion.pipeline.notSoldReasonRequired` in Arabic.
- The browser test environment logs jsdom's existing unsupported canvas `getContext` warning when the agreement signature pad initializes; the agreement tests still pass.
- Billing, subscriptions and gyms route bodies are outside this packet. Their consumers of the shared platform badges can pass through localized labels from `platform-status.tsx`; finance owns those route changes.
