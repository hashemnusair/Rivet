# RIVET — external legal/commercial review brief

Prepared 7 October 2026. **Not sent; counsel not yet appointed.** The lawyer's
name/email and the founders' legal-entity details remain missing. Start review
with the open questions below rather than waiting for every decision. No fees,
engagement terms or legal text have been approved by this preparation.

## Material ready to review

Open [SOURCE_SNAPSHOT.html](SOURCE_SNAPSHOT.html) in a browser or print it.
It renders all 34 current privacy/terms sections, including the DPA in Terms
section 09, and the canonical subscription agreement clause body. It contains
no customer/signatory records. It is a snapshot of the existing source, not a
rewritten contract; the contract's signature fields are described below.

Source baseline `9fbd53c`:

- Privacy: `apps/web/src/features/legal/privacy-policy.tsx`, v1.1, 14 September.
- Terms and DPA: `apps/web/src/features/legal/terms-of-service.tsx`, same date.
- Agreement: `apps/web/convex/legalAgreementText.ts`, v1.2, 4 September.
- E-signature flow: `subscription-agreement-signing.tsx`, `convex/legalAgreement.ts`.
- Current pricing/limits: `convex/platformPlanCatalog.ts`, `convex/workspaceModules.ts`.

## Decisions and redlines requested

1. **Entity and signatories.** Confirm legal name in English/Arabic, registration
   and tax IDs, registered/service address, jurisdiction, authorized signatory,
   invoice issuer and bank/CliQ payee. `BRAND_LEGAL` is currently empty. Do not
   substitute the RIVET brand for an unconfirmed legal entity.
2. **Pricing/package sign-off.** Current monthly defaults are Starter JOD 79,
   Growth 149, Pro 249 and Enterprise base 500 (publicly quote-led). Annual is
   20% off. Confirm tax inclusion, onboarding fees, fair-use/email costs,
   negotiated overrides and limits. Current branch/staff/member caps are
   1/8/500, 3/25/2,500, 8/80/10,000 and 25/250/50,000. These are implemented
   defaults, not a founder approval recorded by this task.
3. **Term conflict.** Terms default to 12 months with renewal; agreement 1.2
   continues until ended with 30 days' notice. Reconcile monthly/annual billing,
   commitment, renewals, cancellation, refunds and the precedence clause.
   Check 14-day payment, overdue suspension, 60-day price-change notices and
   actual billing implementation against the final commercial decision.
4. **Scope.** On 7 October Elias removed automated WhatsApp/SMS. Staff initiate
   WhatsApp manually; RIVET records the handoff without delivery proof. All
   email transport moves to Resend; Clerk still owns authentication. Redline
   obsolete messaging/provider/opt-out promises and any messaging surcharge.
   Do not add Twilio/Meta API processing as a launch dependency.
5. **Privacy and DPA.** Review controller/processor roles for gym members and
   direct RIVET accounts, lawful grounds/notices, access/deletion processes,
   security obligations, subprocessor list and cross-border transfers. Confirm
   actual providers: Clerk identity, Convex database, Vercel web hosting,
   Resend email and Spacemail founder inboxes. Confirm AI processing where
   enabled. Do not assume an unverified provider region or executed DPA.
6. **Sensitive records and retention.** Review signatory national ID/passport
   collection, authorization to reveal it, signature images/hashes, member
   photos/health-related notes if collected, minors, export and deletion
   duties. Verify the draft's 30-day export and 90-day deletion promises
   against backups and actual purge behavior; identify any retention exception.
7. **Service commitments.** Review 99.5% availability target, support hours
   09:00–21:00 Amman Saturday–Thursday, exclusions, liability cap, governing
   law/dispute process and notices. Confirm these are commercially supportable.
8. **E-signature and Arabic.** Review signatory identity, authority, consent,
   typed/drawn signatures, timestamp/hash evidence, countersignatures and
   immutable version retention. Signer fields include gym details, name/role,
   ID/passport, contact details, contract start date and selected plan. Supply
   or review full Arabic privacy/terms/DPA/agreement with language precedence
   and matching numbered clauses. Arabic UI/email copy is not legal review.
9. **Consistency corrections.** Terms omit Enterprise. Agreement 1.2 uses
   older `rivet.jo` legal links; current public host is `www.rivetjo.com`.
   Issue a new reviewed version and preserve existing signed versions/hashes.

Requested outputs: annotated English drafts, complete reviewed Arabic drafts,
a decision list for founders, prioritized launch blockers, scope/fee estimate
and expected turnaround. Counsel should distinguish legal requirements from
optional commercial recommendations.

## Outreach draft — ready once a recipient is named

Subject: RIVET launch — English/Arabic privacy, terms, DPA and subscription review

Hello,

We are preparing RIVET, a gym management platform based in Amman, for launch.
Please review the attached current privacy policy, terms including DPA, and
subscription agreement, and provide/review equivalent Arabic versions.

The attached brief lists our open entity/pricing decisions and specific
consistency questions. Please begin the review with these points flagged;
we will supply confirmed entity details and commercial approvals separately.
Our launch scope includes Resend email and staff-initiated manual WhatsApp.
Automated WhatsApp is excluded.

Please confirm your proposed scope, fees and turnaround, and identify the
changes needed before launch. We have not treated these drafts as approved.

Thank you,
RIVET

Attachments: REVIEW_BRIEF.md and SOURCE_SNAPSHOT.html. No real signed customer
agreement, identity number or production export is included.
