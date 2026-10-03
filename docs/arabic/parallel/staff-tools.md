# Staff tools Arabic packet

This packet localizes the staff audit log, daily checklists, automation monitoring/editor views, RIVET support, and export center. It uses the approved `staffTools` message catalogs and current locale/formatting hooks. No backend message templates or shared export workers were changed here.

## Files

- `apps/web/src/app/(app)/audit/page.tsx`
- `apps/web/src/app/(app)/checklists/page.tsx`
- `apps/web/src/app/(app)/automations/[ruleId]/rule-editor.client.tsx`
- `apps/web/src/app/(app)/automations/[ruleId]/rule-monitoring.client.tsx`
- `apps/web/src/app/(app)/support/page.tsx`
- `apps/web/src/app/(app)/exports/export-center.client.tsx`
- `apps/web/src/app/(app)/exports/export-job-presentation.ts`
- `apps/web/src/app/(app)/exports/export-job-presentation.test.ts`
- `apps/web/src/app/(app)/exports/export-center-arabic.test.tsx`
- `apps/web/src/app/(app)/automations/[ruleId]/rule-editor-arabic.test.tsx`
- `apps/web/src/features/automations/automation-monitoring.client.tsx`
- `apps/web/src/features/automations/coming-soon.tsx`
- `apps/web/src/features/automations/form.ts`
- `apps/web/src/features/automations/form.test.ts`
- `apps/web/src/features/automations/labels.ts`
- `apps/web/src/features/automations/monitoring-ui.tsx`
- `apps/web/src/lib/i18n/messages/en/staffTools.ts`
- `apps/web/src/lib/i18n/messages/ar/staffTools.ts`

## Decision and key map

The packet follows the locked `docs/arabic/README.md`, `STANDARD.md`, `DECISIONS.md`, and `approved-decisions.v1.json` (revision 607). Relevant approved decisions include `activity-log`, `checklist`, `fail-check`, `support-case`, `support-reply`, `automations-paused`, `downloads`, `digits`, `money-format`, `save`, `cancel`, and `retry`.

The registered catalogs map those decisions as follows:

- `staffTools.audit`: translated category, known action, role, and field labels plus access/filter/empty states. Unknown historical codes remain unchanged.
- `staffTools.checklists`: run type, result, validation, due-time, escalation, and dialog states. Draft status/reason and escalation zone selection remain in component state across locale changes.
- `staffTools.automations`: known trigger/action/status/provider/pause projections, editor validation and dialogs, and Arabic plural forms. Saved `enabled`, global pause, retry, dedupe, and template settings remain canonical.
- `staffTools.support`: case workflow, upgrade request, loading/errors, and toast copy. The plan selection, reply, subject, and body are not reset by language changes.
- `staffTools.exports`: export kinds/status/download, filters, row and branch scope summaries, frozen file language, and known oversize-job error. `useLocale().locale` is attached to each request; a prior job displays its stored locale, defaulting legacy jobs to English.

Dates use the tenant timezone and the approved Gregorian Jordanian display. Counters use `useFormat().number`; money values use the shared money formatter. Automation integer fields normalize Arabic-Indic and Persian digits and Arabic comma separators only during validation/save, leaving the visible draft unchanged.

## Preserved original content

Audit summaries, reasons, entity/actor names, correlation IDs, and unknown before/after values remain source text. Checklist names, item labels/instructions, actor names, and recorded reasons remain authored values. Automation rule and message-template names/bodies and execution subject/detail text remain intact; only known system state is translated. Support subjects, authors, message bodies, branch names, and resolution summaries remain unchanged. Export file names, real branch names, and unknown worker failure/scope text stay verbatim. Known branch-scope codes and the known export size-limit failure descriptor are localized without changing the stored job.

No real automation run, support reply, or support request was sent. The editor tests use the seeded `MockGymOSApi`; they verify drafts and authorization without invoking the run action.

## Validation

Commands run from the assigned worktree:

```sh
python3 docs/arabic/verify-lock.py
pnpm --filter web exec eslint 'src/app/(app)/audit/page.tsx' 'src/app/(app)/checklists/page.tsx' 'src/app/(app)/automations/[ruleId]/rule-editor.client.tsx' 'src/app/(app)/automations/[ruleId]/rule-monitoring.client.tsx' 'src/app/(app)/support/page.tsx' 'src/app/(app)/exports/export-center.client.tsx' 'src/app/(app)/exports/export-job-presentation.ts' 'src/app/(app)/exports/export-job-presentation.test.ts' 'src/app/(app)/automations/[ruleId]/rule-editor-arabic.test.tsx' 'src/app/(app)/exports/export-center-arabic.test.tsx' 'src/features/automations' 'src/lib/i18n/messages/en/staffTools.ts' 'src/lib/i18n/messages/ar/staffTools.ts'
pnpm --filter web exec vitest run 'src/app/(app)/automations/[ruleId]/rule-editor-arabic.test.tsx' 'src/app/(app)/exports/export-center-arabic.test.tsx' 'src/app/(app)/exports/export-job-presentation.test.ts' src/features/automations/form.test.ts src/features/automations/monitoring-ui.test.tsx src/features/automations/coming-soon.test.tsx 'src/app/(app)/checklists/page.test.tsx' 'src/app/(app)/support/page.test.tsx' src/lib/i18n/messages.test.ts src/lib/i18n/format.test.ts
pnpm --filter web exec tsc --noEmit --incremental false
```

Results: Arabic lock verification passed (revision 607). Focused ESLint passed with no findings. Vitest passed all 36 tests across the 10 selected files, including Arabic editor draft/permission coverage and the export locale round trip. `pnpm --filter web exec tsc --noEmit --incremental false` passed with exit code 0. The ordinary sandbox denied Vitest's temporary config write under `apps/web/node_modules/.vite-temp`; the test command was then run with the managed-worktree escalation allowed for this task.

## Handoff and limitations

The shared export contract and CSV builders are owned by the primary packet. The UI passes the requested file-content locale and understands `failureMessageKey: "exports.tooLarge"` with count params, plus known legacy failure/scope values. Mock/backend round-trip validation now confirms that a returned history job retains its requested locale even after the interface language changes. Legacy jobs without a locale display English. Unknown future worker descriptors remain visible verbatim until a catalog mapping is explicitly added.
