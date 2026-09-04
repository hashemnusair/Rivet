# Go-live decisions: messaging, operational email, legal documents, pricing

Written 3 September 2026. This is the working sheet for the four items that
were "live but provisional" in RIVET: WhatsApp/SMS reminders, operational
email, the legal documents and e-signature, and the pricing tiers. Each
section says what the product does today, what must be decided, and what
must be true before the switch is flipped. Decisions marked **[decide]**
need Elias or Hashem to sign the table at the end. Keep secret values,
provider credentials and applicant details out of this file.

## 1. WhatsApp and SMS reminders

### What the product does today

- Reminders run in a **sandbox ledger**. Automation rules and the renewal
  journey create `messageDelivery` and `renewalDeliveries` rows with the
  channel the gym asked for, the language of the member, consent facts,
  quiet-hour decisions, and an attempt history, and nothing leaves RIVET.
- Two switches now exist and **both must be on** before a member receives
  anything:
  1. `RIVET_MESSAGING_MODE` on the server (`off` by default; `sandbox`
     redirects every message to `RIVET_MESSAGING_SANDBOX_TO`; `allowlist`
     sends only to `RIVET_MESSAGING_ALLOWLIST`; `live` sends to members).
  2. The gym's own **Settings → Notifications → External delivery** switch.
- The provider seam is **Twilio** (`RIVET_MESSAGING_PROVIDER=twilio`,
  `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_MESSAGING_SERVICE_SID`
  for SMS, `TWILIO_WHATSAPP_FROM` for WhatsApp). A minute worker leases due
  rows for live gyms, renders the body, calls Twilio, and records the
  provider id, the mode and the number actually used. Transient failures
  retry at 1, 5 and 30 minutes; a final failure notifies the gym's managers.
- **Quiet hours** are per gym (default 22:00–08:00, gym timezone). A live
  gym's message that falls inside the window is deferred to the end of the
  window, never dropped. Sandbox gyms keep today's retained ledger.
- Phone numbers are normalised to E.164 with Jordan (+962) as the default.
- Every message names the gym. Marketing-class messages carry the opt-out
  line ("Reply STOP to stop these messages" / "أرسل إيقاف لإيقاف هذه الرسائل").

### Template catalogue (code-owned, `convex/messagingTemplates.ts`)

| Key | Family | Channels | Variables |
|---|---|---|---|
| `renewal_7d` | Renewal, 7 days before | WhatsApp, SMS | member_name, gym_name, end_date, branch_name |
| `renewal_3d` | Renewal, 3 days before | WhatsApp, SMS | member_name, gym_name, end_date |
| `renewal_today` | Renewal, ends today | WhatsApp, SMS | member_name, gym_name, branch_name |
| `renewal_expired_3d` | Renewal, 3 days after expiry | WhatsApp, SMS | member_name, gym_name, end_date |
| `payment_due_3d` | Payment due in 3 days | WhatsApp, SMS | member_name, gym_name, amount, due_date |
| `payment_due_today` | Payment due today | WhatsApp, SMS | member_name, gym_name, amount |
| `payment_overdue_3d` | Payment 3 days overdue | WhatsApp, SMS | member_name, gym_name, amount |
| `class_booking_confirmation` | Class booked | WhatsApp, SMS | member_name, gym_name, class_name, class_time, branch_name |
| `class_reminder` | Class in 2 hours | WhatsApp, SMS | member_name, gym_name, class_name, class_time |
| `entry_pass` | Entry pass | WhatsApp | member_name, gym_name, pass_link |

All ten are Meta **utility** templates (operational, no marketing consent
needed) in Arabic and English. The catalogue version is
`1.0 · 3 September 2026`; the settings page shows the full text.

### Decisions needed

- **[decide] Provider.** Twilio is implemented because one vendor covers
  SMS and WhatsApp with one API and one bill. The alternative is the Meta
  Cloud API for WhatsApp (cheaper per message, more setup) plus a local SMS
  aggregator. Switching later means implementing one more `send` function
  behind the same seam; the ledger does not change.
- **[decide] WhatsApp Business account.** Meta business verification of the
  RIVET legal entity, the display name, and template approval for the ten
  catalogue templates (submit both languages). Budget two to three weeks.
- **[decide] Inbound STOP / إيقاف.** SMS: enable Twilio Advanced Opt-Out on
  the messaging service (carrier-level). WhatsApp: needs an inbound webhook
  that marks the member `whatsappOptedOut`; not built in this release.
