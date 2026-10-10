# RIVET — external legal/commercial review brief

Prepared 7 October 2026; commercial facts refreshed 8 October 2026 against
implementation `0f5a92f`. **Not sent; counsel not yet appointed.** The lawyer's
name/email and the founders' legal-entity details remain missing. Start review
with the open questions below rather than waiting for every decision. No fees,
engagement terms or legal text have been approved by this preparation.

## Material ready to review

Open the [English snapshot](SOURCE_SNAPSHOT.html) and [Arabic snapshot](SOURCE_SNAPSHOT_AR.html) in a browser or print them.
Each renders all 34 current privacy/terms sections, including the DPA in Terms
section 09, and the canonical subscription agreement clause body. They contain
no customer/signatory records. Each is a snapshot of the existing source, not a
rewritten contract; the contract's signature fields are described below.

Legal snapshot baseline `4fe7be1`; the privacy/terms/DPA and agreement source
remains unchanged at implementation `0f5a92f`:

- Privacy: `apps/web/src/features/legal/privacy-policy.tsx`, v1.1, 14 September.
- Terms and DPA: `apps/web/src/features/legal/terms-of-service.tsx`, same date.
- Agreement: `apps/web/convex/legalAgreementText.ts`, v1.2, 4 September.
- Arabic: `src/lib/i18n/messages/ar/publicPrivacy.ts`, `publicTerms.ts` and
  `convex/legalAgreementArabic.ts` (agreement v1.2-ar, 2 October).
- E-signature flow: `subscription-agreement-signing.tsx`, `convex/legalAgreement.ts`.
- Current commercial facts (paths under `apps/web`): `convex/planCatalogue.ts`
  (prices, fees, discount and limits), `convex/planCapacity.ts` (effective
  catalogue overrides and capacity), `convex/workspaceModules.ts` and
  `convex/platformPlanCatalog.ts` (module selection).
- Public pricing/signup: `src/lib/public/pricing.ts`, `src/app/signup/page.tsx`.
  Setup capture/invoicing: `convex/platformProvisioning.ts`,
  `convex/onboardingBilling.ts`, `convex/domain.ts` and
  `convex/subscriptionReconciliation.ts`.

## Decisions and redlines requested

1. **Entity and signatories.** Confirm legal name in English/Arabic, registration
   and tax IDs, registered/service address, jurisdiction, authorized signatory,
   invoice issuer and bank/CliQ payee. `BRAND_LEGAL` is currently empty. Do not
   substitute the RIVET brand for an unconfirmed legal entity.
2. **Pricing/package sign-off.** Implemented launch defaults:

   | Plan | Monthly (JOD) | One-time onboarding (JOD) | Branches | Owner/staff accounts | Active members | Operational emails/month |
   |---|---:|---:|---:|---:|---:|---:|
   | Starter | 39 | 75 | 1 | 3 | 150 | 600 |
   | Growth | 89 | 150 | 2 | 8 | 300 | 1,500 |
   | Pro | 199 | 300 | 5 | 20 | 1,000 | 5,000 |

   Annual subscription billing is twelve monthly fees billed once at **5% off**;
   onboarding is outside that discount. Public/signup first-payment subtotals
   combine the selected subscription term with the one-time onboarding fee
   before applicable tax; signup takes no immediate payment. New gyms capture
   that fee for a separate line on their first subscription invoice for the
   post-trial term. Existing gyms without a captured fee receive no retroactive
   onboarding charge. This describes
   implementation and collection timing, not legal approval or a new commitment.
   Member capacity is pooled across branches; future and frozen membership terms
   reserve capacity. Staff capacity includes owners and pending invitations.
   Member-facing operational email allowances use the Amman calendar month;
   authentication and platform billing/agreement/support/admin mail are exempt.
   Excess operational mail is deferred; no automatic overage charge is implemented.
   Valid operator catalogue overrides remain authoritative.

   Enterprise is publicly **quote-only**, including pricing, onboarding and
   capacity. Its retained negotiated/legacy configuration is JOD 500/month,
   25 branches, 250 owner/staff accounts, 50,000 members and 20,000 operational
   emails/month, with onboarding stored as zero; this is not a public fixed-price
   or free-onboarding promise.

   **Questions for counsel/founders:** confirm tax inclusion, onboarding fee
   disclosure and collection timing, fair-use/email costs, negotiated overrides
   and limits. Terms section 05 says "Onboarding is included"; reconcile that
   wording with the implemented fee. Agreement 1.2 section 4 refers to written
   quotes or published pricing, and section 6 describes onboarding services;
   it does **not** explicitly promise free onboarding. These facts do not record
   founder sign-off or resolve the legal wording.
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
   ID/passport, contact details, contract start date and selected plan. Review the existing full Arabic privacy/terms/DPA/agreement with language precedence
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
subscription agreement, and the attached existing Arabic versions.

The attached brief lists our open entity/pricing decisions and specific
consistency questions. Please begin the review with these points flagged;
we will supply confirmed entity details and commercial approvals separately.
Our launch scope includes Resend email and staff-initiated manual WhatsApp.
Automated WhatsApp is excluded.

Please confirm your proposed scope, fees and turnaround, and identify the
changes needed before launch. We have not treated these drafts as approved.

Thank you,
RIVET

Attachments: REVIEW_BRIEF.md, SOURCE_SNAPSHOT.html and SOURCE_SNAPSHOT_AR.html. No real signed customer
agreement, identity number or production export is included.
