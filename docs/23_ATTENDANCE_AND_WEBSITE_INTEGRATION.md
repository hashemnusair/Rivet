# Live occupancy and attendance — 2 October 2026

## Product and ownership

RIVET's existing Next.js / Convex / Clerk application remains the product.
`GymOSApi` is the page-facing data boundary. Member Home and membership detail,
Reception, and Reports → Peak hours use the same attendance calculation.
Settings → Attendance owns branch policy and optional public publication.
The original `FRONTEND_HANDOFF.md` remains frozen.

Hashem and Elias's proposed managed website service is a studio service:
each gym gets an individually designed bespoke landing page, optionally with
a custom `/live` page. This implementation supplies the shared data and a
portable React widget. It does not create sites, a website builder, automatic
generic gym pages, subscription changes, pricing, or commercial commitments.
The onboarding fee and 100–200 JD add-on are undecided commercial matters.

## Attendance facts and estimates

- `src/lib/attendance/model.ts` is the single deterministic calculation used
  by Convex and the explicitly seeded preview. Inputs are accepted/denied
  entry and real exit facts with person ID, event ID, source and UTC event time.
- Existing `checkIn` records, including search/manual and QR admission, are
  normalized on read. Allowed, warning and overridden entries qualify;
  blocked entries do not. New check-ins store source and visit length.
- An accepted entry starts a fixed presence window, normally 90 minutes.
  Settings allow 15–720 minutes per branch. Repeated scans inside that window
  neither add a person nor move its end. Reception suppresses a repeat entry
  while the estimated window remains open. A recorded actual exit or expiry
  allows a new visit. Without an exit signal, an unmarked leave-and-return
  inside the window cannot be distinguished from a repeat scan; Reception
  can record the actual exit before checking the person in again.
- Window expiry is a calculation only. It never writes a departure, timeline
  event, or audit event. Reception's **Record actual exit** writes a real
  event into the member timeline and supports retry-safe event IDs.
- New entry and override attempts carry a stable `idempotencyKey` across
  retries, including consumed QR retries. The server retains replay records
  for 30 days and rejects reuse with changed details. Reusing an old attempt
  cannot create another window after the first one expires. Clients making
  their own calls must retain this key and use a new key for a new attempt.
- Each saved entry keeps its original visit length. Legacy check-ins keep
  90 minutes, even when the branch changes its policy. `attendancePolicy`
  records preserve policy change times so a delayed device entry uses the
  duration effective at its event time, not its delivery time.
- Person IDs are operational gym member IDs. This is an estimate from access
  records, not a claim that sensors count every person physically present.
  Visitors/staff without member entry facts are outside this estimate.

## Time, freshness and unavailable data

Every query uses server time. Consumers refresh at 15-second intervals, so
windows expire on screen without a new database write. The Convex adapter
includes a changing clock bucket: an unchanged cached query cannot pin the
headcount indefinitely. Reception's occupancy subscription is a disposable
clock-driven poll. Browser focus and reconnect trigger fresh reads.

Snapshots carry `generatedAt`, `validUntil` (45 seconds), availability, branch
timezone and next expiry. The reusable reading component checks freshness
locally every second, hides headcounts on offline/error/expired/stale data,
and says **Live estimate unavailable**. Zero is displayed only for a
successful, available feed. A timeout or disconnected feed is not an empty gym.

Reception mode means successful reads of the system of record are available;
a quiet reception desk does not imply a broken feed. Staff can mark a feed
paused when check-ins are no longer being recorded. External mode requires
a verified integration heartbeat within two minutes. Selecting it alone does
not connect a device; it deliberately shows unavailable without that heartbeat.

The branch-specific timezone defaults to the organization timezone. UTC
instants are sampled at 15-minute intervals and converted through `Intl`:
spring-forward hours are not invented and repeated fall-back hours retain
separate UTC samples. Daily curves end at the latest observation, never a
fictional future-day zero. The selected report date controls the curve;
typical-time history always uses the most recent 28 days and says so.

