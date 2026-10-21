# Go-live decisions: messaging, operational email, legal documents, pricing

## Current status — reconciled 17 October 2026

The 7 October release below shipped the operational-email safeguards and the
Clerk → Resend relay code. Strict recipient allowlisting, persistent hard-bounce
and complaint suppression, and signed callback handling are implemented and
released; provider configuration and fresh delivery acceptance remain open.
The beta email branding added on 17 October is shipped on the web side but is
still awaiting its Convex deployment. See the current checkpoint in
[`CURRENT_STATE.md`](../CURRENT_STATE.md) and the pending batch in the
[release runbook](12_SYSTEM_MAPS_AND_RELEASE_RUNBOOK.md).

The last recorded provider inspection is 7 October: Resend's domain was
verified, its API-key/sender configuration names were present, and some agreement
copies were found in the recipient inbox. The Resend callback/secret, monitored
Reply-To acceptance, application-kind gate and separate Clerk template cutover
were still open. No new provider/configuration inspection or email send was made
in this PR review. Do not describe all email as unconfigured, or treat shipped
relay code as evidence that Clerk has stopped delivering authentication mail.
The remaining actions are in the [canonical backlog](13_PRODUCT_AND_OPERATIONS_TODO.md).

## Verification update — 7 October 2026

This is a readiness review, **not an incident investigation** (Elias's
clarification). Use **Spacemail**, `elias@rivetjo.com`, for the delivery
evidence below. Initial audit baseline: `9fbd53c`; release integration includes
current main `4fe7be1`, including the completed Arabic implementation.
Code presence, provider acceptance, recipient-server delivery, and inbox
placement are separate findings. No email was sent, provider activated or service purchased during this review.
Implementation changes are listed below; see CURRENT_STATE.md for release
evidence. No provider configuration or DNS was changed.

### Email inventory verified against executable triggers

All operational rows below use `operationalEmail.ts` → Resend, with the
configured `RESEND_FROM_EMAIL`. Observed production agreement copies use
`noreply@rivetjo.com`. At the inspected live baseline, authentication mail is delivered by Clerk.
The 7 October implementation adds a signed Clerk → Resend relay; its deployment
is part of this release; configuration and template cutover remain pending. Clerk continues to own authentication.
The relay does not use tenant operational-email preferences or redirect codes
to an operational sandbox mailbox.

| Implemented email | Trigger / recipient | Source under `apps/web` | Inbox evidence in this review |
|---|---|---|---|
| Owner organization invitation | Approved application is provisioned; owner is invited to the Clerk organization | `convex/platformProvisioningAction.ts`, `createOrFindClerkInvitation` | No matching invitation found by Spacemail all-mail search; fresh test pending |
| Staff account invitation | Authorized staff invitation action, with Clerk `notify: true` | `convex/invitations.ts` | Fresh test pending; distinct from owner organization invitation |
| Account verification / sign-in email challenge | Clerk sign-up email verification or a required email challenge during sign-in | `src/app/login/`, Clerk | Rivet verification message visible in Spacemail Inbox dated 6 October; no fresh challenge generated |
| Application received: applicant + internal team | Gym application submission; applicant and configured application recipients | `convex/gymApplications.ts` | Not verified in Spacemail |
| Application approved / rejected | Platform application decision; applicant | `convex/gymApplications.ts` | Not verified in Spacemail |
| Signed, countersigned and re-sent agreement copies | Owner signing, platform countersigning or explicit resend; signer plus founder copies; PDF attached | `convex/legalAgreement.ts` | Signed and countersigned founder copies dated 27 September in Spacemail Inbox; countersigned copy opened and attachment presence checked |
| Member payment receipt notification | Successful payment collection; member email; deduped by receipt ID | `convex/domain.ts`, `payment_receipt` | Code-confirmed only. This is a link to the receipt, not a promised emailed receipt PDF |
| Renewal and expiry reminders | Hourly job; respectively 7 and 1 tenant-local days before a current membership ends; member email | `convex/membershipJobs.ts`, `convex/crons.ts` | Code-confirmed and locally tested; inbox delivery pending |
| Trial request confirmation / status | Member trial request, then staff trial-status change; requester | `convex/domain.ts` | Inbox delivery pending |
| Support acknowledgement / reply / resolution | Case creation, platform reply, platform resolution; case creator/contact | `convex/domain.ts` | Inbox delivery pending |
| Platform invoice issued / paid / past due | Platform invoice actions and subscription changes; gym owner; invoice PDF | `convex/domain.ts` | Resend shows issued and paid examples delivered to a test-owner mailbox; that recipient inbox was not inspected |
| Platform payment sent back | `platform.invoice.payment_reject`; gym owner; RIVET's message and the invoice facts; once per set of details sent back | `convex/platformCommerce.ts`, `platform_payment_returned` | Code and Convex tests only (19 October) |
| Platform upcoming-invoice / overdue / suspension notice | Hourly subscription reconciliation, only when its explicit enable flag is on; gym owner | `convex/subscriptionReconciliation.ts` | Production reconciliation flag absent; automated reconciliation is off |
| Platform subscription suspended / cancelled | Explicit platform subscription-status transition; gym owner | `convex/domain.ts` | Inbox delivery pending |
| PT package paid | Full package payment activates credits; member | `convex/domain.ts` | Inbox delivery pending |
| PT booking confirmation / update | Booking; cancellation, reschedule or no-show; member | `convex/domain.ts` | Inbox delivery pending |
| PT booking reminder | 15-minute job finds sessions around 24 hours away; member | `convex/ptJobs.ts` | Locally tested; inbox delivery pending |
| PT low balance | PT completion/outcome reduces available credits to the low-balance threshold | `convex/domain.ts` | Inbox delivery pending |

Receipts and renewal reminders were examples in the call, not evidence of
implementation. The rows above are now supported by their actual queueing
code. They must still pass recipient-inbox tests before being called verified
live features. No additional Clerk security/password-reset email is claimed
as verified merely because Clerk supports it.

### Provider and inbox findings

