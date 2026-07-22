# TherapyPlanner

A lightweight, browser-based scheduling tool for ophthalmologists managing intravitreal injection therapy programs.

## Overview

Intravitreal injection therapy (e.g., anti-VEGF treatments for AMD, DME, RVO) requires a series of appointments spaced at clinically defined intervals. TherapyPlanner lets clinic staff plan, visualise, and historically reconstruct the full injection schedule for both eyes — enforcing minimum same-eye intervals, a mandatory cross-eye gap, and restricting bookings to configured clinic days.

The two eye schedules are **cross-eye coupled, not independent**: every appointment in one eye must be at least 14 calendar days away from every planned appointment in the other eye.

## Features

- **Cross-eye coupled scheduling** — left and right eyes share a single timeline; every change to one eye may cascade into the other.
- **Two appointment statuses** — `planned` (future) and `completed` (historical fact).
- **Completed-prefix ordering** — completed appointments always precede planned ones; no gaps allowed.
- **Two date origins** — `generated` (computed automatically) and `confirmed` (explicitly set by the user).
- **Two cascade modes** — *ordinary* (planning) and *historical* (reconstruction). See below.
- **Atomic historical-date entry** — selecting "Completed" opens an inline date picker; the planner is mutated only when the user confirms both status and date together.
- **Configurable same-eye intervals** — each session can have its own minimum interval (4–16 weeks in steps of 2), reflecting loading phases and treat-and-extend protocols.
- **`minWeeks` changes enforce the cross-eye rule** — changing any appointment's interval triggers a full cascade that enforces the 14-day cross-eye gap everywhere.
- **Transactional mutations** — every operation is snapshot-based; a failed validation rolls back the entire schedule, restores all dates and intervals, and returns a structured error.
- **`changedAppointments` reporting** — every successful mutation returns the list of appointments whose dates changed, with old and new values.
- **Persistent validation messages** — errors and warnings survive planner-triggered redraws without duplicating.
- **Clinic-day enforcement** — bookings are constrained to configured valid weekdays (default: Tuesday, Wednesday, Thursday).
- **No npm runtime dependencies** — pure vanilla JavaScript; Bootstrap and normalize.css are loaded from CDN.

## Getting Started

### Run locally

```bash
git clone https://github.com/nax83/TherapyPlanner.git
cd TherapyPlanner
```

Because `index.html` loads `config/scheduleConfig.json`, opening via `file://` may be blocked by CORS. Serve with any static file server:

```bash
# Python 3
python -m http.server 8080
# open http://localhost:8080
```

### Run tests

```bash
npm test
```

Requires Node.js 18+ (uses the built-in `node:test` runner and `assert/strict`).

To verify DST-safe calendar arithmetic under a European timezone and under UTC:

```bash
TZ=Europe/Berlin npm test
TZ=UTC npm test
```

All three commands must pass. The test suite includes explicit scenarios across the March 2026 spring DST transition and the October 2026 autumn DST transition.

## Configuration

`config/scheduleConfig.json`:

```json
{
  "validAppointmentWeekdays": [2, 3, 4],
  "interEyeGapDays": 14
}
```

Weekday numbers follow `Date.getDay()`: `0` = Sunday … `6` = Saturday. The default clinic days are Tuesday (2), Wednesday (3), and Thursday (4).

`interEyeGapDays` (default `14`) is the minimum number of calendar days between any left-eye and any right-eye planned appointment. The rule is enforced after every mutation; a same-day bilateral result is never valid.

## Appointment Model

Each appointment has:

| Field | Values | Meaning |
|---|---|---|
| `status` | `planned` \| `completed` | Whether the injection has occurred |
| `dateOrigin` | `generated` \| `confirmed` | How the date was determined |
| `plannedDate` | `Date` | The scheduled (or historical) date |
| `minWeeks` | 4, 6, 8 … 16 | Minimum weeks from the previous same-eye appointment |

**Completed-prefix rule**: within each eye, all completed appointments appear before all planned ones. Gaps are not allowed.

**Historical exceptions**: completed appointments may fall on non-clinic days (accepted as historical facts) and may be closer than `minWeeks × 7` days from the previous same-eye completed appointment.

## Cascade Modes

### Ordinary mode

Used for:
- Editing a planned appointment's date (`updateDateFor`)
- Changing `minWeeks` (`updateMinWeeksFor`)
- Adding a new appointment

