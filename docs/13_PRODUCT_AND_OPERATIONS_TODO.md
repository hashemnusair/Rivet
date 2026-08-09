# RIVET product and operations follow-ups

Updated 9 August 2026. This is the living, prioritized follow-up list for issues discovered during production-shaped verification. Keep secret values, applicant details, and provider credentials out of this file.

## P0 — Finish the disposable production onboarding

- Accept the Clerk owner invitation in a private/incognito browser so the platform-admin and gym-owner sessions cannot mix.
- Confirm the invited identity resolves to the provisioned `Hashem Test` organization with the `owner` role and the first branch.
- Complete the first-owner setup: organization settings, branch details, and one membership plan.
- Exercise lead → member → membership → payment → check-in → timeline/audit → shift reconciliation with disposable data.
- Hide/archive the disposable tenant after verification. Do not run `seed:seedDemoTenant` in Production.

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