- **[decide] Who pays message costs** per tier (included, capped, or passed
  through). The Terms say "included or passed through as stated in the
  subscription agreement"; the agreement quote must state it.
- **[decide] Friday prayer window.** The privacy policy no longer promises
  it; if RIVET wants it, it becomes a second per-gym quiet window.

### Before flipping `RIVET_MESSAGING_MODE` to `live`

- [ ] Twilio production account, messaging service and approved WhatsApp
  sender; credentials in the Convex environment, never in the repository
- [ ] Ten catalogue templates approved by Meta in Arabic and English
- [ ] `sandbox` for one week against RIVET's own numbers, then `allowlist`
  with RIVET staff plus one pilot gym for two weeks with zero unexplained
  failures in the delivery ledger
- [ ] Inbound STOP handling live for the channels in use
- [ ] Twilio status webhook (delivered / failed) wired to the attempt
  history, or accept "accepted by provider" as the final state (documented)
- [ ] Pilot gym has consent facts on its members and has switched External
  delivery on knowingly
- [ ] Runbook: how to set the mode back to `allowlist` in under five minutes

## 2. Operational email

### What the product does today

- `RIVET_EMAIL_MODE` = `off` | `sandbox` | `allowlist` | `live`, read on the
  server. `off` is the default and the fallback for any unrecognised value.
  `sandbox` sends everything to `RIVET_EMAIL_SANDBOX_TO` with the original
  recipient in the subject. `allowlist` sends only to
  `RIVET_EMAIL_ALLOWLIST` (addresses or `@domain`s) and suppresses the rest
  with a visible reason. The old `RIVET_OPERATIONAL_EMAIL_LIVE=true` counts
  as `live` only while the new variable is unset.
- Gym-controlled member service kinds still require the owner's confirmed
  preferences; RIVET-controlled platform kinds (invoices, subscription
  notices, and now the signed and countersigned agreement copies) are
  mandatory.
- Every attempt records the mode and the address actually used; Settings →
  Operational email shows the mode in plain language.

### Before flipping `RIVET_EMAIL_MODE` to `live`

- [ ] **[decide]** sending domain (normally `noreply@rivetjo.com`), with
  SPF, DKIM and DMARC (`p=quarantine` at minimum) published and verified
- [ ] Resend production key in the Convex environment; webhook secret set
- [ ] Bounce and complaint webhooks handled (already recorded as delivery
  events); a hard bounce must mark the address bad before go-live
- [ ] Templates reviewed in Arabic and English with RIVET's contact details
- [ ] Reply-to routed to a monitored inbox
- [ ] Two weeks in `allowlist` with RIVET staff and one pilot gym, zero
  unexplained failures
- [ ] Runbook: how to switch back to `allowlist` in under five minutes

## 3. Legal documents and the e-signature

### What exists

| Document | Where | Status |
|---|---|---|
| Privacy policy | `/privacy` | Draft 1.0 · 3 September 2026 |
| Terms of service with the data processing addendum | `/terms` | Draft 1.0 · 3 September 2026 |
| Subscription agreement, signed at onboarding | blocking modal in the app shell (owner); copy under `/settings?section=agreement`; `/platform/agreements` (RIVET) | Draft 1.1 · 3 September 2026 |

All three are consistent with each other (14-day payment terms, 7-day
suspension notice, 30-day notice to end, 60-day fee-change notice, 99.5%
availability target, support 09:00–21:00 Saturday to Thursday, liability
capped at twelve months of fees, Jordanian law, courts of Amman) and with
what the platform actually records.

### How the e-signature works

1. A newly provisioned gym's owner signs in; the session says the agreement
   is required and the app shell opens a modal over the workspace that
   cannot be closed (no close button, Escape and outside clicks are
   ignored). Staff are never blocked; they see the workspace as usual.
2. **Step 1, read.** The modal shows the versioned agreement text with a
   reading progress bar. "I have read and agree" stays disabled until the
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

### Before a lawyer sees them

- RIVET's legal entity name, legal form, commercial registration number and
  registered address (the documents say "RIVET, Amman, Jordan")
- Whether RIVET must register or appoint a data protection officer under
  the Personal Data Protection Law No. 24 of 2023
- Retention periods in Privacy section 09, especially commercial and tax
  records
