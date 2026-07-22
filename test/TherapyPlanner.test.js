'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

const TherapyPlanner = require('../TherapyPlanner.js');

// ─── helpers ────────────────────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;

function d(year, month0, day) {
  return new Date(year, month0, day);
}

function fmt(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

// All tests use today = Tuesday 6 Jan 2026 unless noted.
// Jan 1 2026 = Thursday.  Clinic days default = [2,3,4] = Tue/Wed/Thu.
//
// Default initial schedule with today = 2026-01-06:
//   right[0] = 2026-01-06  right[1] = 2026-02-03  right[2] = 2026-03-03
//   left[0]  = 2026-01-20  left[1]  = 2026-02-17  left[2]  = 2026-03-17

const TODAY = d(2026, 0, 6); // Tue 6 Jan 2026

function defaultPlanner(configOverride) {
  return new TherapyPlanner(configOverride || {}, { today: TODAY });
}

// ─── Mock DOM for UI tests ───────────────────────────────────────────────────

class MockTextNode {
  constructor(text) { this.textContent = text; this.parentNode = null; }
  findById() { return null; }
}

class MockElement {
  constructor(tagName) {
    this.tagName = String(tagName).toUpperCase();
    this.children = [];
    this.attributes = {};
    this.eventListeners = {};
    this.textContent = '';
    this.value = '';
    this.parentNode = null;
    const classSet = new Set();
    this.classList = {
      add: (...names) => { names.forEach(n => classSet.add(n)); },
      contains: name => classSet.has(name),
      toString: () => [...classSet].join(' '),
    };
  }
  appendChild(child) {
    if (child && typeof child === 'object') child.parentNode = this;
    this.children.push(child);
    return child;
  }
  removeChild(child) {
    const i = this.children.indexOf(child);
    if (i !== -1) {
      const [removed] = this.children.splice(i, 1);
      if (removed && typeof removed === 'object') removed.parentNode = null;
      return removed;
    }
    return null;
  }
  get firstChild() { return this.children[0] || null; }
  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name === 'id') this.id = String(value);
  }
  getAttribute(name) { return this.attributes[name]; }
  addEventListener(event, handler) {
    if (!this.eventListeners[event]) this.eventListeners[event] = [];
    this.eventListeners[event].push(handler);
  }
  querySelector(selector) {
    if (selector.startsWith('#')) return this.findById(selector.slice(1));
    return null;
  }
  findById(id) {
    if (this.id === id) return this;
    for (const child of this.children) {
      if (child && typeof child.findById === 'function') {
        const r = child.findById(id);
        if (r) return r;
      }
    }
    return null;
  }
}

class MockDocument {
  constructor() { this.root = new MockElement('#document'); }
  createElement(tagName) { return new MockElement(tagName); }
  createTextNode(text) { return new MockTextNode(text); }
  getElementById(id) { return this.root.findById(id); }
  querySelector(sel) { return this.root.querySelector(sel); }
}

function withMockDom(fn) {
  const prevDoc = global.document;
  const prevTP = global.TherapyPlanner;
  global.document = new MockDocument();
  global.TherapyPlanner = TherapyPlanner;
  delete require.cache[require.resolve('../TherapyListComponent.js')];
  const createTherapyListComponent = require('../TherapyListComponent.js');
  try {
    fn(createTherapyListComponent, global.document);
  } finally {
    delete require.cache[require.resolve('../TherapyListComponent.js')];
    if (prevDoc === undefined) delete global.document; else global.document = prevDoc;
    if (prevTP === undefined) delete global.TherapyPlanner; else global.TherapyPlanner = prevTP;
  }
}

// ─── 1. Initial-date behaviour ───────────────────────────────────────────────

test('first appointment defaults to today when today is a clinic day', () => {
  const planner = defaultPlanner();
  const r0 = planner.getPlanByEye(TherapyPlanner.RIGHTEYE)[0];
  assert.equal(fmt(r0.plannedDate), '2026-01-06');
});

test('first appointment defaults to next clinic day when today is not a clinic day', () => {
  // Monday 5 Jan 2026 is not a clinic day; next clinic day is Tuesday 6 Jan
  const planner = new TherapyPlanner({}, { today: d(2026, 0, 5) });
  const r0 = planner.getPlanByEye(TherapyPlanner.RIGHTEYE)[0];
  assert.equal(fmt(r0.plannedDate), '2026-01-06');
});