Rules:
- Completed appointments never move.
- Confirmed appointments never move backward.
- Generated appointments never move backward.
- Valid existing dates are preserved; appointments advance only when required.

Lower bound for every mutable appointment:
```
max(today, previousSameEye + minWeeks × 7, snapshotDate)
```
The `snapshotDate` floor prevents any appointment from regressing to an earlier date.

### Historical mode

Used for:
- Marking an appointment completed (`setStatus → completed`)
- Correcting a completed appointment's date
- Converting a completed appointment back to planned (`setStatus → planned`)

Rules:
- Completed appointments never move.
- **Valid confirmed planned appointments are treated as fixed anchors** — see eligibility rules above. Generated appointments are scheduled around them.
- Generated appointments may move backward (rebuild to earliest valid date).
- Confirmed-but-invalid appointments may move forward but never backward below their confirmed date.

A confirmed planned appointment is eligible to become a fixed anchor during historical reconstruction when **all** of the following hold:

1. Its date is a valid normalized calendar date.
2. Its date is today or later.
3. It falls on a configured clinic day.
4. It respects its same-eye ordering and interval.
   - If the same-eye predecessor is **immutable** (completed or already-accepted anchor): the interval must be met directly.
   - If the same-eye predecessor is **mutable** (generated): the earliest theoretically schedulable predecessor date must be at most `confirmedDate − minWeeks × 7`.
5. It is at least `interEyeGapDays` (14) calendar days from **every** immutable opposite-eye appointment (completed or already-accepted confirmed anchors).
6. Fixing it does not make an already-accepted same-eye confirmed sequence infeasible.
7. It can coexist with all previously accepted confirmed anchors.

**Confirmed anchors are conditional — not always frozen.** A confirmed appointment that fails any of these checks remains mutable. When mutable:
- It may move forward.
- It never moves backward below its original confirmed date.
- Its `dateOrigin` remains `confirmed`.

**Confirmed-anchor selection is deterministic** — candidates are sorted by date, right-before-left, lower index first, and each accepted anchor is added to the immutable set before the next candidate is evaluated.

**Post-hoc demotion (Phase 5)**: After scheduling a mutable predecessor, if the same-eye successor was frozen as a confirmed anchor but the predecessor was scheduled too late to satisfy the interval, the successor is demoted from fixed status and rescheduled forward. It never moves backward; `dateOrigin` remains `confirmed`.

Lower bound in historical mode:
- Generated: `max(today, previousSameEye + minWeeks × 7)` — may move backward.
- Confirmed-but-invalid: `max(today, previousSameEye + minWeeks × 7, confirmedDate)` — never below confirmed date.

### Cascade ordering

Mutable appointments are processed in stable chronological order (by their pre-operation snapshot date). Tiebreak: right eye before left eye, lower index first. A same-eye predecessor must be finalised before its successor.

Cross-eye validation uses only **finalised** other-eye appointments — not future mutable ones. This gives the earliest valid minimally-disruptive schedule.

## `minWeeks` Changes

Changing a session's minimum interval is a transactional scheduling operation:

1. Snapshot the current schedule.
2. Apply the new interval.
3. Run the ordinary cascade (predecessors fixed, changed slot and later slots mutable, all other-eye planned mutable).
4. Validate the full result.
5. On failure: restore the snapshot **and** the old interval; return `{ success: false, reason, message }`.
6. On success: return `{ success: true, changedAppointments }`.

The 14-day cross-eye rule is enforced in step 4. A same-day result is never returned as a committed schedule.

## `changedAppointments`

Every successful mutation from `updateDateFor`, `updateMinWeeksFor`, and `setStatus` returns:

```js
{
  success: true,
  changedAppointments: [
    {
      type: "RIGHTEYE" | "LEFTEYE",
      index: number,
      oldDate: "YYYY-MM-DD" | null,
      newDate: "YYYY-MM-DD" | null,
      status: "planned" | "completed",
      dateOrigin: "generated" | "confirmed"
    }
  ],
  warnings: string[]
}
```

Only appointments whose date actually changed are included.

**Completed appointments**: An *unchanged* completed appointment is never included. A completed appointment explicitly corrected by the user **is** included because its effective date changed. In that case the entry has `status: "completed"`.

