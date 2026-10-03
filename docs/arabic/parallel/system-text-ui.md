# System-message presentation in shared UI

Connected the Claude communication descriptor presenters to the shared notification and timeline components in `/Users/eliashreish/.codex/worktrees/complete-arabic-support/Rivet2`. Descriptor generation, API/mock adapters, IDs, routes, metadata, read state, and event behavior were not changed.

## Files

- `apps/web/src/components/shell/notification-center.tsx`
- `apps/web/src/components/shell/notification-center.presentation.test.tsx`
- `apps/web/src/components/shared/timeline-feed.tsx`
- `apps/web/src/components/shared/timeline-feed.presentation.test.tsx`

## Presentation and key mapping

- Notifications now call `presentNotification(record, { locale, t, format })`. `useFormat()` consumes the existing formatting context and its organization timezone. The title/body use the rendered pair, while row IDs, hrefs, read-state actions and subscription identity continue to use the original record. The row action has a translated accessible name built from `common.action.viewDetails` and the displayed title; the mark-read label also uses the displayed title.
- Timeline rows now call `presentTimelineEvent(event, { locale, t, format })`. The existing `timeline-event-${event.id}` anchors, event IDs, receipt link derived from `meta.receiptId`, actor names, timestamps, and authored bodies are preserved. Only the presenter’s returned title/body are displayed.
- English continues to show stored source text. Arabic uses valid known descriptors from `communicationCompletion.notifications.*` and `communicationCompletion.timeline.*`; missing, invalid, or future descriptors retain original text. No authored text is translated.
- Component proofs use `communicationCompletion.notifications.renewalApproaching`, `.termEnds`, and `communicationCompletion.timeline.paymentCollected`, including the `domain.paymentMethod.cash` enum. The translated row action uses existing `common.action.viewDetails`; no catalog namespace or index was changed.
- This exercises the approved `cash`, `money-format`, `calendar`, `months`, `time-format`, and `digits` decisions through the existing system presenter/formatters. The helper’s existing tests cover the wider descriptor key families and exact fallback behavior.

## Tests and checks

Run from `apps/web`:

```sh
pnpm exec vitest run src/components/shell/notification-center.presentation.test.tsx src/components/shared/timeline-feed.presentation.test.tsx src/features/members/member-profile-arabic.test.tsx src/features/branch-ops/branch-ops.test.tsx
pnpm exec vitest run src/lib/i18n/system-messages.test.ts
pnpm exec eslint src/components/shell/notification-center.tsx src/components/shell/notification-center.presentation.test.tsx src/components/shared/timeline-feed.tsx src/components/shared/timeline-feed.presentation.test.tsx
```

Results: 4 component/consumer files passed (16 tests); the presenter suite passed (13 tests); focused ESLint passed. The new component tests cover English source text, Arabic descriptor output and translated notification action labels, unknown descriptor fallbacks, and preserved notification/timeline IDs, receipt metadata destinations, and authored text.

`pnpm exec tsc --noEmit --incremental false` still exits with errors in concurrently edited `apps/web/src/app/(app)/audit/page.tsx` and the shared Arabic catalog index `apps/web/src/lib/i18n/messages/ar/index.ts`. It reports no errors in these four files.

## Boundary

The mock adapter was left untouched while the primary agent edits its export methods. Existing callers now receive presentation at the two shared component boundaries, including the owner dashboard and member/lead feeds that consume `TimelineFeed`.