test('first appointment can be moved forward', () => {
  const planner = defaultPlanner();
  const result = planner.updateDateFor(TherapyPlanner.RIGHTEYE, 0, d(2026, 0, 13));
  assert.equal(result.success, true);
  assert.equal(fmt(planner.getPlanByEye(TherapyPlanner.RIGHTEYE)[0].plannedDate), '2026-01-13');
});

test('after moving first appointment forward it can be moved back to today', () => {
  const planner = defaultPlanner();
  planner.updateDateFor(TherapyPlanner.RIGHTEYE, 0, d(2026, 0, 13));
  const result = planner.updateDateFor(TherapyPlanner.RIGHTEYE, 0, TODAY);
  assert.equal(result.success, true);
  assert.equal(fmt(planner.getPlanByEye(TherapyPlanner.RIGHTEYE)[0].plannedDate), '2026-01-06');
});

test('first appointment before today is rejected', () => {
  const planner = defaultPlanner();
  const result = planner.updateDateFor(TherapyPlanner.RIGHTEYE, 0, d(2026, 0, 5)); // yesterday
  assert.equal(result.success, false);
  assert.equal(result.reason, 'BEFORE_TODAY');
  // schedule unchanged
  assert.equal(fmt(planner.getPlanByEye(TherapyPlanner.RIGHTEYE)[0].plannedDate), '2026-01-06');
});

test('first appointment on non-clinic weekday is rejected', () => {
  const planner = defaultPlanner();
  const result = planner.updateDateFor(TherapyPlanner.RIGHTEYE, 0, d(2026, 0, 12)); // Monday
  assert.equal(result.success, false);
  assert.equal(result.reason, 'NOT_CLINIC_DAY');
});

// ─── 2. Same-eye intervals ───────────────────────────────────────────────────

test('exactly 28 calendar days is valid for 4-week interval', () => {
  // right[0] = Jan 6; Jan 6 + 28 = Feb 3 (Tue) — exactly 28 days
  const planner = defaultPlanner();
  const r1 = planner.getPlanByEye(TherapyPlanner.RIGHTEYE)[1];
  assert.equal(fmt(r1.plannedDate), '2026-02-03',
    'Auto-scheduled right[1] must be exactly 28 days after right[0]');
});

test('27 calendar days is rejected for 4-week interval', () => {
  // right[0] = Jan 7 (Wed); Jan 7 + 27 = Feb 3 (Tue) — only 27 days
  const planner = defaultPlanner();
  planner.updateDateFor(TherapyPlanner.RIGHTEYE, 0, d(2026, 0, 7));
  const result = planner.updateDateFor(TherapyPlanner.RIGHTEYE, 1, d(2026, 1, 3)); // Feb 3 = 27 days after Jan 7
  assert.equal(result.success, false);
  assert.equal(result.reason, 'SAME_EYE_INTERVAL');
});

test('weeks*7+1 behaviour no longer exists — 28 days is valid, not 29', () => {
  // Default right[1] must be Feb 3, not Feb 4 (which would be 29 days)
  const planner = defaultPlanner();
  const r1 = planner.getPlanByEye(TherapyPlanner.RIGHTEYE)[1];
  assert.equal(fmt(r1.plannedDate), '2026-02-03');
  assert.notEqual(fmt(r1.plannedDate), '2026-02-04');
});

test('clinic-day adjustment moves automatic appointment to next valid clinic day', () => {
  // With interEyeGapDays=15, right[0]=Jan 8 (Thu) + 15 = Jan 23 (Fri) — not a clinic day.
  // nextClinicDate(Jan 23) = Jan 27 (Tue).
  const config = { validAppointmentWeekdays: [2, 3, 4], interEyeGapDays: 15 };
  const planner = new TherapyPlanner(config, { today: d(2026, 0, 8) });
  const l0 = planner.getPlanByEye(TherapyPlanner.LEFTEYE)[0];
  assert.equal(fmt(l0.plannedDate), '2026-01-27');
});

// ─── 3. Cross-eye rules ──────────────────────────────────────────────────────

