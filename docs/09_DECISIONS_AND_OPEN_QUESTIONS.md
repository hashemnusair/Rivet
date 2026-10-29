# 09 — Decisions and Open Questions

## AI-native product direction — 24 October 2026

Hashem requested an implementation plan for quiet AI embedded in the existing
product, plus agents capable of completing delegable desk work. This authorizes
the product direction described in [docs/23](23_AI_NATIVE_AGENTIC_IMPLEMENTATION_PLAN.md),
including discovery of more useful QOL improvements within existing workflows.
Its milestone sequence and technical contracts are implementation proposals;
this entry does not claim runtime implementation or production activation.

Preserve Next.js/Convex/Clerk/Vercel, `GymOSApi`, current domain approvals and
tenant/branch authorization, the approved UI, Arabic evidence, and the frozen
frontend handoff. AI may prepare work and execute within explicit one-off or
standing grants, with existing sensitive-action requirements enforced. Delegation
must avoid redundant approvals while keeping exact consequential changes
reviewable. Jev remains retired; automated WhatsApp/SMS is not reintroduced.

AI-0 must record the runtime/checkpoint-ownership decision, provider/model
evaluation, data processing/retention, pilot limits, and accountable owners.
Commercial AI allowances and Basic/Pro packaging remain undecided. Local
contracts, fixtures, and workflow implementation can progress while external
provider or commercial decisions remain open. The canonical backlog owns
AI-0 through AI-5; CURRENT_STATE owns actual implementation/release evidence.

Hashem additionally requires a separate feature branch and worktree for AI
implementation, preserving the shared bug-fix checkout and polished product.
Test backend/identity/provider state must also be isolated. Production activation
and merging the implementation to main require a later explicit instruction.
Hashem will supply a free testing endpoint; docs/23 specifies proposed server-only
configuration names and where he can enter the key without committing it.

### AI-0 runtime and model-call ownership — implementation decision, 24 October 2026

Recorded by the implementation agent on `codex/ai-native-rivet` under the docs/23
discovery contract. This is an engineering decision for review, not a provider,
commercial or production-activation approval.

**Decision: Convex-native durable runs.** Run, step, grant, proposal and receipt
state live in new Convex tables. A run advances through internal mutations that
take a lease (token + expiry, fenced on every write), recheck authority and source
facts, call the existing domain operation and record the step receipt in the same
transaction. Model calls happen in Convex internal actions, outside retried
database transactions, through one replaceable adapter. The Convex scheduler and
crons drive progress, recovery of expired leases and standing instructions. Only
existing domain commands commit business state; no second business database exists.

Alternatives compared:

| Option | Why not selected now |
| --- | --- |
| `@convex-dev/workflow` / workpool components | Real durable step journaling, but adds component tables outside the existing tenant-purge/export inventory and a second journal beside the run/step receipts the product must show; current needs (bounded batches, leases, idempotent domain writes) are met without it. Revisit if multi-day waits or large fan-out appear. |
| `@convex-dev/agent` | Thread/message (chat) model and provider SDK assumptions; docs/23 rejects a chat-first surface and forbids assuming an OpenAI-compatible endpoint. |
| eve | Official getting-started documentation (checked 24 October 2026) requires **Node.js 24 or newer**; this repository declares Node >=20, CI uses Node 22 and `convex.json` pins the Convex Node runtime to 22. An external checkpoint owner would also need a separate recovery protocol around Convex commits. Its execution-model page returned HTTP 500 during review, so its state store was not verified. |
| Next.js/Vercel server or Vercel workflows | Scheduled and delegated work must run without a browser and close to the transactional authority; a Vercel-owned runtime would need its own credentials to Convex and a deployment to test. |

Synthetic proof required by AI-0 (crash after commit, duplicate events, lease
fencing, cancellation during a batch, revocation between steps) uses real Convex
functions in the repository's `convex-test` harness.

**Model-call owner and key placement.** The model call is owned by Convex internal
actions, because delayed and standing work run without a browser. Therefore
`RIVET_AI_API_KEY`, `RIVET_AI_BASE_URL` and `RIVET_AI_MODEL` belong in the **isolated
development Convex deployment's Environment Variables dashboard**, never in
production and never with `NEXT_PUBLIC_`. A Next.js `apps/web/.env.local` file does
not configure Convex actions; it is not needed for AI and should not hold the key.
Additional server-only names introduced by the adapter: `RIVET_AI_MODE`
(`off` default, `fixture`, `live`), `RIVET_AI_PROTOCOL` (the explicitly declared wire
protocol: `anthropic_messages` or `openai_chat_json`, both unverified until a real
endpoint is used), `RIVET_AI_PROCESSING_APPROVED` (must be exactly `member_data`
before any member personal data is sent to a live provider), `RIVET_AI_TIMEOUT_MS`
and budget caps. Production leaves `RIVET_AI_MODE` unset, which means off.