## Analytics definitions and limits

- **Headcount:** distinct member IDs with an unexpired presence window.
- **Occupancy curve:** estimated concurrent people at 15-minute samples.
- **Visits started today:** deduplicated windows starting on the branch-local
  date; a genuine re-entry is another visit.
- **Entry volume report:** the existing accepted check-in record report remains
  separately labelled. Its date/branch filters and export are preserved. It
  is not concurrent occupancy; legacy duplicate records/explicit overrides
  can differ from the normalized visit total.
- **Usual rhythm:** day/hour mean concurrent occupancy over complete observed
  days within the last 28 days. The first partial day and current day are
  excluded. Missing cells display a dash. Zero means a sampled zero.
- **Learning gate:** at least seven complete days after the first recorded
  visit and 20 recorded visit windows. Quiet/peak suggestions additionally
  require at least two observations of that weekday/hour and recorded entry
  activity in that hour. This avoids recommending a closed overnight hour
  purely because it has no entries. Suggestions are historical guidance;
  members are told to check opening hours.
- **Quiet/Moderate/Busy:** when capacity is configured, boundaries are 35% and
  70% of that capacity. Otherwise boundaries are the 35th and 80th percentiles
  of positive historical day/hour means after the learning gate. Zero is
  quiet once a basis exists. Before a basis exists, the count is shown with
  “Learning usual levels.” No capacity is fabricated; the old `120` fallback
  has been removed from occupancy. Existing explicitly saved branch capacity
  can seed the settings; blanking it switches to historical thresholds.

History assumes the configured reception process recorded entries throughout
the observed period. Existing legacy data has no historical outage ledger;
these are estimates, not independently verified sensor coverage. A future
hardware adapter must establish delivery/coverage semantics before rollout.

Reads use `domainRecords.by_organization_branch_type_created`, the last 29
recording days (including carry-in) and at most 10,000 records per source type
per branch. Exceeding that limit returns unavailable and suppresses partial
charts; it never publishes a silently truncated count. Load-test expected gym
volume before publication. Higher-volume gyms need incremental rollups or a
larger verified read strategy before enabling this feature. History is retained
in the existing records; this change does not delete older attendance.

## Authorization and data boundary

`getOccupancy(branchId)` requires `members.read` and tenant/branch access.
`getAttendanceInsights(branchId, date?)` requires the existing reporting
permission, `reports.financial.read`, and branch access. Staff report pages
retain their owner/manager gate. `getAttendanceSettings` /
`saveAttendanceSettings` require `settings.manage` and branch access; changes,
including publication, create an immutable settings audit event.
`recordAttendanceExit({branchId, memberId, eventId})` requires reception's
`members.read` access, tenant/member and branch checks.

`getCustomerAttendance(membershipId)` derives the tenant and operational
branch from an authenticated, owned member-portal membership. An arbitrary
branch/organization field cannot widen it. It returns aggregates only.
No member names, credentials, event IDs or raw attendance leave that endpoint.
Revoked/inactive accounts retain the existing Clerk/Convex authorization gates.

## Public API for a bespoke gym website

```http
GET https://<deployment>.convex.site/api/v1/public/occupancy?organizationId=<gym-public-id>&branchId=<branch-public-id>
```

Use the Convex HTTP **`.site`** origin for the deployed environment, not the
Convex `.cloud` query endpoint. Public IDs are visible in Settings → Attendance
when publication is selected. No secret or API key belongs in a website.

An authorized gym user must save **Publish aggregate occupancy on the gym's
website** for that branch. Publication defaults off. The organization must be
active/trial and the branch active. Private, unknown, foreign-tenant branch,
archived, suspended and disabled combinations all return the same 404.

A successful response is strictly allowlisted:

```json
{
  "version": 1,
  "current": 24,
  "status": "moderate",
  "availability": "available",
  "generatedAt": 1790964000000,
  "validUntil": 1790964045000,
  "timezone": "Asia/Amman",
  "disclosure": "Based on recent check-ins."
}
```