test('13-day separation between eyes is rejected', () => {
  // right[0] = Jan 8 (Thu); Jan 8 + 13 = Jan 21 (Wed) — 13 days — invalid
  const planner = defaultPlanner();
  planner.updateDateFor(TherapyPlanner.RIGHTEYE, 0, d(2026, 0, 8));
  const result = planner.updateDateFor(TherapyPlanner.LEFTEYE, 0, d(2026, 0, 21));
  assert.equal(result.success, false);
  assert.equal(result.reason, 'INTER_EYE_GAP');
});

test('14-day separation between eyes is accepted', () => {
  // right[0] = Jan 8 (Thu); Jan 8 + 14 = Jan 22 (Thu) — exactly 14 days — valid
  const planner = defaultPlanner();
  planner.updateDateFor(TherapyPlanner.RIGHTEYE, 0, d(2026, 0, 8));
  const result = planner.updateDateFor(TherapyPlanner.LEFTEYE, 0, d(2026, 0, 22));
  assert.equal(result.success, true);
});

test('same-day bilateral appointments are rejected', () => {
  const planner = defaultPlanner();
  const result = planner.updateDateFor(TherapyPlanner.LEFTEYE, 0, d(2026, 0, 6)); // same as right[0]
  assert.equal(result.success, false);
  assert.equal(result.reason, 'INTER_EYE_GAP');
});

test('cross-eye rule is checked against every opposite-eye appointment', () => {
  // Move right[2] to Apr 1 (Tue); then try left[2] = Apr 8 (7 days after right[2]) — should fail.
  // This verifies that the rule is applied to every pair, not just the nearest index.
  const planner = defaultPlanner();
  const ok = planner.updateDateFor(TherapyPlanner.RIGHTEYE, 2, d(2026, 3, 1)); // Apr 1
  assert.equal(ok.success, true, 'setup: right[2] = Apr 1 must succeed');

  // Apr 8 is only 7 days after right[2]=Apr 1 — should fail
  const result = planner.updateDateFor(TherapyPlanner.LEFTEYE, 2, d(2026, 3, 8)); // Apr 8
  assert.equal(result.success, false);
  assert.equal(result.reason, 'INTER_EYE_GAP');

  // Apr 15 is exactly 14 days after Apr 1 — should succeed
  const result2 = planner.updateDateFor(TherapyPlanner.LEFTEYE, 2, d(2026, 3, 15)); // Apr 15
  assert.equal(result2.success, true);
});

test('first appointment of each eye respects cross-eye rule', () => {
  const planner = defaultPlanner();
  const r0 = planner.getPlanByEye(TherapyPlanner.RIGHTEYE)[0];
  const l0 = planner.getPlanByEye(TherapyPlanner.LEFTEYE)[0];
  const diff = Math.abs(Math.round(
    (l0.plannedDate.getTime() - r0.plannedDate.getTime()) / DAY_MS,
  ));
  assert.ok(diff >= TherapyPlanner.INTER_EYE_GAP_DAYS,
    `initial gap is only ${diff} days`);
});

// ─── 4. Edit and cascade behaviour ──────────────────────────────────────────

test('editing to a date that conflicts with a fixed previous appointment is rejected', () => {
  // Move left[0] to Feb 17; then try right[1] = Feb 24 (7 days from left[0]) — rejected
  const planner = defaultPlanner();
  planner.updateDateFor(TherapyPlanner.LEFTEYE, 0, d(2026, 1, 17));
  const result = planner.updateDateFor(TherapyPlanner.RIGHTEYE, 1, d(2026, 1, 24));
  assert.equal(result.success, false);
  assert.equal(result.reason, 'INTER_EYE_GAP');
});

test('a rejected edit leaves the entire schedule unchanged', () => {
  const planner = defaultPlanner();
  // Capture full schedule before bad edit
  const before = JSON.stringify(
    [TherapyPlanner.RIGHTEYE, TherapyPlanner.LEFTEYE].map(eye =>
      planner.getPlanByEye(eye).map(s => fmt(s.plannedDate)),
    ),
  );
  planner.updateDateFor(TherapyPlanner.LEFTEYE, 0, d(2026, 0, 6)); // same-day — rejected
  const after = JSON.stringify(
    [TherapyPlanner.RIGHTEYE, TherapyPlanner.LEFTEYE].map(eye =>
      planner.getPlanByEye(eye).map(s => fmt(s.plannedDate)),
    ),
  );
  assert.equal(before, after);
});

