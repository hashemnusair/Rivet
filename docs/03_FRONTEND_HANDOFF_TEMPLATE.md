# 03 — Frontend Handoff Template

The frontend agent must create `/FRONTEND_HANDOFF.md` with the following sections.

```markdown
# Frontend Handoff

## Status

- Completion date:
- Frontend commit:
- Mock mode command:
- Build command:
- Test command:

## Implemented routes

| Route | Purpose | Primary roles | Status |
|---|---|---|---|

## Architecture

- App structure:
- Design system:
- State strategy:
- Form strategy:
- Data-fetching/client boundary:
- Mock persistence behavior:
- Role/permission simulation:
- RTL strategy:

## Data client

- Interface location:
- Mock implementation location:
- Factory/provider location:
- How to add `HttpGymOSApi`:
- How errors are represented:
- Pagination/filter conventions:

## Domain types

- Type/schema locations:
- Any differences from `docs/06_API_AND_MOCK_CONTRACT.md`:
- Decisions the backend must preserve:

## Seed data

- Seed location:
- Reset command/action:
- Scenario coverage:
- Known inconsistencies, if any:

## Authentication preview

- Demo credentials or role-switch mechanism:
- Route guards currently simulated:
- What the backend must replace:

## Critical workflows demonstrated

1. Member creation:
2. Membership sale/renewal:
3. Check-in:
4. Payment/receipt:
5. CRM follow-up:
6. Shift reconciliation:
7. Sensitive-action audit:

## Tests run

- Type-check:
- Lint:
- Unit/component tests:
- Browser tests:
- Build:

## Known gaps

- Functional gaps:
- Responsive/accessibility gaps:
- Visual decisions awaiting approval:
- Mock-only behavior:

## Backend integration order

List the recommended sequence for replacing mocks with real endpoints.

## Files to read first

1.
2.
3.

## Do not break

List important interaction, route, component, and contract decisions that should remain stable during backend integration.
```
