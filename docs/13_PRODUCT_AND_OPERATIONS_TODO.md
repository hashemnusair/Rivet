# RIVET product and operations follow-ups

Updated 9 August 2026. This is the living, prioritized follow-up list for issues discovered during production-shaped verification. Keep secret values, applicant details, and provider credentials out of this file.

## P0 — Finish the disposable production onboarding

- [x] Accept the Clerk owner invitation in a private/incognito browser so the platform-admin and gym-owner sessions cannot mix.
- [x] Confirm the invited identity resolves to the provisioned `Hashem Test` organization with the `owner` role and the first branch.
- [x] Complete the first-owner setup: organization settings, branch details, and one membership plan.
- Exercise lead → member → membership → payment → check-in → timeline/audit → shift reconciliation with disposable data.
- Hide/archive the disposable tenant after verification. Do not run `seed:seedDemoTenant` in Production.

## P0 — Complete cash-shift recovery and Production verification

### Observed problem

Opening the first Production cash shift succeeded in Convex, but the subsequent shift-page refresh crashed with `Cannot read properties of undefined (reading 'amount')`. The `shifts.current` operation correctly returns `{ shift, totals }`, while `ConvexGymOSApi.getCurrentCashShift` incorrectly cast that whole envelope to `CashShift`. The page therefore tried to read `openingFloat.amount` from the envelope instead of its nested shift. The mutation dialog briefly disappeared before the route failed, creating a confusing flicker and leaving the operator unsure whether the financial action completed. The global error boundary then falsely claimed the Production application was an in-memory demo where nothing could be lost, and its reset-only **Try again** action simply rendered the same malformed data again.

### Completion criteria

- Unwrap the current-shift envelope at the Convex adapter boundary and cover both open-shift and no-open-shift responses with contract tests.
- Replace demo-only global error copy with Production-safe guidance that does not claim a mutation failed or succeeded without evidence, and provide working reload/back recovery actions.
- After deployment, confirm the already-open Production shift renders once with its JOD 50.000 opening float; do not create a duplicate shift to perform this check.
- Verify duplicate-open attempts remain blocked with an inline `SHIFT_ALREADY_OPEN` error rather than a route crash.
- Keep the opening dialog in a stable pending/success transition until refreshed shift data is renderable; do not flicker back through stale content.
- Add focused UI coverage for open → refresh → render, mutation failure, ambiguous post-mutation recovery, duplicate open, and error-boundary recovery.
- Resume and finish membership sale, cash payment, shift close, and reconciliation only after the deployed shift page passes this recovery check.

## P0 — Fix first-time invited-owner account creation

### Observed problem

The Production owner invitation successfully carried a Clerk invitation ticket back to RIVET, but provisioning configured its redirect as `/login`. That route renders RIVET's custom password-only sign-in form and does not consume `__clerk_ticket` or branch on Clerk's `__clerk_status`. A first-time owner therefore sees a required password even though no account or password exists. The only visible account-creation link says **Create a member account** and drops the invitation query parameters. During production verification, the owner had to preserve the ticket manually while navigating to the existing account-creation route.

### Completion criteria

- Add a dedicated, branded **Accept gym invitation** route and use it for owner and staff invitation redirects.
- Preserve and consume the Clerk invitation ticket; never place the ticket in logs, analytics, screenshots, or repository fixtures.
- Handle Clerk's `sign_up`, `sign_in`, `complete`, expired, revoked, and invalid invitation states explicitly.
- For a new identity, say **Create your owner account**, collect the required profile fields, let the user set a password, and continue without exposing member-specific copy.
- For an existing identity, say **Sign in to accept your invitation** and preserve the invitation through authentication and verification steps.
- After acceptance, resolve the authenticated Convex membership, select the provisioned organization when necessary, and open the correct gym workspace automatically.
- Provide clear recovery actions for an email mismatch, an already accepted invitation, and an expired invitation.
- Add component and end-to-end coverage for new-owner signup, existing-user acceptance, query-parameter preservation, profile completion, and final owner-role routing.
- Treat this as a release gate before inviting a real gym owner.

## P1 — Make application review notes explicit and auditable

### Observed problem

The application review textarea looks independently editable, but its value is only submitted when **Mark under review**, **Approve application**, or **Reject application** is clicked. There is no **Save note** action or save-state feedback. Once a decision is final, the textarea is disabled, so an operator cannot add a follow-up note. During the 9 August production verification, the application was approved successfully but no review note was persisted.

### Completion criteria

- Add an explicit **Save note** action with saving, saved, failure, and unsaved-change states.
- Explain whether a decision button also saves the current note.
- Permit a platform administrator to append an internal note after approval/rejection without rewriting the original decision or its audit event.
- Treat post-decision notes as append-only platform audit facts with actor and timestamp.
- Warn before changing applications with unsaved text.
- Add unit/component coverage for independent save, decision-with-note, failure recovery, finalized applications, and authorization.

