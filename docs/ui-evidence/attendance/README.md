# Attendance UI verification — 2 October 2026

These captures use RIVET's explicit seeded mock mode, never real member data.
`apps/web/e2e/attendance.spec.ts` exercises the member journey, staff reports
and authorized branch publication setting. Images are current-date evidence,
not deterministic screenshot baselines.

- `member-1440.png`, `member-390.png`: membership detail with a current estimate,
  daily occupancy curve, usual day/hour rhythm and suggestions.
- `member-rtl-390.png`: manual RTL layout and expanded keyboard-accessible daily
  values table. This verifies direction support; attendance copy remains
  English, as do the surrounding untranslated product areas.
- `staff-1440.png`, `staff-390.png`: branch-scoped estimated occupancy above the
  existing, separately labelled entry-volume report.
- `settings-390.png`: branch duration, optional capacity, timezone, source mode
  and explicit public-publication control after saving in the seeded preview.

Visual review checks RIVET typography and restrained monochrome charts,
legible disclosures, responsive layout and bounded heatmap scrolling. The
mobile fixed navigation in full-page captures is drawn at its viewport
position; it stays fixed while scrolling in the actual app. Browser checks
also cover keyboard expansion, no document overflow, offline withdrawal and
reconnection. Public widget component tests cover credential-free fetching
and withdrawal on revoked publication.

Final automated counts, any regression reruns and release limitations are in
`CURRENT_STATE.md`. Real Clerk/Convex staging and deployed public-origin checks
remain release gates; a mock screenshot does not claim hardware or production
verification.

## Final checks

- Full unit/integration suite: **280 files / 1,759 tests passed**, using
  `pnpm --filter web exec vitest run --maxWorkers=3`.
- CLI/environment guards: **14 passed**. Both TypeScript checks, zero-warning
  lint plus secret-output audit, Convex codegen and production build passed.
- The compiled approved mock preview passed **47/47 Playwright journeys** in
  `attendance.spec.ts`, `happy-path.spec.ts`, `workflow-pass-4.spec.ts` and
  `workflow-pass-5.spec.ts` (2.5 minutes). They cover 360, 390, 768, 820, 1280
  and 1440px layouts; the focused attendance captures are 390 and 1440px.
- The initial dev-server run was interrupted after repeated forced-reload /
  navigation timeouts. The compiled rerun resolved those failures. The new
  settings rail was tightened to fit desktop height; existing phone and ledger
  test selectors were corrected without changing those product flows.
- One unit run under concurrent browser compilation exceeded an existing
  communications test's five-second timeout; the bounded full rerun passed.
  No timeout thresholds or screenshot tolerances were relaxed.

For a stable browser reproduction, use a nested ignored build directory:

```sh
NEXT_PUBLIC_DATA_MODE=mock NEXT_PUBLIC_RIVET_DEMO_AUTH=1 NEXT_PUBLIC_RIVET_DEPLOYMENT_CLASS=preview RIVET_DESIGN_PREVIEW=1 NEXT_DIST_DIR=.next-playwright/attendance pnpm build
PLAYWRIGHT_SERVER_MODE=start PLAYWRIGHT_DIST_DIR=.next-playwright/attendance PLAYWRIGHT_PORT=3217 pnpm --filter web exec playwright test e2e/attendance.spec.ts e2e/happy-path.spec.ts e2e/workflow-pass-4.spec.ts e2e/workflow-pass-5.spec.ts
```

Next may add the temporary generated-type paths to `apps/web/tsconfig.json`;
remove only those generated-path additions after local verification. The run
for these captures used an equivalent temporary `.next-attendance-preview`
directory, removed after testing. No production services or publication flags
were changed.