- Whether the ID number should be collected at all, and the wording gyms
  must show members if they collect member IDs
- Arabic versions of all three documents and which language prevails
  (Terms section 18 currently says English unless the law requires otherwise)

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
message was received, the copyright and the legal-entity placeholder. Dark
mode swaps to the night palette and the reversed marks through a media query;
Arabic mirrors the layout without mirroring the logo. Every operational email
goes through it, and a member-facing message colours its button with the
gym's own accent. The one signal red is reserved for past due and suspension.

**PDF** (`convex/pdfDocument.ts`). A4 at 56pt margins, Helvetica and
Helvetica-Bold, hairlines and JPEG images. Page one carries the lockup and an
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

**Agreement layout.** The PDF follows artboard P2: page one carries the
parties and the details (customer, representative, ID, address, plan, fee,
billing interval, payment terms, start date, term, governing law); the
numbered clauses start on a new page under the running header; the
signatures and the SHA-256 fingerprint close the document on a page of their
own. The on-screen record follows the same order.

**Invoice** (`convex/platformInvoicePdf.ts`). The same furniture with an
`INVOICE` label: parties, a four-across meta grid, the line items, totals
with the total due at 20pt, and a how-to-pay panel whose bank and CliQ
details are labelled placeholders. It is attached to the invoice issued,
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

- **Latin only.** A standard PDF font cannot draw Arabic, so any Arabic in a
  typed field, a gym's registered name for instance, appears as question
  marks in the PDF. The app record and the email body show it correctly.
  Arabic in the PDF needs an embedded font with shaping, which is not in this
  release.
- **The masked ID travels, the full one does not.** A PDF gets forwarded, so
  it carries the same masked number the app shows. The full number stays in
  the platform console behind a reason and an audit event.

### Known limitations recorded in docs/09

- The signer's IP address is not captured (needs a trusted server hop).
- The ID number is not field-level encrypted; access control and audit stand
  in for it in this release.

## 4. Pricing tiers: sign-off sheet

Starter, Growth, Pro and Enterprise are live in the product as tier names,
feature gates and prices. The platform pricing page and this sheet say they
are **provisional**. Nothing goes into a quote or a signed agreement as final
until the table at the end is signed.

### What the product enforces today

| | Starter | Growth | Pro | Enterprise |
|---|---|---|---|---|
| Monthly price (JOD) | 79.000 | 149.000 | 249.000 | 500.000 |
| Annual price (JOD, 20% off) | 758.400 | 1,430.400 | 2,390.400 | 4,800.000 |
| Branches | 1 | 3 | 8 | 25 |
| Staff accounts | 8 | 25 | 80 | 250 |
| Members | 500 | 2,500 | 10,000 | 50,000 |
| Gym foundation (members, memberships, payments, reception) | ✓ | ✓ | ✓ | ✓ |
| Revenue protection (leads, follow-ups, reminders) | ✓ | ✓ | ✓ | ✓ |
| Daily operations (stock, purchasing, payables, equipment, maintenance) | — | ✓ | ✓ | ✓ |
| Financial operating system (shifts, reconciliation, ledger) | — | — | ✓ | ✓ |
| Management reporting (statements, analytics) | — | — | ✓ | ✓ |
| Shown on the public site | ✓ | ✓ | ✓ | platform-only |

Source of truth: `convex/seed.ts` (plan rows), `convex/workspaceModules.ts`
(module availability), the public pricing helper (annual formula).

### Decisions needed

- **[decide]** the three public prices and whether Enterprise is quoted
- **[decide]** branch, staff and member limits per tier, and what happens
  when a gym exceeds them (the Terms say RIVET offers the next plan)
- **[decide]** whether message costs are included per tier (section 1)
- **[decide]** onboarding fee: the agreement says onboarding is included
- **[decide]** annual discount (20% today) and whether monthly billing needs
  a minimum term (the agreement's initial term is 12 or 24 months)

### Sign-off

| Item | Decision | Signed by | Date |
|---|---|---|---|
| Public prices (Starter / Growth / Pro) | | | |
| Tier limits | | | |
| Message costs per tier | | | |
| Onboarding fee | | | |
| Annual discount and minimum term | | | |

When the table is signed, remove the provisional notice from the platform
pricing page (`src/app/platform/subscriptions/page.tsx`) and record the
decision in docs/09.