## P1 — Make dashboard branch-scope copy data-driven

### Observed problem

The owner dashboard says **Both branches, consolidated** whenever the branch selector is set to **All branches**. That sentence is hardcoded from the original two-branch preview scenario. The disposable Production tenant has exactly one active branch, so the dashboard currently makes a false claim about the tenant's structure.

### Completion criteria

- Derive the dashboard scope description from the authenticated session's actual accessible branches and selected branch.
- For one accessible branch, name that branch or use accurate singular copy.
- For multiple accessible branches with no branch selected, use accurate aggregate copy such as **All 3 branches, consolidated**.
- For an explicitly selected branch, continue naming that branch.
- Define a safe empty/loading fallback that does not claim a branch count.
- Remove assumptions tied to the seeded Forge Fitness tenant.
- Add component coverage for zero/loading, one, two, and three-or-more accessible branches plus an explicitly selected branch.

## P1 — Fix lead-capture contact and owner fields

### Observed problem

The lead schema, API contract, persistence layer, detail screen, and duplicate-conversion checks support an optional email address, but the **New lead** dialog never renders an email input. A phone-only lead is valid and must remain supported, but staff currently have no way to capture an email when the prospect provides one. This weakens identity matching and prevents future email follow-up without editing the record elsewhere. The owner selector also appeared blank during Production testing even though the current gym owner was silently assigned and later appeared on the lead card; its option query only requests active salespeople and therefore cannot render the selected owner identity.

### Completion criteria

- Add a clearly optional email field to **New lead**, with email autocomplete, normalization, validation, and accessible error text.
- Keep phone-only lead creation valid; do not make email mandatory.
- Persist and display the email in the lead context and carry it into the converted member record.
- Include both phone and email in duplicate detection without leaking cross-tenant matches.
- Ensure the owner selector visibly represents the value that will be saved. Include every legitimately assignable current user, or show a clear **Unassigned** value rather than silently persisting a hidden owner.
- Define which roles may own leads and which roles may assign them, then enforce the same rules in both the selector and server authorization.
- Define an authorized edit path for correcting or adding lead contact details after capture, with timeline/audit treatment appropriate to identity changes.
- Add tests for phone-only, phone-plus-email, invalid email, normalization, conversion, visible owner assignment, unassigned leads, and same-tenant/cross-tenant duplicate behavior.

## P0 — Make offer delivery and status truthful

### Observed problem

The lead action says **Create offer**, its confirmation button says **Send offer**, the persisted offer immediately receives `status: "sent"`, and the timeline says **Offer sent**. The operation currently only creates an internal offer record and does not deliver an email, WhatsApp message, SMS, link, or document to the prospect. That wording creates a serious operational risk: staff can reasonably believe a revenue-critical offer reached a lead when nothing left RIVET.

### Completion criteria

- Separate **Record/draft offer** from **Send offer**; never claim an offer was sent solely because an internal record was created.
- Let staff select an available delivery channel based on captured contact data, with a deliberate manual-delivery option when external messaging is not configured.
- For provider delivery, persist queued, provider-accepted, delivered, failed, bounced, and retried states as appropriate; expose failures and safe retries to the operator.
- For manual delivery, require an explicit confirmation and record who confirmed it, when, through which channel, and any safe external reference—without storing message credentials or sensitive provider payloads.
- Generate a stable, branded offer view/document with plan, historical offered price, expiry, gym identity, and clear acceptance/contact instructions.
- Keep offer price and plan history immutable after the offer is issued; later plan edits must not rewrite it.
- Append accurate lead-timeline and audit facts for creation, delivery attempt, success/failure, expiry, acceptance, and conversion.
- Add tests proving a failed or unattempted delivery can never display as **sent**.
- Treat this as a release gate before real sales staff use the CRM.

## P1 — Make CRM progression reflect actual events

### Observed problem

After a Production lead moved directly from **Contacted** to **Offer sent**, the lead stepper painted **Trial booked** and **Trial done** as completed even though no trial was booked or completed and no corresponding timeline facts existed. The UI currently treats every stage before the lead's current ordinal position as historical fact. That is misleading in a pipeline where valid paths can skip stages.

### Completion criteria

- Define which pipeline stages are current state, which are optional milestones, and which require an actual domain event.
- Derive completed milestone presentation from persisted lead/timeline/trial facts rather than ordinal position alone.
- Permit valid paths such as contacted → offer sent without visually fabricating a trial.
- Preserve a clear current-stage indicator while distinguishing skipped, completed, and not-applicable milestones.
- Keep board counts, lead detail, dashboard funnel, timeline, and trial state consistent from the same source of truth.
- Add tests for straight-through, skipped-trial, completed-trial, lost, converted, cancelled-trial, and no-show paths.