The numbers above are illustrative. `current` is `null` when unavailable or
stale. Status also permits `quiet`, `busy`, `learning`, `unavailable`.
Availability permits `available`, `stale`, `unavailable`. There is no identity,
capacity, daily entry total, historical report, operational setting, or raw
feed data in the public response. Errors use
`{"error":{"code":"...","message":"..."}}` with 400/404/429/503 statuses.

The endpoint is read-only GET, validates identifier lengths/characters and
query keys, has credential-free CORS and `Cache-Control: no-store` for prompt
revocation. A persisted deployment-wide budget limits it to 600 requests per
minute; 429 includes `Retry-After: 60`. A shared ceiling protects backend cost
but is not a per-client abuse defense: the managed site's edge/WAF should
apply a per-IP limit before public launch. Configure this on the actual site
provider when its hosting is selected. No raw IPs or new tracking identifiers
are stored by RIVET. Do not put unbounded retries or `stale-if-error` caching
in front of the estimate. Recheck publication on every request.

## Reusable website component

`apps/web/src/features/attendance/occupancy-widget.tsx` is self-contained React
and inline CSS, with no Next.js, Clerk, Convex, Tailwind, or RIVET provider
requirement. Import it in this repo or copy the file into a bespoke React site.
The surrounding custom `/live` page remains the designer's work.

```tsx
import { PublicOccupancyWidget } from "./occupancy-widget";

<PublicOccupancyWidget
  title="At Abdoun now"
  endpoint="https://<deployment>.convex.site/api/v1/public/occupancy?organizationId=<gym-public-id>&branchId=<branch-public-id>"
  style={{
    "--occupancy-surface": "#171717",
    "--occupancy-ink": "#fafafa",
    "--occupancy-muted": "#b8b8b8",
    "--occupancy-line": "#383838",
    fontFamily: "inherit",
    borderRadius: 8,
  }}
/>
```

The widget fetches without credentials, validates the response, times out
after ten seconds, polls every 15 seconds, handles reconnect/focus, withdraws
stale data, uses logical alignment, and announces count changes accessibly.
`OccupancyReading` can also render the same contract from a site's own fetch
layer. The site CSP must allow `connect-src` to its selected `.convex.site`
origin. Always retain estimate notation and disclosure.

## Future hardware seam

`internal.attendance.ingest` is server-only and accepts a pre-validated
organization, branch, operational member ID, source, stable source event ID,
event UTC timestamp, entry/exit kind and accepted decision. It validates
ownership, deduplicates IDs transactionally, rejects changed retry payloads,
future events and events more than 28 days late, and writes actual source
facts into the member timeline. `internal.attendance.heartbeat` certifies
adapter delivery health independently from attendance.

An actual adapter must supply verified device/tenant mapping, signatures,
replay protection, source clocks, event IDs, admission semantics and heartbeat
behavior from the chosen hardware specification. No unauthenticated ingest
HTTP route, vendor SDK, face/fingerprint processing, biometric templates or
invented turnstile integration was added.

## Verification and rollout

Read `CURRENT_STATE.md` for this change's final test counts and evidence.
Relevant checks are `pnpm test`, `pnpm typecheck`, `pnpm convex:typecheck`,
`pnpm lint`, `pnpm convex:codegen`, `pnpm build` and
`pnpm --filter web exec playwright test e2e/attendance.spec.ts`.
Screenshots and their evidence notes live in `docs/ui-evidence/attendance/`.

Deploy the additive branch fields, index and Convex operations through the
mandatory `pnpm convex:deploy` wrapper, then deploy the matching frontend.
No data backfill or synthetic departure job is needed. Before publication:
verify the chosen environment, real Clerk member/staff identities, branch
capacity/timezone/window, traffic headroom, API rate/WAF policy, unauthenticated
404 while off, aggregate response while on, immediate revocation, expiry,
reconnect, and isolation against a second tenant. Real hardware stays disabled
until specifications and an adapter acceptance test exist. This implementation
has not been deployed or enabled for a production gym by this task.
