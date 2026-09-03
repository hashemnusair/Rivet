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
| Subscription agreement, signed at onboarding | `/onboarding/agreement` (owner), `/platform/agreements` (RIVET) | Draft 1.0 · 3 September 2026 |

All three are consistent with each other (14-day payment terms, 7-day
suspension notice, 30-day renewal notice, 60-day fee-change notice, 99.5%
availability target, support 09:00–21:00 Saturday to Thursday, liability
capped at twelve months of fees, Jordanian law, courts of Amman) and with
what the platform actually records.

### How the e-signature works

1. A newly provisioned gym's owner signs in; the session says the agreement
   is required and the app takes them to `/onboarding/agreement`.
2. The page shows the versioned agreement text next to a form prefilled
   from the organization and the owner account: registered name, trade
   name, commercial registration number (optional until invoicing), address,
   city, branches; signatory name, role, national ID (ten digits) or
   passport number, phone, email; plan, quote number, contract start date,
   initial term (12 or 24 months); place of signing.
3. The signer draws a signature on the canvas or types their full name and
   adopts it, ticks four declarations, and signs.
4. The browser hashes the exact text it displayed (SHA-256). The server
   hashes its own copy, records the signing with **its own clock**, and
   stores the evidence record. A hash mismatch is flagged for review, never
   silently rejected.
5. The owner sees the signed copy (ID masked) with a print-to-PDF action and
   receives it by email; RIVET is notified. RIVET countersigns from
   Platform → Agreements by typing the admin's own name; the signatory gets
   the countersigned copy by email.
6. The ID number is stored only in the agreement row (Convex encrypts at
   rest), masked in every view and audit payload, and revealed to a
   platform admin only with a reason and a platform audit event.

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