## P1 — Make the default marketing preference transparent and attributable

### Observed problem

The Production lead-conversion flow did not show a marketing-preference choice, while the resulting member record displayed **Marketing: Opted in**. RIVET's chosen product policy is to keep **Opted in** as the default for newly created members. The remaining product gap is transparency and provenance: staff and members should be able to see the default, change it easily, and distinguish a system-applied default from an explicit member choice.

### Completion criteria

- Keep **Opted in** as RIVET's consistent default across manual member creation and lead conversion unless the operator or member selects **Opted out**.
- Show the marketing preference clearly before member creation/conversion and never hide the value that will be persisted.
- Store preference status with provenance such as `system_default`, `staff_selected`, or `member_selected`, plus timestamp, actor where applicable, wording/version, and applicable channels; preserve later changes as append-only facts.
- Never describe a system-applied default as explicit consent or claim that the member actively selected it.
- Keep essential transactional/service messages separate from marketing preferences.
- Provide an obvious member-facing and staff-assisted opt-out path and apply the current preference before any campaign send.
- Make the default configurable by channel or market if a later compliance/product review requires different behavior; changing that configuration must not rewrite historical provenance.
- Add tests for omitted/defaulted, explicit false, explicit true, import, conversion, preference changes, cross-channel behavior, and authorization.

## P1 — Build a branded transactional-email system

### Observed problem

The production applicant-confirmation and approval messages deliver successfully but look like minimally formatted text emails. The Clerk organization invitation is also close to the provider default. The production invitation was categorized by Gmail as **Promotions**, and sender avatars were blank. Gmail category placement is ultimately decided by the mailbox provider, so it cannot be guaranteed, but authentication, sender reputation, message construction, and recipient behavior can be improved and measured.

### Email families in scope

- Gym application received — applicant confirmation.
- New gym application — internal RIVET sales/platform notification.
- Application approved/rejected.
- Clerk organization owner invitation.
- Gym staff invitations.
- Authentication and account-recovery emails.
- Future receipts, payment notices, renewals, and operational alerts.

### Design-system work

- Create a reusable, email-safe RIVET template system rather than composing separate HTML strings inside Convex actions.
- Use a restrained 600px layout, hosted RIVET logo, paper/ink/signal palette, clear hierarchy, one primary CTA, useful preheader, contact/help path, and consistent legal footer.
- Provide both HTML and plain-text bodies; keep the message small and usable with images disabled.
- Use table-based email layout and inline styles that render predictably in Gmail, Outlook, and Apple Mail, including mobile and dark-mode checks.
- Keep transactional language direct; do not make service messages resemble campaigns.
- Add rendered fixtures or previews to the repository for visual review and regression testing.

### Resend work

- Replace the current application email HTML builders with the shared template system.
- Use a monitored, reply-capable identity such as `support@rivetjo.com` or `hello@rivetjo.com` where appropriate instead of relying exclusively on `noreply@rivetjo.com`.
- Confirm the From, Reply-To, return path, DKIM, SPF, and DMARC alignment for every production message.
- Run Resend Deliverability Insights on each template.
- Disable open/click tracking for sensitive transactional mail unless there is a demonstrated operational need.
- Consider a dedicated transactional sending subdomain after reviewing reputation and alignment tradeoffs.

