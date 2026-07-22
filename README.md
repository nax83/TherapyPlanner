# TherapyPlanner

A lightweight, browser-based scheduling tool for ophthalmologists managing intravitreal injection therapy programs.

## Overview

Intravitreal injection therapy (e.g., anti-VEGF treatments for AMD, DME, RVO) requires a series of appointments spaced at clinically defined intervals. TherapyPlanner lets clinic staff plan and visualize the full injection schedule for both eyes independently — enforcing minimum inter-injection gaps and restricting bookings to configured clinic days.

## Features

- **Per-eye scheduling** — left eye and right eye are managed as independent therapy timelines.
- **Configurable inter-injection gaps** — each session can have its own minimum interval (4–16 weeks in steps of 2), reflecting treatment protocols like loading phases followed by treat-and-extend.
- **Automatic date cascade** — changing any session's date or interval automatically recalculates all subsequent sessions downstream.
- **Clinic-day enforcement** — bookings are constrained to configured valid weekdays (default: Tuesday, Wednesday, Thursday). The scheduler automatically advances to the next valid clinic day when needed.
- **Minimum date guardrail** — the date picker prevents selecting a date earlier than the computed minimum, eliminating scheduling errors.
- **Zero dependencies** — pure vanilla JavaScript, no build step, no backend, no package installation required. Runs directly in any modern browser.

## Getting Started

### Run locally

Clone the repository and open `index.html` in a browser:

```bash
git clone https://github.com/nax83/TherapyPlanner.git
cd TherapyPlanner
```

Because `index.html` fetches `config/scheduleConfig.json` at startup, opening the file via `file://` may be blocked by browser CORS policy. Serve it with any static file server:

```bash
# Python 3
python -m http.server 8080
# then open http://localhost:8080
```

### Run tests

```bash
npm test
```

Requires Node.js 18+ (uses the built-in `node:test` runner).

To verify DST-safe arithmetic under a European timezone:

```bash
TZ=Europe/Berlin npm test
```

## Configuration

Edit `config/scheduleConfig.json` to set which weekdays are valid for appointments and the minimum gap between left- and right-eye injections:

```json
{
  "validAppointmentWeekdays": [2, 3, 4],
  "interEyeGapDays": 14
}
```

Weekday numbers follow the JavaScript `Date.getDay()` convention: `0` = Sunday, `1` = Monday, … `6` = Saturday.

| Value | Day |
|-------|-----|
| 0 | Sunday |
| 1 | Monday |
| 2 | Tuesday |
| 3 | Wednesday |
| 4 | Thursday |
| 5 | Friday |
| 6 | Saturday |

`interEyeGapDays` (default `14`) is the minimum number of calendar days that must separate any left-eye appointment from any right-eye appointment.

## How It Works

1. On load, the planner creates an initial 3-session schedule for each eye, starting from today.
2. Each session stores an **earliest same-eye date** (the soonest the same eye may be treated) and a **planned date** (user-selected or automatically computed).
3. The earliest same-eye date for session `N` is `planned_date(N-1) + minWeeks × 7` calendar days.  
   *(Exactly `minWeeks × 7` days — no off-by-one.)*
4. The cross-eye rule requires every left-eye appointment to be at least `interEyeGapDays` calendar days away from every right-eye appointment in both directions.
5. Users can add or remove sessions per eye using the `+` / `−` buttons.
6. Any edit triggers a full re-cascade from that point forward, keeping the entire schedule consistent. All dates are computed using calendar-day arithmetic that is safe across DST transitions.

## Tech Stack

| | |
|---|---|
| Language | Vanilla JavaScript (ES2015+, no transpilation) |
| Styling | Bootstrap 5.3, Bootstrap Icons 1.5, normalize.css |
| Tests | Node.js built-in `node:test` + `assert/strict` |
| Build | None — files served as-is |

## Project Structure

```
TherapyPlanner/
├── config/
│   └── scheduleConfig.json   # valid clinic weekdays
├── test/
│   └── TherapyPlanner.test.js
├── index.html                # app entry point
├── TherapyPlanner.js         # scheduling logic and data model
├── TherapyListComponent.js   # DOM component (one per eye)
└── package.json
```

## License

MIT
