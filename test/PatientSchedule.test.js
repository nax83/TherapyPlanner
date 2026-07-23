'use strict';
const test   = require('node:test');
const assert = require('node:assert/strict');

const TherapyPlanner = require('../TherapyPlanner.js');
const psModule = require('../PatientSchedule.js');
const { buildMergedAppointmentList, PATIENT_SCHEDULE_LABELS,
        formatIsoDate, formatPatientDate, formatPatientWeekday } = psModule;

// ─── Helpers ────────────────────────────────────────────────────────────────

function d(year, month0, day) {
  return new Date(year, month0, day);
}

function fmt(date) {
  const y  = date.getFullYear();
  const m  = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

const TODAY = d(2026, 0, 6); // Tue 6 Jan 2026

function defaultPlanner() {
  return new TherapyPlanner({}, { today: TODAY });
}

// Simple appointment factory for merge-function tests (no full planner required).
function appt(status, year, month0, day) {
  return { status, plannedDate: (year == null ? null : d(year, month0, day)) };
}

// ─── Extended Mock DOM for PatientScheduleComponent tests ────────────────────

class PMockElement {
  constructor(tagName) {
    this.tagName    = String(tagName).toUpperCase();
    this.children   = [];
    this.attributes = {};
    this.id         = undefined;
    this.eventListeners = {};
    this.textContent = '';
    this.value       = '';
    this.parentNode  = null;
    this._focused    = false;

    const _classes = new Set();
    this.classList = {
      add:      (...ns) => ns.forEach(n => _classes.add(n)),
      remove:   (...ns) => ns.forEach(n => _classes.delete(n)),
      contains: (n)     => _classes.has(n),
      toggle:   (n, force) => {
        const next = (force === undefined) ? !_classes.has(n) : !!force;
        next ? _classes.add(n) : _classes.delete(n);
        return next;
      },
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
  getAttribute(name) {
    const v = this.attributes[name];
    return (v !== undefined) ? v : null;
  }
  removeAttribute(name) { delete this.attributes[name]; }
  addEventListener(event, handler) {
    if (!this.eventListeners[event]) this.eventListeners[event] = [];
    this.eventListeners[event].push(handler);
  }
  querySelector(sel) {
    if (sel.startsWith('#')) return this.findById(sel.slice(1));
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
  focus() { this._focused = true; }
  blur()  { this._focused = false; }
}

class PMockTextNode {
  constructor(text) { this.textContent = text; this.parentNode = null; }
  findById() { return null; }
}

class PMockBody extends PMockElement {
  constructor() { super('body'); }
}

class PMockDocument {
  constructor() {
    this.root = new PMockElement('#document');
    this.body = new PMockBody();
  }
  createElement(tagName)  { return new PMockElement(tagName); }
  createTextNode(text)    { return new PMockTextNode(text); }
  getElementById(id)      { return this.root.findById(id); }
  querySelector(sel)      {
    if (sel.startsWith('#')) return this.root.findById(sel.slice(1));
    return null;
  }
}

class PMockWindow {
  constructor() {
    this.print          = undefined;
    this._listeners     = {};
  }
  addEventListener(event, handler) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(handler);
  }
  removeEventListener(event, handler) {
    if (!this._listeners[event]) return;
    this._listeners[event] = this._listeners[event].filter(h => h !== handler);
  }
  /** Convenience: fire the first registered handler for an event. */
  fireEvent(event) {
    const handlers = this._listeners[event] || [];
    handlers.forEach(h => h());
  }
}

function withPatientMockDom(fn) {
  const prevDoc  = global.document;
  const prevWin  = global.window;
  const prevTP   = global.TherapyPlanner;

  const mockDoc  = new PMockDocument();
  const mockWin  = new PMockWindow();

  global.document       = mockDoc;
  global.window         = mockWin;
  global.TherapyPlanner = TherapyPlanner;

  // PatientScheduleComponent auto-requires PatientSchedule.js if globals absent.
  delete require.cache[require.resolve('../PatientScheduleComponent.js')];
  const create = require('../PatientScheduleComponent.js');

  try {
    fn(create, mockDoc, mockWin);
  } finally {
    delete require.cache[require.resolve('../PatientScheduleComponent.js')];
    if (prevDoc === undefined) delete global.document; else global.document = prevDoc;
    if (prevWin === undefined) delete global.window;   else global.window   = prevWin;
    if (prevTP  === undefined) delete global.TherapyPlanner;
    else global.TherapyPlanner = prevTP;
  }
}

// ════════════════════════════════════════════════════════════════════════════
// A. Pure merge-function tests (PatientSchedule.js)
// ════════════════════════════════════════════════════════════════════════════

// ── A-1. Exact merged order ────────────────────────────────────────────────

test('patient-schedule-test-1: exact merged chronological order', () => {
  // Use the default planner to get a realistic, valid schedule.
  // Default schedule (today = Jan 6 2026):
  //   right[0]=Jan6  right[1]=Feb3  right[2]=Mar3
  //   left[0]=Jan20  left[1]=Feb17  left[2]=Mar17
  const planner = defaultPlanner();
  const schedule = {
    RIGHTEYE: planner.getPlanByEye(TherapyPlanner.RIGHTEYE),
    LEFTEYE:  planner.getPlanByEye(TherapyPlanner.LEFTEYE),
  };
  const rows = buildMergedAppointmentList(schedule);

  assert.equal(rows.length, 6, 'six planned appointments total');

  // Expected order
  const expected = [
    { iso: '2026-01-06', eye: 'Right eye' },
    { iso: '2026-01-20', eye: 'Left eye' },
    { iso: '2026-02-03', eye: 'Right eye' },
    { iso: '2026-02-17', eye: 'Left eye' },
    { iso: '2026-03-03', eye: 'Right eye' },
    { iso: '2026-03-17', eye: 'Left eye' },
  ];
  for (let i = 0; i < expected.length; i++) {
    assert.equal(rows[i].isoDate,  expected[i].iso, `row[${i}] isoDate`);
    assert.equal(rows[i].eyeLabel, expected[i].eye, `row[${i}] eyeLabel`);
  }
});

// ── A-2. Completed appointments excluded ───────────────────────────────────

test('patient-schedule-test-2: completed appointments are excluded', () => {
  const schedule = {
    RIGHTEYE: [
      appt('completed', 2026, 0, 6),
      appt('planned',   2026, 1, 3),
    ],
    LEFTEYE: [
      appt('completed', 2026, 0, 20),
      appt('planned',   2026, 1, 17),
    ],
  };
  const rows = buildMergedAppointmentList(schedule);

  assert.equal(rows.length, 2, 'only planned appointments included');
  assert.equal(rows[0].isoDate,  '2026-02-03', 'first row is right planned');
  assert.equal(rows[0].eyeLabel, 'Right eye');
  assert.equal(rows[1].isoDate,  '2026-02-17', 'second row is left planned');
  assert.equal(rows[1].eyeLabel, 'Left eye');
  // Verify completed dates not present
  for (const row of rows) {
    assert.notEqual(row.isoDate, '2026-01-06', 'completed right must not appear');
    assert.notEqual(row.isoDate, '2026-01-20', 'completed left must not appear');
  }
});

// ── A-3. Deterministic same-date tie-break ─────────────────────────────────

test('patient-schedule-test-3: same-date tie-break: right before left, lower index first', () => {
  // Construct a schedule with same-date entries that would not pass full planner
  // validation (same-day bilateral + same-day same-eye) — valid for merge-only testing.
  const schedule = {
    RIGHTEYE: [
      appt('planned', 2026, 0, 6),   // index 0 — Jan 6
      appt('planned', 2026, 1, 3),   // index 1 — Feb 3
    ],
    LEFTEYE: [
      appt('planned', 2026, 0, 6),   // index 0 — Jan 6  (same as RIGHTEYE[0])
      appt('planned', 2026, 1, 3),   // index 1 — Feb 3  (same as RIGHTEYE[1])
    ],
  };
  const rows = buildMergedAppointmentList(schedule);

  assert.equal(rows.length, 4);

  // Jan 6: right before left
  assert.equal(rows[0].type,    'RIGHTEYE', 'row[0] type');
  assert.equal(rows[0].index,   0,          'row[0] index');
  assert.equal(rows[0].isoDate, '2026-01-06');
  assert.equal(rows[1].type,    'LEFTEYE',  'row[1] type');
  assert.equal(rows[1].index,   0,          'row[1] index');
  assert.equal(rows[1].isoDate, '2026-01-06');

  // Feb 3: right before left
  assert.equal(rows[2].type,    'RIGHTEYE', 'row[2] type');
  assert.equal(rows[2].index,   1,          'row[2] index');
  assert.equal(rows[2].isoDate, '2026-02-03');
  assert.equal(rows[3].type,    'LEFTEYE',  'row[3] type');
  assert.equal(rows[3].index,   1,          'row[3] index');
  assert.equal(rows[3].isoDate, '2026-02-03');
});

// ── A-4. Input not mutated ─────────────────────────────────────────────────

test('patient-schedule-test-4: merge function does not mutate its input', () => {
  const r0 = appt('planned', 2026, 0, 6);
  const l0 = appt('planned', 2026, 0, 20);
  const origR0Date = r0.plannedDate.getTime();
  const origL0Date = l0.plannedDate.getTime();

  const schedule = { RIGHTEYE: [r0], LEFTEYE: [l0] };
  const origRightLength = schedule.RIGHTEYE.length;
  const origLeftLength  = schedule.LEFTEYE.length;

  buildMergedAppointmentList(schedule);

  // Arrays unchanged
  assert.equal(schedule.RIGHTEYE.length, origRightLength, 'RIGHTEYE array unchanged');
  assert.equal(schedule.LEFTEYE.length,  origLeftLength,  'LEFTEYE array unchanged');
  // Objects unchanged
  assert.equal(schedule.RIGHTEYE[0], r0, 'RIGHTEYE[0] object identity preserved');
  assert.equal(schedule.LEFTEYE[0],  l0, 'LEFTEYE[0] object identity preserved');
  // Dates unchanged
  assert.equal(r0.plannedDate.getTime(), origR0Date, 'right[0] plannedDate not mutated');
  assert.equal(l0.plannedDate.getTime(), origL0Date, 'left[0] plannedDate not mutated');
});

// ── A-5. Output date is cloned ─────────────────────────────────────────────

test('patient-schedule-test-5: returned dates are cloned — mutating them does not affect source', () => {
  const sourceDate = d(2026, 0, 6);
  const origTime   = sourceDate.getTime();

  const schedule = { RIGHTEYE: [appt('planned', 2026, 0, 6)], LEFTEYE: [] };
  const rows = buildMergedAppointmentList(schedule);

  assert.equal(rows.length, 1, 'one row returned');
  assert.notEqual(rows[0].date, sourceDate, 'returned date is not the same object');

  // Mutate the returned date.
  rows[0].date.setFullYear(2099);

  // Source date must be unchanged.
  assert.equal(sourceDate.getTime(), origTime, 'source plannedDate not mutated by row.date change');
  // The schedule's plannedDate is also unchanged.
  assert.equal(schedule.RIGHTEYE[0].plannedDate.getTime(), origTime,
    'schedule plannedDate not mutated');
});

// ── A-6. Invalid planned date throws ──────────────────────────────────────

test('patient-schedule-test-6: invalid planned date causes descriptive error', () => {
  // null plannedDate
  assert.throws(
    () => buildMergedAppointmentList({
      RIGHTEYE: [{ status: 'planned', plannedDate: null }],
      LEFTEYE:  [],
    }),
    /invalid|missing/i,
    'null plannedDate must throw',
  );

  // Invalid Date object
  assert.throws(
    () => buildMergedAppointmentList({
      RIGHTEYE: [],
      LEFTEYE:  [{ status: 'planned', plannedDate: new Date('not-a-date') }],
    }),
    /invalid|missing/i,
    'invalid Date must throw',
  );
});

// ── A-7. Empty planned list ────────────────────────────────────────────────

test('patient-schedule-test-7: all-completed schedule produces empty merged list', () => {
  const schedule = {
    RIGHTEYE: [appt('completed', 2026, 0, 6), appt('completed', 2026, 1, 3)],
    LEFTEYE:  [appt('completed', 2026, 0, 20)],
  };
  const rows = buildMergedAppointmentList(schedule);
  assert.equal(rows.length, 0, 'no planned appointments → empty list');
});

// ════════════════════════════════════════════════════════════════════════════
// B. UI / Component tests (PatientScheduleComponent.js)
// ════════════════════════════════════════════════════════════════════════════

// ── B-8. Launch button opens preview ──────────────────────────────────────

test('patient-schedule-test-8: launch button exists and opens preview', () => {
  withPatientMockDom((create, mockDoc) => {
    const planner = defaultPlanner();
    const root    = create(planner);
    mockDoc.root.appendChild(root);

    const launchBtn = root.findById('patient-schedule-launch-btn');
    assert.ok(launchBtn, 'launch button must exist');
    assert.ok(launchBtn.textContent, 'launch button must have text');

    const overlay = root.findById('patient-schedule-overlay');
    assert.ok(overlay, 'overlay must exist');
    assert.ok(overlay.classList.contains('hidden'), 'overlay initially hidden');

    // Click to open
    assert.ok(
      Array.isArray(launchBtn.eventListeners['click']) && launchBtn.eventListeners['click'].length > 0,
      'launch button must have a click handler',
    );
    launchBtn.eventListeners['click'][0]();

    assert.ok(!overlay.classList.contains('hidden'), 'overlay visible after launch');
    assert.ok(overlay.classList.contains('open'), 'overlay has open class');

    const dialog = root.findById('patient-schedule-dialog');
    assert.ok(dialog, 'dialog must exist');
    assert.equal(dialog.getAttribute('role'),       'dialog', 'dialog role');
    assert.equal(dialog.getAttribute('aria-modal'), 'true',   'aria-modal');
  });
});

// ── B-9. Current schedule read when opening ────────────────────────────────

test('patient-schedule-test-9: preview reads current planner state at open time, not at create time', () => {
  withPatientMockDom((create, mockDoc) => {
    const planner = defaultPlanner();
    const root    = create(planner);
    mockDoc.root.appendChild(root);

    // Mark right[0] as completed AFTER creating the component.
    const r = planner.setStatus(TherapyPlanner.RIGHTEYE, 0, 'completed', d(2026, 0, 6));
    assert.equal(r.success, true, 'setStatus must succeed');

    // Open preview — should reflect the NEW schedule state.
    root.findById('patient-schedule-launch-btn').eventListeners['click'][0]();

    const tbody = root.findById('patient-schedule-table-body');
    assert.ok(tbody, 'table body must exist');

    // 5 planned appointments remain (right[0] is completed).
    assert.equal(tbody.children.length, 5,
      '5 planned appointments after right[0] completed');

    // First row must be left[0] (Jan20), not right[0] (Jan6).
    const firstTr = tbody.children[0];
    const timeEl  = firstTr.children[0].children[0];
    assert.equal(timeEl.getAttribute('datetime'), '2026-01-20',
      'first row must be left[0] = Jan20, not cached right[0] = Jan6');
    assert.equal(firstTr.children[2].textContent, 'Left eye',
      'first row must be left eye');
  });
});

// ── B-10. Exact patient-facing table ─────────────────────────────────────

test('patient-schedule-test-10: exact patient-facing table content', () => {
  withPatientMockDom((create, mockDoc) => {
    const planner = defaultPlanner();
    const root    = create(planner);
    mockDoc.root.appendChild(root);

    root.findById('patient-schedule-launch-btn').eventListeners['click'][0]();

    const tbody = root.findById('patient-schedule-table-body');
    assert.ok(tbody, 'table body must exist');
    assert.equal(tbody.children.length, 6, '6 planned appointments');

    // Expected rows in order.
    const expected = [
      { iso: '2026-01-06', eye: 'Right eye' },
      { iso: '2026-01-20', eye: 'Left eye'  },
      { iso: '2026-02-03', eye: 'Right eye' },
      { iso: '2026-02-17', eye: 'Left eye'  },
      { iso: '2026-03-03', eye: 'Right eye' },
      { iso: '2026-03-17', eye: 'Left eye'  },
    ];

    for (let i = 0; i < expected.length; i++) {
      const tr      = tbody.children[i];
      const timeEl  = tr.children[0].children[0]; // td > time
      const dayCell = tr.children[1];
      const eyeCell = tr.children[2];

      assert.equal(timeEl.getAttribute('datetime'), expected[i].iso,
        `row[${i}] datetime attr`);
      assert.equal(timeEl.textContent, formatPatientDate(d(
        Number(expected[i].iso.slice(0, 4)),
        Number(expected[i].iso.slice(5, 7)) - 1,
        Number(expected[i].iso.slice(8, 10)),
      )), `row[${i}] formatted date`);

      // Weekday — all default appointments are Tuesdays.
      assert.equal(dayCell.textContent, formatPatientWeekday(d(
        Number(expected[i].iso.slice(0, 4)),
        Number(expected[i].iso.slice(5, 7)) - 1,
        Number(expected[i].iso.slice(8, 10)),
      )), `row[${i}] weekday`);

      assert.equal(eyeCell.textContent, expected[i].eye, `row[${i}] eye label`);

      // Internal fields must NOT appear in any cell text.
      const fullText = [timeEl.textContent, dayCell.textContent, eyeCell.textContent].join(' ');
      assert.ok(!fullText.includes('dateOrigin'), 'dateOrigin must not appear');
      assert.ok(!fullText.includes('minWeeks'),   'minWeeks must not appear');
      assert.ok(!fullText.includes('RIGHTEYE'),   'RIGHTEYE key must not appear');
      assert.ok(!fullText.includes('LEFTEYE'),    'LEFTEYE key must not appear');
      assert.ok(!fullText.includes('generated'),  'generated origin must not appear');
    }

    // Rows must be in chronological order (isoDate ascending).
    for (let i = 1; i < tbody.children.length; i++) {
      const prevIso = tbody.children[i - 1].children[0].children[0].getAttribute('datetime');
      const currIso = tbody.children[i].children[0].children[0].getAttribute('datetime');
      assert.ok(currIso >= prevIso, `row[${i}] must not precede row[${i - 1}]`);
    }
  });
});

// ── B-11. Patient name ────────────────────────────────────────────────────

test('patient-schedule-test-11: patient name input updates display and is cleared on close', () => {
  withPatientMockDom((create, mockDoc) => {
    const planner = defaultPlanner();
    const root    = create(planner);
    mockDoc.root.appendChild(root);

    const launchBtn = root.findById('patient-schedule-launch-btn');
    launchBtn.eventListeners['click'][0]();

    const nameInput = root.findById('patient-schedule-name-input');
    assert.ok(nameInput, 'patient-name input must exist');

    const patientRow = root.findById('patient-schedule-patient-row');
    assert.ok(patientRow, 'patient-row element must exist');

    // Initially empty → patient row hidden.
    assert.ok(patientRow.classList.contains('hidden'), 'patient row initially hidden');

    // Set name and trigger input event.
    nameInput.value = 'Maria Rossi';
    nameInput.eventListeners['input'][0]({ target: nameInput });

    const display = root.findById('patient-schedule-patient-display');
    assert.ok(display, 'patient-display element must exist');
    assert.ok(display.textContent.includes('Maria Rossi'), 'display shows patient name');
    assert.ok(!patientRow.classList.contains('hidden'), 'patient row visible when name set');

    // Clear name → patient row hidden again.
    nameInput.value = '';
    nameInput.eventListeners['input'][0]({ target: nameInput });
    assert.ok(patientRow.classList.contains('hidden'), 'patient row hidden when name cleared');

    // Set name, close preview → name cleared.
    nameInput.value = 'Maria Rossi';
    nameInput.eventListeners['input'][0]({ target: nameInput });
    assert.ok(!patientRow.classList.contains('hidden'), 'patient row visible before close');

    const closeBtn = root.findById('patient-schedule-close-btn');
    assert.ok(closeBtn, 'close button must exist');
    closeBtn.eventListeners['click'][0]();

    // Reopen — name must be empty.
    launchBtn.eventListeners['click'][0]();
    assert.equal(nameInput.value, '', 'name input empty on reopen');
    assert.ok(patientRow.classList.contains('hidden'), 'patient row hidden on reopen');
  });
});

// ── B-12. Print action ────────────────────────────────────────────────────

test('patient-schedule-test-12: print adds body class, calls window.print, class removed on afterprint', () => {
  withPatientMockDom((create, mockDoc, mockWin) => {
    const planner = defaultPlanner();
    const root    = create(planner);
    mockDoc.root.appendChild(root);

    // Open preview
    root.findById('patient-schedule-launch-btn').eventListeners['click'][0]();

    const printBtn = root.findById('patient-schedule-print-btn');
    assert.ok(printBtn, 'print button must exist');
    assert.ok(printBtn.textContent, 'print button must have text');

    // Install mock window.print
    let printCount = 0;
    mockWin.print = () => { printCount++; };

    // Click print
    printBtn.eventListeners['click'][0]();

    assert.equal(printCount, 1, 'window.print called exactly once');
    assert.ok(
      mockDoc.body.classList.contains('printing-patient-schedule'),
      'body class added during print',
    );

    // Afterprint event removes the class
    assert.ok(
      Array.isArray(mockWin._listeners['afterprint']) &&
      mockWin._listeners['afterprint'].length > 0,
      'afterprint listener must be registered',
    );
    mockWin.fireEvent('afterprint');

    assert.ok(
      !mockDoc.body.classList.contains('printing-patient-schedule'),
      'body class removed after afterprint event',
    );

    // Planner schedule unchanged
    assert.equal(planner.validateSchedule().valid, true, 'planner still valid after print');
  });
});

// ── B-13. Print failure cleanup ────────────────────────────────────────────

test('patient-schedule-test-13: print failure removes body class and shows error', () => {
  withPatientMockDom((create, mockDoc, mockWin) => {
    const planner = defaultPlanner();
    const root    = create(planner);
    mockDoc.root.appendChild(root);

    root.findById('patient-schedule-launch-btn').eventListeners['click'][0]();

    const printBtn = root.findById('patient-schedule-print-btn');
    assert.ok(printBtn, 'print button must exist');

    mockWin.print = () => { throw new Error('printer unavailable'); };

    printBtn.eventListeners['click'][0]();

    // Class must be cleaned up despite the error.
    assert.ok(
      !mockDoc.body.classList.contains('printing-patient-schedule'),
      'body class removed after print failure',
    );

    // Accessible error must be visible.
    const errorEl = root.findById('patient-schedule-error');
    assert.ok(errorEl, 'error element must exist');
    assert.ok(!errorEl.classList.contains('hidden'), 'error visible after print failure');
    assert.ok(errorEl.textContent.length > 0, 'error message must be non-empty');

    // Planner unchanged.
    assert.equal(planner.validateSchedule().valid, true, 'planner unchanged');
  });
});

// ── B-14. Close and focus restoration ─────────────────────────────────────

test('patient-schedule-test-14: close hides preview, Escape hides preview, focus returns to launch', () => {
  withPatientMockDom((create, mockDoc) => {
    const planner   = defaultPlanner();
    const root      = create(planner);
    const launchBtn = root.findById('patient-schedule-launch-btn');
    const overlay   = root.findById('patient-schedule-overlay');
    const dialog    = root.findById('patient-schedule-dialog');
    const nameInput = root.findById('patient-schedule-name-input');
    const closeBtn  = root.findById('patient-schedule-close-btn');

    // Open → Close via button.
    launchBtn.eventListeners['click'][0]();
    assert.ok(!overlay.classList.contains('hidden'), 'overlay open');

    // Set a name to verify it's cleared.
    nameInput.value = 'Test Patient';
    nameInput.eventListeners['input'][0]({ target: nameInput });

    closeBtn.eventListeners['click'][0]();
    assert.ok(overlay.classList.contains('hidden'), 'overlay hidden after close');
    assert.ok(!overlay.classList.contains('open'),  'open class removed after close');
    assert.ok(launchBtn._focused,                   'focus returned to launch button');
    assert.equal(nameInput.value, '',               'patient name cleared on close');

    // Open again → Escape to close.
    launchBtn._focused = false;
    launchBtn.eventListeners['click'][0]();
    assert.ok(!overlay.classList.contains('hidden'), 'overlay open again');

    assert.ok(
      Array.isArray(dialog.eventListeners['keydown']) &&
      dialog.eventListeners['keydown'].length > 0,
      'dialog must have a keydown handler for Escape',
    );
    dialog.eventListeners['keydown'][0]({ key: 'Escape' });

    assert.ok(overlay.classList.contains('hidden'), 'overlay hidden after Escape');
    assert.ok(launchBtn._focused,                   'focus returned to launch button after Escape');

    // Non-Escape key must not close.
    launchBtn._focused = false;
    launchBtn.eventListeners['click'][0]();
    dialog.eventListeners['keydown'][0]({ key: 'Enter' });
    assert.ok(!overlay.classList.contains('hidden'), 'Enter key must not close the preview');
  });
});

// ── B-15. Invalid planner state ────────────────────────────────────────────

test('patient-schedule-test-15: invalid planner state shows error, disables print, no mutation', () => {
  withPatientMockDom((create, mockDoc) => {
    const planner = defaultPlanner();
    const root    = create(planner);

    // Corrupt the schedule to force validateSchedule() to return invalid.
    planner.schedule[TherapyPlanner.RIGHTEYE][1].plannedDate = null;

    const launchBtn = root.findById('patient-schedule-launch-btn');
    launchBtn.eventListeners['click'][0]();

    const errorEl = root.findById('patient-schedule-error');
    assert.ok(errorEl, 'error element must exist');
    assert.ok(!errorEl.classList.contains('hidden'), 'error must be visible for invalid schedule');
    assert.ok(errorEl.textContent.length > 0, 'error message must be non-empty');

    const printBtn = root.findById('patient-schedule-print-btn');
    assert.ok(printBtn, 'print button must exist');
    assert.equal(
      printBtn.getAttribute('disabled'), 'disabled',
      'print button must be disabled when schedule is invalid',
    );

    // Table body must be empty — no patient list rendered.
    const tbody = root.findById('patient-schedule-table-body');
    assert.ok(tbody, 'table body must exist');
    assert.equal(tbody.children.length, 0, 'no rows when schedule is invalid');

    // Overlay still opened (to show the error).
    const overlay = root.findById('patient-schedule-overlay');
    assert.ok(!overlay.classList.contains('hidden'), 'overlay opened to display error');

    // Planner was not mutated by opening the preview.
    // (The corruption we applied remains — no extra changes.)
    planner.schedule[TherapyPlanner.RIGHTEYE][1].plannedDate = d(2026, 1, 3);
    assert.equal(planner.validateSchedule().valid, true, 'planner restores to valid when fixed');
  });
});

// ── B-16. Required DOM controls — all mandatory, no if-guards ─────────────

test('patient-schedule-test-16: all required DOM controls exist (mandatory assertions)', () => {
  withPatientMockDom((create, mockDoc) => {
    const planner = defaultPlanner();
    const root    = create(planner);
    mockDoc.root.appendChild(root);

    // Launch button
    const launchBtn = root.findById('patient-schedule-launch-btn');
    assert.ok(launchBtn, 'launch button must exist');
    assert.ok(launchBtn.textContent, 'launch button must have accessible text');

    // Open the preview to expose the dialog controls.
    launchBtn.eventListeners['click'][0]();

    // Overlay
    const overlay = root.findById('patient-schedule-overlay');
    assert.ok(overlay, 'overlay must exist');

    // Dialog
    const dialog = root.findById('patient-schedule-dialog');
    assert.ok(dialog, 'dialog must exist');
    assert.equal(dialog.getAttribute('role'),       'dialog', 'role=dialog');
    assert.equal(dialog.getAttribute('aria-modal'), 'true',   'aria-modal=true');
    const labelledBy = dialog.getAttribute('aria-labelledby');
    assert.ok(labelledBy, 'aria-labelledby must be set');
    // The referenced title element must exist.
    const titleEl = root.findById(labelledBy);
    assert.ok(titleEl, 'element referenced by aria-labelledby must exist');

    // Print button
    const printBtn = root.findById('patient-schedule-print-btn');
    assert.ok(printBtn, 'print button must exist');
    assert.ok(printBtn.textContent, 'print button must have visible text');

    // Close button
    const closeBtn = root.findById('patient-schedule-close-btn');
    assert.ok(closeBtn, 'close button must exist');
    const closeLabel = closeBtn.textContent || closeBtn.getAttribute('aria-label');
    assert.ok(closeLabel, 'close button must have visible text or aria-label');

    // Patient-name input
    const nameInput = root.findById('patient-schedule-name-input');
    assert.ok(nameInput, 'patient-name input must exist');

    // Error area
    const errorEl = root.findById('patient-schedule-error');
    assert.ok(errorEl, 'error area must exist');
    assert.equal(errorEl.getAttribute('role'), 'alert', 'error area must have role=alert');

    // Table body
    const tbody = root.findById('patient-schedule-table-body');
    assert.ok(tbody, 'table body must exist');

    // Patient row (hidden when empty)
    const patientRow = root.findById('patient-schedule-patient-row');
    assert.ok(patientRow, 'patient-row element must exist');

    // Generated-on paragraph
    const generatedOn = root.findById('patient-schedule-generated-on');
    assert.ok(generatedOn, 'generated-on element must exist');
    assert.ok(generatedOn.textContent.length > 0, 'generated-on must have text after open');

    // Empty message element
    const emptyMsg = root.findById('patient-schedule-empty');
    assert.ok(emptyMsg, 'empty-message element must exist');

    // Footer
    const footerEl = root.findById('patient-schedule-footer');
    assert.ok(footerEl, 'footer element must exist');
    assert.ok(footerEl.textContent, 'footer must have text');
  });
});

// ── B-17. Empty schedule shows empty message, print still works ────────────

test('patient-schedule-test-17: empty planned schedule shows empty message', () => {
  withPatientMockDom((create, mockDoc, mockWin) => {
    // Mock planner with no planned appointments.
    const mockPlanner = {
      validateSchedule: () => ({ valid: true }),
      getPlanByEye: (eye) => [
        { status: 'completed', plannedDate: d(2026, 0, 6) },
      ],
    };

    const root = create(mockPlanner);
    mockDoc.root.appendChild(root);
    root.findById('patient-schedule-launch-btn').eventListeners['click'][0]();

    const tbody = root.findById('patient-schedule-table-body');
    assert.ok(tbody, 'table body must exist');
    assert.equal(tbody.children.length, 0, 'no rows when all completed');

    const emptyMsg = root.findById('patient-schedule-empty');
    assert.ok(emptyMsg, 'empty message element must exist');
    assert.ok(!emptyMsg.classList.contains('hidden'), 'empty message must be visible');
    assert.equal(emptyMsg.textContent, PATIENT_SCHEDULE_LABELS.empty, 'correct empty text');

    // Print button is still enabled (empty schedule is valid).
    const printBtn = root.findById('patient-schedule-print-btn');
    assert.ok(printBtn, 'print button must exist');
    assert.equal(printBtn.getAttribute('disabled'), null, 'print button not disabled');

    // Print still works on empty schedule.
    let printCalled = false;
    mockWin.print = () => { printCalled = true; };
    printBtn.eventListeners['click'][0]();
    assert.ok(printCalled, 'window.print called for empty schedule');
  });
});
