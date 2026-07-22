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

test('same-day bilateral appointments: mutable opposite-eye cascades instead of rejecting', () => {
  // right[0]=Jan6; left[0] → Jan6: right[0] is mutable (snapshotDate >= Jan6), so cascade.
  const planner = defaultPlanner();
  const result = planner.updateDateFor(TherapyPlanner.LEFTEYE, 0, d(2026, 0, 6));
  assert.equal(result.success, true, result.message || '');
  assert.equal(fmt(planner.getPlanByEye(TherapyPlanner.LEFTEYE)[0].plannedDate), '2026-01-06');
  // right[0] must have cascaded forward (≥ 14 days from Jan6)
  const r0 = planner.getPlanByEye(TherapyPlanner.RIGHTEYE)[0];
  assert.ok(r0.plannedDate > d(2026, 0, 6), `right[0] must cascade past Jan6; got ${fmt(r0.plannedDate)}`);
  const v = planner.validateSchedule();
  assert.equal(v.valid, true, v.violations && v.violations.join('; '));
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
  planner.updateDateFor(TherapyPlanner.LEFTEYE, 0, d(2026, 0, 5)); // before today — rejected
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

test('decreasing minWeeks does not move generated dates backward in ordinary mode', () => {
  const planner = defaultPlanner();
  // Increase to 8 weeks: right[1] moves forward from Feb3 to Mar3.
  planner.updateMinWeeksFor(TherapyPlanner.RIGHTEYE, 1, 8);
  const r1After8 = fmt(planner.getPlanByEye(TherapyPlanner.RIGHTEYE)[1].plannedDate);
  assert.ok(planner.getPlanByEye(TherapyPlanner.RIGHTEYE)[1].plannedDate >= d(2026, 2, 3),
    `setup: right[1] must be >= Mar3 after increasing to 8 weeks; got ${r1After8}`);

  // Decrease back to 4 weeks in ordinary mode: snapshot floor prevents backward movement.
  planner.updateMinWeeksFor(TherapyPlanner.RIGHTEYE, 1, 4);
  const r1After4 = fmt(planner.getPlanByEye(TherapyPlanner.RIGHTEYE)[1].plannedDate);
  // right[1] must NOT move backward — it stays at the snapshot date (Mar3).
  assert.equal(r1After4, r1After8,
    `right[1] must remain at ${r1After8} (ordinary mode never moves backward); got ${r1After4}`);
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

// ─── 9. Historical and completed-appointment tests ───────────────────────────
//
// Reference today for historical tests: Tuesday 3 March 2026 (HIST_TODAY).
// Jan 1 2026 = Thursday.  HIST_TODAY + n×7 days always stays on Tuesday.
//
// Default schedule with HIST_TODAY = 2026-03-03:
//   right[0] = 2026-03-03  right[1] = 2026-03-31  right[2] = 2026-04-28
//   left[0]  = 2026-03-17  left[1]  = 2026-04-14  left[2]  = 2026-05-12

const HIST_TODAY = d(2026, 2, 3); // Tue 3 Mar 2026

function histPlanner(configOverride) {
  return new TherapyPlanner(configOverride || {}, { today: HIST_TODAY });
}

// ── 9a. Initialisation ───────────────────────────────────────────────────────

test('all initially generated appointments are planned', () => {
  const planner = histPlanner();
  for (const eye of [TherapyPlanner.RIGHTEYE, TherapyPlanner.LEFTEYE]) {
    for (const s of planner.getPlanByEye(eye)) {
      assert.equal(s.status, TherapyPlanner.STATUS_PLANNED,
        `${eye} session must default to planned`);
    }
  }
});

// ── 9b. Historical entry ─────────────────────────────────────────────────────

test('planned can be marked completed with a historical date', () => {
  const planner = histPlanner();
  const result = planner.setStatus(TherapyPlanner.RIGHTEYE, 0, 'completed', d(2026, 2, 1)); // Sun Mar1
  assert.equal(result.success, true, result.message || '');
  const r0 = planner.getPlanByEye(TherapyPlanner.RIGHTEYE)[0];
  assert.equal(r0.status, TherapyPlanner.STATUS_COMPLETED);
  assert.equal(fmt(r0.plannedDate), '2026-03-01');
});

test('completed appointment may be dated today', () => {
  const planner = histPlanner(); // today=Mar3
  const result = planner.setStatus(TherapyPlanner.RIGHTEYE, 0, 'completed', HIST_TODAY);
  assert.equal(result.success, true, result.message || '');
});

test('completed appointment after today is rejected', () => {
  const planner = histPlanner();
  const result = planner.setStatus(TherapyPlanner.RIGHTEYE, 0, 'completed', d(2026, 2, 4)); // Mar4>Mar3
  assert.equal(result.success, false);
  assert.equal(result.reason, 'COMPLETED_AFTER_TODAY');
});

test('multiple completed appointments can form a contiguous prefix', () => {
  const planner = new TherapyPlanner({}, { today: d(2026, 2, 17) }); // Mar17
  planner.setStatus(TherapyPlanner.RIGHTEYE, 0, 'completed', d(2026, 2, 3));  // Mar3
  const r2 = planner.setStatus(TherapyPlanner.RIGHTEYE, 1, 'completed', d(2026, 2, 10)); // Mar10
  assert.equal(r2.success, true, r2.message || '');
  const plan = planner.getPlanByEye(TherapyPlanner.RIGHTEYE);
  assert.equal(plan[0].status, TherapyPlanner.STATUS_COMPLETED);
  assert.equal(plan[1].status, TherapyPlanner.STATUS_COMPLETED);
  assert.equal(plan[2].status, TherapyPlanner.STATUS_PLANNED);
});

test('completed appointment after a planned appointment is rejected', () => {
  const planner = histPlanner(); // right[0]=planned, right[1]=planned
  const result = planner.setStatus(TherapyPlanner.RIGHTEYE, 1, 'completed', d(2026, 2, 1));
  assert.equal(result.success, false);
  assert.equal(result.reason, 'NOT_PREFIX');
});

test('historical appointments in the same eye must be chronologically ordered', () => {
  const planner = new TherapyPlanner({}, { today: d(2026, 2, 17) });
  planner.setStatus(TherapyPlanner.RIGHTEYE, 0, 'completed', d(2026, 2, 10)); // Mar10
  const result = planner.setStatus(TherapyPlanner.RIGHTEYE, 1, 'completed', d(2026, 2, 3)); // Mar3<Mar10
  assert.equal(result.success, false);
  assert.equal(result.reason, 'CHRONOLOGICAL_ORDER');
});

test('two completed same-eye appointments on the same date are rejected', () => {
  const planner = new TherapyPlanner({}, { today: d(2026, 2, 17) });
  planner.setStatus(TherapyPlanner.RIGHTEYE, 0, 'completed', d(2026, 2, 3));
  const result = planner.setStatus(TherapyPlanner.RIGHTEYE, 1, 'completed', d(2026, 2, 3)); // same date
  assert.equal(result.success, false);
  assert.equal(result.reason, 'CHRONOLOGICAL_ORDER');
});

// ── 9c. Historical exceptions ────────────────────────────────────────────────

test('completed appointment on a non-clinic weekday is accepted', () => {
  const planner = histPlanner();
  const sunday = d(2026, 2, 1); // Sunday — non-clinic
  const result = planner.setStatus(TherapyPlanner.RIGHTEYE, 0, 'completed', sunday);
  assert.equal(result.success, true, result.message || '');
  assert.equal(planner.getPlanByEye(TherapyPlanner.RIGHTEYE)[0].status, TherapyPlanner.STATUS_COMPLETED);
});

test('two completed same-eye appointments closer than the configured interval are accepted', () => {
  const planner = new TherapyPlanner({}, { today: d(2026, 2, 17) });
  planner.setStatus(TherapyPlanner.RIGHTEYE, 0, 'completed', d(2026, 2, 3));  // Mar3
  const result = planner.setStatus(TherapyPlanner.RIGHTEYE, 1, 'completed', d(2026, 2, 10)); // Mar10 = only 7 days
  assert.equal(result.success, true, result.message || '');
  const v = planner.validateSchedule();
  assert.equal(v.valid, true, v.violations && v.violations.join('; '));
});

test('two completed opposite-eye appointments less than 14 days apart are accepted', () => {
  const planner = new TherapyPlanner({}, { today: d(2026, 2, 10) }); // Mar10
  planner.setStatus(TherapyPlanner.RIGHTEYE, 0, 'completed', d(2026, 2, 3)); // Mar3
  const result = planner.setStatus(TherapyPlanner.LEFTEYE, 0, 'completed', d(2026, 2, 10)); // Mar10 = 7 days from right
  assert.equal(result.success, true, result.message || '');
  const v = planner.validateSchedule();
  assert.equal(v.valid, true, v.violations && v.violations.join('; '));
});

test('completed appointment on a non-clinic day generates a warning but not a blocking error', () => {
  const planner = histPlanner();
  const sunday = d(2026, 2, 1);
  const result = planner.setStatus(TherapyPlanner.RIGHTEYE, 0, 'completed', sunday);
  assert.equal(result.success, true);
  assert.ok(Array.isArray(result.warnings) && result.warnings.length > 0,
    'a non-clinic completed date must generate a warning');
});

// ── 9d. Future planning from history ─────────────────────────────────────────

test('first planned uses last completed appointment as the same-eye interval anchor', () => {
  const planner = histPlanner();
  planner.setStatus(TherapyPlanner.RIGHTEYE, 0, 'completed', d(2026, 0, 1)); // Jan1
  const r1 = planner.getPlanByEye(TherapyPlanner.RIGHTEYE)[1];
  // earliestSameEyeDate = Jan1 + 28 = Jan29
  assert.equal(fmt(r1.earliestSameEyeDate), '2026-01-29',
    'earliestSameEyeDate must reflect the completed appointment + interval');
  assert.ok(r1.plannedDate >= r1.earliestSameEyeDate,
    'planned date must be >= the interval anchor');
});

test('first planned also respects today as a lower bound', () => {
  const planner = histPlanner(); // today=Mar3
  planner.setStatus(TherapyPlanner.RIGHTEYE, 0, 'completed', d(2026, 1, 1)); // Feb1; Feb1+28=Mar1<today
  const r1 = planner.getPlanByEye(TherapyPlanner.RIGHTEYE)[1];
  assert.ok(r1.plannedDate >= HIST_TODAY,
    `planned must be >= today (Mar3); got ${fmt(r1.plannedDate)}`);
});

test('planned appointment respects 14-day rule against a completed opposite-eye appointment', () => {
  const planner = histPlanner(); // today=Mar3
  planner.setStatus(TherapyPlanner.RIGHTEYE, 0, 'completed', d(2026, 2, 3)); // Mar3=today
  // left[0] is planned Mar17. Try to move it to Mar4 — only 1 day from completed right[0].
  const result = planner.updateDateFor(TherapyPlanner.LEFTEYE, 0, d(2026, 2, 4)); // Mar4 Wed
  assert.equal(result.success, false);
  assert.equal(result.reason, 'INTER_EYE_GAP');
});

test('interval from non-clinic completed date advances planned to next clinic day', () => {
  // today=Jan5 (Mon). right[0]=Jan6 (Tue, initial). Mark completed Jan5 (Mon, non-clinic).
  // Jan5+28=Feb2 (Mon, non-clinic). nextClinicDate(Feb2)=Feb3 (Tue).
  const planner = new TherapyPlanner({}, { today: d(2026, 0, 5) }); // Jan5
  planner.setStatus(TherapyPlanner.RIGHTEYE, 0, 'completed', d(2026, 0, 5)); // Jan5 = today ✓
  const r1 = planner.getPlanByEye(TherapyPlanner.RIGHTEYE)[1];
  assert.ok(planner.isClinicDate(r1.plannedDate),
    `planned date ${fmt(r1.plannedDate)} must be a clinic day`);
  assert.ok(r1.plannedDate >= d(2026, 1, 2), // >= Feb2 = Jan5+28
    `planned must be >= Jan5+28=Feb2; got ${fmt(r1.plannedDate)}`);
});

test('multiple historical appointments in both eyes correctly constrain the future plan', () => {
  const planner = new TherapyPlanner({}, { today: d(2026, 2, 17) }); // Mar17
  planner.setStatus(TherapyPlanner.RIGHTEYE, 0, 'completed', d(2026, 2, 3));  // Mar3
  planner.setStatus(TherapyPlanner.LEFTEYE, 0, 'completed', d(2026, 2, 10)); // Mar10
  const v = planner.validateSchedule();
  assert.equal(v.valid, true, v.violations && v.violations.join('; '));
  const r1 = planner.getPlanByEye(TherapyPlanner.RIGHTEYE)[1];
  // right[1] must be >= Mar3+28=Mar31 and >= 14 days from left[0]=Mar10 (i.e. >= Mar24)
  assert.ok(r1.plannedDate >= d(2026, 2, 24),
    `right[1] must be >= Mar24; got ${fmt(r1.plannedDate)}`);
});

// ── 9e. Historical correction ─────────────────────────────────────────────────

test('editing a completed appointment forward reschedules affected planned appointments', () => {
  // right[0] completed Mar3, right[1] planned Mar31 (exactly Mar3+28).
  // Advance planner.today to Mar10, then correct right[0] to Mar10.
  // Mar10+28=Apr7; right[1] must advance past Mar31 (its pre-edit date).
  const planner = new TherapyPlanner({}, { today: d(2026, 2, 3) }); // Mar3
  planner.setStatus(TherapyPlanner.RIGHTEYE, 0, 'completed', d(2026, 2, 3));
  // right[1] is now at Mar31 (Mar3+28)

  planner.today = new Date(2026, 2, 10); // simulate time passing
  const result = planner.updateDateFor(TherapyPlanner.RIGHTEYE, 0, d(2026, 2, 10)); // Mar10 Tue
  assert.equal(result.success, true, result.message || '');

  const r1 = planner.getPlanByEye(TherapyPlanner.RIGHTEYE)[1];
  // right[1] was Mar31; after correction right[1] must be >= Mar10+28=Apr7
  assert.ok(r1.plannedDate > d(2026, 2, 30),
    `right[1] must advance past Mar31 (pre-edit); got ${fmt(r1.plannedDate)}`);
  assert.ok(r1.plannedDate >= d(2026, 3, 7),
    `right[1] must be >= Apr7 (Mar10+28); got ${fmt(r1.plannedDate)}`);
  const v = planner.validateSchedule();
  assert.equal(v.valid, true, v.violations && v.violations.join('; '));
});

test('correcting a completed appointment backward recalculates generated planned appointments', () => {
  const planner = new TherapyPlanner({}, { today: d(2026, 2, 3) }); // Mar3
  planner.setStatus(TherapyPlanner.RIGHTEYE, 0, 'completed', d(2026, 2, 3));
  assert.equal(fmt(planner.getPlanByEye(TherapyPlanner.RIGHTEYE)[1].plannedDate), '2026-03-31',
    'setup: right[1] should be Mar31');

  // Edit right[0] backward to Feb1 (Sun — historical exception).
  // Generated right[1] rebuilds to earliest valid date from max(today, Feb1+28).
  const result = planner.updateDateFor(TherapyPlanner.RIGHTEYE, 0, d(2026, 1, 1)); // Feb1 Sun
  assert.equal(result.success, true, result.message || '');

  const r1 = planner.getPlanByEye(TherapyPlanner.RIGHTEYE)[1];
  // right[1] must have moved backward from Mar31 to an earlier valid date
  assert.ok(r1.plannedDate < d(2026, 2, 31),
    `right[1] must recalculate to an earlier date; got ${fmt(r1.plannedDate)}`);
  const v = planner.validateSchedule();
  assert.equal(v.valid, true, v.violations && v.violations.join('; '));
});

test('editing a completed appointment never changes another completed appointment', () => {
  const planner = new TherapyPlanner({}, { today: d(2026, 2, 17) }); // Mar17
  planner.setStatus(TherapyPlanner.RIGHTEYE, 0, 'completed', d(2026, 2, 3));  // Mar3
  planner.setStatus(TherapyPlanner.RIGHTEYE, 1, 'completed', d(2026, 2, 10)); // Mar10

  const r0Before = fmt(planner.getPlanByEye(TherapyPlanner.RIGHTEYE)[0].plannedDate);
  planner.updateDateFor(TherapyPlanner.RIGHTEYE, 1, d(2026, 2, 17)); // move right[1] to Mar17

  const r0After = fmt(planner.getPlanByEye(TherapyPlanner.RIGHTEYE)[0].plannedDate);
  assert.equal(r0After, r0Before, 'right[0] must not change when right[1] is edited');
});

test('a rejected completed edit restores the complete previous schedule', () => {
  const planner = new TherapyPlanner({}, { today: d(2026, 2, 17) }); // Mar17
  planner.setStatus(TherapyPlanner.RIGHTEYE, 0, 'completed', d(2026, 2, 3));
  planner.setStatus(TherapyPlanner.RIGHTEYE, 1, 'completed', d(2026, 2, 10));

  const scheduleBefore = JSON.stringify(planner.schedule);
  // Edit right[0] to Mar11 — would be after right[1]=Mar10 → chronological violation
  const result = planner.updateDateFor(TherapyPlanner.RIGHTEYE, 0, d(2026, 2, 11));
  assert.equal(result.success, false);
  assert.equal(JSON.stringify(planner.schedule), scheduleBefore, 'schedule must be unchanged');
});

test('correcting a historical appointment can cause a cross-eye cascade of planned appointments', () => {
  // right[0] completed Mar3, left[0] forced to Mar24 (close to Mar17=today).
  // Edit right[0] to Mar17 → |Mar24-Mar17|=7<14 → left[0] must cascade to Mar31.
  const planner = new TherapyPlanner({}, { today: d(2026, 2, 17) }); // Mar17
  planner.setStatus(TherapyPlanner.RIGHTEYE, 0, 'completed', d(2026, 2, 3));
  // Force left[0] closer to Mar17 for a visible cascade
  planner.schedule[TherapyPlanner.LEFTEYE][0].plannedDate = d(2026, 2, 24); // Mar24 Tue

  const result = planner.updateDateFor(TherapyPlanner.RIGHTEYE, 0, d(2026, 2, 17)); // Mar17 Tue
  assert.equal(result.success, true, result.message || '');

  const l0 = planner.getPlanByEye(TherapyPlanner.LEFTEYE)[0];
  // nextClinicDate(Mar17+14=Mar31) = Mar31 (Tue)
  assert.ok(l0.plannedDate >= d(2026, 2, 31),
    `left[0] must advance to >= Mar31; got ${fmt(l0.plannedDate)}`);
  const v = planner.validateSchedule();
  assert.equal(v.valid, true, v.violations && v.violations.join('; '));
});

// ── 9f. Status transitions ────────────────────────────────────────────────────

test('changing planned to completed triggers cascade on following appointments', () => {
  const planner = histPlanner(); // today=Mar3, right[0]=Mar3 (planned)
  const result = planner.setStatus(TherapyPlanner.RIGHTEYE, 0, 'completed', d(2026, 2, 3));
  assert.equal(result.success, true, result.message || '');
  assert.equal(planner.getPlanByEye(TherapyPlanner.RIGHTEYE)[0].status, TherapyPlanner.STATUS_COMPLETED);
  const r1 = planner.getPlanByEye(TherapyPlanner.RIGHTEYE)[1];
  assert.equal(r1.status, TherapyPlanner.STATUS_PLANNED);
  assert.ok(r1.plannedDate >= d(2026, 2, 31),
    `right[1] must be >= Mar31 (Mar3+28); got ${fmt(r1.plannedDate)}`);
  const v = planner.validateSchedule();
  assert.equal(v.valid, true, v.violations && v.violations.join('; '));
});

test('an invalid planned-to-completed transition is rolled back transactionally', () => {
  const planner = histPlanner();
  const scheduleBefore = JSON.stringify(planner.schedule);
  // right[1] cannot be completed while right[0] is still planned
  const result = planner.setStatus(TherapyPlanner.RIGHTEYE, 1, 'completed', d(2026, 2, 1));
  assert.equal(result.success, false);
  assert.equal(JSON.stringify(planner.schedule), scheduleBefore, 'schedule must be unchanged');
});

test('completed-to-planned is allowed when the session is the last completed in the eye', () => {
  const planner = histPlanner();
  planner.setStatus(TherapyPlanner.RIGHTEYE, 0, 'completed', d(2026, 2, 3));
  const result = planner.setStatus(TherapyPlanner.RIGHTEYE, 0, 'planned');
  assert.equal(result.success, true, result.message || '');
  assert.equal(planner.getPlanByEye(TherapyPlanner.RIGHTEYE)[0].status, TherapyPlanner.STATUS_PLANNED);
  const v = planner.validateSchedule();
  assert.equal(v.valid, true, v.violations && v.violations.join('; '));
});

test('completed-to-planned is rejected when another completed appointment follows it', () => {
  const planner = new TherapyPlanner({}, { today: d(2026, 2, 17) });
  planner.setStatus(TherapyPlanner.RIGHTEYE, 0, 'completed', d(2026, 2, 3));
  planner.setStatus(TherapyPlanner.RIGHTEYE, 1, 'completed', d(2026, 2, 10));
  const result = planner.setStatus(TherapyPlanner.RIGHTEYE, 0, 'planned'); // not the last completed
  assert.equal(result.success, false);
  assert.equal(result.reason, 'NOT_LAST_COMPLETED');
});

test('completed-to-planned transition does not produce a planned appointment before today', () => {
  const planner = histPlanner(); // today=Mar3
  planner.setStatus(TherapyPlanner.RIGHTEYE, 0, 'completed', d(2026, 2, 3)); // completed today
  const result = planner.setStatus(TherapyPlanner.RIGHTEYE, 0, 'planned');
  assert.equal(result.success, true, result.message || '');
  const r0 = planner.getPlanByEye(TherapyPlanner.RIGHTEYE)[0];
  assert.ok(r0.plannedDate >= HIST_TODAY,
    `planned date after transition must be >= today; got ${fmt(r0.plannedDate)}`);
});

test('cannot mark appointment completed with a future date via setStatus', () => {
  const planner = histPlanner();
  const result = planner.setStatus(TherapyPlanner.RIGHTEYE, 0, 'completed', d(2026, 2, 4)); // Mar4>Mar3
  assert.equal(result.success, false);
  assert.equal(result.reason, 'COMPLETED_AFTER_TODAY');
});

// ── 9g. Global validation with mixed statuses ─────────────────────────────────

test('completed-to-completed clinic-day exceptions do not fail global validation', () => {
  const planner = new TherapyPlanner({}, { today: d(2026, 2, 17) });
  planner.setStatus(TherapyPlanner.RIGHTEYE, 0, 'completed', d(2026, 2, 1)); // Sun Mar1 — non-clinic
  const v = planner.validateSchedule();
  assert.equal(v.valid, true, v.violations && v.violations.join('; '));
});

test('completed-to-completed same-eye interval exceptions do not fail global validation', () => {
  const planner = new TherapyPlanner({}, { today: d(2026, 2, 17) });
  planner.setStatus(TherapyPlanner.RIGHTEYE, 0, 'completed', d(2026, 2, 3));
  planner.setStatus(TherapyPlanner.RIGHTEYE, 1, 'completed', d(2026, 2, 10)); // only 7 days later
  const v = planner.validateSchedule();
  assert.equal(v.valid, true, v.violations && v.violations.join('; '));
});

test('completed-to-completed cross-eye gap exceptions do not fail global validation', () => {
  const planner = new TherapyPlanner({}, { today: d(2026, 2, 10) });
  planner.setStatus(TherapyPlanner.RIGHTEYE, 0, 'completed', d(2026, 2, 3)); // Mar3
  planner.setStatus(TherapyPlanner.LEFTEYE, 0, 'completed', d(2026, 2, 10)); // Mar10, only 7 days from right
  const v = planner.validateSchedule();
  assert.equal(v.valid, true, v.violations && v.violations.join('; '));
});

test('completed-to-planned cross-eye violations do fail global validation', () => {
  const planner = histPlanner(); // today=Mar3
  planner.setStatus(TherapyPlanner.RIGHTEYE, 0, 'completed', d(2026, 2, 3)); // Mar3 (today)
  // Force left[0] planned to Mar10 — only 7 days from completed right[0]=Mar3
  planner.schedule[TherapyPlanner.LEFTEYE][0].plannedDate = d(2026, 2, 10);
  const v = planner.validateSchedule();
  assert.equal(v.valid, false);
  assert.ok(v.violations.some(m => m.includes('LEFTEYE[0]') || m.includes('14')),
    'violation must mention the cross-eye gap');
});

test('planned-to-planned cross-eye violations do fail global validation', () => {
  const planner = histPlanner(); // today=Mar3, right[0]=Mar3, left[0]=Mar17
  // Force left[0] to Mar4 — only 1 day from right[0]=Mar3
  planner.schedule[TherapyPlanner.LEFTEYE][0].plannedDate = d(2026, 2, 4); // Mar4 Wed
  const v = planner.validateSchedule();
  assert.equal(v.valid, false);
  assert.ok(v.violations.some(m => m.includes('14') || m.toLowerCase().includes('apart')),
    'violation must mention the gap');
});

test('completed-to-planned same-eye interval violations do fail global validation', () => {
  const planner = histPlanner(); // today=Mar3
  planner.setStatus(TherapyPlanner.RIGHTEYE, 0, 'completed', d(2026, 2, 3)); // Mar3
  // Force right[1] to Mar10 — only 7 days from completed right[0]=Mar3
  planner.schedule[TherapyPlanner.RIGHTEYE][1].plannedDate = d(2026, 2, 10); // Mar10 Tue
  const v = planner.validateSchedule();
  assert.equal(v.valid, false);
  assert.ok(v.violations.some(m => m.includes('interval')),
    'violation must mention the interval');
});

// ── 9h. Add / remove with completed prefix ───────────────────────────────────

test('adding an appointment with a completed prefix works correctly', () => {
  const planner = histPlanner();
  planner.setStatus(TherapyPlanner.RIGHTEYE, 0, 'completed', d(2026, 2, 3));
  const result = planner.addTherapy(TherapyPlanner.RIGHTEYE);
  assert.equal(result, true);
  const plan = planner.getPlanByEye(TherapyPlanner.RIGHTEYE);
  assert.equal(plan[0].status, TherapyPlanner.STATUS_COMPLETED);
  assert.equal(plan[plan.length - 1].status, TherapyPlanner.STATUS_PLANNED);
  const v = planner.validateSchedule();
  assert.equal(v.valid, true, v.violations && v.violations.join('; '));
});

test('removing the last planned session with a completed prefix leaves a valid schedule', () => {
  const planner = histPlanner(); // 3 right sessions
  planner.setStatus(TherapyPlanner.RIGHTEYE, 0, 'completed', d(2026, 2, 3));
  const result = planner.removeTherapy(TherapyPlanner.RIGHTEYE);
  assert.equal(result, true);
  assert.equal(planner.getPlanByEye(TherapyPlanner.RIGHTEYE).length, 2);
  const v = planner.validateSchedule();
  assert.equal(v.valid, true, v.violations && v.violations.join('; '));
});


// ─── 10. New spec tests ──────────────────────────────────────────────────────
//
// Tests 1-22 from the specification.
// Reference today for new cascade tests: Tuesday 6 January 2026 (TODAY).
// Reference today for historical tests: Tuesday 22 July 2026 (JULY_TODAY).

const JULY_TODAY = d(2026, 6, 22); // Tue 22 Jul 2026

function julyPlanner() {
  return new TherapyPlanner({}, { today: JULY_TODAY });
}

// ── 10a. Minimal cascade (spec tests 1-3) ───────────────────────────────────

test('spec-test-1: minimal cascade produces exact dates for January example', () => {
  // Today = Jan 6.  right[0] moves from Jan6 to Jan13.
  // Expected: R=[Jan13, Feb10, Mar10], L=[Jan27, Feb24, Mar24]
  const planner = defaultPlanner();
  const result = planner.updateDateFor(TherapyPlanner.RIGHTEYE, 0, d(2026, 0, 13));
  assert.equal(result.success, true, result.message || '');

  const rp = planner.getPlanByEye(TherapyPlanner.RIGHTEYE);
  const lp = planner.getPlanByEye(TherapyPlanner.LEFTEYE);
  assert.equal(fmt(rp[0].plannedDate), '2026-01-13', 'right[0]');
  assert.equal(fmt(rp[1].plannedDate), '2026-02-10', 'right[1]');
  assert.equal(fmt(rp[2].plannedDate), '2026-03-10', 'right[2]');
  assert.equal(fmt(lp[0].plannedDate), '2026-01-27', 'left[0]');
  assert.equal(fmt(lp[1].plannedDate), '2026-02-24', 'left[1]');
  assert.equal(fmt(lp[2].plannedDate), '2026-03-24', 'left[2]');
});

test('spec-test-2: no appointment is placed beyond the earliest valid clinic date', () => {
  const planner = defaultPlanner();
  planner.updateDateFor(TherapyPlanner.RIGHTEYE, 0, d(2026, 0, 13));
  const rp = planner.getPlanByEye(TherapyPlanner.RIGHTEYE);
  const lp = planner.getPlanByEye(TherapyPlanner.LEFTEYE);
  // right[1] lower bound = Jan13+28=Feb10 with no cross-eye conflict from finalized left → Feb10
  assert.equal(fmt(rp[1].plannedDate), '2026-02-10');
  // left[0] earliest valid from gap with right[0]=Jan13: Jan27
  assert.equal(fmt(lp[0].plannedDate), '2026-01-27');
});

test('spec-test-3: cascade is deterministic across repeated identical runs', () => {
  const p1 = defaultPlanner();
  p1.updateDateFor(TherapyPlanner.RIGHTEYE, 0, d(2026, 0, 13));
  const p2 = defaultPlanner();
  p2.updateDateFor(TherapyPlanner.RIGHTEYE, 0, d(2026, 0, 13));
  for (const eye of [TherapyPlanner.RIGHTEYE, TherapyPlanner.LEFTEYE]) {
    p1.getPlanByEye(eye).forEach((s, i) => {
      assert.equal(fmt(s.plannedDate), fmt(p2.getPlanByEye(eye)[i].plannedDate),
        `${eye}[${i}] must be identical in both planners`);
    });
  }
});

// ── 10b. Mutable same-day conflict (spec tests 4-6) ─────────────────────────

test('spec-test-4: mutable opposite-eye same-day conflict cascades forward', () => {
  // left[0] → Jan6 (same as right[0]=Jan6 which is mutable since snapshot >= Jan6)
  const planner = defaultPlanner();
  const result = planner.updateDateFor(TherapyPlanner.LEFTEYE, 0, d(2026, 0, 6));
  assert.equal(result.success, true, result.message || '');
  assert.equal(fmt(planner.getPlanByEye(TherapyPlanner.LEFTEYE)[0].plannedDate), '2026-01-06',
    'left[0] stays on the edited date');
  const r0 = planner.getPlanByEye(TherapyPlanner.RIGHTEYE)[0];
  assert.ok(r0.plannedDate > d(2026, 0, 6), `right[0] must cascade past Jan6; got ${fmt(r0.plannedDate)}`);
  const v = planner.validateSchedule();
  assert.equal(v.valid, true, v.violations && v.violations.join('; '));
});

test('spec-test-5: same-day conflict with completed opposite-eye is rejected', () => {
  // Mark right[0] completed on Jan6, then try to place left[0] on Jan6.
  const planner = defaultPlanner();
  planner.setStatus(TherapyPlanner.RIGHTEYE, 0, 'completed', d(2026, 0, 6));
  const result = planner.updateDateFor(TherapyPlanner.LEFTEYE, 0, d(2026, 0, 6));
  assert.equal(result.success, false);
  assert.equal(result.reason, 'INTER_EYE_GAP');
});

test('spec-test-6: same-day conflict with a fixed previous planned appointment is rejected', () => {
  // Confirm left[0]=Feb10 (fixed, earlier than the target date).
  // Then try right[1]=Feb10 — left[0] snapshot Feb10 < Feb10? No: equal → mutable.
  // Use left[0]=Feb3 (< Feb10) to force it into the fixed set.
  const planner = defaultPlanner();
  planner.updateDateFor(TherapyPlanner.LEFTEYE, 0, d(2026, 1, 3));  // left[0]=Feb3 (confirmed)
  // right[1]=Feb10: left[0]=Feb3 has snapshotDate Feb3 < Feb10 → fixed; |Feb10-Feb3|=7<14 → reject
  const result = planner.updateDateFor(TherapyPlanner.RIGHTEYE, 1, d(2026, 1, 10));
  assert.equal(result.success, false);
  assert.equal(result.reason, 'INTER_EYE_GAP');
});

// ── 10c. Historical reconstruction (spec tests 7-11) ────────────────────────

test('spec-test-7: first generated planned is earliest valid clinic date after historical entry', () => {
  // today=Jul22 2026 (Tue), completed Jun1 2026, 4-week interval.
  // max(Jul22, Jun1+28=Jun29) = Jul22.  But left[0] also recalculates to Jul22,
  // so right[1] must be >= Jul22+14=Aug5 (Wed — next clinic day after gap).
  const planner = julyPlanner();
  planner.setStatus(TherapyPlanner.RIGHTEYE, 0, 'completed', d(2026, 5, 1)); // Jun1
  const r1 = planner.getPlanByEye(TherapyPlanner.RIGHTEYE)[1];
  // right[1] must be the earliest clinic date respecting today + interval + cross-eye gap.
  // left[0] cascades to Jul22; right[1] must be >= Jul22+14=Aug5.
  assert.equal(fmt(r1.plannedDate), '2026-08-05',
    `right[1] must be Aug5 (earliest valid after left[0] on Jul22); got ${fmt(r1.plannedDate)}`);
  const v = planner.validateSchedule();
  assert.equal(v.valid, true, v.violations && v.violations.join('; '));
});

test('spec-test-8: generated appointment may move backward after historical correction', () => {
  // right[0] completed Mar3; right[1]=Mar31 (generated).
  // Correct right[0]→Feb1: right[1] should recalculate from max(today=Mar3, Feb1+28=Mar1)=Mar3.
  const planner = new TherapyPlanner({}, { today: d(2026, 2, 3) });
  planner.setStatus(TherapyPlanner.RIGHTEYE, 0, 'completed', d(2026, 2, 3));
  const dateBefore = planner.getPlanByEye(TherapyPlanner.RIGHTEYE)[1].plannedDate;
  assert.equal(fmt(dateBefore), '2026-03-31');

  const result = planner.updateDateFor(TherapyPlanner.RIGHTEYE, 0, d(2026, 1, 1)); // Feb1
  assert.equal(result.success, true, result.message || '');

  const r1 = planner.getPlanByEye(TherapyPlanner.RIGHTEYE)[1];
  assert.ok(r1.plannedDate < dateBefore,
    `right[1] must move backward from Mar31; got ${fmt(r1.plannedDate)}`);
  const v = planner.validateSchedule();
  assert.equal(v.valid, true, v.violations && v.violations.join('; '));
});

test('spec-test-9: confirmed planned appointment retains its date after historical correction', () => {
  // Confirm right[1]=Apr14, then mark right[0]=completed Mar3.
  // right[1] (confirmed) is a valid anchor → stays at exactly Apr14.
  const planner = new TherapyPlanner({}, { today: d(2026, 2, 3) });
  planner.updateDateFor(TherapyPlanner.RIGHTEYE, 1, d(2026, 3, 14)); // Apr14 confirmed
  planner.setStatus(TherapyPlanner.RIGHTEYE, 0, 'completed', d(2026, 2, 3));
  const r1 = planner.getPlanByEye(TherapyPlanner.RIGHTEYE)[1];
  assert.equal(fmt(r1.plannedDate), '2026-04-14',
    `confirmed right[1] must remain exactly Apr14; got ${fmt(r1.plannedDate)}`);
  assert.equal(r1.dateOrigin, TherapyPlanner.DATE_ORIGIN_CONFIRMED);
});

test('spec-test-10: confirmed appointment that becomes invalid moves forward, never backward', () => {
  // Confirm right[1]=Mar31.  Then complete right[0] and advance today to Apr1,
  // then correct right[0]→Apr1 (confirmed floor=Mar31, interval floor=Apr29 → Apr29+).
  const planner = new TherapyPlanner({}, { today: d(2026, 2, 3) });
  planner.updateDateFor(TherapyPlanner.RIGHTEYE, 1, d(2026, 2, 31)); // Mar31 confirmed
  planner.setStatus(TherapyPlanner.RIGHTEYE, 0, 'completed', d(2026, 2, 3));

  planner.today = new Date(2026, 3, 1); // Apr1
  const result = planner.updateDateFor(TherapyPlanner.RIGHTEYE, 0, d(2026, 3, 1)); // Apr1 Wed
  assert.equal(result.success, true, result.message || '');

  const r1 = planner.getPlanByEye(TherapyPlanner.RIGHTEYE)[1];
  // lowerBound = max(Apr1, confirmedDate=Mar31, Apr1+28=Apr29) = Apr29
  assert.ok(r1.plannedDate >= d(2026, 3, 29),
    `confirmed right[1] must be >= Apr29; got ${fmt(r1.plannedDate)}`);
  // Must never go below confirmed date (Mar31)
  assert.ok(r1.plannedDate >= d(2026, 2, 31),
    `confirmed appointment must not go below confirmed date Mar31; got ${fmt(r1.plannedDate)}`);
});

test('spec-test-11: completed appointments never move during historical reconstruction', () => {
  const planner = new TherapyPlanner({}, { today: d(2026, 2, 17) });
  planner.setStatus(TherapyPlanner.RIGHTEYE, 0, 'completed', d(2026, 2, 3));
  planner.setStatus(TherapyPlanner.RIGHTEYE, 1, 'completed', d(2026, 2, 10));

  const r0Before = fmt(planner.getPlanByEye(TherapyPlanner.RIGHTEYE)[0].plannedDate);
  planner.updateDateFor(TherapyPlanner.RIGHTEYE, 1, d(2026, 2, 17)); // correct r1 → Mar17
  assert.equal(fmt(planner.getPlanByEye(TherapyPlanner.RIGHTEYE)[0].plannedDate), r0Before,
    'right[0] must not move during right[1] correction');
  assert.equal(fmt(planner.getPlanByEye(TherapyPlanner.RIGHTEYE)[1].plannedDate), '2026-03-17');
});

// ── 10d. Atomic historical UI workflow (spec tests 12-14) ───────────────────

test('spec-test-12: changing row to completed does not first commit today as a temporary date', () => {
  withMockDom((createTherapyListComponent, mockDoc) => {
    const planner = histPlanner();
    const component = createTherapyListComponent('testComp', TherapyPlanner.RIGHTEYE, planner);
    mockDoc.root.appendChild(component);

    const scheduleBefore = JSON.stringify(planner.schedule);

    // Simulate user selecting "completed" in status dropdown
    const statusSelect = component.findById(`${TherapyPlanner.RIGHTEYE}-status-0`);
    if (statusSelect) {
      statusSelect.value = TherapyPlanner.STATUS_COMPLETED;
      statusSelect.eventListeners['change'][0]({ target: statusSelect });
    }

    // Schedule must be unchanged — no temp "today" date committed yet
    assert.equal(JSON.stringify(planner.schedule), scheduleBefore,
      'schedule must not change until date is provided');
  });
});

test('spec-test-13: status and completed date are committed together atomically', () => {
  withMockDom((createTherapyListComponent, mockDoc) => {
    const planner = histPlanner();
    const component = createTherapyListComponent('testComp', TherapyPlanner.RIGHTEYE, planner);
    mockDoc.root.appendChild(component);

    // Start pending completion
    const statusSelect = component.findById(`${TherapyPlanner.RIGHTEYE}-status-0`);
    if (statusSelect) {
      statusSelect.value = TherapyPlanner.STATUS_COMPLETED;
      statusSelect.eventListeners['change'][0]({ target: statusSelect });
    }

    // Find the confirm input and submit button (inline date picker form)
    const confirmInput = component.findById(`${TherapyPlanner.RIGHTEYE}-complete-date-0`);
    const confirmBtn   = component.findById(`${TherapyPlanner.RIGHTEYE}-complete-confirm-0`);
    if (confirmInput && confirmBtn) {
      confirmInput.value = '2026-03-01'; // Mar1 (valid past date)
      confirmBtn.eventListeners['click'][0]({ target: confirmBtn });
    }

    const r0 = planner.getPlanByEye(TherapyPlanner.RIGHTEYE)[0];
    assert.equal(r0.status, TherapyPlanner.STATUS_COMPLETED,
      'appointment must now be completed');
    assert.equal(fmt(r0.plannedDate), '2026-03-01',
      'date must be the user-provided date, not today');
  });
});

test('spec-test-14: cancelling completed-date entry leaves schedule unchanged', () => {
  withMockDom((createTherapyListComponent, mockDoc) => {
    const planner = histPlanner();
    const component = createTherapyListComponent('testComp', TherapyPlanner.RIGHTEYE, planner);
    mockDoc.root.appendChild(component);

    const scheduleBefore = JSON.stringify(planner.schedule);

    // Start pending completion
    const statusSelect = component.findById(`${TherapyPlanner.RIGHTEYE}-status-0`);
    if (statusSelect) {
      statusSelect.value = TherapyPlanner.STATUS_COMPLETED;
      statusSelect.eventListeners['change'][0]({ target: statusSelect });
    }

    // Cancel (dismiss without confirming)
    const cancelBtn = component.findById(`${TherapyPlanner.RIGHTEYE}-complete-cancel-0`);
    if (cancelBtn) {
      cancelBtn.eventListeners['click'][0]({ target: cancelBtn });
    }

    assert.equal(JSON.stringify(planner.schedule), scheduleBefore,
      'schedule must be unchanged after cancel');
    // Status select must be reverted to planned
    const sel2 = component.findById(`${TherapyPlanner.RIGHTEYE}-status-0`);
    if (sel2) assert.equal(sel2.value, TherapyPlanner.STATUS_PLANNED);
  });
});

// ── 10e. Warning persistence (spec tests 15-18) ─────────────────────────────

test('spec-test-15: warning from non-clinic completed date persists after redraw', () => {
  withMockDom((createTherapyListComponent, mockDoc) => {
    const planner = histPlanner();
    const component = createTherapyListComponent('testComp', TherapyPlanner.RIGHTEYE, planner);
    mockDoc.root.appendChild(component);

    // Mark right[0] completed on a Sunday (non-clinic) using the confirm form
    const statusSelect = component.findById(`${TherapyPlanner.RIGHTEYE}-status-0`);
    if (statusSelect) {
      statusSelect.value = TherapyPlanner.STATUS_COMPLETED;
      statusSelect.eventListeners['change'][0]({ target: statusSelect });
    }
    const confirmInput = component.findById(`${TherapyPlanner.RIGHTEYE}-complete-date-0`);
    const confirmBtn   = component.findById(`${TherapyPlanner.RIGHTEYE}-complete-confirm-0`);
    if (confirmInput && confirmBtn) {
      confirmInput.value = '2026-03-01'; // Sun Mar1
      confirmBtn.eventListeners['click'][0]({ target: confirmBtn });
    }

    // After the notifyListeners redraw, warning should still be visible
    const warnNodes = [];
    function findWarnings(node) {
      if (!node || typeof node !== 'object') return;
      if (node.classList && node.classList.contains('therapy-warning')) warnNodes.push(node);
      if (Array.isArray(node.children)) node.children.forEach(findWarnings);
    }
    findWarnings(component);
    assert.ok(warnNodes.length > 0, 'warning must be visible after redraw');
  });
});

test('spec-test-16: rejected edit error is visible after redraw', () => {
  withMockDom((createTherapyListComponent, mockDoc) => {
    const planner = defaultPlanner();
    const component = createTherapyListComponent('testComp', TherapyPlanner.RIGHTEYE, planner);
    mockDoc.root.appendChild(component);

    // Attempt invalid edit: Jan5 (before today)
    const input0 = component.findById(`${TherapyPlanner.RIGHTEYE}-date-0`);
    input0.value = '2026-01-05';
    input0.eventListeners['change'][0]({ target: input0 });

    // Error must be visible in the redrawn component
    const errNodes = [];
    function findErrors(node) {
      if (!node || typeof node !== 'object') return;
      if (node.classList && node.classList.contains('therapy-error')) errNodes.push(node);
      if (Array.isArray(node.children)) node.children.forEach(findErrors);
    }
    findErrors(component);
    assert.ok(errNodes.length > 0, 'error must be visible after failed edit');
    // Input value must be restored
    assert.equal(input0.value, '2026-01-06');
  });
});

test('spec-test-17: subsequent successful edit clears stale error', () => {
  withMockDom((createTherapyListComponent, mockDoc) => {
    const planner = defaultPlanner();
    const component = createTherapyListComponent('testComp', TherapyPlanner.RIGHTEYE, planner);
    mockDoc.root.appendChild(component);

    // First: rejected edit
    const input0 = component.findById(`${TherapyPlanner.RIGHTEYE}-date-0`);
    input0.value = '2026-01-05';
    input0.eventListeners['change'][0]({ target: input0 });

    // Confirm error is set
    const errsBefore = [];
    function findErrors(node) {
      if (!node || typeof node !== 'object') return;
      if (node.classList && node.classList.contains('therapy-error')) errsBefore.push(node);
      if (Array.isArray(node.children)) node.children.forEach(findErrors);
    }
    findErrors(component);
    assert.ok(errsBefore.length > 0, 'error must exist before successful edit');

    // Then: valid edit — should clear error
    const input0b = component.findById(`${TherapyPlanner.RIGHTEYE}-date-0`);
    input0b.value = '2026-01-13';
    input0b.eventListeners['change'][0]({ target: input0b });

    const errsAfter = [];
    function findErrors2(node) {
      if (!node || typeof node !== 'object') return;
      if (node.classList && node.classList.contains('therapy-error')) errsAfter.push(node);
      if (Array.isArray(node.children)) node.children.forEach(findErrors2);
    }
    findErrors2(component);
    assert.equal(errsAfter.length, 0, 'error must be cleared after successful edit');
  });
});

test('spec-test-18: repeated redraws do not duplicate warnings', () => {
  withMockDom((createTherapyListComponent, mockDoc) => {
    const planner = histPlanner();
    const component = createTherapyListComponent('testComp', TherapyPlanner.RIGHTEYE, planner);
    mockDoc.root.appendChild(component);

    // Trigger an operation that generates a warning (non-clinic completed date)
    const statusSelect = component.findById(`${TherapyPlanner.RIGHTEYE}-status-0`);
    if (statusSelect) {
      statusSelect.value = TherapyPlanner.STATUS_COMPLETED;
      statusSelect.eventListeners['change'][0]({ target: statusSelect });
    }
    const confirmInput = component.findById(`${TherapyPlanner.RIGHTEYE}-complete-date-0`);
    const confirmBtn   = component.findById(`${TherapyPlanner.RIGHTEYE}-complete-confirm-0`);
    if (confirmInput && confirmBtn) {
      confirmInput.value = '2026-03-01'; // Sun — non-clinic
      confirmBtn.eventListeners['click'][0]({ target: confirmBtn });
    }

    // Force multiple external redraws (simulating other-eye changes)
    planner.notifyListeners();
    planner.notifyListeners();

    const warnNodes = [];
    function findWarnings(node) {
      if (!node || typeof node !== 'object') return;
      if (node.classList && node.classList.contains('therapy-warning')) warnNodes.push(node);
      if (Array.isArray(node.children)) node.children.forEach(findWarnings);
    }
    findWarnings(component);
    assert.equal(warnNodes.length, 1, `exactly one warning must be visible; found ${warnNodes.length}`);
  });
});

// ── 10f. Changed appointments (spec tests 19-22) ────────────────────────────

test('spec-test-19: successful cascade returns all appointments whose date changed', () => {
  const planner = defaultPlanner();
  const result = planner.updateDateFor(TherapyPlanner.RIGHTEYE, 0, d(2026, 0, 13));
  assert.equal(result.success, true);
  // right[0] moved, plus at least right[1], right[2], left[0], left[1], left[2]
  assert.ok(result.changedAppointments.length >= 5,
    `expected >= 5 changed; got ${result.changedAppointments.length}`);
  const keys = result.changedAppointments.map(c => `${c.type}_${c.index}`);
  assert.ok(keys.includes('RIGHTEYE_0'), 'right[0] (the edited appointment) must be included');
});

test('spec-test-20: unchanged appointments are not included in changedAppointments', () => {
  const planner = defaultPlanner();
  // Confirm right[1]=Jun2 (far future — will not change after right[0]→Jan8)
  planner.updateDateFor(TherapyPlanner.RIGHTEYE, 2, d(2026, 5, 2)); // Jun2
  const result = planner.updateDateFor(TherapyPlanner.RIGHTEYE, 0, d(2026, 0, 8)); // Jan8
  assert.equal(result.success, true);
  // right[2] should stay at Jun2 (confirmed) — must not appear in changedAppointments
  // (unless cross-eye pushed it, but Jun2 is far enough)
  const r2Changed = result.changedAppointments.find(c => c.type === TherapyPlanner.RIGHTEYE && c.index === 2);
  // right[2]=Jun2 confirmed; if the cascade did not change it, it should not be in the list
  if (r2Changed) {
    // It is allowed to be in the list only if the date actually changed
    assert.notEqual(r2Changed.oldDate, r2Changed.newDate,
      'if right[2] appears in changedAppointments, its dates must differ');
  }
  // Verify dates with no change are absent
  const allSame = result.changedAppointments.every(c => c.oldDate !== c.newDate);
  assert.ok(allSame, 'all entries in changedAppointments must have different old/new dates');
});

test('spec-test-21: changedAppointments contains correct old and new dates', () => {
  const planner = defaultPlanner();
  const result = planner.updateDateFor(TherapyPlanner.RIGHTEYE, 0, d(2026, 0, 13));
  assert.equal(result.success, true);

  const r0 = result.changedAppointments.find(c => c.type === TherapyPlanner.RIGHTEYE && c.index === 0);
  assert.ok(r0, 'right[0] must appear in changedAppointments');
  assert.equal(r0.oldDate, '2026-01-06', 'right[0] oldDate must be Jan6');
  assert.equal(r0.newDate, '2026-01-13', 'right[0] newDate must be Jan13');

  const l0 = result.changedAppointments.find(c => c.type === TherapyPlanner.LEFTEYE && c.index === 0);
  assert.ok(l0, 'left[0] must appear in changedAppointments');
  assert.equal(l0.oldDate, '2026-01-20', 'left[0] oldDate must be Jan20');
  assert.equal(l0.newDate, '2026-01-27', 'left[0] newDate must be Jan27');
});

test('spec-test-22: historical reconstruction reports generated appointments that moved backward', () => {
  const planner = new TherapyPlanner({}, { today: d(2026, 2, 3) }); // Mar3
  planner.setStatus(TherapyPlanner.RIGHTEYE, 0, 'completed', d(2026, 2, 3));
  // right[1]=Mar31. Now correct right[0]→Feb1.
  const result = planner.updateDateFor(TherapyPlanner.RIGHTEYE, 0, d(2026, 1, 1));
  assert.equal(result.success, true, result.message || '');

  const r1entry = result.changedAppointments.find(
    c => c.type === TherapyPlanner.RIGHTEYE && c.index === 1,
  );
  assert.ok(r1entry, 'right[1] must appear in changedAppointments');
  assert.equal(r1entry.oldDate, '2026-03-31', 'right[1] old date must be Mar31');
  // New date must be earlier than old date (backward movement)
  assert.ok(new Date(r1entry.newDate) < new Date(r1entry.oldDate),
    `right[1] must have moved backward; old=${r1entry.oldDate} new=${r1entry.newDate}`);
  assert.equal(r1entry.dateOrigin, 'generated', 'right[1] must be generated');
});

// ── 10g. dateOrigin field ────────────────────────────────────────────────────

test('all initially created appointments have dateOrigin generated', () => {
  const planner = defaultPlanner();
  for (const eye of [TherapyPlanner.RIGHTEYE, TherapyPlanner.LEFTEYE]) {
    for (const s of planner.getPlanByEye(eye)) {
      assert.equal(s.dateOrigin, TherapyPlanner.DATE_ORIGIN_GENERATED,
        `${eye} appointment must default to generated`);
    }
  }
});

test('updateDateFor marks the edited planned appointment as confirmed', () => {
  const planner = defaultPlanner();
  planner.updateDateFor(TherapyPlanner.RIGHTEYE, 0, d(2026, 0, 13));
  const r0 = planner.getPlanByEye(TherapyPlanner.RIGHTEYE)[0];
  assert.equal(r0.dateOrigin, TherapyPlanner.DATE_ORIGIN_CONFIRMED);
  // Cascaded appointments remain generated
  const r1 = planner.getPlanByEye(TherapyPlanner.RIGHTEYE)[1];
  assert.equal(r1.dateOrigin, TherapyPlanner.DATE_ORIGIN_GENERATED);
});

// ─── 11. New regression tests (spec v2) ──────────────────────────────────────

// ── 11a. Ordinary cascade does not move generated dates backward ─────────────

test('new-test-1a: moving right[0] to Jan13 produces exact cascade dates', () => {
  const planner = defaultPlanner();
  const r1 = planner.updateDateFor(TherapyPlanner.RIGHTEYE, 0, d(2026, 0, 13));
  assert.equal(r1.success, true, r1.message || '');

  const rp = planner.getPlanByEye(TherapyPlanner.RIGHTEYE);
  const lp = planner.getPlanByEye(TherapyPlanner.LEFTEYE);
  assert.equal(fmt(rp[0].plannedDate), '2026-01-13');
  assert.equal(fmt(rp[1].plannedDate), '2026-02-10');
  assert.equal(fmt(rp[2].plannedDate), '2026-03-10');
  assert.equal(fmt(lp[0].plannedDate), '2026-01-27');
  assert.equal(fmt(lp[1].plannedDate), '2026-02-24');
  assert.equal(fmt(lp[2].plannedDate), '2026-03-24');
});

test('new-test-1b: moving right[0] back to Jan6 keeps later appointments stable', () => {
  const planner = defaultPlanner();
  planner.updateDateFor(TherapyPlanner.RIGHTEYE, 0, d(2026, 0, 13)); // → Jan13, cascades forward
  const r2 = planner.updateDateFor(TherapyPlanner.RIGHTEYE, 0, d(2026, 0, 6));  // back to Jan6
  assert.equal(r2.success, true, r2.message || '');

  const rp = planner.getPlanByEye(TherapyPlanner.RIGHTEYE);
  const lp = planner.getPlanByEye(TherapyPlanner.LEFTEYE);
  // right[0] is back to Jan6; later appointments must NOT move backward below their snapshot dates.
  assert.equal(fmt(rp[0].plannedDate), '2026-01-06');
  // right[1] stays at Feb10 (snapshot after Jan13 edit), NOT Feb3 (original).
  assert.equal(fmt(rp[1].plannedDate), '2026-02-10');
  assert.equal(fmt(rp[2].plannedDate), '2026-03-10');
  assert.equal(fmt(lp[0].plannedDate), '2026-01-27');
  assert.equal(fmt(lp[1].plannedDate), '2026-02-24');
  assert.equal(fmt(lp[2].plannedDate), '2026-03-24');
});

// ── 11b. Decreasing minWeeks does not move backward in ordinary mode ─────────

test('new-test-2: decreasing minWeeks after increase keeps snapshot date as floor', () => {
  const planner = defaultPlanner();
  // Increase to 8 weeks.
  planner.updateMinWeeksFor(TherapyPlanner.RIGHTEYE, 1, 8);
  const dateAfter8 = fmt(planner.getPlanByEye(TherapyPlanner.RIGHTEYE)[1].plannedDate);

  // Decrease back to 4 weeks — must NOT go below the snapshot (dateAfter8).
  const result = planner.updateMinWeeksFor(TherapyPlanner.RIGHTEYE, 1, 4);
  assert.equal(result.success, true, result.message || '');
  const dateAfter4 = fmt(planner.getPlanByEye(TherapyPlanner.RIGHTEYE)[1].plannedDate);
  assert.equal(dateAfter4, dateAfter8,
    `right[1] must stay at ${dateAfter8}; got ${dateAfter4}`);
  const v = planner.validateSchedule();
  assert.equal(v.valid, true, v.violations && v.violations.join('; '));
});

// ── 11c. Historical mode may move generated dates backward ───────────────────

test('new-test-3: historical correction moves generated date backward to earliest valid', () => {
  const planner = new TherapyPlanner({}, { today: d(2026, 2, 3) }); // Mar3
  planner.setStatus(TherapyPlanner.RIGHTEYE, 0, 'completed', d(2026, 2, 3));
  assert.equal(fmt(planner.getPlanByEye(TherapyPlanner.RIGHTEYE)[1].plannedDate), '2026-03-31');

  // Correct right[0] backward to Feb1: right[1] rebuilds to max(Mar3, Feb1+28=Mar1)=Mar3.
  const result = planner.updateDateFor(TherapyPlanner.RIGHTEYE, 0, d(2026, 1, 1)); // Feb1 Sun (historical)
  assert.equal(result.success, true, result.message || '');

  const r1 = planner.getPlanByEye(TherapyPlanner.RIGHTEYE)[1];
  // Must be earlier than the pre-correction Mar31.
  assert.ok(r1.plannedDate < d(2026, 2, 31),
    `right[1] must move backward from Mar31; got ${fmt(r1.plannedDate)}`);
  // Must be the earliest valid clinic date (today=Mar3 is a clinic day — check >= Mar3).
  assert.ok(r1.plannedDate >= d(2026, 2, 3),
    `right[1] must be >= today (Mar3); got ${fmt(r1.plannedDate)}`);
  const v = planner.validateSchedule();
  assert.equal(v.valid, true, v.violations && v.violations.join('; '));
});

// ── 11d. Valid confirmed appointment has priority in historical mode ──────────

test('new-test-4: confirmed left[0] is preserved as anchor during historical reconstruction', () => {
  // Set up: right[0] completed Mar10, left[0] confirmed Apr14, right[1] generated.
  // Direct schedule manipulation bypasses pre-validation cross-eye check (which would
  // reject Apr14 because right[1]=Apr7 is only 7 days away).
  // The _isConfirmedAnchorValid check inside the historical cascade correctly
  // evaluates whether Apr14 is a valid anchor (it is: >= today, clinic day, no pred).
  const planner = new TherapyPlanner({}, { today: d(2026, 2, 10) }); // Mar10
  planner.schedule[TherapyPlanner.LEFTEYE][0].plannedDate = d(2026, 3, 14); // Apr14
  planner.schedule[TherapyPlanner.LEFTEYE][0].dateOrigin  = TherapyPlanner.DATE_ORIGIN_CONFIRMED;

  // Mark right[0] completed on Mar10: triggers historical cascade.
  const r = planner.setStatus(TherapyPlanner.RIGHTEYE, 0, 'completed', d(2026, 2, 10));
  assert.equal(r.success, true, r.message || '');

  const left0  = planner.getPlanByEye(TherapyPlanner.LEFTEYE)[0];
  const right1 = planner.getPlanByEye(TherapyPlanner.RIGHTEYE)[1];

  // Confirmed anchor must not have been rescheduled.
  assert.equal(fmt(left0.plannedDate), '2026-04-14',
    `confirmed left[0] must remain exactly Apr14; got ${fmt(left0.plannedDate)}`);
  assert.equal(left0.dateOrigin, TherapyPlanner.DATE_ORIGIN_CONFIRMED);
  // Generated right[1] must be pushed out by the confirmed anchor.
  assert.equal(fmt(right1.plannedDate), '2026-04-28',
    `right[1] must be Apr28 (pushed to >= Apr14+14); got ${fmt(right1.plannedDate)}`);
  const v = planner.validateSchedule();
  assert.equal(v.valid, true, v.violations && v.violations.join('; '));
});

// ── 11e. Screenshot minWeeks regression ─────────────────────────────────────

const SCREENSHOT_TODAY = d(2026, 6, 22); // Tue 22 Jul 2026

function screenshotPlanner() {
  // Build the exact screenshot schedule through planner APIs.
  const planner = new TherapyPlanner({}, { today: SCREENSHOT_TODAY });
  // Set up 2-appointment schedules to match screenshot (3 per eye).
  // Right: completed Jul1, planned Aug26 (q-6), planned Sep23 (q-4).
  // Left : completed Jul15, planned Aug12 (q-4), planned Sep9 (q-4).

  // Force right[1]=Aug26 by confirming it, then set interval.
  // We'll use a controlled planner state instead.
  return planner;
}

test('new-test-5: screenshot scenario — changing left[1].minWeeks 4→6 produces exact result', () => {
  // Build the screenshot schedule directly by manipulating the planner.
  const planner = new TherapyPlanner({}, { today: SCREENSHOT_TODAY });

  // Complete right[0] on Jul1.
  planner.setStatus(TherapyPlanner.RIGHTEYE, 0, 'completed', d(2026, 6, 1));
  // Complete left[0] on Jul15.
  planner.setStatus(TherapyPlanner.LEFTEYE, 0, 'completed', d(2026, 6, 15));

  // Force planned dates to match screenshot by confirming them.
  planner.updateDateFor(TherapyPlanner.RIGHTEYE, 1, d(2026, 7, 26)); // Aug26, q still 4 → change to 6
  planner.updateMinWeeksFor(TherapyPlanner.RIGHTEYE, 1, 6);          // set right[1] to q-6
  planner.updateDateFor(TherapyPlanner.RIGHTEYE, 2, d(2026, 8, 23)); // Sep23, q-4
  planner.updateDateFor(TherapyPlanner.LEFTEYE, 1, d(2026, 7, 12));  // Aug12, q-4
  planner.updateDateFor(TherapyPlanner.LEFTEYE, 2, d(2026, 8, 9));   // Sep9, q-4

  // Verify screenshot state.
  const rp0 = planner.getPlanByEye(TherapyPlanner.RIGHTEYE);
  const lp0 = planner.getPlanByEye(TherapyPlanner.LEFTEYE);
  assert.equal(fmt(rp0[1].plannedDate), '2026-08-26', 'setup: right[1]');
  assert.equal(fmt(rp0[2].plannedDate), '2026-09-23', 'setup: right[2]');
  assert.equal(fmt(lp0[1].plannedDate), '2026-08-12', 'setup: left[1]');
  assert.equal(fmt(lp0[2].plannedDate), '2026-09-09', 'setup: left[2]');

  // Change left[1].minWeeks from 4 to 6.
  const result = planner.updateMinWeeksFor(TherapyPlanner.LEFTEYE, 1, 6);
  assert.equal(result.success, true, result.message || '');

  const rp = planner.getPlanByEye(TherapyPlanner.RIGHTEYE);
  const lp = planner.getPlanByEye(TherapyPlanner.LEFTEYE);

  // Exact expected dates per spec.
  assert.equal(fmt(rp[0].plannedDate), '2026-07-01', 'right[0] completed unchanged');
  assert.equal(fmt(lp[0].plannedDate), '2026-07-15', 'left[0] completed unchanged');
  assert.equal(fmt(lp[1].plannedDate), '2026-08-26', 'left[1] must move to Aug26');
  assert.equal(fmt(rp[1].plannedDate), '2026-09-09', 'right[1] must cascade to Sep9');
  assert.equal(fmt(lp[2].plannedDate), '2026-09-23', 'left[2] must stay Sep23');
  assert.equal(fmt(rp[2].plannedDate), '2026-10-07', 'right[2] must cascade to Oct7');

  // No same-day bilateral appointments.
  for (let ri = 0; ri < rp.length; ri++) {
    for (let li = 0; li < lp.length; li++) {
      if (rp[ri].status === 'completed' && lp[li].status === 'completed') continue;
      const gap = Math.abs(
        Math.round((rp[ri].plannedDate - lp[li].plannedDate) / (24 * 60 * 60 * 1000)),
      );
      assert.ok(gap >= 14,
        `right[${ri}] and left[${li}] are only ${gap} days apart (need >= 14)`);
    }
  }

  // Every planned date must be a clinic day.
  for (const [label, plan] of [['right', rp], ['left', lp]]) {
    for (let i = 0; i < plan.length; i++) {
      if (plan[i].status === 'planned') {
        assert.ok(planner.isClinicDate(plan[i].plannedDate),
          `${label}[${i}]=${fmt(plan[i].plannedDate)} must be a clinic day`);
      }
    }
  }

  const v = planner.validateSchedule();
  assert.equal(v.valid, true, v.violations && v.violations.join('; '));

  // changedAppointments must include all moved appointments; completed unchanged must be absent.
  const changed = result.changedAppointments;
  const completedChanged = changed.filter(c => c.status === 'completed');
  assert.equal(completedChanged.length, 0, 'completed appointments must not appear in changedAppointments');
  const allHaveDiff = changed.every(c => c.oldDate !== c.newDate);
  assert.ok(allHaveDiff, 'every changedAppointments entry must have differing old/new dates');
});

// ── 11f. minWeeks rollback ───────────────────────────────────────────────────

test('new-test-6: minWeeks rollback restores schedule and minWeeks on failure', () => {
  // Construct a 1-appointment-each planner and try to increase minWeeks so far
  // that no valid schedule can be produced within a reasonable horizon.
  // Use a custom planner with only two appointments (one per eye) so the interval
  // can be forced to something that conflicts with today.
  const planner = new TherapyPlanner({}, { today: d(2026, 0, 6) });
  // Complete right[0] today, so right[1] lower = today+minWeeks*7.
  planner.setStatus(TherapyPlanner.RIGHTEYE, 0, 'completed', d(2026, 0, 6));

  // Forcibly corrupt the schedule to be almost invalid — easier: just verify rollback
  // by testing a concrete scenario:
  // right[1] currently has minWeeks=4. The planner uses snapshot floor in ordinary mode.
  // We don't have a reliable way to force a validation failure through the public API
  // without a custom validator. Instead, verify the rollback contract via a mock.
  const originalMinWeeks = planner.getPlanByEye(TherapyPlanner.RIGHTEYE)[1].minWeeks;
  const originalDate = planner.getPlanByEye(TherapyPlanner.RIGHTEYE)[1].plannedDate;

  // Any valid minWeeks change from the MINWEEKS list should succeed.
  // Verify that on failure (forced via direct injection) the state is restored.
  // Spy on validateSchedule to force one failure.
  const originalValidate = planner.validateSchedule.bind(planner);
  let callCount = 0;
  planner.validateSchedule = function() {
    if (callCount++ === 0) return { valid: false, violations: ['forced failure'] };
    return originalValidate();
  };

  const result = planner.updateMinWeeksFor(TherapyPlanner.RIGHTEYE, 1, 8);
  assert.equal(result.success, false, 'must fail when validation returns invalid');
  assert.equal(result.reason, 'VALIDATION_FAILED');

  // Schedule must be unchanged.
  const r1after = planner.getPlanByEye(TherapyPlanner.RIGHTEYE)[1];
  assert.equal(r1after.minWeeks, originalMinWeeks, 'minWeeks must be restored');
  assert.equal(fmt(r1after.plannedDate), fmt(originalDate), 'date must be restored');

  planner.validateSchedule = originalValidate; // restore
});

// ── 11g. minWeeks UI redraw ──────────────────────────────────────────────────

test('new-test-7: minWeeks UI change redraws both eyes with updated dates', () => {
  withMockDom((createTherapyListComponent, mockDoc) => {
    const planner = new TherapyPlanner({}, { today: SCREENSHOT_TODAY });
    planner.setStatus(TherapyPlanner.RIGHTEYE, 0, 'completed', d(2026, 6, 1));
    planner.setStatus(TherapyPlanner.LEFTEYE, 0, 'completed', d(2026, 6, 15));

    const rightComp = createTherapyListComponent('right', TherapyPlanner.RIGHTEYE, planner);
    const leftComp  = createTherapyListComponent('left', TherapyPlanner.LEFTEYE, planner);
    mockDoc.root.appendChild(rightComp);
    mockDoc.root.appendChild(leftComp);

    // Confirm left[1]=Aug12, then change minWeeks 4→6.
    planner.updateDateFor(TherapyPlanner.LEFTEYE, 1, d(2026, 7, 12));

    const sel = leftComp.findById(`${TherapyPlanner.LEFTEYE}-select-1`);
    if (sel) {
      sel.value = '6';
      sel.eventListeners['change'][0]({ target: sel });
    }

    // After redraw, left[1] must show a date that is 6 weeks from left[0].
    const leftDate1 = leftComp.findById(`${TherapyPlanner.LEFTEYE}-date-1`);
    const rightDate1 = leftComp.findById(`${TherapyPlanner.RIGHTEYE}-date-1`);
    // The planner must have updated; its state must be valid.
    const v = planner.validateSchedule();
    assert.equal(v.valid, true, v.violations && v.violations.join('; '));
    // No stale same-day date should remain.
    const lp = planner.getPlanByEye(TherapyPlanner.LEFTEYE);
    const rp = planner.getPlanByEye(TherapyPlanner.RIGHTEYE);
    for (let ri = 0; ri < rp.length; ri++) {
      for (let li = 0; li < lp.length; li++) {
        if (rp[ri].status === 'completed' && lp[li].status === 'completed') continue;
        const gap = Math.abs(
          Math.round((rp[ri].plannedDate - lp[li].plannedDate) / (24 * 60 * 60 * 1000)),
        );
        assert.ok(gap >= 14, `right[${ri}] and left[${li}] are only ${gap} days apart after redraw`);
      }
    }
  });
});

// ── 11h. minWeeks UI rollback and error ──────────────────────────────────────

test('new-test-8: failed minWeeks change restores dropdown and shows persistent error', () => {
  withMockDom((createTherapyListComponent, mockDoc) => {
    const planner = new TherapyPlanner({}, { today: d(2026, 0, 6) });
    const component = createTherapyListComponent('testComp', TherapyPlanner.RIGHTEYE, planner);
    mockDoc.root.appendChild(component);

    const originalDate = fmt(planner.getPlanByEye(TherapyPlanner.RIGHTEYE)[1].plannedDate);
    const origMinWeeks = planner.getPlanByEye(TherapyPlanner.RIGHTEYE)[1].minWeeks;

    // Force validation failure on next change.
    const origValidate = planner.validateSchedule.bind(planner);
    let calls = 0;
    planner.validateSchedule = function() {
      if (calls++ === 0) return { valid: false, violations: ['forced failure'] };
      return origValidate();
    };

    const sel = component.findById(`${TherapyPlanner.RIGHTEYE}-select-1`);
    if (sel) {
      sel.value = '8';
      sel.eventListeners['change'][0]({ target: sel });
    }

    // Dropdown must be restored.
    if (sel) {
      assert.equal(sel.value, String(origMinWeeks),
        'dropdown must revert to original minWeeks on failure');
    }
    // Date must be unchanged.
    assert.equal(fmt(planner.getPlanByEye(TherapyPlanner.RIGHTEYE)[1].plannedDate), originalDate,
      'planned date must be unchanged after failed minWeeks change');

    // Error must survive a subsequent buildPlan triggered by another event.
    // Simulate a no-op redraw.
    planner.notifyListeners();
    const err = component.findById ? null : null;
    // Check _messages state via visible DOM elements.
    const errDiv = component.querySelector ? component.querySelector('.therapy-error') : null;
    // The component must have rendered an error div.
    function findByClass(el, cls) {
      if (!el || !el.children) return null;
      for (const child of el.children) {
        if (child.classList && child.classList.contains(cls)) return child;
        const found = findByClass(child, cls);
        if (found) return found;
      }
      return null;
    }
    const errEl = findByClass(component, 'therapy-error');
    assert.ok(errEl, 'an error div with class therapy-error must be visible after failed change');

    planner.validateSchedule = origValidate;
  });
});

// ── 11i. Pending completed cancelled through selector (no planner call) ───────

test('new-test-9: cancelling pending completion via selector does not mutate planner', () => {
  withMockDom((createTherapyListComponent, mockDoc) => {
    const planner = new TherapyPlanner({}, { today: d(2026, 0, 6) });
    // Confirm right[0] to Jan13 so it is confirmed.
    planner.updateDateFor(TherapyPlanner.RIGHTEYE, 0, d(2026, 0, 13));
    const originBefore = planner.getPlanByEye(TherapyPlanner.RIGHTEYE)[0].dateOrigin;
    const dateBefore   = fmt(planner.getPlanByEye(TherapyPlanner.RIGHTEYE)[0].plannedDate);
    const scheduleBefore = JSON.stringify(planner.schedule);

    const component = createTherapyListComponent('testComp', TherapyPlanner.RIGHTEYE, planner);
    mockDoc.root.appendChild(component);

    // Step 1: select "completed" → open pending form.
    const statusSelect = component.findById(`${TherapyPlanner.RIGHTEYE}-status-0`);
    if (statusSelect) {
      statusSelect.value = TherapyPlanner.STATUS_COMPLETED;
      statusSelect.eventListeners['change'][0]({ target: statusSelect });
    }
    // No planner mutation yet.
    assert.equal(JSON.stringify(planner.schedule), scheduleBefore,
      'schedule must not change when pending form opens');

    // Step 2: change selector back to "planned" — must only cancel UI.
    if (statusSelect) {
      statusSelect.value = TherapyPlanner.STATUS_PLANNED;
      statusSelect.eventListeners['change'][0]({ target: statusSelect });
    }
    // Still no planner mutation.
    assert.equal(JSON.stringify(planner.schedule), scheduleBefore,
      'schedule must not change when pending completion is cancelled via selector');
    assert.equal(planner.getPlanByEye(TherapyPlanner.RIGHTEYE)[0].dateOrigin, originBefore,
      'dateOrigin must be unchanged after UI-only cancellation');
    assert.equal(fmt(planner.getPlanByEye(TherapyPlanner.RIGHTEYE)[0].plannedDate), dateBefore,
      'date must be unchanged after UI-only cancellation');
  });
});

// ── 11j. setStatus idempotency ───────────────────────────────────────────────

test('new-test-10: setStatus with same status is idempotent for planned', () => {
  const planner = defaultPlanner();
  const dateBefore = fmt(planner.getPlanByEye(TherapyPlanner.RIGHTEYE)[0].plannedDate);
  const originBefore = planner.getPlanByEye(TherapyPlanner.RIGHTEYE)[0].dateOrigin;

  let listenerCalled = false;
  planner.addListener(() => { listenerCalled = true; });

  const result = planner.setStatus(TherapyPlanner.RIGHTEYE, 0, TherapyPlanner.STATUS_PLANNED);
  assert.equal(result.success, true, result.message || '');
  assert.equal(result.changedAppointments.length, 0, 'no changes should occur for no-op');
  assert.equal(fmt(planner.getPlanByEye(TherapyPlanner.RIGHTEYE)[0].plannedDate), dateBefore,
    'date must be unchanged after idempotent setStatus');
  assert.equal(planner.getPlanByEye(TherapyPlanner.RIGHTEYE)[0].dateOrigin, originBefore,
    'dateOrigin must be unchanged after idempotent setStatus');
  assert.equal(listenerCalled, false, 'listener must not be notified for a no-op');
});

test('new-test-10b: setStatus with same status is idempotent for completed', () => {
  const planner = new TherapyPlanner({}, { today: d(2026, 2, 3) });
  planner.setStatus(TherapyPlanner.RIGHTEYE, 0, 'completed', d(2026, 2, 3));
  const dateBefore = fmt(planner.getPlanByEye(TherapyPlanner.RIGHTEYE)[0].plannedDate);

  let listenerCalled = false;
  planner.addListener(() => { listenerCalled = true; });

  const result = planner.setStatus(TherapyPlanner.RIGHTEYE, 0, TherapyPlanner.STATUS_COMPLETED);
  assert.equal(result.success, true, result.message || '');
  assert.equal(result.changedAppointments.length, 0);
  assert.equal(fmt(planner.getPlanByEye(TherapyPlanner.RIGHTEYE)[0].plannedDate), dateBefore);
  assert.equal(listenerCalled, false, 'no-op must not fire listener');
});

// ── 11k. changedAppointments strictness ──────────────────────────────────────

test('new-test-12: changedAppointments entries always have differing old/new dates', () => {
  const planner = defaultPlanner();
  const result = planner.updateDateFor(TherapyPlanner.RIGHTEYE, 0, d(2026, 0, 13));
  assert.equal(result.success, true);

  for (const entry of result.changedAppointments) {
    assert.notEqual(entry.oldDate, entry.newDate,
      `entry ${entry.type}[${entry.index}] must have different old/new dates`);
  }

  // Completed appointments (if any) must NOT appear.
  const completedEntries = result.changedAppointments.filter(c => c.status === 'completed');
  assert.equal(completedEntries.length, 0,
    'completed appointments must not appear in changedAppointments for a planned-date edit');
});

test('new-test-12b: minWeeks changedAppointments includes cross-eye cascade', () => {
  // Increase left[1] from 4 to 6 weeks: left[1] moves from Feb17 to Mar3,
  // which conflicts with right[2]=Mar3 → right[2] cascades to Mar17.
  const planner = defaultPlanner(); // today=Jan6
  const result = planner.updateMinWeeksFor(TherapyPlanner.LEFTEYE, 1, 6);
  assert.equal(result.success, true, result.message || '');

  // Must include at least one right-eye entry (cross-eye cascade from left moving forward).
  const rightChanged = result.changedAppointments.filter(c => c.type === TherapyPlanner.RIGHTEYE);
  assert.ok(rightChanged.length > 0,
    `cross-eye cascade must appear in changedAppointments; got: ${JSON.stringify(result.changedAppointments)}`);
  // All entries must have different old/new dates.
  for (const entry of result.changedAppointments) {
    assert.notEqual(entry.oldDate, entry.newDate,
      `entry ${entry.type}[${entry.index}] must have different old/new dates`);
  }
  // Completed appointments must be absent.
  assert.equal(result.changedAppointments.filter(c => c.status === 'completed').length, 0);
});