test('moving first appointment forward reschedules invalid following appointments', () => {
  // right[0] Jan 6 → Feb 3 (Tue); right[1] was Feb 3, now must be >= Feb 3+28 = Mar 3
  const planner = defaultPlanner();
  const result = planner.updateDateFor(TherapyPlanner.RIGHTEYE, 0, d(2026, 1, 3)); // Feb 3
  assert.equal(result.success, true, 'edit must succeed');
  const r1 = planner.getPlanByEye(TherapyPlanner.RIGHTEYE)[1];
  assert.ok(r1.plannedDate >= d(2026, 2, 3),
    `right[1] should be >= Mar 3, got ${fmt(r1.plannedDate)}`);
});

test('cascade propagates from one eye to the other', () => {
  // right[0] Jan 6 (Tue) → Jan 7 (Wed).
  // Jan 7 and left[0]=Jan 20 are only 13 days apart, so left[0] must cascade forward.
  const planner = defaultPlanner();
  const result = planner.updateDateFor(TherapyPlanner.RIGHTEYE, 0, d(2026, 0, 7));
  assert.equal(result.success, true);

  const lp = planner.getPlanByEye(TherapyPlanner.LEFTEYE);
  // left[0] was Jan 20 — only 13 days after Jan 7 → must move forward
  assert.ok(
    lp[0].plannedDate > d(2026, 0, 20),
    `left[0] must cascade past Jan 20 due to 13-day cross-eye gap; got ${fmt(lp[0].plannedDate)}`,
  );
  // The resulting schedule must satisfy all invariants
  const v = planner.validateSchedule();
  assert.equal(v.valid, true, v.violations && v.violations.join('; '));
});

test('later appointments keep their dates when still valid after a cascade', () => {
  const planner = defaultPlanner();
  // Set right[2] far into the future
  planner.updateDateFor(TherapyPlanner.RIGHTEYE, 2, d(2026, 5, 2)); // Jun 2 (Tue)
  // Trigger a cascade by moving right[0] slightly forward
  planner.updateDateFor(TherapyPlanner.RIGHTEYE, 0, d(2026, 0, 8)); // Jan 8 (Thu)
  const r2 = planner.getPlanByEye(TherapyPlanner.RIGHTEYE)[2];
  assert.equal(fmt(r2.plannedDate), '2026-06-02', 'right[2] must remain on Jun 2');
});

test('later appointments never move backward automatically', () => {
  const planner = defaultPlanner();
  const before = [TherapyPlanner.RIGHTEYE, TherapyPlanner.LEFTEYE].map(eye =>
    planner.getPlanByEye(eye).slice(1).map(s => s.plannedDate.getTime()),
  );
  planner.updateDateFor(TherapyPlanner.RIGHTEYE, 0, d(2026, 0, 7));
  const after = [TherapyPlanner.RIGHTEYE, TherapyPlanner.LEFTEYE].map((eye, ei) =>
    planner.getPlanByEye(eye).slice(1).map((s, i) => {
      assert.ok(s.plannedDate.getTime() >= before[ei][i],
        `${eye}[${i + 1}] moved backward: ${fmt(s.plannedDate)}`);
    }),
  );
  void after;
});

test('the edited appointment remains exactly on the selected date', () => {
  const planner = defaultPlanner();
  planner.updateDateFor(TherapyPlanner.RIGHTEYE, 1, d(2026, 1, 10)); // Feb 10
  assert.equal(fmt(planner.getPlanByEye(TherapyPlanner.RIGHTEYE)[1].plannedDate), '2026-02-10');
});

test('previous same-eye appointments remain unchanged after a cascade', () => {
  const planner = defaultPlanner();
  planner.updateDateFor(TherapyPlanner.RIGHTEYE, 1, d(2026, 1, 10));
  assert.equal(fmt(planner.getPlanByEye(TherapyPlanner.RIGHTEYE)[0].plannedDate), '2026-01-06');
});

