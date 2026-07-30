# 09 — Decisions and Open Questions

## Decisions already made

- Working title is GymOS.
- B2B gym operations are the product core.
- Frontend is implemented and reviewed separately before backend integration.
- Frontend must run entirely in mock mode.
- The backend later connects through a typed client boundary.
- Initial region is Jordan/MENA.
- Arabic/RTL readiness is required.
- Multi-tenant and multi-branch are foundational.
- The MVP prioritizes members, memberships, CRM, reception, payments, reconciliation, automations, dashboards, and audit.
- Public consumer and trainer marketplaces are future phases.
- Raw biometric storage is out of scope.

## Implementation decisions agents may make

Agents may choose and document:

- Exact visual identity and navigation pattern.
- Authentication provider or local-auth implementation.
- Redis-backed worker library.
- ORM repository conventions.
- Test frameworks.
- Hosting providers.
- Shared-contract generation approach.
- Object storage provider.

Do not let these choices change the product model or acceptance criteria.

## Questions for real customer discovery

These should not block the initial build, but should be answered before a paid rollout:

1. Which access-control devices are common among target gyms?
2. Are memberships predominantly prepaid, installment-based, recurring-card, or manual-renewal?
3. Which local payment methods and receipt/tax requirements are mandatory?
4. How are freezes, discounts, and refunds currently approved?
5. What are common trainer commission models?
6. Do owners need Arabic, English, or both for staff interfaces and receipts?
7. What customer communication channels are actually used: WhatsApp, SMS, calls, email?
8. How should old member spreadsheets and fingerprint-system identifiers be imported?
9. Which reports are requested daily by gym owners?
10. What would make a gym refuse a shared consumer identity/app?

## Pilot decisions to capture later

- Pilot gym profile and branches.
- Existing plans and pricing rules.
- Required custom fields.
- Receipt numbering and tax configuration.
- Approval thresholds.
- Renewal cadence.
- Inactivity thresholds.
- Message templates and languages.
- Data-retention requirements.
- Hardware/integration requirements.

Record product decisions in this file or a dedicated ADR directory rather than burying them in code comments.
