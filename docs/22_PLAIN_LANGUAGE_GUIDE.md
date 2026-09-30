# 22 — Plain language guide for the gym product

RIVET is used by busy people at a gym desk, on the gym floor and on their
phones: owners, managers, sales staff, receptionists, trainers and the gym's
own members. Many of them are not comfortable with software, and many read
English as a second language. Every word on screen has to work for them.

This guide applies to the gym workspace, the member app, sign-in and sign-up.
The marketing site and the RIVET platform console keep their own voice.

## The rules

1. **Write what you would say to a new receptionist.** Short, everyday words.
   One idea per sentence. Aim for 12 words or fewer; never more than 20.
2. **Name things by what people do, not by how RIVET works.** A heading tells
   the person what the section is for ("Payments", "Needs attention"). Never
   an invented name ("Resolve", "Operating brief", "Command center").
3. **Buttons say exactly what will happen.** Verb + thing: "Collect payment",
   "Renew membership", "Add member", "Save". Never "Submit", "Proceed",
   "Execute", "Apply" when a clearer verb exists.
4. **Cut text that only describes the screen.** Keep text that helps someone
   act or avoid a mistake. If a sentence explains RIVET's internal safeguards
   ("RIVET checks your permissions", "each records an audit event", "never
   netted", "deterministic"), delete it.
5. **Say what happened and what to do next.** Empty: "No classes yet. Add
   your first class." Error: "The payment was not saved. Check the amount and
   try again." Never show codes, ids or internal field names.
6. **No symbols in place of words.** Write "this week", "in the last 30 days",
   "to". Not "≤ 7d", "30d", "→" in a sentence. The "·" separator is fine in a
   short list of facts under a name, not inside a sentence.
7. **One word for one thing, everywhere.** Use the word list below. If a
   screen says "unpaid", every screen says "unpaid".
8. **Money and dates people can read at a glance.** "Owes JOD 45.000",
   "Ends 18 Nov 2026", "Expired 3 days ago".
9. **Warn plainly before anything that cannot be undone or moves money.**
   "This gives JOD 40.000 back to the member. It cannot be undone."
10. **Sentence case.** "Add member", not "Add Member". Keep the DESIGN.md
    type rules: human text in Manrope, helper text never below 12px.

## Word list

Use the plain word on the left. The words on the right are allowed only
inside the Management ledger and financial statements (for accountants), or
not at all.

| Say | Instead of |
| --- | --- |
| unpaid, owes | outstanding, balance due, collectible, receivable |
| paid | settled |
| membership | term, subscription (for a member's plan) |
| ends, ended | expiry, expiring, lapsed |
| cash difference | cash variance, variance |
| end-of-day cash count | reconciliation |
| staff | users (people who work at the gym) |
| access | permission, entitlement |
| your gym | organization, tenant, workspace |
| feature | module |
| included in your plan | entitled |
| stock | inventory |
| machine | asset (equipment) |
| repair job | work order |
| maintenance job | facility task |
| area of the gym | zone |
| supplier bills | payables |
| cancel a payment entered by mistake (void) | void (on its own) |
| entry refused | access denial, denied |
| let in anyway | override |
| list | queue |
| download | export (as a button) |
| set up | configure |
| history | audit trail, audit events (outside the owner's Activity log page) |
| agreed to receive messages | opted in, consent (on its own) |
| not sent | suppressed |
| people inside now | occupancy |
| missing information | partial coverage, source not read |

Keep the words gym staff already use every day: member, lead, follow-up,
check-in, freeze, renew, shift, receipt, branch, class, PT, trainer, plan.

## Before and after

| Before | After |
| --- | --- |
| Resolve — what Adnan needs, without leaving the record | Needs attention |
| Unresolved now: JOD 45.000 outstanding · term ends in 3 days | Owes JOD 45.000 · Membership ends in 3 days |
| Renewals ≤ 7d · 26 expired ≤ 30d | Renewals due this week · 26 ended this month |
| Suggestion only. Nothing changes until you act… | (delete) |
| Payment rows need financial report access. | You don't have access to payment details. |

## Checking a change

- Read the screen out loud as if to a new receptionist. Anything you would
  have to explain is too complicated.
- Search your change for the words in the right-hand column above.
- Update the tests that look for the old text. Keep `data-testid` values as
  they are so tests and screenshots stay stable.