- **Spacemail:** countersigned copy at `/mail/INBOX/36/`, subject
  `Test Gym · agreement RVT-20260927-CU4U6 countersigned`, received
  27 September at 19:47 Amman time, from `noreply@rivetjo.com` to
  `elias@rivetjo.com`. Its source shows return-path `send.rivetjo.com`,
  DKIM selector `resend` for `rivetjo.com`, a second Amazon SES signature,
  and SES delivery. A DKIM signature being present alone is not a verified
  authentication pass. The source view inspected did not establish full
  receiver SPF/DKIM/DMARC results. The signed copy is also visible in Inbox.
- **Correct Resend workspace resolved:** the browser now has access to
  team **`rivetjo`**. Domain `rivetjo.com` is Verified, sending enabled,
  Ireland (`eu-west-1`), DKIM and sending SPF/MX Verified. Its email list
  shows the two founder copies and signer copies, plus invoice issued/paid
  examples, as Delivered. This is receiver-server evidence, not proof that
  every recipient saw an Inbox placement. Only Elias's Spacemail was checked.
- **No Resend webhooks:** the workspace's Webhooks page says “No webhooks
  yet.” Production names-only inspection confirms `RESEND_WEBHOOK_SECRET`
  is absent. The existing verified-signature endpoint is
  `/webhooks/resend`; provider events cannot reach the app until configured.
- **Public DNS checked:** root SPF uses `spf.spacemail.com`; Resend's
  `send` return-path SPF uses `amazonses.com`, with SES MX and a published
  `resend._domainkey`. Clerk's `clk` / `clk2` DKIM selectors and `clkmail`
  point to Clerk-managed records. DMARC is `v=DMARC1; p=none;`.
  A monitoring policy is not evidence of a delivery incident. Review all
  legitimate senders before changing enforcement; no automatic DNS change.
- **Production configuration names:** Resend API key/from, email mode and
  email allowlist are present. Names-only inspection does not reveal their
  values. `RIVET_OPERATIONAL_EMAIL_GLOBAL_TYPES` is absent, so the current
  code suppresses no-organization application emails at the global-kind
  gate. `RESEND_REPLY_TO_EMAIL` is absent; application mail falls back to
  `sales@rivetjo.com`. The current candidate applies that Reply-To to every operational kind; monitored mailbox acceptance remains unverified.
- **Current candidate repairs:** persistent hard-bounce/complaint address suppression, signature-verified callback replay/order handling, terminal provider suppression, and strict recipient-level allowlist checks. These are local code/test results until the candidate is deployed and provider callbacks are configured.
- **Allowlist:** subscribed-gym trust no longer bypasses explicit addresses/domains in the candidate. Inspect the configured pilot list before releasing this stricter behavior. Sandbox still redirects to its configured RIVET catch-all.

### Confirmed channel decision — 7 October 2026

Elias explicitly removed **automated WhatsApp** from the product scope.
Keep staff-initiated WhatsApp for contacting a member/lead. **All email
transport is Resend**, including authentication after its separate cutover.
This supersedes the 14 September WhatsApp/Twilio plan and the earlier request
for Meta approvals, STOP/إيقاف automation, number registration and API pilots.
No Twilio account, paid provider setup or WhatsApp API launch is needed.

The implementation removes the sender and its cron, makes the old worker
an inert compatibility target, ignores old messaging environment flags,
suppresses retained WhatsApp/SMS automation actions, removes the activation
controls, and preserves message history. The renewal job creates only the
opt-in one-day staff call task; the 7-day and 1-day **emails** stay in
`membershipJobs`. Manual WhatsApp opens an editable draft in the staff
member's WhatsApp. RIVET records a handoff, not proof that it was sent.
Deployment evidence is recorded in CURRENT_STATE.md.

### Commercial/legal review status and next actions

Implemented launch defaults are Starter JOD 39/month, Growth 89 and Pro 199,
with one one-time onboarding fee of JOD 75 on every plan (since 19 October
2026; it was 75/150/300 by plan before) and a 5% annual
subscription discount. Enterprise is quote-only, on the website and in the
console: each Enterprise gym is billed its own monthly quote
(`organizations.quotedPriceMinor`, since 21 October 2026). RIVET records the
quote when it approves the application, or with Billing → Gyms → **Change
plan**. The catalogue's JOD 500 row only bills an Enterprise gym with no quote
on record. Current limits, allowances and modules are in section 4. These
implementation facts do not establish founder sign-off or legal approval.
`BRAND_LEGAL` is empty: legal entity, registration, address and tax treatment
must be provided by the founders and verified with counsel/accountant.

The review brief, human-readable source snapshot and outreach draft are in
[`legal-review/2026-10-07/REVIEW_BRIEF.md`](legal-review/2026-10-07/REVIEW_BRIEF.md).
Start review before these facts are all settled; counsel can flag open fields
and review the existing Arabic documents in parallel. The lawyer's name/email has been requested
but not supplied, so **no external request has been sent and review has not
started**. This is a recipient blocker, not a requirement to delay preparation.
The Terms' twelve-month default conflicts with the agreement's continuing
term/30-day notice. Terms omit Enterprise; the agreement contains older
`rivet.jo` links. Preserve signed versions and issue a new reviewed version.

### Validation completed

- Full unit/component/Convex suite: **321 files, 2,006 tests passed** after integration with current main
  (`pnpm --filter web exec vitest run --maxWorkers=3`). Covers retired sender
  behavior under old live flags, retained rule suppression/history, staff call
  tasks, manual WhatsApp handoff, 7/1-day email reminders, tenant dedupe and
  renewal guards, plus signed Clerk→Resend forwarding, invalid signatures,
  provider failures and Clerk-owned-template duplicate prevention.
- `pnpm typecheck`, `pnpm convex:typecheck`, and `pnpm lint` passed, including
  the secret-output audit. `pnpm build` passed and includes the dynamic Clerk
  email webhook route. CLI/environment guard tests: **14 passed**.
