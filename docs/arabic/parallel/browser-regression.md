# Credential-free browser regression

## Checkpoint and scope

The initial run used the Arabic-enabled production bundle at `apps/web/.next-arabic-build`, built at checkpoint `6d53751`, on local port `3120` with two workers. The run was read-only outside the local mock application: it used no credentials, staging tenant, provider provisioning, external write, message send, or deployment. Its Playwright artifacts are in `/private/tmp/rivet-playwright-results-regression`.

The explicit suite included the public Arabic review room, English journeys, and the application, billing, settings, member, trainer, and workflow regressions:

```sh
PLAYWRIGHT_SERVER_MODE=start \
PLAYWRIGHT_DIST_DIR=.next-arabic-build \
PLAYWRIGHT_PORT=3120 \
PLAYWRIGHT_WORKERS=2 \
pnpm exec playwright test --output /private/tmp/rivet-playwright-results-regression \
  e2e/arabic-review.spec.ts \
  e2e/checkout-and-payables.spec.ts \
  e2e/classes.spec.ts \
  e2e/design-system-checkpoint.spec.ts \
  e2e/design-system-visual.spec.ts \
  e2e/exports.spec.ts \
  e2e/feedback-regressions.spec.ts \
  e2e/gym-spaces.spec.ts \
  e2e/happy-path.spec.ts \
  e2e/host-routing.spec.ts \
  e2e/legal-agreement.spec.ts \
  e2e/member-import.spec.ts \
  e2e/operations-workflows.spec.ts \
  e2e/platform-subscription-entitlements.spec.ts \
  e2e/public-experience.spec.ts \
  e2e/repo-workflows.spec.ts \
  e2e/role-routing.spec.ts \
  e2e/tab-scroll-stability.spec.ts \
  e2e/today-queue.spec.ts \
  e2e/trainer-journey.spec.ts \
  e2e/workflow-pass-1-visual.spec.ts \
  e2e/workflow-pass-2.spec.ts \
  e2e/workflow-pass-3.spec.ts \
  e2e/workflow-pass-4.spec.ts \
  e2e/workflow-pass-5.spec.ts \
  e2e/workflow-pass-6.spec.ts \
  e2e/workflow-pass-7.spec.ts
```

The staff-owned `rtl-audit.spec.ts` and `arabic-browser-verification.spec.ts`, staging specs, and Convex specs were excluded. This is credential-free local browser evidence; it does not certify provider integration, staging acceptance, or a production release.

## Initial result and triage

The run completed with **154 passed and 21 failed out of 175**. The failures were triaged with the saved Playwright error contexts. Follow-up changes are being checked against a final rebuilt bundle; the original count remains the result of the checkpoint run.

| Area | Failures | Evidence and follow-up |
| --- | ---: | --- |
| Arabic review prompt | 1 | The downloaded prompt now contains the complete locked-standard brief and points to `docs/arabic/approved-decisions.v1.json`; it does not repeat the JSON field name `readyForImplementation`. The e2e assertion now checks the approved export path, revision 607, and all 247 decisions. |
| English-copy baseline | 3 | Historical source showed platform navigation was “Applications,” the overview region was “Needs attention,” and signup validation was `Enter the gym's address.`. The English catalog values were restored; Arabic values remain translated. The overview-region assertion failure is counted here, not as a separate failure. |
| Product language switch | 1 | The former manual-direction demo control no longer exists. The e2e now uses the supported account-menu switch to verify English → Arabic (`lang=ar`, `dir=rtl`, translated member heading and row) → English. |
| CRM mobile screenshot | 1 | The only inspected image difference was a changed English CRM pipeline description wrapping on a 390px capture. The English source was restored to the original “Call leads, follow up on trials, and record sales.” No screenshot or threshold was changed. Retest after rebuilding. |
| Settings numeric field | 6 | At 360, 390, 768, 820, 1280, and 1440px, the expected “Ending soon warning, days” field is present as a textbox with value `7`; the test expected a spinbutton. Desk owns the selector follow-up. |
| Member phone locator | 1 | The member table wraps the LTR phone in `bdi[dir=ltr]` rather than putting `dir=ltr` on the table cell. Desk owns the selector follow-up. |
| Delivery quantity locator | 1 | The repository workflow timed out waiting for a `Quantity` spinbutton. Desk owns the workflow follow-up. |
| Trainer time-off date | 1 | The UI displays the locale-formatted `21 Sept 2026`; the test expected storage-form ISO `2026-09-21`. Desk owns the assertion follow-up. |
| Payment-method settings | 1 | The test could not find the “Other / adjustment” switch. This remains under coordinated review; no product behavior or test threshold was changed in this packet. |
| Platform billing preview | 1 | The snapshot contains the expected invoice preview as a list item, while the original locator did not resolve it. Finance owns the platform assertion review. |
| Platform subscription audit history | 1 | Historical checkpoint failure: the test expected the old exact English activity sentence after suspension. Root/finance have since repaired the audit reason/breadcrumb presentation; the rebuilt run must determine whether the original journey now passes. The checkpoint trace remains historical evidence, not a claim about current behavior. |
| Platform public listing | 1 | The gym-detail test could not resolve “Public directory listing” after opening Forge Fitness. Finance owns the accessible-name review. |
| Public profile draft | 1 | The snapshot includes “Draft · version 2” but the locator did not resolve it. Finance owns the assertion review. |
| Platform detail at 360px | 1 | The gym record failed the horizontal-overflow assertion. Finance owns the layout review; this is a real viewport failure, not a stale selector. |

