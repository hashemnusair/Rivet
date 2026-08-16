# RIVET investor readiness brief

Last updated: 17 August 2026

## Executive summary

RIVET is a production-oriented CRM and operations platform for gyms. Its core loop is intentionally simple:

**Lead → Trial → Membership → Member record → Payment, check-in, PT, follow-up, and support**

The product is designed for multi-branch gym organizations with role-aware access, tenant isolation, an auditable money trail, and a member-facing experience that can later become a native app shell.

## What is working

- Gym applications, owner access, staff roles, branch scope, and platform support operations.
- Lead and trial workflows with truthful outcomes: trial, membership sold, membership not sold, and did not answer.
- Membership sales, renewals, freezes, extensions, cancellations, charge-specific collections, receipts, refunds, voids, and cash reconciliation.
- Personal training packages, volume pricing, package editing, safe deletion/archive behavior, credit reservations, bookings, cancellations, and trainer visibility.
- Gym branding and public profile management with local media preview, draft/save/publish, gallery handling, replacement, cleanup, and published-version protection.
- Multi-gym member accounts with gym-specific membership views, QR entry passes, check-in history, PT details, activity history, and synchronized member-owned profile fields.
- Two-way gym ↔ RIVET support conversations with persisted replies and resolution history.
- Responsive CRM workspaces, indexed reads, realtime updates, retryable error states, and role-aware navigation.

## Trust and operating model

- Convex enforces tenant, branch, role, ownership, and financial permissions on the server.
- Sensitive actions require reasons and append immutable audit facts.
- Payments use integer minor units and idempotency protection.
- Historical membership and PT sale terms remain immutable through later edits.
- Production verification is controlled and read-only unless a specific action is explicitly approved.
- Live operational email remains disabled by default; configuring a provider does not activate delivery.
- No medical records, native mobile application, marketplace, inventory system, or external card checkout is being claimed as part of the pilot.

## Current product boundary

The core CRM is the pilot product. Automations are intentionally paused behind a clear **Coming soon** state while the Convex foundation and deployment evidence are settled. The automation backend and local tests are preserved, but automated messages are not part of the current operating promise.

The five credential-gated isolated-staging bodies still needing a complete run are:

- Provisioning
- Reception entry
- Member portal
- Isolation/audit
- Automation — deferred rather than active because the product surface is Coming soon

The current release has local and preview coverage for the core workflows. Full role-based staging acceptance, realistic-volume/concurrency evidence, provider-backed delivery, and broader read-only Production visual verification remain explicitly tracked in the living backlog.

## Evidence and next milestones

Exact commit, CI, Vercel, Convex, health, and test evidence belongs in [CURRENT_STATE.md](../CURRENT_STATE.md), not in this summary. The next milestones are:

1. Keep the simplified core CRM stable and observe Production responsiveness and error rates.
2. Complete focused local concurrency and authorization coverage without writing test data to Production.
3. Run the remaining isolated-staging journeys when the role-specific credentials are available.
4. Decide whether and when to resume automations and activate any operational message categories.
5. Replace this brief's evidence references with the exact release links after each material release.