- Production Convex dry run and deployment passed with no index deletions.
  Runtime `885ba36` is pushed to main and successfully deployed by Vercel.
  All 13 jobs in [CI 37611531668](https://github.com/hashemnusair/Rivet/actions/runs/37611531668)
  passed. The released Arabic implementation and its email recipient-language
  tests are retained. Five focused local browser journeys passed; screenshot
  references and tolerances are unchanged. The source-map-js dependency was
  patched to 1.2.2 after the first audit flagged it; the final audit is clean.
- These are local/CI fixtures and provider doubles, not fresh provider sends or inbox
  tests. Fresh invitation and operational-mail tests still need a named test
  identity/gym and approved destinations. No real gym, payment, agreement or
  invitation was created to manufacture delivery evidence.

Originally written 3 September 2026; updated for the explicit 7 October
channel decision. Commercial decisions below still require founder sign-off.
Keep provider credentials and personal applicant/signatory details out of
this file.

## 1. Manual WhatsApp

Staff use the WhatsApp button on member/lead follow-up screens, review the
prefilled draft and send it themselves in WhatsApp. The contact history
labels opening WhatsApp as a handoff with delivery unconfirmed. It retains
manual contact outcomes and existing historical provider records.

There is no RIVET WhatsApp API sender, automated renewal journey, launch
allowlist, Meta template approval work or STOP webhook to activate. Do not
restore a provider by setting old environment flags. Historical schema/types
and bilingual wording remain only for reading old records and suggesting
manual drafts. `getMessagingStatus` returns off/none and the automated
catalogue endpoint returns an empty list.

Settings → Notifications offers manager alerts and opt-in **Renewal call
tasks** one day before expiry. Member renewal/expiry emails are controlled
under Settings → Emails. The job cancels pending historical WhatsApp/SMS
renewal records with an event; it preserves sent/terminal history. The old
worker never leases or sends retained automation rows. No historical tables
or indexes are removed.

## 2. Operational email

### What the product does today

- `RIVET_EMAIL_MODE` = `off` | `sandbox` | `allowlist` | `live`, read on the
  server. `off` is the default and the fallback for any unrecognised value.
  `sandbox` sends everything to `RIVET_EMAIL_SANDBOX_TO` with the original
  recipient in the subject. `allowlist` sends only to
  `RIVET_EMAIL_ALLOWLIST` (addresses or domains), and suppresses every other
  recipient with a visible reason. Subscription, message kind and worker trust
  never bypass this strict recipient gate. The old
  `RIVET_OPERATIONAL_EMAIL_LIVE=true` counts as `live` only while the new
  variable is unset.
- Gym-controlled member service kinds still require the owner's confirmed
  preferences; RIVET-controlled platform kinds (invoices, subscription
  notices, and now the signed and countersigned agreement copies) are
  mandatory.
- Every attempt records the mode and the address actually used; Settings →
  Operational email shows the mode in plain language.
- The public gym application form accepts five submissions an hour per
  applicant inbox, whatever phone number is sent. "+tag" addresses, and dots
  in Gmail addresses, count as the same inbox. This bounds the applicant copy
  (`gym_application_received_applicant`) once that kind is enabled through
  `RIVET_OPERATIONAL_EMAIL_GLOBAL_TYPES`.

### Before flipping `RIVET_EMAIL_MODE` to `live`

- [x] **Decided 14 September 2026:** the sending address is
  `noreply@rivetjo.com` (`RESEND_FROM_EMAIL`). **Updated 7 October:**
  authentication emails also move to Resend using the separate cutover below.
- [x] Resend sending domain verified in the correct `rivetjo` workspace on
  7 October. DMARC is monitoring-only; review legitimate senders and receiver
  results before any enforcement change. Do not replace Spacemail root SPF.
- [x] Production API-key/sender configuration names confirmed on 7 October;
  values were not read. This is dated evidence, not a fresh configuration check.
- [x] Signed callback processing and persistent hard-bounce/complaint address
  suppression implemented, tested and released on 7 October.
- [ ] Configure the Resend callback and its Convex webhook secret, then verify
  delivery events, replay handling and suppression through the actual provider.
- [ ] Templates reviewed in Arabic and English with RIVET's contact details
- [ ] Reply-to routed to a monitored inbox
- [ ] Two weeks in `allowlist` with RIVET staff and one pilot gym, zero
  unexplained failures
- [ ] Runbook: how to switch back to `allowlist` in under five minutes

### Authentication email cutover (separate from operational mail)

Implementation: `src/app/api/webhooks/clerk-email/route.ts`, public POST at
`https://www.rivetjo.com/api/webhooks/clerk-email`. It verifies the Clerk
signature via `verifyWebhook`, handles `email.created` and sends the email
through Resend as "RIVET Beta" at the configured sender, with
`clerk-email/<email-id>` as its retry key. An email that carries a code
(`data.otp_code`) or an http(s) link (`data.action_url`) is rebuilt in RIVET's
own branded template (`renderBrandedEmail` in `convex/emailTemplate.ts`, in
English because the event names no language). Any other email, or a render
that lost its code or link, goes out as Clerk's rendered HTML/plain text.
Events already delivered by Clerk are acknowledged without a duplicate send.
Missing configuration returns 503. Resend failures that can clear (401, 403,
408, 409, 425, 429, 5xx, a network error or an incomplete response) return
502 so Clerk retries. Any other 4xx is a permanent rejection: the route
returns 200 so Clerk stops retrying a code that would arrive expired, and logs
one line with the status, Resend's error name and Clerk's email id. No OTP,
invitation link, address or rendered auth body is logged or stored in the
staff-visible email ledger.

1. Deploy the web handler. In Vercel server configuration, set
   `CLERK_WEBHOOK_SIGNING_SECRET`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL` and
   `RIVET_AUTH_EMAIL_PROVIDER=resend`. Keep values out of Git, commands, chat
   and diagnostics. These are separate from the Convex operational secrets.
2. In the correct Clerk production application, add a webhook for
   `email.created` at the exact URL above. Use its signing secret. Test the
   endpoint/signature and email routing in staging first.
3. Cut over each applicable Clerk email template by disabling **Delivered by
   Clerk** only after the relay is ready. Cover owner organization invites,
   staff account invites, verification and each enabled sign-in/security
   email. Keep Clerk's invitation `notify: true` so it emits the email event.
4. Trigger fresh tests to the approved identity/mailbox; inspect **Spacemail
   Inbox and Junk**, sender, headers and working invitation/verification
   flow. Resend Accepted/Delivered alone is insufficient. Record evidence
   without storing auth codes or invitation tokens. No fresh send is claimed
   by the current local tests.
5. Check Clerk webhook failures and Resend delivery/bounce/complaint events.
   A permanently rejected send counts as delivered in Clerk's webhook log; find
   it in the Vercel function logs ("permanently rejected a message").
   Resend idempotency lasts 24 hours; avoid replaying old successful auth
   events after that window. Generate a fresh invite/code when needed.
6. Roll back a template by restoring Delivered by Clerk, then reconcile any
   outstanding custom-delivery events before disabling the relay. Do not
   leave both senders disabled for an active template.

Live cutover is **pending**; no Clerk dashboard setting has been changed.
Official references: [Clerk email delivery settings](https://clerk.com/docs/guides/customizing-clerk/email-sms-templates),
[Clerk deliverability and email.created](https://clerk.com/docs/guides/development/troubleshooting/email-deliverability),
[Resend retry keys](https://resend.com/docs/dashboard/emails/idempotency-keys).
The installed Clerk SDK event type is singular `email.created`; the template
page currently contains a plural spelling in its prose.

## 3. Legal documents and the e-signature

### What exists

| Document | Where | Status |
|---|---|---|
| Privacy policy | `/privacy` | Draft 1.1 · 14 September 2026 (WhatsApp-only wording) |
| Terms of service with the data processing addendum | `/terms` | Draft 1.2 · 15 October 2026: adds section 11, Beta period, for counsel review (see the review brief addendum). 1.1 · 14 September 2026 is in git and the 7 October snapshot. |
| Subscription agreement, signed at onboarding | blocking modal in the app shell (owner); copy under `/settings?section=agreement`; `/platform/agreements` (RIVET) | Version 1.2 · 4 September 2026; counsel review outstanding |

These are existing draft commitments, not verified legal approval. The Terms'
12-month default and agreement's continuing term/30-day notice need review,
as do the removed automated-messaging wording and complete Arabic versions.
See the dated review packet; preserve already signed agreement versions.

### How the e-signature works

1. A newly provisioned gym's owner signs in; the session says the agreement
   is required and the app shell opens a modal over the workspace that
   cannot be closed (no close button, Escape and outside clicks are
   ignored). Staff are never blocked; they see the workspace as usual.
2. **Step 1, read.** The modal shows the whole document in order on the
   document sheet: 1 Parties and 2 Details filled from what RIVET already
   holds, with the address and the ID marked as confirmed in the next step,
   then the clauses 3 to 12, then 13 Signatures; a reading progress bar
   tracks the scroll. "I have read and agree" stays disabled until the
   end of the text has been scrolled into view.
3. **Step 2, details.** Only what the agreement needs, prefilled from the
   account where RIVET already knows it: registered name of the gym or
   company, gym address (one line, with the city), the owner's full name as
   on their ID, Jordanian national ID (ten digits) or passport number, and
   the contract start date. The plan is shown read-only from the account
   RIVET set up; the signer's copy goes to the account email. Trade name,
   commercial registration, branch count, role, phone, quote number, term
   and place of signing are no longer asked for (the record keeps them as
   optional fields for a future form).
4. **Step 3, sign.** A summary of the details with the ID masked, a drawn or
   typed signature, and two declarations (owner or authorised and details
   true; electronic signature is binding). The "read and agree" click from
   step 1 is recorded as the agreement consent.
5. The browser hashes the exact text it displayed (SHA-256). The server
   hashes its own copy, records the signing with **its own clock**, and
   stores the evidence record. A hash mismatch is flagged for review, never
   silently rejected.
6. **Copies, with the agreement attached as a PDF.** The same rendered copy
   (details with the ID masked, the full agreement text, the fingerprint) is
   queued to the signer and to `elias@rivetjo.com` and `hashem@rivetjo.com`
   (`AGREEMENT_COPY_RECIPIENTS` in `convex/legalAgreementText.ts`, kind
   `subscription_agreement_copy`), each carrying
   `RIVET-agreement-<reference>.pdf`. All three go through the operational
   email boundary, so `RIVET_EMAIL_MODE` decides whether anything leaves the
   platform; the queue rows, attachment bytes included, are the evidence
   either way. The confirmation screen names all three addresses and offers
   the same PDF as a download, then "Continue to RIVET" closes the modal.
7. RIVET countersigns from Platform → Agreements by hand; the completed
   agreement, with the PDF, goes to the signatory and to `elias@rivetjo.com`
   and `hashem@rivetjo.com`, each under a key tied to that countersignature
   so replacing the signature sends fresh copies. In allowlist mode the
   signatory's own copy is dropped unless their address is listed; the
   founders' copies are the ones that prove the chain. The same dialog
   has **Send the copies again**, which re-renders the email and the PDF from
   the record as it stands and queues fresh delivery rows: RIVET's addresses
   always, the signatory only when the box is ticked. Use it when the first
   copies were suppressed, because a suppressed row is never revisited by the
   worker and the original dedupe keys block a repeat. The result names each
   recipient and says "queued" or gives the suppression reason, so a copy that
   is not going to arrive says so on the spot. The same dialog has **Void this
   agreement**: with a reason, it marks the record void (the evidence stays),
   writes a platform audit event, and the owner is asked to sign again the
   next time they open RIVET. Use it when an agreement was signed under an
   older text or with wrong details; the replacement is a new agreement with
   its own reference and its own copies.

   `convex/communications.e2e.test.ts` drives this whole chain against the
   real backend on every run: sign, countersign by hand, re-send, void,
   sign again, then issue, chase and settle an invoice, checking every email
   for the branded template and every attachment for a readable PDF. Run it
   with `RIVET_DUMP_DIR=<folder>` to write the emails and PDFs out. The owner can
   view or print the record under Settings → Agreement.
8. The ID number is stored only in the agreement row (Convex encrypts at
   rest), masked in every view, email and audit payload, and revealed to a
   platform admin only with a reason and a platform audit event.

Agreement text 1.1 (same date) replaced 1.0 before any real signature: the
signature block no longer carries a quote number or a fixed initial term, so
section 02 points to RIVET's written quote or published prices and section
03 runs the agreement until ended with 30 days' notice.

### Open facts for the lawyer — start review while these are being settled

- RIVET's legal entity name, legal form, commercial registration number and
  registered address (the documents say "RIVET, Amman, Jordan")
- Whether RIVET must register or appoint a data protection officer under
  the Personal Data Protection Law No. 24 of 2023
- Retention periods in Privacy section 09, especially commercial and tax
  records
- Whether the ID number should be collected at all, and the wording gyms
  must show members if they collect member IDs
- The Terms 1.2 beta clause (section 11). Agreement 1.2 still states the
  99.5% availability aim and prevails over the Terms, so it may need a
  matching agreement version. See item 10 of the review brief.
- Arabic versions of all three documents and which language prevails
  (Terms section 19 currently says English unless the law requires otherwise)

### Branding: email, PDF and invoice

The transactional communications follow the identity system designed for
RIVET in September 2026. One family across three surfaces, built from
`convex/brandTokens.ts` (palette, contact block, the placeholders RIVET has
not filled in yet) and `convex/brandAssets.ts` (the marks as print-ready
JPEGs, embedded because the server has no image codec).

**Email** (`convex/emailTemplate.ts`). One column at 600px: a paper header
with the lockup at 112px, an optional gym name for member-facing mail, one
headline, one or two paragraphs, an optional summary card of label/value
rows, exactly one primary button, an attachment chip when a PDF rides along,
and a sunken footer carrying RIVET's contact block, the legal links, why the
message was received, the copyright and, once registered, RIVET's legal line. The
message is light in every client: no dark palette is shipped, the
colour-scheme declarations refuse inversion where a client honours them,
and Outlook's recolouring is overridden back to paper, white and ink.
Gmail offers a sender no such switch, so every surface also carries a
one-pixel background image of its own colour, served from
`/brand/email-*.png`; Gmail's inverter leaves an element with a
background image alone. The paint goes on the elements holding text as well
as the panels behind them: painting only the panels keeps the background and
loses the writing, because Gmail lightens the ink on a panel it has been made
to leave alone. A reader with images off still sees the colour,
which is set inline and as a `bgcolor` as well. On a
phone the gutters tighten, each summary row stacks label over value, and
the button goes full width. Arabic mirrors the layout without mirroring the
logo. Every operational email
goes through it, and a member-facing message colours its button with the
gym's own accent. The one signal red is reserved for past due and suspension.

**PDF** (`convex/pdfDocument.ts`). A4 at 56pt margins, the identity's own
type embedded in every file: Manrope regular and semibold for text, IBM Plex
Mono for the meta line, the technical label, references and the footer.
The faces are WinAnsi subsets built by `scripts/build-pdf-fonts.mjs` from
the open-licence files in `scripts/pdf-fonts/` (SIL OFL 1.1, licences
alongside) into `convex/pdfFonts.ts`; they add about 100 KB to a file.
Hairlines and JPEG images complete the toolkit. Page one carries the lockup and an
uppercase technical label; later pages carry a running header with the glyph,
the document title and the reference. Every page ends with the page number,
the reference and the legal-entity placeholder. The renderer draws status
chips, label/value rows on a 52mm label column, ruled tables, right-aligned
totals, sunken panels and hairline frames for signatures.

**Documents on screen** (`src/features/legal/document-sheet.tsx`). The
same master page, rendered in the app: the privacy policy and the terms at
`/privacy` and `/terms`, the agreement as the owner reads it in the signing
modal, and the signed record in Settings → Agreement and in the platform
console all use one sheet with the lockup, the technical label, the title
and status chip, the mono meta line, numbered sections at the document
scale, label/value rows on the 52mm column, framed signatures and the
footer. The legal pages carry a Download PDF action that reads the rendered
page back into the PDF renderer (`src/features/legal/document-pdf.ts`,
`convex/documentPdf.ts`), so the file says exactly what the page says.

**Language.** Settings → Organization has "Language for emails and
documents". Every email addressed to the gym, invoices and the copies of its
agreement included, follows it; member-facing mail follows the member's own
language. PDFs stay English: the renderer has only the standard Helvetica
faces, and Arabic needs an embedded font with shaping that is not in this
release. The agreement email is fully translated (`convex/legalAgreementEmail.ts`);
RIVET's own internal copy stays English whatever the gym chose.

**Invoices in the app.** Settings → Subscription & invoices lists the gym's
own RIVET invoices with a View button that opens the invoice PDF, built in the
browser from the same record and renderer as the emailed attachment. The
platform billing console has the same PDF button on every row. The invoice
emails' "View invoice" button lands on that settings section.

**Who receives mail in allowlist mode.** Everything that belongs to a
subscribed gym, meaning an organization in trial, active or past-due
status: mail addressed to the gym goes to any active member of its team
(invoices, agreements, support, subscription notices), and mail addressed to
a member goes to the address the gym's own records hold for that person (PT
bookings, receipts, renewal and expiry reminders, trial updates). No list
entry is needed. `RIVET_EMAIL_ALLOWLIST` still governs everyone else, and
`live` mode removes the distinction. The worker decides per message when it
leases it, and a suppression names both conditions in its reason. Member
service mail also passes the gym's own switch: the owner confirms which
member email types are on under Settings → Operational email, and an
unconfirmed gym's member mail is held with that reason.

**Email log.** Platform → Email log lists the last hundred messages RIVET
queued across every gym, newest first, with what happened to each: not sent
with its suppression reason, failed with the provider's error code, redirected
in sandbox mode, or delivered. It is the first place to look when a message
did not arrive, before the provider's dashboard.

**Agreement text 1.2 (4 September 2026).** Same clauses as 1.1, numbered 3 to
12 so the document reads as one sequence with 1 Parties and 2 Details ahead
of them and 13 Signatures after; the one internal cross-reference moved with
its section. 1.1 stays in code because a test gym signed it. The details name
the plan only, never limits the agreement does not promise. The fee row is
the price RIVET publishes for that plan at the moment of signing (the
console's catalogue if an operator has set one, else the launch price),
frozen onto the agreement as `subscription.feeLabel` so the document keeps
saying what was true then.

**No placeholders on a customer's page.** `convex/brandTokens.ts` holds
RIVET's registered facts as optional fields (`BRAND_LEGAL`: legal entity,
commercial registration, tax number and treatment, bank and CliQ details).
Each line is printed only once it is filled in; until then the documents
name RIVET and Amman and say nothing bracketed. The one address RIVET prints
anywhere is sales@rivetjo.com.

**Agreement layout.** The PDF follows artboard P2's anatomy and flows
without forced page breaks: 1 Parties and 2 Details (customer,
representative, address, plan with limits, fee, billing interval, payment
terms, start date, term, governing law), then the clauses 3 to 12 straight
after with a hairline between sections, then 13 Signatures with the masked
ID and the SHA-256 fingerprint, kept together on one page but taking the
next free space. Every page fills. The on-screen record follows the same
order.

**Invoice** (`convex/platformInvoicePdf.ts`). The same furniture with an
`INVOICE` label: parties, a four-across meta grid, the line items, totals
with the total due at 20pt, and a how-to-pay panel. Invoices print
the CliQ and bank details from console → Billing → **Where gyms pay**; with
none set, the `BRAND_LEGAL` details, and with neither, a line saying RIVET
sends them. Since 21 October 2026 the PDF opened in the browser (console
Billing, Settings → Subscription) prints the same details as the emailed
copy. It is attached to the invoice issued,
past due and paid emails. Tax treatment is shown as undecided rather than
guessed.

### The PDF

`convex/pdfDocument.ts` is a small PDF writer with no dependencies: the
standard Helvetica faces, WinAnsi text and JPEG images, which is what a Latin
contract needs. It has no Convex imports, so the server builds the emailed
attachment and the browser builds the "Download PDF" file from the same
record, byte for byte. `convex/legalAgreementPdf.ts` lays out the document:
the signed details with the ID masked, the full agreement text of the version
that was signed, the signature, the server time, the fingerprint and the
countersignature once it exists.

Both sides sign by hand. The customer draws in the modal; RIVET draws in the
platform console when countersigning, and the PDF carries the two marks side
by side under "Signatures". A countersignature can be replaced, which is how
a typed one becomes a drawn one; the replacement is audited and sends a fresh
completed copy.

A drawn signature is captured twice: the transparent PNG the app shows on
screen, and an opaque JPEG (`signature.printImageDataUrl`) for the PDF,
because a PDF embeds JPEG bytes directly and the server has no image decoder.
Anything signed before the PDF existed has only the PNG, so opening the
agreement in the platform console fills the gap: the browser can already
display the PNG, so it flattens it to JPEG and sends it back through
`legal.agreement.attach_print_signature`, which only ever fills an empty slot
and is audited. Until that happens the PDF prints "Signature drawn in RIVET
and held with the signed record" rather than a blank space.

Two limits worth knowing:

- **Latin only.** The embedded faces carry the WinAnsi range, so any Arabic
  in a typed field, a gym's registered name for instance, appears as question
  marks in the PDF. The app record and the email body show it correctly.
  Arabic in the PDF needs an Arabic face with shaping, which is not in this
  release.
- **The masked ID travels, the full one does not.** A PDF gets forwarded, so
  it carries the same masked number the app shows. The full number stays in
  the platform console behind a reason and an audit event.

### Known limitations recorded in docs/09

- The signer's IP address is not captured (needs a trusted server hop).
- The ID number is not field-level encrypted; access control and audit stand
  in for it in this release.

## 4. Commercial launch catalogue — 7 October 2026

Changed 19 October 2026: one onboarding fee for every plan, and new gyms pay
their first invoice before they get access instead of starting a trial month.
The trial and first-invoice paragraphs below describe gyms set up before that;
see section 5.

Implemented in the current candidate under the request to fix nonlegal launch issues. Deployment and provider acceptance are separate release gates; see CURRENT_STATE.md. Legal wording and signed history are unchanged.

| | Starter | Growth | Pro |
|---|---|---|---|
| Monthly price (JOD) | 39.000 | 89.000 | 199.000 |
| Annual subscription (JOD, 5% saving) | 444.600 | 1,014.600 | 2,268.600 |
| One-time onboarding (JOD) | 75.000 | 75.000 | 75.000 |
| First monthly invoice subtotal (JOD) | 114.000 | 164.000 | 274.000 |
| Branches | 1 | 2 | 5 |
| Owner and staff accounts, including pending invitations | 3 | 8 | 20 |
| Active members pooled across branches | 150 | 300 | 1,000 |
| Member-facing operational email allowance per Amman calendar month | 600 | 1,500 | 5,000 |
| Foundation and revenue workflows | Yes | Yes | Yes |
| Operations | — | Yes | Yes |
| Finance and reporting | — | — | Yes |

Enterprise is quote-only on public surfaces and in the console; each Enterprise gym's monthly price is its own quote (see "Enterprise quotes" in section 5), and the catalogue row keeps Enterprise's default limits and modules. Valid operator catalogue overrides remain authoritative. The release migration previews by default and updates only exact former Starter/Growth/Pro defaults; customized rows remain unchanged and require review. No existing invoice or signed agreement is rewritten.

Capacity checks run inside server mutations, including branch activation, staff invitation/reactivation, membership sale/import/date changes. Membership capacity counts distinct people with overlapping current or future terms across the organization; frozen terms reserve capacity. Existing excess is not deleted or automatically billed: corrections that do not increase an over-limit interval remain allowed, and new over-limit increases require freeing capacity or changing plan.

Newly provisioned gyms capture their one-time onboarding fee. It is added as a separate line on the first subscription invoice, outside the annual discount and proration. An unpaid replacement carries it forward; a paid fee is never charged at renewal. Existing gyms without the captured fee remain uncharged. This collection timing is the implementation assumption; no new upfront payment gateway or mandatory minimum term was invented.

Plan/cadence changes retain the existing one-interval date rules. Credits now use the current term's recorded funded subscription value rather than its current catalogue price or active status alone. Paid invoices contribute subscription value excluding setup; unpaid invoices contribute only a carried paid credit. An unpaid invoice cannot fund a free upgrade. Credits stay capped at the new subscription subtotal. The existing explicit-end-date override and payment/enforcement windows are unchanged.

Member-facing email sends reserve allowance transactionally before provider submission. Dedupe and retries reuse the reservation. Sandbox/allowlist-dropped messages do not consume it. Excess mail remains visibly deferred to the next Amman month; it is not reported as delivered. Authentication, platform invoice/account/legal notices and support/admin mail are outside this member-email allowance. Deferred notices can become stale, so operators must review the outbox before increasing allowance or retrying old notices; no automatic overage charge is implemented.

**Legal decisions remain excluded and open.** Terms section 05 says "Onboarding is included"; counsel must reconcile that wording with the implemented fee. Agreement 1.2 section 4 refers to written quotes or published pricing, and section 6 describes onboarding services without explicitly promising free onboarding. The Terms' twelve-month default and agreement's termination provisions still require counsel reconciliation, as does tax treatment. The public first payment is explicitly a subtotal; no tax amount or legal approval is implied by this engineering change. See the refreshed [review brief](legal-review/2026-10-07/REVIEW_BRIEF.md).

## 5. One onboarding fee, pay-first gyms, launch offers and renewals — 19 October 2026

Elias decided on 19 October 2026: one JOD 75 onboarding fee on every plan; a
custom website add-on, free for the first gyms that ask and JOD 150 after;
promo codes managed in a new console page; gyms pay before they get access;
and a workspace warning on the last day of a paid term.

### Onboarding fee

`ONBOARDING_FEE_MINOR = 75_000` in `convex/planCatalogue.ts` for Starter,
Growth and Pro (it was 75/150/300); the public catalogue in
`src/lib/public/pricing.ts` mirrors it. Enterprise stays quote-only with
onboarding stored as zero. Gyms already provisioned keep the fee they were
given. Production had no stored plan overrides on 19 October (read-only
check), so the code catalogue applies there once Convex is deployed.
`launchCatalogue.migrateDefaults` also treats untouched 7 October rows
(Growth 150, Pro 300) as old defaults; edited rows are preserved.

### Pay first

1. **Apply.** The form now asks whether the gym wants a custom website and
   takes an optional promo code (checked live with `public.promo.check`, and
   again when the form is sent). Nothing is paid at this step.
2. **Approve and set up.** Provisioning creates the gym with organization
   status **`pending_payment`** (new) instead of a one-month `trial`, and
   creates its **first invoice** at once (`createFirstInvoice` in
   `convex/platformCommerce.ts`): term + JOD 75 + website (free or JOD 150) −
   promo, due in 14 days. The owner gets the existing Clerk invitation.
3. **Pay.** The owner can sign in, but `requireActor` refuses every workspace
   operation for a `pending_payment` gym. `identity.current` returns
   `billingAccess` for the owner, the sign-in page and `/dashboard` route to
   **`/billing`**, and only `billing.checkout`, `billing.payment.submit` and
   `billing.invoices.list` accept the gym (`requireBillingActor`). The page
   shows the invoice lines, RIVET's CliQ and bank details, and a short note
   reference (`INV-` + 8 characters). The owner pays outside RIVET and sends
   method, reference, payer name and date; platform admins get a
   notification.
4. **Confirm.** Platform console → Billing → **Payments to confirm**. Confirm
   uses the existing `platform.invoice.payment` (reason required, audited);
   for a first payment the paid term starts at confirmation, the gym becomes
   `active`, its listing becomes public, and the paid email goes out. **Send
   back** (`platform.invoice.payment_reject`) records a message the owner sees
   on the payment page and gets by email (`platform_payment_returned`). For a
   plan upgrade, confirming also changes the plan (see below).

A gym stopped for an unpaid invoice (`suspended`, not archived) gets the same
billing-only access, so it can pay and be restored. Staff of an unpaid gym
are told the gym is unavailable; only the owner (or a role with
`settings.manage`) can send payment details.

### Plan upgrades by the gym — 19 October 2026

Elias decided that gyms change their own plan. Settings → Subscription →
**Change plan** offers the plans above the gym's own (Starter → Growth → Pro;
Enterprise stays quoted by RIVET; a smaller plan or a different billing cycle
is a message to RIVET, which makes the change itself in Billing → Gyms →
**Change plan**, below). `billing.plans` prices each one with the same term
change RIVET used for its own plan changes (`termChange` in
`convex/subscriptionTerm.ts`): one term of the new plan less the unused days
of the paid term, valued at what the gym paid. **Continue to payment**
(`billing.plan_change.request`) raises an invoice with `planChange: { from,
to }` and takes the owner to `/billing`, which shows "Upgrade to {plan}". The
plan does not change yet. Choosing another plan replaces the request; it can
be cancelled until payment details are sent (`billing.plan_change.cancel`).

When the owner sends payment details, a gym that can open its workspace gets a
**support request** (`requestType: "billing"`, one per invoice) with a
three-step tracker: payment sent → RIVET confirms → plan upgraded. Sending the
details back moves it to "waiting" with RIVET's message; confirming resolves
it. A gym still waiting for its first payment only has the payment page, so it
gets no support request.

Confirming an upgrade (`platform.invoice.payment`) changes the organization's
plan and features (`syncPlanEntitlement`, shared with the console's own
subscription change), starts a new term on the confirmation day, keeps the
original subscription start date, and voids any unpaid renewal it replaces.
Renewals then bill the new plan every month (or year). Only an `active` gym
can upgrade; a gym behind on a renewal pays that first.

The console's Billing page was cut down to: totals (to confirm, unpaid, paid
this month), **Payments to confirm**, one invoice list (Unpaid / Paid / All,
with PDF, **Mark paid** and **Void** in a menu), **Gyms** (plan, status, paid
until; suspend, cancel or reactivate in a menu) and **Where gyms pay**. The
bill-a-gym wizard, manual exception invoices, the renewal-policy dialog, the
lifecycle cards and manual "mark past due" were removed; the operations
behind them still exist. Gym pages link to Billing with `?gym=<id>`, which
shows that gym's invoices.

### Enterprise quotes and RIVET's own plan changes — 21 October 2026

Elias reported that the console showed Enterprise at JOD 500 a month while the
website said "Custom quote", and asked for subscriptions that actually work.
An Enterprise applicant was billed the hidden JOD 500 on its first invoice,
and the console had no way to change a gym's plan, billing cycle or price
after the 19 October billing page lost its wizard.

- **One price rule.** `gymMonthlyPriceMinor` in `convex/planCatalogue.ts`: an
  Enterprise gym pays `organizations.quotedPriceMinor`; every other plan, and
  an Enterprise gym with no quote, pays the catalogue price. The first
  invoice, renewals, RIVET's plan changes (term and credit), the gym's own
  upgrade credit, the agreement fee, the gym record's recurring amount and
  platform MRR all use it. Yearly billing is twelve months of the quote less
  5%, as for the other plans.
- **Approval.** Approving an Enterprise application requires the quoted
  monthly price (`gymApplications.review` → `quotedPriceMinor`, audited);
  set-up copies it onto the gym. Other plans ignore it.
- **Change plan (console).** Billing → Gyms → a gym's menu → **Change plan**:
  plan, monthly or yearly, and the quote when Enterprise, with a reason. It
  calls the existing `platform.gym.update`. Moving a gym onto Enterprise needs
  a quote; a quote on another plan is refused; a new quote, plan or cycle on
  an active gym starts a new term today and bills it less the unused paid
  days; leaving Enterprise clears the quote. The audit row records the quote
  before and after. For a gym still waiting for its first payment, the same
  dialog corrects the plan, cycle or quote and replaces its first invoice
  (old one voided; onboarding fee, website place and promo re-checked); it is
  refused while the gym's payment details wait for RIVET.
- **Pricing & entitlements.** Enterprise shows "Custom quote", as the website
  does, and its edit dialog has no price field (limits and modules only).
- **The gym's view.** `billing.plans` returns `monthlyPriceMinor`, the price
  the gym pays now, so Settings → Subscription shows an Enterprise gym its
  quote and every gym the live catalogue price rather than the launch one.

### Website add-on and free places

`platformSettings` key `commercial` holds `websiteOffer` (default: on, **5**
places, JOD **150**). A place is **held when the gym's first invoice is
issued with the website free** (at approval/set-up), not at payment, because
the price must be fixed on the invoice. Voiding that invoice gives the place
back. Gyms that did not ask for a website never take a place, so Test Gym is
not counted. The landing panel and the form read `public.websiteOffer`; the
console's Promos page lists the gyms holding places in order and lets admins
change places, price, or switch the offer off (audited).

### Promo codes

`platformPromoCodes` table. A code takes a percent or an amount off one part
of the first payment: the first month or year, the onboarding fee, the
website, or the whole first payment. Optional plan list, maximum uses and last
day. Codes are never edited after creation, only paused and resumed (audited),
so an invoice that used one keeps meaning what it said. Uses are counted from
non-void invoices carrying the code. A code that stopped working between
application and set-up is not applied, and the invoice records
`promoNotApplied` for the platform team. Only the subscription share of a
discount (`subscriptionDiscountMinor`) is excluded from later term credits.

### Renewals and the last-day warning

- Renewal invoices are now raised **14 days** before the paid term ends
  (`INVOICE_LEAD_DAYS`), so the agreement's 14-day payment term ends on the
  last day of the paid term. Creating one sends `platform_invoice_issued`.
- `platform_invoice_reminder` goes **7, 3 and 1 days** before the term ends
  while the invoice is unpaid and no payment details are waiting; each mark
  is sent once, and a late job sends only the nearest one.
- The workspace shows `BillingNoticeBanner` on the **last day** of a paid
  term with nothing paid for the next one (plus a once-a-day prompt for the
  owner with **Pay now** → `/billing`), an **overdue** banner after the term
  ends stating the day access stops, and a calm "payment sent" banner while
  RIVET checks. Billing emails now link to `/billing`.
- **Access still stops 21 days after the due date**, as agreement section 02
  allows (more than 14 days overdue plus 7 days' written notice). Ending
  access on the last day of the term would contradict the signed agreement;
  that needs a new agreement version and counsel.

### Before this works in Production

- `RIVET_SUBSCRIPTION_RECONCILIATION_ENABLED` is **not set** in Production
  (names-only check, 19 October). Without it no renewal invoices, reminders,
  past-due marking or suspension run. Set it to `1` once a paying gym exists.
- Enter RIVET's CliQ alias and bank details in console → Billing → **Where
  gyms pay**. Until then the payment page tells gyms to contact RIVET and
  emailed invoice PDFs say RIVET sends the details; once set, both show them.
  `BRAND_LEGAL` bank details stay empty and are only a fallback.
- Deploy Convex (`pnpm convex:deploy`) together with the frontend; the
  frontend alone would route new gyms to a payment page the backend does not
  serve.

### Open [decide] items

- What the website includes (pages, domain, hosting, how long RIVET runs it,
  who edits it later), and whether the offer and add-on need Terms or
  agreement wording. The public copy promises no specifics.
- Whether the owner should sign the subscription agreement before paying.
  Today they apply under the Terms, pay, and sign the agreement on first
  entry to the workspace, as before.
- Whether to keep the 21-day grace or end access sooner (agreement change).
- Promo codes and the website offer are public on the landing/form; codes can
  be guessed but only discount a first payment RIVET still has to approve.