The CRM expected/actual/diff images were visually inspected. The mismatch was isolated to the changed description text and its wrapping. No image reference was accepted or edited.

## Final-bundle regression

After coordinated copy and layout fixes, the same explicit 175-test suite ran against `.next-arabic-final` on port `3120`, with two workers and output in `/private/tmp/rivet-playwright-results-regression-final`. The command used the file list above with `PLAYWRIGHT_DIST_DIR=.next-arabic-final` and `--output /private/tmp/rivet-playwright-results-regression-final`. It completed with **173 passed and 2 failed in 5.1 minutes**. The Arabic review prompt, restored English validation text, actual Arabic language switch, member-phone bidi journey, all Settings viewports, delivery-date workflow, trainer time-off date, public application approval, platform directory/detail viewport checks, and the inspected 390px CRM screenshot all passed. No screenshot references or thresholds were changed.

The two failures were:

| Test | Checkpoint evidence and follow-up |
| --- | --- |
| `platform-subscription-entitlements.spec.ts:111` | The invoice-preview sentence is visible in the snapshot, but the original locator spanning formatted money nodes failed. Finance replaced it with stable list-item and substring assertions. The focused billing journey passed; artifacts are under `/private/tmp/rivet-playwright-results-regression-targeted`. |
| `workflow-pass-7.spec.ts:203` | The attention link correctly navigated to the pending application filter; the next assertion initially expected “Pending 1” while the catalog said “Awaiting review 1”. Pre-Arabic source used “Pending”, so the English enum was restored while Arabic remained unchanged. The first focused run then exposed a missing terminal period in the directory summary; history at `e94f004e:apps/web/src/app/platform/gyms/page.tsx:132` confirmed the period. Finance restored it, and the remaining overview journey passed against the rebuilt bundle; artifacts are under `/private/tmp/rivet-playwright-results-regression-overview-final`. |

The full-suite result above is historical evidence for the exact bundle used. The corrected billing journey passed in the first targeted rerun (1/1); the overview journey passed after the final English punctuation correction (1/1). The 175-test suite was not repeated after these two narrow fixes. These local tests do not establish provider, staging, or production acceptance.

## Additional focused checks

After restoring the historical English labels and signup validation punctuation, focused component tests passed:

```sh
pnpm exec vitest run \
  src/app/platform/applications/page.test.tsx \
  src/app/platform/page.test.tsx \
  src/app/signup/page.test.tsx
```

Result: **3 test files, 14 tests passed**. Focused ESLint passed for the changed English catalogs and the Arabic review/happy-path specs. The Vitest runner required an approved sandbox escalation because Vite writes a temporary bundled config under `apps/web/node_modules/.vite-temp`; the sandbox-denied attempt itself did not run tests.

The first focused rerun used the rebuilt `.next-arabic-final` bundle on port `3120` and selected only these two journeys:

```sh
PLAYWRIGHT_SERVER_MODE=start \
PLAYWRIGHT_DIST_DIR=.next-arabic-final \
PLAYWRIGHT_PORT=3120 \
PLAYWRIGHT_WORKERS=2 \
pnpm exec playwright test --output /private/tmp/rivet-playwright-results-regression-targeted \
  e2e/platform-subscription-entitlements.spec.ts \
  e2e/workflow-pass-7.spec.ts \
  --grep "updates Forge workspace modules|overview's attention links land on shareable console filters"
```

Result: **1 passed, 1 failed**. The billing tier journey passed with finance’s corrected locator. The overview journey passed navigation and the restored `Pending 1` filter, then failed because the gym-directory summary lacked the historical terminal period. Source at `e94f004e:apps/web/src/app/platform/gyms/page.tsx:132` confirms the original rendered sentence ended in a period. Finance restored that punctuation in the composed message and its direct page test. After a successful rebuild, the remaining overview journey passed **1/1** using output `/private/tmp/rivet-playwright-results-regression-overview-final`. Together with the focused billing pass, both failures from the 173/175 whole-suite run pass in targeted browser checks. No snapshots or thresholds changed.