Accepted confirmed anchors (those that remain exactly at their confirmed date) are not included unless they moved.

## Calendar-Day Safety

All therapy intervals are expressed in **calendar days**. No scheduling rule uses fixed 24-hour (86 400 s) arithmetic.

Key invariants:
- `calendarDayDifference(dateA, dateB)` uses UTC serial numbers (`Date.UTC(year, month, day) / 86400000`), producing an exact integer result without rounding or DST sensitivity.
- `addCalendarDays(date, n)` uses `Date.setDate()`, which the JavaScript engine advances by calendar date regardless of clock changes.
- Confirmed-anchor feasibility (`_isConfirmedAnchorEligible`) compares calendar-day differences, not raw timestamps. A predecessor exactly 28 calendar days before a confirmed successor is always accepted, even across a spring or autumn DST transition.



`validateSchedule()` checks the full schedule against all invariants and returns `{ valid: true }` or `{ valid: false, violations: string[] }`.

Checked invariants:
- Valid statuses (`planned` | `completed`).
- Completed-prefix ordering (no completed after planned).
- All dates are valid `Date` objects.
- No completed appointment after today.
- No planned appointment before today.
- Completed appointments appear in chronological order.
- Planned appointments are on configured clinic days.
- Same-eye minimum intervals between planned appointments.
- Cross-eye `interEyeGapDays` gap between every planned-vs-any pair.
- No same-day bilateral appointments.
- **`dateOrigin` for every planned appointment must be exactly `"generated"` or `"confirmed"`** — a missing, null, or unknown origin is a violation.

Completed appointments are exempt from the same-eye interval, cross-eye, and clinic-day checks (accepted as historical facts).

## API Return Shape

All three main mutation methods return a consistent result object.

**Success:**

```js
{
  success: true,
  changedAppointments: [...],
  warnings: []
}
```

**Failure:**

```js
{
  success: false,
  reason: "SOME_REASON",
  message: "Useful explanation",
  changedAppointments: [],
  warnings: []
}
```

Common failure `reason` values: `INVALID_DATE`, `INVALID_INDEX`, `BEFORE_TODAY`, `COMPLETED_AFTER_TODAY`, `NOT_CLINIC_DAY`, `SAME_EYE_INTERVAL`, `INTER_EYE_GAP`, `CHRONOLOGICAL_ORDER`, `NOT_PREFIX`, `NOT_LAST_COMPLETED`, `INVALID_MINWEEKS`, `INVALID_STATUS`, `VALIDATION_FAILED`.



Every mutation clones the schedule before applying changes. If global validation fails:

- The snapshot is restored (all dates, intervals, statuses, and origins).
- `notifyListeners` is **not** called.
- `{ success: false, reason, message }` is returned.

The planner is always in a fully valid state after any API call returns.

## UI Behaviour

### `minWeeks` selector

- The previous value is captured before the change.
- A successful change redraws both eye components; cross-eye cascades are immediately visible.
- A failed change restores the previous dropdown value and displays a persistent error.
- The error survives redraws and is cleared by a subsequent successful change.

### Atomic historical date entry

1. Selecting "Completed" in the status selector opens an inline date picker form (no planner mutation yet).
2. The user enters the historical date and clicks **OK**; only then are status and date committed together.
3. Clicking **Cancel** (or changing the selector back to "Planned") discards the pending form — **without calling the planner**. This preserves any existing `dateOrigin` and planned date.

### Idempotent status changes

Calling `setStatus(type, index, appointment.status)` (same status already stored) returns:

```js
{ success: true, changedAppointments: [], warnings: [] }
```

No mutation occurs, no listeners are notified.

## Tech Stack

| | |
|---|---|
| Language | Vanilla JavaScript (ES2015+, no transpilation) |
| Styling | Bootstrap 5.3, Bootstrap Icons 1.5, normalize.css (CDN) |
| Tests | Node.js built-in `node:test` + `assert/strict` |
| Build | None — files served as-is |

## Project Structure

```
TherapyPlanner/
├── config/
│   └── scheduleConfig.json    # valid clinic weekdays + interEyeGapDays
├── test/
│   └── TherapyPlanner.test.js
├── index.html                 # app entry point
├── TherapyPlanner.js          # scheduling engine and data model
├── TherapyListComponent.js    # DOM component (one instance per eye)
└── package.json
```

## License

MIT