test('opposite-eye appointments earlier than edited date remain unchanged', () => {
  // left[0] = Jan 20, which is before right[1] new date Feb 10 → must stay Jan 20
  const planner = defaultPlanner();
  planner.updateDateFor(TherapyPlanner.RIGHTEYE, 1, d(2026, 1, 10));
  assert.equal(fmt(planner.getPlanByEye(TherapyPlanner.LEFTEYE)[0].plannedDate), '2026-01-20');
});

test('resulting schedule satisfies all global invariants after any edit', () => {
  const planner = defaultPlanner();
  planner.updateDateFor(TherapyPlanner.RIGHTEYE, 0, d(2026, 0, 7));
  const v = planner.validateSchedule();
  assert.equal(v.valid, true, v.violations && v.violations.join('; '));
});

// ─── 5. Interval editing ────────────────────────────────────────────────────

test('increasing minWeeks reschedules invalid following appointments', () => {
  // right[1] is auto-set to Feb 3 (28 days from Jan 6, minWeeks=4)
  // Increase minWeeks to 8 → right[1] must be >= Jan 6 + 56 = Mar 3
  const planner = defaultPlanner();
  planner.updateMinWeeksFor(TherapyPlanner.RIGHTEYE, 1, 8);
  const r1 = planner.getPlanByEye(TherapyPlanner.RIGHTEYE)[1];
  assert.ok(
    r1.plannedDate >= d(2026, 2, 3),
    `right[1] should be >= Mar 3, got ${fmt(r1.plannedDate)}`,
  );
});

test('decreasing minWeeks does not pull later appointments backward', () => {
  const planner = defaultPlanner();
  // First increase to 8 weeks so right[1] is at ~56 days
  planner.updateMinWeeksFor(TherapyPlanner.RIGHTEYE, 1, 8);
  const dateBefore = planner.getPlanByEye(TherapyPlanner.RIGHTEYE)[1].plannedDate.getTime();

  // Decrease back to 4 — right[1] must not move backward
  planner.updateMinWeeksFor(TherapyPlanner.RIGHTEYE, 1, 4);
  const dateAfter = planner.getPlanByEye(TherapyPlanner.RIGHTEYE)[1].plannedDate.getTime();
  assert.ok(dateAfter >= dateBefore, 'right[1] must not move backward when minWeeks decreases');
});

test('changing minWeeks does not change previous appointments', () => {
  const planner = defaultPlanner();
  planner.updateMinWeeksFor(TherapyPlanner.RIGHTEYE, 1, 8);
  assert.equal(fmt(planner.getPlanByEye(TherapyPlanner.RIGHTEYE)[0].plannedDate), '2026-01-06');
});

// ─── 6. Add / remove behaviour ───────────────────────────────────────────────

test('adding an appointment gives it a valid scheduled date', () => {
  const planner = defaultPlanner();
  planner.addTherapy(TherapyPlanner.RIGHTEYE);
  const plan = planner.getPlanByEye(TherapyPlanner.RIGHTEYE);
  const newSession = plan[plan.length - 1];
  assert.ok(newSession.plannedDate instanceof Date, 'plannedDate must be a Date');
  assert.ok(!isNaN(newSession.plannedDate.getTime()), 'plannedDate must be valid');
  assert.ok(planner.isClinicDate(newSession.plannedDate), 'plannedDate must be a clinic day');
});

test('new appointment respects same-eye spacing and cross-eye rule', () => {
  const planner = defaultPlanner();
  planner.addTherapy(TherapyPlanner.RIGHTEYE);
  const v = planner.validateSchedule();
  assert.equal(v.valid, true, v.violations && v.violations.join('; '));
});

test('removing an appointment leaves the remaining schedule globally valid', () => {
  const planner = defaultPlanner();
  planner.removeTherapy(TherapyPlanner.RIGHTEYE);
  const v = planner.validateSchedule();
  assert.equal(v.valid, true, v.violations && v.violations.join('; '));
});

test('removing the last appointment from an eye is safely prevented', () => {
  const planner = defaultPlanner();
  planner.removeTherapy(TherapyPlanner.RIGHTEYE);
  planner.removeTherapy(TherapyPlanner.RIGHTEYE);
  const result = planner.removeTherapy(TherapyPlanner.RIGHTEYE); // only 1 left
  assert.equal(result, false);
  assert.equal(planner.getPlanByEye(TherapyPlanner.RIGHTEYE).length, 1);
});