**Claude connection (implementation decision, 25 October 2026).** Hashem and Elias
plan to try Claude Sonnet 5.5 with Elias's Claude API account. Claude is the candidate
provider, not yet the approved production provider (open decisions below).
`anthropic_messages` calls the Messages API with Anthropic's official TypeScript SDK
from the Convex action, rather than through a compatibility layer. Each task sends
the same safety rules and minimized input as before, constrains the reply with
structured outputs (the task's JSON schema), and asks for low effort, so short
reading tasks usually skip thinking. RIVET still validates every reply as before. No
sampling settings or thinking switches are sent. The SDK never retries and its
logging is off. A refusal becomes `model_refused`, and the person carries on by hand.
Server-side fallback to another model is not enabled: for Claude Sonnet 5.5 it only
retries cyber and AI-development declines, which gym tasks should not trigger, and it
would bill a second model. This can be revisited if the live evaluation shows
refusals. Spend is computed from published per-token prices: Sonnet 5.5 at $2/$10,
Opus 5.5 at $4/$20 and Haiku 5.5 at $0.10/$0.50 per million input/output tokens.
Deployment price variables cover any other model. Every billed reply counts, including
rejected ones, and live mode is not ready without a price. For Claude, budget
variables are in micro-dollars. The default evaluation model is Claude Sonnet 5.5.

**Fixture mode.** `fixture` uses deterministic bilingual rules for extraction,
drafting and request interpretation so contracts, UI and evaluations work without a
provider. Its results are labelled as test results, and production must never set
it; it is not a production fallback for an unavailable provider.

**Deterministic first.** Facts, eligibility, deduplication, stop conditions, dates,
money and authorization are computed by code from domain records. The model may
phrase, extract or interpret; its output is validated and cannot authorize actions.
Simple batches run as fixed playbooks over typed tools; multi-agent execution is not
used until an evaluated task benefits from it.

**Evaluation protocol (implementation decision, 25 October 2026).** `pnpm ai:eval`
and the unit suite run the same deterministic gate (`apps/web/src/lib/ai/evals`).
Only a held-out set written before the readers last changed may gate. When a
held-out set's failures are used to fix a reader, that set becomes the development
set and a new held-out set is written and committed first (v1 → v2 happened this
way: `5f7bbafe` then `13ca7832`). The same author wrote both sets, so v2 is not
blind to phrasing habits; the live-provider evaluation (AI-5.2) must use the same
cases plus new ones from real staff notes once data handling is approved.
Minimums (note fields ≥ 85%, filters ≥ 75% of cases, revisions ≥ 80%, decision
tasks exact, zero fabrications everywhere) may be raised freely; lowering one needs
a recorded decision here. The deterministic reader is a fixture: its Arabic note
result on v2 (6/12 cases) is not adequate for an Arabic release of reading, which
needs the live reader to be measured on the same set first.

**Autonomy expansion policy (implementation decision, 25 October 2026).** A capability
moves to more autonomy (for example from prepared drafts to saved work, from one-off to
standing instructions, or from a proposal to direct execution) only when all of these
hold, and the change is recorded here with its evidence: (1) a domain rule already
permits the action without a person's approval, and that rule is unchanged; (2) live
evaluation on the held-out set and real pilot use meet the capability's minimums with
zero fabrications for at least four weeks at the gyms concerned; (3) the monthly outcome
summary shows the saved work is being used (done rather than left open or closed another
way) and corrections are falling; (4) the stop controls were rehearsed on that
deployment; (5) the owner of the affected gyms agreed. Money movement, membership
dates, refunds, discounts, messages to members and machine safety never become
autonomous under this policy; they stay with a person through the existing approvals.

### AI release decisions — Hashem, 25 October 2026

Recorded as given by Hashem in the task for this pass. They change the release
path, not the scope of docs/23.

1. **Acceptance happens on production instead of a separate staging deployment.**
   After the merge, assistance is made available only for the disposable
   **"Hashem Test"** gym (platform availability, below). This replaces the staging
   parts of AI-2.7 and AI-5.6; the production procedure is in docs/12 "AI release to
   production".
2. **Candidate provider: Claude Sonnet 5.5 through Elias's Claude API account.**
   Elias pastes the key into the Convex Production dashboard after the release. No
   key is needed or used by the implementation pass. The approval of the provider for
   wider use remains in the decision sheet below.
3. **This pass finishes the plan plus five small gaps** (Today card for a waiting
   proposal, "approve all", dismissals and unnecessary contacts, lead contact consent,
   localised prepared task titles). The other AI-4.10 gaps come in a later pass.

### AI implementation decisions — 25 October 2026 pass

Engineering decisions made while implementing the above, for review. None changes a
commercial term, a provider approval or a gym's data.

- **Platform availability per gym (release blocker).** A new `aiAvailability` table
  (tenant data, purged with the gym) records which gyms RIVET lets use assistance. No
  row means not available, so **no gym is available by default**. Only a platform
  admin changes it, from `/platform/assistance`, with a reason; each change writes a
  platform audit event (`ai.gym.available` / `ai.gym.unavailable`). The server treats
  an unavailable gym as off in every gate (the authority intersection used by member
  surfaces, preparation, runs, standing work and the settings view), and
  `ai.settings.update` refuses to turn assistance or external processing on for it.
  Removing availability stops that gym's queued and running work at its next step,
  like the gym's own switch, and keeps the gym's saved choices, which apply again only
  if a platform admin makes it available again. The preview adapter starts every gym
  unavailable as well, so the preview shows the same first-run state.
- **Server-side live evaluation.** `aiEvaluation:runLive` is an internal Convex action
  (no page or browser can call it). It runs only when `RIVET_AI_MODE=live` and the
  adapter is fully configured, keeps the $1 default spend limit and never goes above a
  $5 ceiling, is not charged to any gym's monthly budget, and returns scores, counts,
  cost and latency only. Running it on production is Hashem's step (docs/12).
- **Model-output cache (AI-1.9) covers live note readings only.** The validated
  provider answer is kept for 15 minutes under a SHA-256 key over the gym, the member
  or lead and its record version, the reader's role, branch scope and permissions, the
  reader's language, and the prompt version, protocol and model. RIVET recomputes
  dates and checks evidence against the current note on every reuse, so a reused
  answer read after midnight resolves "tomorrow" to the new day. Every access and
  policy check runs before a kept answer is served; a reuse makes no call and records
  no spend (it is served even when the month's budget is used up). Kept answers are
  dropped on a member merge or deletion and on any change to roles or staff access,
  expire by cron, and are never kept in test mode. Filter and revision readings are
  not cached: their inputs change with the list or the run, and they were not part
  of the acceptance.
- **Today card.** A waiting proposal appears on Today for each person who holds its
  required permission and can read its run, linking to the work's own page. For a cash
  drawer it takes the place of that drawer's "check the difference" item (one item for
  one situation). It is shown only while the work's capability can run, so a stopped,
  turned-off or unavailable gym never gets a link to a page that cannot show it.
- **"Approve all".** Offered on a run's proposal list when the reader may approve two
  or more waiting proposals; at most 20 in one step. Each proposal runs in its own
  Convex sub-transaction with exactly the checks of a single approval, so one that
  changed, no longer matches or cannot be saved is rolled back on its own and reported
  with its outcome. No current playbook creates more than one proposal per run, so in
  practice the button appears only once a future playbook groups proposals.
- **Dismissals and unnecessary contacts (AI-5.3).** "Hide suggestions" on a note
  reading records a `dismissed` feedback row. "Not needed" on a call RIVET saved
  closes it as cancelled with the outcome "Not needed" if it is still open (with a
  member timeline line), marks the step, is audited (`ai.contact.unnecessary`), counts
  once, and is refused for tasks people created themselves. The monthly summary counts
  both.
- **Lead contact consent.** An additive `doNotContact` record on the lead (when, who,
  optional note), set only through `leads.contact_preference` (audited as
  `lead.do_not_contact` / `lead.contact_allowed`, with a lead timeline line);
  `leads.update` strips it. Lead preparation excludes such a lead before anything that
  would lead to a call, including linking open work, with the existing reason
  "Asked not to be contacted". The Today list's own lead follow-up item is unchanged
  in this pass (open below).
- **Rules tightened by the branch review** (the defects are listed in docs/13):
  - The gym's "Allow member details to be sent" consent applies to every live call,
    because a typed filter or correction can name a member; notes and drafts also need
    RIVET's member-data approval.
  - A waiting prepared change can be approved only while its capability can run: a
    platform stop, the gym switching off or lowering to "Prepare only", a capability
    off or removed availability leaves only rejecting. This replaces the earlier
    behaviour, where people could still approve under a stop.
  - Work belongs to a branch. A branch-limited person's work is always filed under
    their branch; gym-wide work (no branch) is visible only to people who cover every
    branch, plus whoever asked for it; owners and managers limited to selected branches
    see only those branches' runs, proposals and repeating work.
  - A cash approval is prepared only when exactly one recorded movement explains the
    difference; otherwise the person decides through the ordinary review.
  - Handover sections drawn from follow-ups or the open drawer are hidden from readers
    without that access, so the handover still reaches the next person on shift.
  - Budgets and monthly summaries use the gym's own calendar month.
  - Management reports cannot repeat on a schedule (their period is fixed), and
    repeating work never takes a fixed date.
- **Localised prepared task titles.** Tasks RIVET saves keep their English `title` and
  carry a `titleMessage` descriptor in the existing system-message format, extended to
  `communicationCompletion.tasks.*` keys. Only delegated work can store one; tasks
  people create, and older prepared tasks, keep showing their stored title.

### Ask RIVET decisions — 27 October 2026

Hashem asked for a conversation panel with the screen as context by default, records
and files to attach, and polished streaming. Engineering decisions made while building
it, for review; none changes a commercial term, a provider approval or a gym's data.

- **Read-only.** Ask RIVET reads, explains, compares and drafts. Its 13 lookups are
  reads over existing domain read operations (`members.list`, `members.get`,
  `renewal.queue`, `transactions.list`, `dashboard`, `analytics.*` …) run **as the
  signed-in person** through `domain.query`, so every permission, branch scope and
  field rule is the screen's own; a refusal comes back to the model as "no access"
  and is said plainly. The fourteenth tool, `open_screen`, only builds a link to an
  allowlisted RIVET route. There is no tool that writes, books, takes money or sends.
  Writes stay with the existing prepared-work flows and their approvals.
- **One more capability, same gates.** `chat` joins the capability registry as
  prepare-only. It needs the deployment mode, no platform stop, the gym made available,
  gym assistance on and the capability on; in live mode it also needs both the gym's
  "allow member details" and `RIVET_AI_PROCESSING_APPROVED=member_data`, because the
  screen, attachments and lookups carry member data. Spend counts against the same
  monthly cap, and each answer against the per-run cap (`runPublicId` `chat:<message>`).
- **Private conversations, kept 30 days.** A conversation belongs to the person who
  started it; another person, including the owner, reads it as not found. Conversations,
  their messages and files are removed 30 days after the last message (hourly cron) and
  with the gym's data purge.
- **Context by default, attachments on request.** Every message carries a
  `<rivet_context>` block RIVET writes: gym time and timezone, gym, person and what they
  can read (in words), the screen title and route with its filters, and attached records
  as compact summaries (ids, names, dates, exact money; no photos or internal ids; lists
  capped at 25 rows with the total). The screen's record is attached by default and can
  be removed; screens offer one-tap attachments above the message box; `@` attaches any
  member or lead the person can read; images and PDFs upload to Convex storage, are
  resized in the browser to 1,600 px, and are checked by their first bytes before they
  are sent. Everything in the context block, lookups, notes and files is data, never
  instructions (stated in the system prompt).
- **Efficient by construction.** Tools and the system prompt are fixed for every gym and
  turn, so the prefix caches (an explicit marker on the system block plus automatic
  caching of the conversation). A record already sent in the last 10 minutes of a
  conversation is not sent again; the model is told it is above. The three latest answers
  replay with their lookups and results, older ones as words only, files only for the
  latest two turns that had them, and the oldest turns are dropped past ~30k tokens with a
  note. Reasoning blocks are replayed only inside the answer that produced them, never in
  later turns, which keeps history edits safe from the preserved-thinking check.
- **Claude settings.** `claude-sonnet-5-5` (the deployment's `RIVET_AI_MODEL`), adaptive
  thinking with `display: "summarized"` so the panel can show what it is doing, effort
  `low` by default (`RIVET_AI_CHAT_EFFORT` may raise it to `medium` or `high`), 8,000
  output tokens per call, at most six calls per answer with the last forced to a written
  answer (`tool_choice: none`), no SDK retries or logging, a 90 s connection timeout.
- **Priced at cache rates.** Chat calls are priced with cache writes at 1.25× and reads
  at 0.1× the input rate (`chatCallCostMicros`), so spend matches the Claude console;
  the older single-call tasks keep counting cached input at the full rate.
- **Streaming that survives a reload.** Sending saves the person's message and an empty
  answer; the panel then calls the `aiChat.respond` action as the same person. The answer
  streams into `aiChatStreams` (written at most every 60 ms, one write in flight), which
  the panel watches separately from the conversation, so a long conversation is not
  re-sent with every word; the finished answer replaces it in one write. Stop is read at
  every write and at least once a second; an answer the panel never starts is failed after
  45 s and one that stops reporting after 3 minutes, so a conversation can always continue.
- **Presentation.** Model output is untrusted: no raw HTML, no images, links only to RIVET
  records (`rivet://member/<id>`, `rivet://lead/<id>`, rendered as chips), RIVET routes
  and marked external https pages. Text is revealed whole words at a time (Arabic letters
  never change shape mid-word); finished markdown blocks never re-render; half-written
  syntax is closed while it streams. The working state is the RIVET mark lifting its
  plates, not a spinner. The panel docked beside the page from 1,440 px, overlaid it on
  smaller desktops and tablets, and was full screen on phones (replaced on 28 October by
  Wazen's floating window, below).
- **Preview model.** The local preview and tests use a deterministic, labelled "test
  answers" model that runs the same tools on seeded data in English and Arabic. It is not
  an evaluation of Claude.

### Wazen decisions — 28 October 2026

Elias asked for Ask RIVET to become **Wazen** (وزن), a popup that never squeezes the page,
and for Hashem's three follow-ups: separate conversations with their own context, a chatbox
on the home screen, and minimal actions. Elias chose the actions (renew; freeze and end a
freeze), that a renewal adds to what the member owes rather than taking payment, and that
the chatbox lives in the bottom-right corner. These supersede the "Read-only" and
docking points of the Ask RIVET decisions above; the rest stand.

- **Name.** Wazen in English, وزن in Arabic, everywhere a person reads it (window, search,
  shortcut list, assistance settings, audit labels, the system prompt). Code keeps its
  `ask-rivet` / `askRivet` names to avoid churn.
- **A floating window, never docked.** The page keeps its full width at every size. A
  launcher sits in the bottom corner (bottom-left in Arabic); the window opens from that
  corner at 420 × 680 px, and "Make larger" grows it to 1,040 × 900 px (within 16 px of
  the edges) with the conversation list beside the chat from 900 px wide. Below 640 px
  wide or 540 px tall it is full screen. Following a link shrinks the large window so the
  screen shows, and closes it on a phone. The size is remembered per browser; the open
  state and conversation per tab, as before. Pages end with room to scroll their last row
  clear of the launcher; toasts sit above the launcher, beside an open window when there
  is room, otherwise above its message box.
- **Conversations.** Each conversation keeps its own history and context on the server
  (unchanged); the window now lists them under day headings with search, rename (new
  `ai.chat.rename`, owner only, 80 characters) and delete, as a view in the small window
  and a side list in the large one. A half-written message survives a look at the list.
- **Home screen.** On the dashboard the launcher is a message box ("Ask Wazen anything…")
  in the same corner; sending opens the window with the question. Phones get the round
  button. The dashboard layout itself is unchanged.
- **Confirmed actions, three of them.** `propose_renewal`, `propose_freeze` and
  `propose_unfreeze` only read, as the person, and check the change the way the server
  would (renewal target and date rules, the plan still sold, freeze within the term and
  the plan's remaining freeze days, a freeze in progress to end). The person needs
  `memberships.sell` (renew) or `memberships.freeze` (freeze, end a freeze), or no card is
  offered. The answer then shows a card. Only the person's **Confirm** runs the existing operation
  (`memberships.renew`, `.freeze`, `.unfreeze`) through `aiDomainPort.executeApproved`,
  as them, in the same transaction that marks the card done, with the operation's own
  permission checks, validation, timeline and audit, plus an `ai.chat.action.confirm`
  audit row that names Wazen. Inputs are rebuilt from the stored card only; a renewal
  carries the idempotency key `wazen:<message>:<part>`.
- **Guards.** A card can be confirmed for 30 minutes after its answer finished, once, by
  the person whose conversation it is, while assistance is still available, and only if
  the term's end date and status are still what Wazen read; otherwise it refuses and
  nothing changes. At most three proposals per answer. Freeze and end-freeze reasons are
  the person's own words; the prompt forbids inventing one and the tools require it.
  Wazen cannot change prices, plans, dates or discounts, take or refund money, cancel, or
  message anyone.
- **Money.** A renewal uses the plan's listed price and is charged to the member; nothing
  is paid. Its charge falls due when the new term starts, so the card says so and offers
  "Collect payment" only when the term starts today.
- **The assistant learns the outcome.** The next message's context lists earlier
  proposals and whether they were confirmed (with the saved dates) or dismissed, so Wazen
  never re-proposes or claims a change it did not see happen.
- **Member profile layout.** Contact actions (WhatsApp, log contact, note, task) moved into
  the header card; the four figures are one strip; "Find a class" became a **Classes** tab
  beside PT (shown only where the class finder is available); the details column sits
  beside the tabs from 1,280 px and two across under them on laptops and tablets.

#### How the window opens — 29 October 2026

Elias did not like the window simply appearing, asked that typing open it, that the
expansion stay on the same lines, that the arrow become the send button, and that pills
go in favour of the design sheet's rounded rectangles. This supersedes "sending opens the
window" and "the round button" above.

- **Typing opens it.** The home screen's box is as wide as the window (420 px). The first
  key typed (or pasted; after composition for IME input) opens the window and moves the
  words and the caret into its message box, so typing simply carries on there. Nothing is
  sent until the person sends it. The box's arrow, or ⌘J, opens it empty.
- **It grows out of its launcher.** The window opens upward out of the launcher showing
  (the home box, or the corner button elsewhere), keeping that launcher's side and bottom
  edges, and settles back into it on close; it also moves between its two sizes. The home
  box's arrow travels to the window's send button and back. Only the frame changes size;
  the contents hold their final size in the bottom corner so nothing re-wraps while it
  moves. Open 380 ms, close 260 ms, resize 320 ms on `cubic-bezier(0.2, 0, 0, 1)`: longer
  and gentler than DESIGN.md's overlay timing on purpose, because the window travels much
  further than a menu. Phones keep the rising full-screen sheet; reduced motion gets none
  of it.
- **Shapes.** Launchers are rounded rectangles (8 px box and corner button, 6 px arrow),
  and the window has the 8 px panel corner. No pills.

### AI decision sheet — proposed, awaiting Hashem/Elias

Each line is a recommendation from the implementation agent, **not an approval**. The
code ships with the conservative default in the last column until a person decides.

**AI-0.1 capability inventory review** (the table under AI-0.1 in docs/13)

| Decision | Recommended answer (proposed, awaiting Hashem/Elias) | Default in code until decided |
| --- | --- | --- |
| Accept the five classes (read, prepare, execute within a grant, existing approval, physical/unsupported) as the release inventory | Accept as written; revisit a row only when its AI-4.10 slice is built | Table is documentation only; it grants nothing |
| Rows that stay with people | Confirm: check-in overrides, payments, refunds and voids, physical cash counts, machine safety and repairs, messages to members | Not delegable in code |
| Capabilities to enable for the "Hashem Test" acceptance | Every built capability in "Prepare and save work", external processing on | Each gym off until its owner turns it on, and only once available |
| Remaining AI-4.10 gaps | Defer to the next pass (decision 3 above) | Not built |

**AI-0.7 provider, data, budgets, packaging, pilot and owners**

| Decision | Recommended answer (proposed, awaiting Hashem/Elias) | Default in code until decided |
| --- | --- | --- |
| Provider and model | Claude Sonnet 5.5 (`claude-sonnet-5-5`, `anthropic_messages`) for the Hashem Test acceptance; decide wider use after the server-side live evaluation meets every minimum | `RIVET_AI_MODE` unset (off) |
| Provider data processing, retention and region | Confirm Anthropic's current commercial API terms (data use, retention, region) for Elias's account before any real gym's member data is sent; until then member data goes only to the provider from Hashem Test, which holds test records | `RIVET_AI_PROCESSING_APPROVED` unset: notes and drafts never sent |
| Member-data approval for the acceptance | Set `RIVET_AI_PROCESSING_APPROVED=member_data` for the Hashem Test acceptance only; availability keeps every other gym off | Unset |
| Monthly budget per gym | $5 (`RIVET_AI_MAX_MONTHLY_COST_MICROS=5000000`); one note reading is about $0.0014 at Sonnet 5.5 prices, so about 3,500 readings | Unset: live mode spends nothing |
| Budget per run | $0.50 (`RIVET_AI_MAX_RUN_COST_MICROS=500000`) | Unset (only the monthly cap applies) |
| Evaluation spend | $1 default, $5 ceiling per server-side run | As recommended |
| Basic/Pro packaging, allowances, pricing | No AI in Basic/Pro pricing during the pilot; pilot gyms free; decide a package after a month of measured cost and use | No entitlement change |
| Pilot gyms | "Hashem Test" for acceptance (decided above); one friendly gym after two weeks of clean Hashem Test evidence | None available |
| Incident owner | Hashem | None named |
| Platform stop and availability owner | Hashem (platform admin); Elias as backup | Any platform admin can act |
| Provider key and spend owner | Elias: holds the key, rotates it, watches spend in the Claude console | No key |
| Standing authorities beyond preparation | Keep to internal tasks, reports and handovers (autonomy policy above) | As recommended |
| Today lead follow-up item for a do-not-contact lead | Hide it, or show it without "Log contact"; small follow-up | Unchanged in this pass |

### AI open decisions — not approved by the implementation work

| Decision | Owner | Current default in code |
| --- | --- | --- |
| Model provider/endpoint for wider use | Hashem | `RIVET_AI_MODE` unset (off); fixture for local/CI. Claude Sonnet 5.5 is the decided candidate for the Hashem Test acceptance (above) |
| Provider data processing, retention and region; member-data approval | Hashem (with counsel as needed) | Member data never sent to a live provider unless `RIVET_AI_PROCESSING_APPROVED=member_data`, the gym is available and the gym enabled external processing |
| Pilot budgets in currency (per run, per gym per month) | Hashem | Code caps exist but stay unset/zero-spend; live calls refuse when a cost is reported without a configured budget |
| Basic/Pro AI packaging, allowances and pricing | Hashem/Elias | No entitlement change; no gym available by default |
| Pilot gyms beyond Hashem Test, accountable owners, incident responsibility | Hashem/Elias | Only a platform admin can make a gym available |
| Which standing authorities may run unattended beyond preparation | Hashem after measured evidence | Standing instructions limited to internal tasks/reports/handovers |

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
- New members default to **Marketing: Opted in** across manual creation, lead conversion, and imports. An explicit opt-out must be preserved. The system-applied default is a product preference, not a claim that the member actively gave consent; preference provenance and withdrawal history remain tracked in the canonical backlog.
- Membership plan changes create a linked successor term and a full replacement-plan charge. Staff may schedule a change for the next renewal; roles with date-override authority may make it effective immediately, which supersedes the prior term with an auditable reason. RIVET does not invent proration, automatic credits, or refunds in the pilot; any financial adjustment is a separate deliberate operation.

## Approved architecture override — 2026-07-31

The product owner selected **Next.js + Convex + Clerk + Vercel** for the active implementation. This is the approved alternative allowed by `AGENTS.md` and supersedes the earlier FastAPI/PostgreSQL/Redis default in `docs/04` for new backend work.

- Convex owns persistence, server functions, realtime queries, file storage where needed, and scheduled/durable application work.
- Clerk owns authentication and organization identity; Convex remains authoritative for tenant data, branch scope, operational roles, permissions, and audit events.
- Vercel provides the Next.js server runtime required by Clerk's request proxy.
- The documented domain invariants, API boundary, multi-tenant isolation, money representation, audit requirements, and acceptance tests remain binding even where the implementation mechanism changes.
- The existing mock adapter remains available only as a preview/testing mode while each workflow is migrated vertically to Convex.
- Gym owners do not self-provision workspaces. The public `/signup` route submits a reviewed application with the gym name, owner name, email, contact number, and selected plan. RIVET creates the organization and issues gym access only after approval; `/login/gym` is sign-in only for invited teams.

## Domain topology — 2026-08-04

The product owner selected one Vercel project with hostname-specific entry points for the first release:

- `rivetjo.com` redirects to `www.rivetjo.com`.
- `www.rivetjo.com` is the public landing and marketing surface.
- `app.rivetjo.com` is the member portal and future PWA surface.
- `dashboard.rivetjo.com` is the gym workspace for owners, managers, reception, and sales.
- `platform.rivetjo.com` is the canonical RIVET platform-owner console.
- `admin.rivetjo.com` is a compatibility alias that redirects to `platform.rivetjo.com`.

All of these domains currently attach to the `rivet-web` Vercel project. The Next.js request proxy maps each hostname's entry points to the existing `/customer`, gym workspace, and `/platform` route trees. Hostnames are navigation and canonical-URL boundaries only; Clerk and Convex authorization remain the security boundary.

## Release hold — production Convex and Clerk configuration (2026-08-06)

`rivetjo.com` is now attached to the live `rivet-web` Vercel project. The apex redirects to `www.rivetjo.com`, and both responses are healthy. DNS records for the Clerk production instance have been added, and a first production Clerk user has been created. The remaining release hold is verification, not another frontend redesign:

- Confirm that the latest production build actually contains the configured `NEXT_PUBLIC_CONVEX_URL` and `NEXT_PUBLIC_DATA_MODE=convex`; a variable can exist in Vercel without being present in an already-built deployment.
- Confirm that Convex production trusts the same Clerk production issuer configured in Vercel (`CLERK_FRONTEND_API_URL`). A signed-in browser must resolve its Convex identity and role rather than falling back to preview/seeded accounts.
- Google sign-in is intentionally deferred. Email/password is the supported pilot path; Google can stay disabled until a project-owned OAuth client is worth the maintenance cost.

### Ordered `rivetjo.com` release checklist

Complete these steps in order. Keep development/preview and production Convex deployments separate; never copy a production deploy key into Preview.

1. **Verify the production Convex deployment.** Confirm the production deployment URL and deploy key, run `pnpm convex:deploy` from the repository when the schema/functions change, and set these Convex-side variables:

   ```text
   CLERK_FRONTEND_API_URL=<production Clerk issuer URL>
   CLERK_SECRET_KEY=<production Clerk secret>
   ENTRY_PASS_SIGNING_SECRET=<random Convex-only secret>
   RIVET_SITE_URL=https://www.rivetjo.com
   ```

   `CLERK_FRONTEND_API_URL` must be set in Convex because `convex/auth.config.ts` reads it there. Setting it only in Vercel leaves every Convex query unauthenticated. Convex environment variables are deployment-specific and `convex env set` defaults to Development, so use `--prod` on every production command (or select the production deployment in the dashboard). Verify the target with `pnpm --filter web exec convex env list --prod --names-only` without printing secret values.
2. **Verify Vercel Production variables and redeploy.** Set the following in the `rivet-web` project with `apps/web` as the root directory, then trigger a fresh production deployment from `main`:

   ```text
   NEXT_PUBLIC_DATA_MODE=convex
   NEXT_PUBLIC_CONVEX_URL=<production Convex URL>
   NEXT_PUBLIC_CONVEX_SITE_URL=<production Convex site URL>
   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_…
   CLERK_SECRET_KEY=sk_live_…
   CLERK_FRONTEND_API_URL=<production Clerk issuer URL>
   NEXT_PUBLIC_SITE_URL=https://www.rivetjo.com
   CONVEX_DEPLOY_KEY=<production Convex deploy key for the trusted Convex deploy command; not a browser variable>
   ```

   The production build now stops with a clear error when the public Convex URL or Clerk publishable key is absent. The repository pins Vercel's application build to `pnpm build`; run `pnpm convex:deploy` separately from a trusted environment with `CONVEX_DEPLOY_KEY` so a Preview build cannot accidentally deploy or mutate Convex.
3. **Keep Google deferred unless the pilot requires it.** Email/password is enough to validate the first gym workflow. If Google is enabled later, create a project-owned OAuth client and add the production callback/origin values shown by Clerk.
4. **Verify the production Clerk issuer in both runtimes.** The Vercel publishable/secret keys must be `pk_live_…`/`sk_live_…`, and the production `CLERK_FRONTEND_API_URL` must be set in both Vercel and Convex. Clerk's development users do not transfer between instances.
5. **Verify the public gym application.** Submit a test application from `/signup` and confirm that `gymApplications` contains the gym name, owner name, email, contact number, selected plan, and `pending` status. Configure Resend in Convex with `RESEND_API_KEY`, a verified `RESEND_FROM_EMAIL` (normally `noreply@rivetjo.com`), and `RIVET_APPLICATION_RECIPIENTS`; confirm both the applicant confirmation and the partner notification arrive. Do not provision a workspace from the public form.
6. **Review applications in the platform console.** Open `/platform/applications`, move a submission to review, approve or reject it with a reason where required, and confirm the decision email plus immutable platform audit event.
7. **Provision an approved gym from the platform console.** The protected **Provision gym workspace** action creates the Convex tenant, first branch, subscription assignment, default roles/settings, Clerk organization, and owner invitation. RIVET keeps its own internal organization slug; Clerk organization slugs are optional and do not need to be enabled. Confirm the application changes to `completed`, the workspace is visible to the owner, and the invitation link reaches `/login`. Retry only from the application detail if an external Clerk request fails; the action is idempotent and records the failure.
8. **Run the trusted smoke.** The isolated Development Clerk session and the five GitHub Actions secrets (`CONVEX_DEPLOY_KEY`, `NEXT_PUBLIC_CONVEX_URL`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, and `PLAYWRIGHT_CLERK_STORAGE_STATE`) are configured; the focused smoke passes locally against `fleet-otter-621`, and manual `GymOS CI` run `31257271522` passed all jobs on `main`. Rerun it after rotating the staging identity or session state. This verifies Clerk-to-Convex tenant access rather than only checking that the landing page renders.

Until this checklist is complete, the site is a public marketing preview, not a real-gym pilot. Accounts created against the development Clerk instance must be recreated in production.

### Environment progress — 2026-08-08

- Convex production has a completed backup export from 8 August 2026. Production data remains intentionally unseeded; do not run `seed:seedDemoTenant` against production without an explicit pilot-data decision.
- Vercel Preview now uses `NEXT_PUBLIC_DATA_MODE=mock`; Production uses `NEXT_PUBLIC_DATA_MODE=convex`. The runtime now honors that explicit Preview mode even though Vercel builds run with `NODE_ENV=production`, while the Production build validator requires `convex`. `NEXT_PUBLIC_CONVEX_URL` and `NEXT_PUBLIC_CONVEX_SITE_URL` are Production-only; masked Clerk values remain Preview-scoped and must be reviewed or replaced with a dedicated staging pair before an authenticated Preview deployment is used.
- A fresh local Convex development deployment, `dev/hashem-nusair` (`fleet-otter-621`), is configured with the isolated Development Clerk issuer, a development-only entry-pass secret, the current schema/functions, and the idempotent reference seed. It is not production or a pilot tenant.
- GitHub Actions now has all five non-production smoke inputs: `CONVEX_DEPLOY_KEY`, `NEXT_PUBLIC_CONVEX_URL`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, and `PLAYWRIGHT_CLERK_STORAGE_STATE`. The focused smoke passed locally and manual CI run `31257271522` passed with the signed-in Development Clerk session.

## Implementation decisions agents may make

### Convex completion decisions — 2026-08-04

- `ConvexGymOSApi` is the sole production adapter. `MockGymOSApi` remains available only for explicit non-production preview/test mode; production forces Convex and fails closed when its URL or authenticated session is missing.
- Convex stores the operational model in a normalized `domainRecords` fact table plus explicit foundation, audit, idempotency, sequence, and entry-pass tables. The adapter maps those records into the existing typed `GymOSApi` contract and preserves UUID public IDs.
- Clerk subject resolution, organization membership, role permissions, branch scope, platform-admin checks, stable errors, and append-only audits are server concerns. Browser gates are usability only.
- Staff invitations use a server-only Convex action calling Clerk's invitation API. `CLERK_SECRET_KEY` is a Convex/Vercel server secret and is never sent to browser code. Invitation failures remain visible and audited.
- Approved gym applications use a separate protected Convex action for provisioning. It creates stable tenant/branch identifiers, a trial organization with the selected plan, default settings and role definitions, an owner membership, a Clerk organization, and an idempotent owner invitation. The public application route never creates access; the platform-admin console is the only entry point.
- Customer entry passes use a 15-minute HMAC-signed token, are stored/consumed in Convex, are branch-bound, and are not the prior demo QR value. `ENTRY_PASS_SIGNING_SECRET` is Convex-only.
- Member CSV imports use a server-persisted preview followed by resumable chunks of at most 100 rows. Each chunk has an idempotency key; invalid and duplicate rows are reviewable/skipped, and preview/commit events are audited.
- Free-trial bookings use one shared lifecycle record linked to the gym-scoped CRM lead. Staff can confirm, complete, record a no-show, or cancel from the lead. Cancellation closes the lead; no-show returns it to active contact and creates a high-priority recovery task; completion creates a next-day post-trial follow-up. No-show/cancellation require reasons, terminal outcomes cannot be silently reopened, conversion marks the member-facing booking converted, and every transition is audited. These are MVP defaults to validate with the pilot gym.
- Until the typed client boundary gains a subscription-aware adapter, operational queries and member experience data use a four-second background refresh in Convex mode. Background refresh never reopens the full-page loading gate. This is an explicit MVP consistency compromise: it gives cross-browser updates without coupling page components directly to Convex, while native subscriptions remain a later latency/efficiency optimization.
- Automation evaluation runs from a Convex scheduled function every 15 minutes. The default delivery mode is sandbox/log, quiet hours suppress delivery, and execution/attempt records carry daily deduplication keys and retry metadata.
- Platform billing collection and outbound messaging remain provider adapters. The MVP persists platform ledger/support records and exposes no fabricated external success.
- The final real-data release sequence is credential-gated: Clerk production/custom-domain setup and access to the selected Convex/Vercel deployments are external steps, documented in the README and `CURRENT_STATE.md` rather than simulated in code.

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

## Interim approval semantics for the MVP

Until pilot-specific thresholds are configured, the reference workflow treats a refund above JOD 25.000 as a completed, immutable financial transaction that requires post-action manager review. The review records approval or rejection for accountability; rejection never deletes or rewrites the refund. The actor must already hold `payments.refund` to issue or review it. Discounts above the actor's configured limit and cash-shift variances remain reviewable through their own permissions. Every review is an append-only record, and audit queries derive the displayed decision from that record rather than mutating the original event.

The JOD 25.000 refund-review threshold is an explicit MVP assumption, not a final policy. Replace it with a tenant setting after pilot discovery establishes the required thresholds and whether any gym needs pre-authorization instead of post-action review.

## Tenant operational-policy defaults — 2026-08-09

Entry and membership rules are now tenant settings enforced by Convex, not presentation-only preferences. Until a gym explicitly changes them, RIVET warns (but does not block) for outstanding balances, warns seven days before expiry, suppresses duplicate scans for two minutes, opens the renewal queue fourteen days before expiry, requires at least a one-day freeze, caps manual extensions at 365 days, and prevents overlapping membership terms. Operating-hour enforcement is off by default so an unconfigured branch cannot accidentally lock out every member.

When hours are enabled, each active branch receives a seven-day local-time schedule and outside-hours entry is blocked unless an authorized manager records an override. Membership branch transfers require the date-override permission and a reason, update both the membership and the member's home branch, and append timeline plus audit events. These defaults are pilot assumptions; each gym owner should confirm balance policy, hours, freeze minimum, renewal cadence, overlap handling, and extension authority during onboarding.

## Management-ledger audit policies — 2026-08-31

The forensic statements audit (docs/18) fixed defects and made three policy
decisions explicit:

- **Voids are dependency-gated.** A void source posts only when the original
  payment source is already posted; otherwise it is `excluded` because there
  is no ledger effect to reverse. Refunds deliberately remain standalone
  (their cash-out is a real event even when the collection is still pending).
- **Cash-flow classification is `cashflow-classification.v2`.** Cash = cash
  on hand plus card/bank-transfer clearing. Classification is by non-cash
  counterparts with investing → financing → operating priority; all-cash
  entries are internal transfers excluded from the sections; mixed-activity
  compound entries warn and should be posted as split journals.
- **The balance sheet reports `cumulativeEarnings`** (revenue − costs from
  ledger inception; there is no period close). `currentEarnings` remains a
  deprecated equal-valued alias for one release. A retained-earnings close, a
  supplier-payment source type, and refund-shortens-service semantics remain
  open owner/accountant decisions recorded in docs/18 §4.

## Legal, e-signature, email and messaging go-live — 2026-09-03

- **Legal documents are published in the app**, not on a separate site:
  `/privacy` and `/terms` (with the data processing addendum), version
  1.0 · 3 September 2026, written for review by a Jordanian lawyer before the
  first real signature. RIVET's contact details (Instagram @rivet.jo, phone
  077 837 8608, WhatsApp) live in one constant and appear in every footer.
- **The subscription agreement is signed inside RIVET with RIVET's own
  e-signature, in a modal the owner cannot close.** The text is code-owned
  and versioned (1.1 · 3 September 2026; 1.0 was never signed for real); the
  server publishes its SHA-256 and the browser hashes what it displayed, with
  a mismatch flagged for review, never silently rejected. The flow is read
  (agree unlocks only at the end of the text), details, sign. **Decided:**
  ask only what a binding agreement needs: registered gym name, address,
  owner's name, national ID or passport number, contract start date, then a
  drawn or typed signature and two declarations; the plan comes from the
  account RIVET set up and the signer's copy goes to the account email.
  Trade name, registration number, branches, role, phone, quote, term and
  place of signing stay optional in the record and are not asked for.
  **Decided:** every signing is copied to elias@rivetjo.com and
  hashem@rivetjo.com as well as to the signer, through the operational email
  boundary, with the ID masked, and each copy carries the agreement as a PDF.
  **Decided:** the PDF is produced by RIVET's own dependency-free writer
  rather than a service or an npm library, so the server and the browser
  build the same bytes and nothing about a contract leaves the platform to be
  rendered. It draws Latin text only; Arabic in a typed field appears as
  question marks in the PDF and correctly everywhere else. **Decided:** the ID number is stored in the
  agreement row on Convex (encrypted at rest), masked everywhere, never in
  audit payloads or emails, and revealed only by a platform admin with a
  reason and an audit event. **Open:** field-level encryption of the ID
  number and capturing the signer's IP address both need a trusted server
  hop (a Next.js route or Convex HTTP action); neither is in this release and
  the privacy policy wording reflects what is actually recorded.
- **Operational email has one go-live flag**, `RIVET_EMAIL_MODE`
  (off/sandbox/allowlist/live). Off is the default and the fallback for
  anything unrecognised. The legacy boolean is honoured as `live` only while
  the new variable is unset. **Open [decide]:** the sending domain and DMARC
  policy, and the date to move Production from `allowlist` to `live`.
- **WhatsApp/SMS use Twilio as the single provider** behind
  `RIVET_MESSAGING_MODE` plus a per-gym "External delivery" switch; both must
  be on. Quiet hours defer instead of dropping. The reviewed utility template
  catalogue is code-owned and bilingual. **Open [decide]:** Twilio versus the
  Meta Cloud API for WhatsApp, the Meta business verification and template
  approval timeline, the STOP/إيقاف inbound handling (Twilio Advanced Opt-Out
  for SMS; WhatsApp needs an inbound webhook), and who pays message costs
  per tier.
- **Pricing tiers stay provisional.** Starter, Growth and Pro are live in the
  product with their limits and prices; the platform pricing page says so and
  docs/19 carries the sign-off sheet. Nothing is quoted as final until signed.

## Membership revenue posts in full at sale — 2026-09-01

The owner reviewed the deferred model live and retired it for new sales:
`membership-sale.v2` / `membership-renewal.v2` post the full net price as
immediate revenue (1200 → 4100). No service-day split, no monthly recognition
clicks, no fils from allocation on new sales. Accepted trade-offs: revenue is
front-loaded to the sale month, and a mid-term cancellation does not claw
back revenue automatically (refunds reverse cash only; further adjustment is
an owner manual journal). Already-posted deferred v1 terms keep their
recognition schedules until run-off or an owner reversal-and-repost; queue
rows projected under v1 stay pinned to v1. In the same session the owner
approved audited **review exclusions** (`accounting.source.exclude` /
`.reconsider`, owner/manager with reason) so never-postable facts stop
counting toward statement completeness warnings, and warnings stopped
counting `excluded` rows or not-yet-due current-month schedules. Details in
docs/18 §7.

## Supplier payments settle accounts payable — 2026-09-02

Accepted policy: a supplier payment is an operational fact recorded by an
owner or manager (`operations.manage`) against one supplier's received
purchase orders, oldest first, never exceeding what is outstanding and never
leaving a credit balance. Cash comes out of the branch's open cash drawer
and is part of shift and reconciliation truth; bank transfers and CliQ are
recorded with the reference staff typed and are never claimed as verified.
The ledger settles 2100 against 1100 (cash) or 1120 (bank transfer, CliQ)
under stable per-method policy codes; a reversal is the opposite entry and
only posts after the original did. Recording and posting remain separate
steps, and every screen says which one has happened.

Decisions taken in the same change: payables read access reuses
`reports.financial.read` or `operations.manage` rather than a new permission
(no catalog migration); reversing a cash payment after its shift closed
puts the cash into the shift open at reversal time rather than rewriting the
closed shift; due dates are shown only when a supplier recorded one.

Still open for the owner/accountant: how to attribute costs that have no
supplier account (equipment, repairs, facility supplies, private purchases)
so they can be settled without a manual journal; whether supplier credit
notes should exist; whether partial receipts should create partial payables
before an order is fully received.

## Member app on the home screen — 2026-10-29

Elias asked for the member portal to work like a phone app from a home-screen
shortcut, with a tutorial and an add-to-home-screen button that keeps coming back.
Decisions taken in that change (assumptions, open to the owners):

- **Members only.** Only member pages (`/customer/*`, `/login/member/*`) link the web
  app manifest. The gym dashboard and platform console offer no install, so staff are
  never offered "RIVET Member". The manifest keeps its `/manifest.webmanifest` address
  so phones that already installed it keep receiving updates.
- **One button, two paths.** Where the browser offers its own install prompt (Chrome,
  Edge, Samsung Internet on Android and computers), the button opens it in one tap.
  Everywhere else (every iPhone browser, in-app browsers, a declined prompt) it opens
  the step-by-step guide.
- **The guide.** Three steps per phone family (iPhone: Share, Add to Home Screen, Add;
  Android: menu, Add to home screen / Install app, Install), the detected phone first
  and the other one tab away. In-app browsers (Instagram, Facebook, TikTok, app web
  views) are told to open the page in a real browser, with a Copy link button.
  Computers get a QR code that opens RIVET on the phone. Arabic button names follow
  what an Arabic-language phone shows (unconfirmed on a device:
  «فتح كتطبيق ويب», Samsung's «إضافة صفحة إلى», the apps' «فتح في المتصفح»).
- **The reminder.** A slim bar under the member header, on phones and tablets only,
  never in the installed app and never on the getting-started page (which has its own
  card). "Not now" hides it for 3, then 7, then 14, then every 30 days. It stops when
  the app installs on that device, when Chrome on Android reports the app installed
  (`getInstalledRelatedApps`), or when the member taps "I already added it". All of this
  is per browser (`localStorage`), because installation is per device; an iPhone's
  Safari cannot see that its home-screen app exists, hence the "already added" answer.
  The account menu always has "Add to home screen" outside the installed app.
- **Onboarding.** Opening RIVET from the home screen, or installing it, completes the
  member's optional "Install RIVET" setup step for that account.
- **Not done on purpose.** No iOS splash images (the paper background already matches
  the first screen), no manifest screenshots (they would show demo data), no
  pull-to-refresh on iPhone, and no caching of member data for offline use (unchanged
  privacy policy in `public/sw.js`).

## Gym workspace on phones — 2026-10-29

Elias decided that the gym workspace on a phone keeps only the most important daily
work and that the rest is not shown on phones at all. He chose the list and the
behaviour; the implementation details are assumptions, open to the owners.

- **On phones (Elias).** Dashboard (key numbers only), Reception (check-in, renew, take
  payment), Members and member profiles, Classes, Personal training.
- **Not on phones (Elias).** Every other page: Checkout, Daily checklist, Stock &
  purchasing, Leads, Follow-ups, Payments, Reports, Statements, Activity log, Downloads,
  Support, Settings, Getting started, plans, automations and the rest. The phone menu
  and search do not list them, and opening one (a link, bookmark or notification) shows
  "This page is for a computer or tablet" with a button to Reception (Elias chose the
  message over a silent redirect).
- **Tablets keep everything (Elias).** Reception desks often run on tablets.
- **What counts as a phone (assumption).** A touch screen (`pointer: coarse`) whose
  shorter side is under 600 CSS px, measured on the screen rather than the window: a
  phone turned sideways is still a phone; a narrow desktop window or a tablet in split
  view is not. The smallest common tablets (7-inch Android, iPad mini) are 600 px or
  wider. Desktop browser tests at 390 px therefore still see every page; the phone
  checks in `e2e/phone-pages.spec.ts` emulate a touch phone.
- **Inside the phone pages (assumptions).** Add member (`/members/new`) stays, as the
  start of a sale at the desk; Import and Duplicates do not, and their buttons are hidden
  on phones. Receipts (`/payments/receipts/*`) open, because taking a payment links to
  one. The subscription agreement page opens, so a new owner on a phone is not locked
  out. Reception hides its "shift history" link; opening and closing the drawer stay.
  The account menu keeps language and sign-out only.
- **Dashboards on phones (assumption).** Owner, manager, sales and reception dashboards
  show the greeting and the key numbers only; the lists, charts and tables below are for
  a computer or tablet. Sales loses its Follow-ups button. The trainer dashboard is
  unchanged, because everything on it is Personal training.
- **Not access control.** This is about screens. The same person opens every page their
  role allows on a computer or tablet, and the server still checks every call. Wazen
  (when available) is unchanged on phones and may link to a page that then shows the
  message.

## Member sign-up and setup fixes — 2026-10-29

Elias reported, from a phone on `app.rivetjo.com`: the sign-up page's top-right link ran
into the heading; a new member was asked for phone and gender again after signing up;
the setup guide did not update by itself and asked a member with no membership to open
it; Install RIVET said "Review" and did nothing; the install section had filler text.
Decisions taken in the fix (assumptions, open to the owners):

- **Bar links.** On sign-up the top-right link is just "Sign in" (the form already says
  "Already have an account? Sign in" under its button). A visitor who is already signed
  in, such as one finishing their profile, sees no sign-in or sign-up link there.
- **Sign-up details are kept until saved.** Before Clerk activates the session, the
  sign-up page keeps name, email, mobile, gender and where it was heading in
  `sessionStorage` for this tab (never the password; an hour at most). If the page
  saves the profile itself it waits up to about 15 s for the new account to exist in
  RIVET. If the signed-in redirect takes the member to the account resolver first, the
  resolver saves the kept details instead of showing the form; the form appears only if
  that fails, already filled in.
- **Setup steps follow the member's situation.** With a membership: profile, My Gyms,
  entry QR, payments and receipts, install. Without one: profile, "Find a gym"
  (recommended, marked done by the member) and install, so a newcomer is never left
  with a required step they cannot finish. The member checklist is live (a Convex
  watch); gym checklists still load once, because their reads cover whole collections.
- **Install.** The install step opens the same add-to-home-screen flow as the reminder
  bar and shows no button once RIVET is installed. The separate "Install and
  notifications" section is gone; a "Reminders" section appears only where web push is
  configured, without the offline and "own devices" notes.

## Member dock works like X's tab bar — 2026-10-29

Elias asked for the member app's Home / Payments / Explore dock to behave like X's
(pressing has a visible effect) and to switch instantly, like X and Instagram.
Decisions taken (assumptions, open to the owners):

- **Instant.** The member pages are rendered per request, so their links prefetched
  nothing and every tap waited for the server. The dock and the desktop header links now
  prefetch their pages in full (`prefetch`), refresh that every four minutes and when
  the app returns to the foreground, and Payments' data is loaded before the first tap.
  The tapped tab lights up in the same frame, and the dock's sections skip the page
  rise-and-fade (other member pages keep it).
- **Feel.** The pressed icon dips and the newly opened one springs back; the open tab's
  icon and label are bold and dark, the others light. No background box, labels kept
  for members who read better than they recognise icons. Reduced motion turns the
  motion off.
- **Behaviour.** Each section keeps its scroll position when you come back to it from
  the dock; tapping the section you are on scrolls it to the top. Not done: haptics
  (iPhone browsers offer none) and pull-to-refresh.

## Instant page switches in the gym workspace — 2026-10-29

Elias asked for the dashboard to load like X or Instagram. Decisions taken
(assumptions, open to the owners):

- **Navigation pages are fetched ahead, after startup.** Once the workspace has loaded
  and the browser is idle, every page in the sidebar is fetched whole, one per idle
  moment (`useWarmNavigation`), and the page just left is fetched again so going back
  is instant. Startup is untouched (fetching at mount slowed it in the 15 October pass).
  The fetches are reused for five minutes and refreshed by use or by returning to the
  tab, never by a timer; a browser in data-saver mode fetches nothing ahead. Phones only
  fetch their phone pages.
- **The clicked item lights up in the same frame** in the sidebar and the phone drawer;
  `aria-current` still follows the page itself.
- **No page fade.** The workspace's quarter-second rise-and-fade on every page switch is
  gone; the platform console keeps its own.
- **Not done here.** The public website (`rivetjo.com`) is rendered on every visit and
  the landing waits for the sign-in check before it shows; making it a cached static
  page is a separate, larger change. Links inside pages (table rows, cards) still fetch
  on the way, not ahead.

## Faster public website — 2026-10-29

Elias asked for the website to load like X or Instagram. Measured from Jordan on the
live site: every page is rendered per visit on a Dublin server behind Vercel's Mumbai
edge (first byte 500–880 ms by curl, sometimes 1–2 s), and the landing stayed hidden
until Clerk's Frontend API answered, so it became visible after about 1.1–2.2 s.
Decisions taken (assumptions, open to the owners):

- **The landing only waits for Clerk in a browser that has had a signed-in account.**
  Every RIVET host writes the account id into the shared language cookie
  (`rivet_ui_locale_v1`, domain `rivetjo.com`) while someone is signed in and clears it
  on sign-out. Without that id (or Clerk's own signed-in marker) the landing paints at
  once and the same Clerk check runs behind it, still sending a signed-in visitor to
  their area. The rare signed-in browser without either marker (cookies cleared, or
  never opened RIVET since Arabic shipped) may see the landing for a moment before it
  moves on.
- **Signed-in page loads skip the language lookup when they can.** The server asked
  Clerk for a token and Convex for the account's saved language on every signed-in
  page load. When the shared cookie already names that account it now uses the cookie;
  a language changed on another device arrives when the page binds the account.
- **Measured result:** the landing did not become visible sooner (0.97–1.15 s typical),
  because it cannot paint before its whole HTML arrives and that takes longer than the
  Clerk check. About 0.3 s of every request, for any page, is the Mumbai edge to Dublin
  trip plus server overhead; the landing's own render is 0.1–0.2 s.
- **Not done, needs a decision.** Caching the landing at the edge (about 0.3–0.6 s
  more, and no cold starts) needs either a restructure so pages do not read cookies, or
  edge-cache headers that can only be proven on Production. Moving the server region
  closer to Jordan, or serving `rivetjo.com` without the redirect to `www`, are
  infrastructure choices for Hashem.