References: [Resend Deliverability Insights](https://resend.com/docs/dashboard/emails/deliverability-insights), [Resend DMARC guide](https://resend.com/docs/dashboard/domains/dmarc).

### Clerk work

- Customize the Production organization-invitation, staff-invitation, sign-in, verification, and recovery templates in **Clerk Dashboard → Emails**.
- Version the approved copy/layout in this repository even when the final template must be pasted into Clerk.
- Set the application logo URL and ensure the invitation redirect lands on the correct RIVET owner flow.
- Preview and test Development first, then copy the approved template to Production.

Reference: [Clerk email and SMS templates](https://clerk.com/docs/how-to/email-sms-templates).

### Sender identity and avatars

- Create or verify real Google Workspace identities/aliases for the public sender addresses (`noreply`, `sales`, `support`, and `invitations` as applicable) and assign the approved square RIVET avatar/profile image.
- Register relevant sender addresses with Gravatar for clients that support it.
- Treat BIMI as a later deliverability/brand project: it requires an enforced DMARC policy and, for Gmail logo display, an eligible VMC or CMC plus the required DNS and hosted assets.
- Do not assume an HTML logo controls the mailbox-list avatar; each mailbox provider applies its own identity rules.

References: [Resend sender-avatar guidance](https://resend.com/docs/knowledge-base/how-do-i-send-with-an-avatar), [Google BIMI setup](https://support.google.com/a/answer/10911320).

### Deliverability and Gmail categorization

- Inspect raw headers from Resend and Clerk test messages and record SPF, DKIM, and DMARC pass/alignment results without copying tokens or message IDs into the repository.
- Add the sending domain to Google Postmaster Tools and monitor reputation/spam rate once volume exists.
- Verify link domains match the visible RIVET sender domain and avoid redirect/tracking domains for invitation and authentication CTAs.
- Test Gmail Primary/Promotions placement across several established recipient accounts. Treat placement as an observed metric, not an invariant the application can force.
- Confirm reply handling, bounce/complaint handling, and suppression behavior before inviting real gyms.

Reference: [Google email sender guidelines](https://support.google.com/mail/answer/81126).

## P2 — Email operational controls

- Store provider delivery identifiers and final delivery/bounce/complaint state without exposing credentials.
- Add an operator-visible retry path for failed application and invitation notifications.
- Deduplicate retries so an operator cannot accidentally send repeated approval or invitation messages.
- Add template/version metadata to audit events so support can identify what a recipient received.
- Document provider ownership, DNS ownership, template ownership, and the safe key-rotation procedure in the release runbook.

## P3 — Final pre-launch performance and responsiveness sprint

### Scheduling

Run this as a dedicated, broad launch-hardening pass only after the product workflows, authorization, integrations, responsive behavior, accessibility, and release-critical defects are complete. Continue avoiding obviously wasteful patterns during normal feature work, but do not let speculative micro-optimization interrupt completion of the operational MVP.

### Observed problem

During the 9 August Production onboarding check, the owner navigated from branch settings to the audit log and waited roughly five seconds through a loading state before a single audit row appeared. Opening the empty one-lead Pipeline also took roughly five seconds. Opening that lead's detail screen took roughly five to ten seconds with no immediate navigation or loading feedback, making the application appear frozen. After successful lead conversion, the dialog closed and the stale lead page reappeared for several seconds, followed by a separate loading screen and finally the member record. Those waits and visual reversions are far too slow and unstable for routine operations. The current audit screen starts its staff-filter query and audit-events query on entry, while the Convex audit query collects and filters the organization's full audit stream before producing a page; the Pipeline, lead detail, and conversion transition similarly need their route, authenticated bootstrap, reference-data queries, domain queries, cache invalidation, and rendering paths measured rather than guessed. Both cold and warm navigation must be profiled.

### Required performance work

- Establish reproducible cold and warm baselines for every major owner, manager, salesperson, receptionist, member, and platform-admin route on realistic phones and laptops over realistic Jordan network conditions.
- Add privacy-safe Real User Monitoring for Core Web Vitals, route-transition duration, authentication/session readiness, Convex query/mutation latency, error rate, and long tasks. Never include member, payment, invitation, or credential data in telemetry.
- Define and enforce launch budgets for initial load, authenticated route transitions, useful-content paint, interaction latency, layout shift, JavaScript size, image/font delivery, and critical Convex operations. Treat a five-second routine route transition as a release failure.
- Provide immediate interaction acknowledgement for every navigation. If useful content cannot appear near-instantly, show an accessible pending indicator or route-level skeleton promptly so a click never appears ignored or frozen.
- Keep successful create/convert/sale mutations in one stable transition state until their destination is ready. Do not close a dialog back onto stale source content and then introduce a second loading phase; prefetch or seed the destination record where safe and use `replace` when returning to the completed source action would be misleading.
- Profile the full Clerk → Convex identity/session bootstrap and remove duplicated or serial readiness gates.
- Audit Next.js route and component boundaries, server/client rendering, streaming, Suspense placement, dynamic imports, bundle composition, hydration work, font/image loading, and accidental client-only waterfalls.
- Add deliberate route and data prefetching for likely navigation targets using Next.js link prefetch plus TanStack Query prefetching on safe idle, hover, or focus signals. Do not prefetch privileged data for an unauthorized identity.
- Reuse already-loaded session, branch, user-filter, settings, and other stable reference data with explicit freshness rules instead of refetching it on every screen.
- Replace broad mutation invalidation with precise cache updates/invalidation where correctness permits, while preserving cross-screen financial consistency.
- Inspect every high-traffic Convex operation for full-table/full-tenant collection, in-memory filtering, N+1 lookups, repeated public-ID translation, missing compound indexes, oversized payloads, and pagination performed after collection.
- Optimize the audit log specifically with index-backed filters and bounded pagination before mapping rows; avoid loading the staff filter as a blocker for the audit-event list.
- Add navigation and query performance regression checks to CI for representative data volumes, including tenants with large member, payment, timeline, and audit histories.
- Verify improvements in Production using both cold and warm sessions, record before/after measurements, and keep a small permanent performance budget suite so speed does not regress after launch.