// ─── 7. Calendar arithmetic across DST ──────────────────────────────────────

test('scheduling works across spring DST transition (Europe/Berlin)', () => {
  // Europe/Berlin clocks spring forward on 2026-03-29.
  // right[0] = Tue 10 Mar 2026; +28 calendar days = Tue 7 Apr 2026.
  const planner = new TherapyPlanner({}, { today: d(2026, 2, 10) });
  const r1 = planner.getPlanByEye(TherapyPlanner.RIGHTEYE)[1];
  assert.equal(fmt(r1.plannedDate), '2026-04-07',
    `Expected 2026-04-07 (Mar 10 + 28 days), got ${fmt(r1.plannedDate)}`);
});

test('scheduling works across autumn DST transition (Europe/Berlin)', () => {
  // Europe/Berlin clocks fall back on 2026-10-25.
  // right[0] = Tue 13 Oct 2026; +28 calendar days = Tue 10 Nov 2026.
  const planner = new TherapyPlanner({}, { today: d(2026, 9, 13) });
  const r1 = planner.getPlanByEye(TherapyPlanner.RIGHTEYE)[1];
  assert.equal(fmt(r1.plannedDate), '2026-11-10',
    `Expected 2026-11-10 (Oct 13 + 28 days), got ${fmt(r1.plannedDate)}`);
});

// ─── 8. UI tests ─────────────────────────────────────────────────────────────

test('date input restores previous value after a rejected edit', () => {
  withMockDom((createTherapyListComponent, mockDoc) => {
    const planner = defaultPlanner();
    const component = createTherapyListComponent('testComp', TherapyPlanner.RIGHTEYE, planner);
    mockDoc.root.appendChild(component);

    // right[0] = Jan 6 → input-0 value should be '2026-01-06'
    const input0 = component.findById(`${TherapyPlanner.RIGHTEYE}-date-0`);
    const originalValue = input0.value;
    assert.equal(originalValue, '2026-01-06');

    // Simulate user entering Jan 5 (before today — should be rejected)
    input0.value = '2026-01-05';
    input0.eventListeners['change'][0]({ target: input0 });

    assert.equal(input0.value, originalValue, 'input must be restored after rejection');
  });
});

test('a successful edit redraws automatically rescheduled dates', () => {
  withMockDom((createTherapyListComponent, mockDoc) => {
    const planner = defaultPlanner();
    const component = createTherapyListComponent('testComp', TherapyPlanner.RIGHTEYE, planner);
    mockDoc.root.appendChild(component);

    // Move right[0] to Jan 13 (valid, will trigger rebuild)
    const input0 = component.findById(`${TherapyPlanner.RIGHTEYE}-date-0`);
    input0.value = '2026-01-13';
    input0.eventListeners['change'][0]({ target: input0 });

    // After success, planner notified, buildPlan re-ran; right[1] >= Jan 13+28 = Feb 10
    const input1 = component.findById(`${TherapyPlanner.RIGHTEYE}-date-1`);
    assert.ok(input1, 'input for session 1 must exist after redraw');
    const r1date = new Date(input1.value.replace(/-/g, '/'));
    assert.ok(r1date >= d(2026, 1, 10), `right[1] input should be >= Feb 10, got ${input1.value}`);
  });
});

test('date inputs contain correct local YYYY-MM-DD values', () => {
  withMockDom((createTherapyListComponent, mockDoc) => {
    const planner = defaultPlanner();
    const component = createTherapyListComponent('testComp', TherapyPlanner.RIGHTEYE, planner);
    mockDoc.root.appendChild(component);

    for (let i = 0; i < planner.getPlanByEye(TherapyPlanner.RIGHTEYE).length; i++) {
      const input = component.findById(`${TherapyPlanner.RIGHTEYE}-date-${i}`);
      assert.ok(input, `input-${i} must exist`);
      assert.match(input.value, /^\d{4}-\d{2}-\d{2}$/,
        `input-${i} value "${input.value}" must be YYYY-MM-DD`);
    }
  });
});
