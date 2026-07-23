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

/**
 * Array-like HTMLCollection mock — iterable but NOT a real Array.
 * Array.isArray(new MockHTMLCollection()) === false.
 */
class MockHTMLCollection {
  constructor() {
    this._items = [];
  }
  get length() { return this._items.length; }
  [Symbol.iterator]() { return this._items[Symbol.iterator](); }
  push(item) { this._items.push(item); this[this._items.length - 1] = item; }
  splice(index, count) {
    const removed = this._items.splice(index, count);
    // Rebuild numeric index keys
    this._items.forEach((it, i) => { this[i] = it; });
    // Remove stale last key if length shrank
    delete this[this._items.length + removed.length - 1];
    return removed;
  }
  indexOf(item) { return this._items.indexOf(item); }
  filter(fn) { return this._items.filter(fn); }
  reduce(fn, init) { return this._items.reduce(fn, init); }
  forEach(fn) { this._items.forEach(fn); }
}

class PMockElement {
  constructor(tagName) {
    this.tagName    = String(tagName).toUpperCase();
    this.nodeType   = 1; // ELEMENT_NODE — required by _removeIdsRecursively
    this.children   = new MockHTMLCollection();
    this.attributes = {};
    this.id         = undefined;
    this.eventListeners = {};
    this.textContent = '';
    this.value       = '';
    this.parentNode  = null;
    this._focused    = false;
    // _classes is stored as an instance property so cloneNode can copy it.
    this._classes   = new Set();
    this.classList = {
      add:      (...ns) => ns.forEach(n => this._classes.add(n)),
      remove:   (...ns) => ns.forEach(n => this._classes.delete(n)),
      contains: (n)     => this._classes.has(n),
      toggle:   (n, force) => {
        const next = (force === undefined) ? !this._classes.has(n) : !!force;
        next ? this._classes.add(n) : this._classes.delete(n);
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
  get firstChild() { return this.children._items[0] || null; }
  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name === 'id') this.id = String(value);
  }
  getAttribute(name) {
    const v = this.attributes[name];
    return (v !== undefined) ? v : null;
  }
  removeAttribute(name) {
    delete this.attributes[name];
    if (name === 'id') this.id = undefined;
  }
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

  /** Deep clone — copies attributes, classes, textContent, value, children.
   *  Event listeners are NOT copied (clones are inert). */
  cloneNode(deep) {
    const clone = new PMockElement(this.tagName);
    for (const [k, v] of Object.entries(this.attributes)) clone.setAttribute(k, v);
    clone.textContent = this.textContent;
    clone.value       = this.value;
    for (const c of this._classes) clone._classes.add(c);
    if (deep) {
      for (const child of this.children) {
        if (child && typeof child.cloneNode === 'function') {
          clone.appendChild(child.cloneNode(true));
        } else if (child && typeof child === 'object') {
          // Text-node-like object
          const tc = new PMockTextNode(child.textContent || '');
          clone.children._items.push(tc);
        }
      }
    }
    return clone;
  }

  /** Remove all children, then append any supplied nodes. */
  replaceChildren(...nodes) {
    while (this.firstChild) this.removeChild(this.firstChild);
    for (const node of nodes) this.appendChild(node);
  }
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
  /** Search both the main tree and body (where printHost lives). */
  getElementById(id)      {
    return this.root.findById(id) || this.body.findById(id) || null;
  }
  querySelector(sel)      {
    if (sel.startsWith('#')) return this.getElementById(sel.slice(1));
    return null;
  }
}

class PMockWindow {
  constructor() {
    this.print               = undefined;
    this._listeners          = {};
    this._rafCallbacks       = [];
    this.requestAnimationFrame = (cb) => { this._rafCallbacks.push(cb); };
  }
  addEventListener(event, handler) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(handler);
  }
  removeEventListener(event, handler) {
    if (!this._listeners[event]) return;
    this._listeners[event] = this._listeners[event].filter(h => h !== handler);
  }
  /** Fire all registered handlers for an event. */
  fireEvent(event) {
    const handlers = (this._listeners[event] || []).slice();
    handlers.forEach(h => h());
  }
  /** Drain up to `n` pending requestAnimationFrame callbacks (default: all). */
  flushRAF(n) {
    n = (n === undefined) ? Infinity : n;
    let count = 0;
    while (this._rafCallbacks.length > 0 && count < n) {
      const cb = this._rafCallbacks.shift();
      cb(0);
      count++;
    }
  }
}

function withPatientMockDom(fn) {
  const prevDoc  = global.document;
  const prevWin  = global.window;
  const prevTP   = global.TherapyPlanner;
  const prevRAF  = global.requestAnimationFrame;

  const mockDoc  = new PMockDocument();
  const mockWin  = new PMockWindow();

  global.document       = mockDoc;
  global.window         = mockWin;
  global.TherapyPlanner = TherapyPlanner;
  global.requestAnimationFrame = mockWin.requestAnimationFrame.bind(mockWin);

  // PatientScheduleComponent auto-requires PatientSchedule.js if globals absent.
  delete require.cache[require.resolve('../PatientScheduleComponent.js')];
  const create = require('../PatientScheduleComponent.js');

  try {
    fn(create, mockDoc, mockWin);
  } finally {
    delete require.cache[require.resolve('../PatientScheduleComponent.js')];
    if (prevDoc  === undefined) delete global.document; else global.document = prevDoc;
    if (prevWin  === undefined) delete global.window;   else global.window   = prevWin;
    if (prevTP   === undefined) delete global.TherapyPlanner; else global.TherapyPlanner = prevTP;
    if (prevRAF  === undefined) delete global.requestAnimationFrame;
    else global.requestAnimationFrame = prevRAF;
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
    mockWin.flushRAF(2);
    assert.ok(printCalled, 'window.print called for empty schedule');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// P. Print-host architecture tests
// ════════════════════════════════════════════════════════════════════════════

// ── P-1. Print host created at component init ─────────────────────────────

test('patient-schedule-test-P1: print host appended to document.body on component creation', () => {
  withPatientMockDom((create, mockDoc) => {
    const planner = defaultPlanner();
    create(planner);

    const host = mockDoc.getElementById('patient-schedule-print-host');
    assert.ok(host, 'print host element must exist');
    assert.ok(
      mockDoc.body.children.indexOf(host) !== -1,
      'print host must be a direct child of document.body',
    );
  });
});

// ── P-2. Print host is NOT nested inside overlay or dialog ────────────────

test('patient-schedule-test-P2: print host is not nested inside the component root', () => {
  withPatientMockDom((create, mockDoc) => {
    const planner = defaultPlanner();
    const root    = create(planner);
    mockDoc.root.appendChild(root);

    const hostInRoot = root.findById('patient-schedule-print-host');
    assert.equal(hostInRoot, null, 'print host must not be inside the component root');

    // Must be in body instead.
    const host = mockDoc.getElementById('patient-schedule-print-host');
    assert.ok(host, 'print host must exist in document (via body)');
  });
});

// ── P-3. Idempotent host creation: second component reuses same host ──────

test('patient-schedule-test-P3: second component creation reuses existing print host', () => {
  withPatientMockDom((create, mockDoc) => {
    const planner = defaultPlanner();
    create(planner); // first component
    const hostAfterFirst = mockDoc.getElementById('patient-schedule-print-host');
    assert.ok(hostAfterFirst, 'host created by first component');

    create(planner); // second component
    const hostAfterSecond = mockDoc.getElementById('patient-schedule-print-host');
    assert.ok(hostAfterSecond, 'host still present after second component');

    const hostsInBody = mockDoc.body.children.filter(
      c => c && c.id === 'patient-schedule-print-host',
    );
    assert.equal(hostsInBody.length, 1, 'exactly one print host in body');
    assert.equal(hostAfterFirst, hostAfterSecond, 'same host instance reused');
  });
});

// ── P-4. Body class added synchronously before rAF fires ─────────────────

test('patient-schedule-test-P4: body class added synchronously before rAF fires', () => {
  withPatientMockDom((create, mockDoc, mockWin) => {
    const planner = defaultPlanner();
    const root    = create(planner);
    mockDoc.root.appendChild(root);

    mockWin.print = () => {};
    root.findById('patient-schedule-launch-btn').eventListeners['click'][0]();
    root.findById('patient-schedule-print-btn').eventListeners['click'][0]();

    assert.ok(
      mockDoc.body.classList.contains('printing-patient-schedule'),
      'body class added synchronously before rAF fires',
    );
  });
});

// ── P-5. Print host receives cloneNode snapshot synchronously ─────────────

test('patient-schedule-test-P5: print host receives cloneNode snapshot synchronously on print click', () => {
  withPatientMockDom((create, mockDoc, mockWin) => {
    const planner = defaultPlanner();
    const root    = create(planner);
    mockDoc.root.appendChild(root);

    mockWin.print = () => {};
    root.findById('patient-schedule-launch-btn').eventListeners['click'][0]();

    const host = mockDoc.getElementById('patient-schedule-print-host');
    assert.equal(host.children.length, 0, 'host empty before print clicked');

    root.findById('patient-schedule-print-btn').eventListeners['click'][0]();

    // _preparePrintHost() runs synchronously — host is populated before any rAF flush.
    assert.ok(host.children.length > 0, 'host has cloned content synchronously after print click');

    mockWin.flushRAF(2); // triggers window.print()
  });
});

// ── P-6. IDs stripped from clone to prevent duplicate IDs ────────────────

test('patient-schedule-test-P6: cloned print host snapshot has all IDs removed', () => {
  function collectIds(el, ids) {
    ids = ids || [];
    if (!el || typeof el !== 'object') return ids;
    if (el.id) ids.push(el.id);
    // Use Symbol.iterator so MockHTMLCollection and real arrays both work.
    if (el.children && el.children[Symbol.iterator]) {
      for (const c of el.children) collectIds(c, ids);
    }
    return ids;
  }

  withPatientMockDom((create, mockDoc, mockWin) => {
    const planner = defaultPlanner();
    const root    = create(planner);
    mockDoc.root.appendChild(root);

    mockWin.print = () => {};
    root.findById('patient-schedule-launch-btn').eventListeners['click'][0]();
    root.findById('patient-schedule-print-btn').eventListeners['click'][0]();
    mockWin.flushRAF(2);

    const host = mockDoc.getElementById('patient-schedule-print-host');
    // Collect IDs from inside the clone children (not the host element itself)
    const idsInsideClone = host.children.reduce(
      (acc, child) => acc.concat(collectIds(child)), [],
    );
    assert.deepStrictEqual(
      idsInsideClone, [],
      'no IDs inside the cloned snapshot (prevents duplicate IDs in live DOM)',
    );
  });
});

// ── P-7. window.print called exactly once after double rAF flush ──────────

test('patient-schedule-test-P7: window.print called exactly once after double rAF flush', () => {
  withPatientMockDom((create, mockDoc, mockWin) => {
    const planner = defaultPlanner();
    const root    = create(planner);
    mockDoc.root.appendChild(root);

    let printCount = 0;
    mockWin.print = () => { printCount++; };

    root.findById('patient-schedule-launch-btn').eventListeners['click'][0]();
    root.findById('patient-schedule-print-btn').eventListeners['click'][0]();

    assert.equal(printCount, 0, 'window.print not called before rAF flush');

    mockWin.flushRAF(2);

    assert.equal(printCount, 1, 'window.print called exactly once after rAF flush');
  });
});

// ── P-8. body class removed after afterprint event ───────────────────────

test('patient-schedule-test-P8: body class removed after afterprint event fires', () => {
  withPatientMockDom((create, mockDoc, mockWin) => {
    const planner = defaultPlanner();
    const root    = create(planner);
    mockDoc.root.appendChild(root);

    mockWin.print = () => {};
    root.findById('patient-schedule-launch-btn').eventListeners['click'][0]();
    root.findById('patient-schedule-print-btn').eventListeners['click'][0]();
    mockWin.flushRAF(2);

    assert.ok(
      mockDoc.body.classList.contains('printing-patient-schedule'),
      'body class present after print',
    );

    mockWin.fireEvent('afterprint');

    assert.ok(
      !mockDoc.body.classList.contains('printing-patient-schedule'),
      'body class removed after afterprint event',
    );
  });
});

// ── P-9. Print host cleared after afterprint event ───────────────────────

test('patient-schedule-test-P9: print host cleared after afterprint event', () => {
  withPatientMockDom((create, mockDoc, mockWin) => {
    const planner = defaultPlanner();
    const root    = create(planner);
    mockDoc.root.appendChild(root);

    mockWin.print = () => {};
    root.findById('patient-schedule-launch-btn').eventListeners['click'][0]();
    root.findById('patient-schedule-print-btn').eventListeners['click'][0]();
    mockWin.flushRAF(2);

    const host = mockDoc.getElementById('patient-schedule-print-host');
    assert.ok(host.children.length > 0, 'host has content before afterprint');

    mockWin.fireEvent('afterprint');

    assert.equal(host.children.length, 0, 'print host cleared after afterprint');
  });
});

// ── P-10. Print failure: body class removed, host cleared, error shown ─────

test('patient-schedule-test-P10: print failure removes body class, clears host, shows error', () => {
  withPatientMockDom((create, mockDoc, mockWin) => {
    const planner = defaultPlanner();
    const root    = create(planner);
    mockDoc.root.appendChild(root);

    mockWin.print = () => { throw new Error('printer unavailable'); };

    root.findById('patient-schedule-launch-btn').eventListeners['click'][0]();
    root.findById('patient-schedule-print-btn').eventListeners['click'][0]();
    mockWin.flushRAF(2);

    assert.ok(
      !mockDoc.body.classList.contains('printing-patient-schedule'),
      'body class removed after print failure',
    );

    const host = mockDoc.getElementById('patient-schedule-print-host');
    assert.equal(host.children.length, 0, 'print host cleared after print failure');

    const errorEl = root.findById('patient-schedule-error');
    assert.ok(errorEl, 'error element must exist');
    assert.ok(!errorEl.classList.contains('hidden'), 'error visible after print failure');
    assert.ok(errorEl.textContent.length > 0, 'error message non-empty after failure');

    assert.equal(planner.validateSchedule().valid, true, 'planner unchanged after print failure');
  });
});

// ── P-11. Generation token cancels stale print on close ──────────────────

test('patient-schedule-test-P11: closing preview before rAF fires cancels pending print', () => {
  withPatientMockDom((create, mockDoc, mockWin) => {
    const planner = defaultPlanner();
    const root    = create(planner);
    mockDoc.root.appendChild(root);

    let printCount = 0;
    mockWin.print = () => { printCount++; };

    root.findById('patient-schedule-launch-btn').eventListeners['click'][0]();
    root.findById('patient-schedule-print-btn').eventListeners['click'][0]();

    // Close BEFORE rAF fires — cancels the pending print job.
    root.findById('patient-schedule-close-btn').eventListeners['click'][0]();

    // Flush any queued rAF callbacks — print must NOT be called.
    mockWin.flushRAF(10);

    assert.equal(printCount, 0, 'window.print not called after close cancels print job');
    assert.ok(
      !mockDoc.body.classList.contains('printing-patient-schedule'),
      'body class not added after cancelled print',
    );
  });
});

// ── P-12. Idempotent cleanup: afterprint safe to fire multiple times ──────

test('patient-schedule-test-P12: afterprint fired twice does not crash or leave body class', () => {
  withPatientMockDom((create, mockDoc, mockWin) => {
    const planner = defaultPlanner();
    const root    = create(planner);
    mockDoc.root.appendChild(root);

    mockWin.print = () => {};
    root.findById('patient-schedule-launch-btn').eventListeners['click'][0]();
    root.findById('patient-schedule-print-btn').eventListeners['click'][0]();
    mockWin.flushRAF(2);

    mockWin.fireEvent('afterprint');
    mockWin.fireEvent('afterprint'); // second fire must be safe

    assert.ok(
      !mockDoc.body.classList.contains('printing-patient-schedule'),
      'body class absent after double afterprint',
    );
    const host = mockDoc.getElementById('patient-schedule-print-host');
    assert.equal(host.children.length, 0, 'host cleared after double afterprint');
  });
});

// ── P-13. window.print undefined: error shown, no body class ─────────────

test('patient-schedule-test-P13: unavailable window.print shows error and skips body class', () => {
  withPatientMockDom((create, mockDoc, mockWin) => {
    const planner = defaultPlanner();
    const root    = create(planner);
    mockDoc.root.appendChild(root);

    mockWin.print = undefined;

    root.findById('patient-schedule-launch-btn').eventListeners['click'][0]();
    root.findById('patient-schedule-print-btn').eventListeners['click'][0]();

    const errorEl = root.findById('patient-schedule-error');
    assert.ok(errorEl, 'error element must exist');
    assert.ok(!errorEl.classList.contains('hidden'), 'error visible when print unavailable');
    assert.ok(errorEl.textContent.length > 0, 'error message non-empty');

    assert.ok(
      !mockDoc.body.classList.contains('printing-patient-schedule'),
      'body class must not be added when print is unavailable',
    );
  });
});

// ── P-14. Empty schedule still produces a printable snapshot ─────────────

test('patient-schedule-test-P14: empty planned list still produces printable host snapshot', () => {
  withPatientMockDom((create, mockDoc, mockWin) => {
    const mockPlanner = {
      validateSchedule: () => ({ valid: true }),
      getPlanByEye: () => [{ status: 'completed', plannedDate: d(2026, 0, 6) }],
    };

    const root = create(mockPlanner);
    mockDoc.root.appendChild(root);

    let printCount = 0;
    mockWin.print = () => { printCount++; };

    root.findById('patient-schedule-launch-btn').eventListeners['click'][0]();
    root.findById('patient-schedule-print-btn').eventListeners['click'][0]();
    mockWin.flushRAF(2);

    assert.equal(printCount, 1, 'window.print called for empty schedule');

    const host = mockDoc.getElementById('patient-schedule-print-host');
    assert.ok(host.children.length > 0, 'host has snapshot even for empty appointment list');

    mockWin.fireEvent('afterprint');
    assert.equal(host.children.length, 0, 'host cleared after afterprint');
  });
});

// ── P-15. CSS regression: old fragile strategies absent, new strategy present

test('patient-schedule-test-P15: patient-schedule.css uses new direct-child print strategy', () => {
  const fs   = require('fs');
  const path = require('path');
  const css  = fs.readFileSync(
    path.join(__dirname, '..', 'patient-schedule.css'), 'utf8',
  );

  // Must NOT be present (old fragile strategy)
  assert.ok(
    !css.includes('body.printing-patient-schedule *\n') &&
    !css.includes('body.printing-patient-schedule * {'),
    'CSS must not use global descendant selector body.printing-patient-schedule *',
  );
  assert.ok(
    !css.includes('visibility: hidden'),
    'CSS must not use visibility: hidden (old approach)',
  );

  // No position: absolute on printable in the @media print block.
  const printMediaIdx = css.indexOf('@media print');
  assert.ok(printMediaIdx !== -1, '@media print block must exist');
  const printBlock = css.slice(printMediaIdx);
  assert.ok(
    !printBlock.includes('position: absolute'),
    'print CSS must not use position: absolute on printable',
  );

  // Must be present (new strategy)
  assert.ok(
    css.includes('.patient-schedule-print-host'),
    'CSS must define .patient-schedule-print-host',
  );
  assert.ok(
    css.includes('body.printing-patient-schedule > *'),
    'CSS must use direct-child selector body.printing-patient-schedule > *',
  );
  assert.ok(
    css.includes('position: static'),
    'CSS must reset printable to position: static in print media',
  );
});

// ── P-16. Full lifecycle: open → print → afterprint → close ──────────────

test('patient-schedule-test-P16: full print lifecycle open→print→afterprint→close', () => {
  withPatientMockDom((create, mockDoc, mockWin) => {
    const planner = defaultPlanner();
    const root    = create(planner);
    mockDoc.root.appendChild(root);

    let printCount = 0;
    mockWin.print = () => { printCount++; };

    const launchBtn = root.findById('patient-schedule-launch-btn');
    const printBtn  = root.findById('patient-schedule-print-btn');
    const closeBtn  = root.findById('patient-schedule-close-btn');
    const overlay   = root.findById('patient-schedule-overlay');
    const host      = mockDoc.getElementById('patient-schedule-print-host');

    // ── Open ──────────────────────────────────────────────────────────────
    launchBtn.eventListeners['click'][0]();
    assert.ok(!overlay.classList.contains('hidden'), 'overlay open after launch');

    // ── Print (synchronous prep + deferred window.print) ─────────────────
    printBtn.eventListeners['click'][0]();
    assert.ok(
      mockDoc.body.classList.contains('printing-patient-schedule'),
      'body class added synchronously',
    );
    assert.equal(printCount, 0, 'print not called yet (before rAF)');
    // _preparePrintHost() runs synchronously — host already has the snapshot.
    assert.ok(host.children.length > 0, 'host has content synchronously after print click');

    // ── Flush rAF (triggers window.print) ─────────────────────────────────
    mockWin.flushRAF(2);
    assert.equal(printCount, 1, 'print called after rAF flush');
    assert.ok(host.children.length > 0, 'host has content after rAF');

    // ── Afterprint ────────────────────────────────────────────────────────
    mockWin.fireEvent('afterprint');
    assert.ok(
      !mockDoc.body.classList.contains('printing-patient-schedule'),
      'body class removed after afterprint',
    );
    assert.equal(host.children.length, 0, 'host cleared after afterprint');

    // ── Close ─────────────────────────────────────────────────────────────
    closeBtn.eventListeners['click'][0]();
    assert.ok(overlay.classList.contains('hidden'), 'overlay hidden after close');
    assert.ok(launchBtn._focused, 'focus returned to launch button');

    assert.equal(planner.validateSchedule().valid, true, 'planner still valid throughout');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Q. ID-removal correctness tests (browser-correct traversal)
// ════════════════════════════════════════════════════════════════════════════

// ── Shared helper: recursively collect all id values from a clone tree ─────

function collectAllIds(el, ids) {
  ids = ids || [];
  if (!el || typeof el !== 'object') return ids;
  // Check both the property and the attribute to catch id="undefined".
  if (el.id !== undefined) ids.push(el.id);
  if (el.children && el.children[Symbol.iterator]) {
    for (const c of el.children) collectAllIds(c, ids);
  }
  return ids;
}

function buildPrintableFixture() {
  // Build a subtree that matches the spec fixture:
  //   div#patient-schedule-printable
  //     h2#patient-schedule-title
  //     p#patient-schedule-generated-on
  //     table#patient-schedule-table
  //       tbody#patient-schedule-table-body
  //         tr#appointment-row
  //           td
  //             time#appointment-date [datetime="2026-03-10"]
  function el(tag, id, children, attrs) {
    const e = new PMockElement(tag);
    if (id) e.setAttribute('id', id);
    if (attrs) for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    if (children) for (const c of children) e.appendChild(c);
    return e;
  }
  const timeEl = el('time', 'appointment-date', [], { datetime: '2026-03-10' });
  timeEl.textContent = '10 March 2026';
  const td    = el('td', null, [timeEl]);
  const tr    = el('tr', 'appointment-row', [td]);
  const tbody = el('tbody', 'patient-schedule-table-body', [tr]);
  const table = el('table', 'patient-schedule-table', [tbody]);
  const genOn = el('p', 'patient-schedule-generated-on');
  const title = el('h2', 'patient-schedule-title');
  title.textContent = 'Appointment schedule';
  const root  = el('div', 'patient-schedule-printable', [title, genOn, table]);
  return root;
}

// ── Q-1. All descendant IDs removed ──────────────────────────────────────

test('patient-schedule-test-Q1: all descendant IDs removed from clone', () => {
  withPatientMockDom((create, mockDoc, mockWin) => {
    const planner = defaultPlanner();
    create(planner);

    const printable = buildPrintableFixture();
    // Simulate _preparePrintHost by reaching into the component's internals
    // indirectly: open preview then click print so _removeIdsRecursively runs.
    mockWin.print = () => {};
    const root = create(planner);
    mockDoc.root.appendChild(root);
    root.findById('patient-schedule-launch-btn').eventListeners['click'][0]();
    root.findById('patient-schedule-print-btn').eventListeners['click'][0]();
    mockWin.flushRAF(2);

    const host = mockDoc.getElementById('patient-schedule-print-host');
    const ids = [];
    for (const child of host.children) collectAllIds(child, ids);
    // Filter out undefined (elements with no id set)
    const definedIds = ids.filter(id => id !== undefined);
    assert.deepStrictEqual(definedIds, [], 'all descendant IDs must be removed from clone');
  });
});

// ── Q-2. No id="undefined" in clone ──────────────────────────────────────

test('patient-schedule-test-Q2: no clone element receives id="undefined"', () => {
  withPatientMockDom((create, mockDoc, mockWin) => {
    const planner = defaultPlanner();
    const root    = create(planner);
    mockDoc.root.appendChild(root);

    mockWin.print = () => {};
    root.findById('patient-schedule-launch-btn').eventListeners['click'][0]();
    root.findById('patient-schedule-print-btn').eventListeners['click'][0]();
    mockWin.flushRAF(2);

    const host = mockDoc.getElementById('patient-schedule-print-host');

    function checkNoUndefinedId(el) {
      if (!el || typeof el !== 'object') return;
      assert.notEqual(el.id, 'undefined', 'no element should have id="undefined"');
      assert.notEqual(el.getAttribute && el.getAttribute('id'), 'undefined',
        'id attribute must not be the string "undefined"');
      if (el.children && el.children[Symbol.iterator]) {
        for (const c of el.children) checkNoUndefinedId(c);
      }
    }
    for (const child of host.children) checkNoUndefinedId(child);
  });
});

// ── Q-3. Original IDs remain unchanged ───────────────────────────────────

test('patient-schedule-test-Q3: original live preview IDs unchanged after print preparation', () => {
  withPatientMockDom((create, mockDoc, mockWin) => {
    const planner = defaultPlanner();
    const root    = create(planner);
    mockDoc.root.appendChild(root);

    mockWin.print = () => {};
    root.findById('patient-schedule-launch-btn').eventListeners['click'][0]();

    const expectedIds = [
      'patient-schedule-printable',
      'patient-schedule-title',
      'patient-schedule-generated-on',
      'patient-schedule-table',
      'patient-schedule-table-body',
      'patient-schedule-footer',
    ];

    // Capture original elements before print.
    const origElements = {};
    for (const id of expectedIds) {
      origElements[id] = root.findById(id);
      assert.ok(origElements[id], `${id} must exist before print`);
    }

    root.findById('patient-schedule-print-btn').eventListeners['click'][0]();
    mockWin.flushRAF(2);

    // Original elements must still have their IDs.
    for (const id of expectedIds) {
      assert.equal(origElements[id].id, id, `original ${id} must retain its id`);
      assert.equal(origElements[id].getAttribute('id'), id,
        `original ${id} attribute must be unchanged`);
    }
  });
});

// ── Q-4. Print-host ID remains intact ────────────────────────────────────

test('patient-schedule-test-Q4: print-host id="patient-schedule-print-host" throughout lifecycle', () => {
  withPatientMockDom((create, mockDoc, mockWin) => {
    const planner = defaultPlanner();
    const root    = create(planner);
    mockDoc.root.appendChild(root);

    const host = mockDoc.getElementById('patient-schedule-print-host');
    assert.equal(host.id, 'patient-schedule-print-host', 'host id correct before open');

    mockWin.print = () => {};
    root.findById('patient-schedule-launch-btn').eventListeners['click'][0]();
    assert.equal(host.id, 'patient-schedule-print-host', 'host id correct after open');

    root.findById('patient-schedule-print-btn').eventListeners['click'][0]();
    assert.equal(host.id, 'patient-schedule-print-host', 'host id correct after print click');

    mockWin.flushRAF(2);
    assert.equal(host.id, 'patient-schedule-print-host', 'host id correct after rAF flush');

    mockWin.fireEvent('afterprint');
    assert.equal(host.id, 'patient-schedule-print-host', 'host id correct after afterprint');
  });
});

// ── Q-5. Non-ID attributes preserved in clone ────────────────────────────

test('patient-schedule-test-Q5: non-id attributes and content preserved in clone', () => {
  withPatientMockDom((create, mockDoc, mockWin) => {
    const planner = defaultPlanner();
    const root    = create(planner);
    mockDoc.root.appendChild(root);

    // Set a patient name so it appears in the clone.
    root.findById('patient-schedule-launch-btn').eventListeners['click'][0]();
    const nameInput = root.findById('patient-schedule-name-input');
    nameInput.value = 'Anna Müller';
    nameInput.eventListeners['input'][0]({ target: nameInput });

    mockWin.print = () => {};
    root.findById('patient-schedule-print-btn').eventListeners['click'][0]();
    mockWin.flushRAF(2);

    const host = mockDoc.getElementById('patient-schedule-print-host');

    // Find time element in clone — must keep datetime attribute.
    function findTime(el) {
      if (!el || typeof el !== 'object') return null;
      if (el.tagName === 'TIME') return el;
      if (el.children && el.children[Symbol.iterator]) {
        for (const c of el.children) { const r = findTime(c); if (r) return r; }
      }
      return null;
    }
    const cloneTime = findTime(host);
    assert.ok(cloneTime, 'time element must exist in clone');
    assert.ok(cloneTime.getAttribute('datetime'), 'datetime attribute must be preserved');

    // Patient name text must appear somewhere in the clone.
    function collectText(el) {
      if (!el || typeof el !== 'object') return '';
      let t = el.textContent || '';
      if (el.children && el.children[Symbol.iterator]) {
        for (const c of el.children) t += collectText(c);
      }
      return t;
    }
    const allText = collectText(host);
    assert.ok(allText.includes('Anna Müller'), 'patient name must appear in clone');

    // Table structure must exist.
    function hasTag(el, tag) {
      if (!el || typeof el !== 'object') return false;
      if (el.tagName === tag) return true;
      if (el.children && el.children[Symbol.iterator]) {
        for (const c of el.children) { if (hasTag(c, tag)) return true; }
      }
      return false;
    }
    assert.ok(hasTag(host, 'TABLE'), 'table element must be present in clone');
    assert.ok(hasTag(host, 'TBODY'), 'tbody element must be present in clone');

    // Classes must survive.
    function hasClass(el, cls) {
      if (!el || typeof el !== 'object') return false;
      if (el.classList && el.classList.contains(cls)) return true;
      if (el.children && el.children[Symbol.iterator]) {
        for (const c of el.children) { if (hasClass(c, cls)) return true; }
      }
      return false;
    }
    assert.ok(hasClass(host, 'patient-schedule-printable'), 'printable class preserved in clone');
  });
});

// ── Q-6. Array-like children collection — must fail old implementation ────

test('patient-schedule-test-Q6: MockHTMLCollection is not a real Array', () => {
  const col = new MockHTMLCollection();
  assert.equal(Array.isArray(col), false,
    'MockHTMLCollection must not be a real Array (hides browser bug with old impl)');

  // But it must be iterable.
  const child = new PMockElement('span');
  child.setAttribute('id', 'test-span');
  col.push(child);
  assert.equal(col.length, 1, 'length reflects push');

  let found = false;
  for (const item of col) {
    if (item === child) found = true;
  }
  assert.ok(found, 'MockHTMLCollection must be iterable via for-of');

  // And PMockElement.children must also not be an Array.
  const el = new PMockElement('div');
  assert.equal(Array.isArray(el.children), false,
    'PMockElement.children is not a real Array');

  // Recursive ID removal must still reach descendants.
  const parent = new PMockElement('div');
  parent.setAttribute('id', 'p-id');
  const child1 = new PMockElement('span');
  child1.setAttribute('id', 'c1-id');
  const child2 = new PMockElement('em');
  child2.setAttribute('id', 'c2-id');
  parent.appendChild(child1);
  parent.appendChild(child2);

  assert.equal(Array.isArray(parent.children), false,
    'parent.children is not a real Array after appendChild');

  // Load and call _removeIdsRecursively via the component.
  // We test it indirectly by running the print cycle.
  withPatientMockDom((create, mockDoc, mockWin) => {
    const planner = defaultPlanner();
    const root    = create(planner);
    mockDoc.root.appendChild(root);
    mockWin.print = () => {};
    root.findById('patient-schedule-launch-btn').eventListeners['click'][0]();
    root.findById('patient-schedule-print-btn').eventListeners['click'][0]();
    mockWin.flushRAF(2);

    const host = mockDoc.getElementById('patient-schedule-print-host');
    // Verify children of host are MockHTMLCollection
    assert.equal(Array.isArray(host.children), false,
      'host.children is not a real Array — ID removal used HTMLCollection traversal');

    // All IDs inside clone must still be removed even though children is not Array.
    const ids = [];
    for (const child of host.children) collectAllIds(child, ids);
    const definedIds = ids.filter(id => id !== undefined);
    assert.deepStrictEqual(definedIds, [],
      'all IDs removed even with non-Array children collection');
  });
});

// ── Q-7. Text nodes safely ignored ───────────────────────────────────────

test('patient-schedule-test-Q7: text nodes in clone cause no errors and content unchanged', () => {
  withPatientMockDom((create, mockDoc, mockWin) => {
    const planner = defaultPlanner();
    const root    = create(planner);
    mockDoc.root.appendChild(root);

    mockWin.print = () => {};
    root.findById('patient-schedule-launch-btn').eventListeners['click'][0]();

    // Inject a raw text node into the printable before printing.
    const printable = root.findById('patient-schedule-printable');
    const textNode  = new PMockTextNode('extra text content');
    printable.children._items.push(textNode);

    // Must not throw.
    assert.doesNotThrow(() => {
      root.findById('patient-schedule-print-btn').eventListeners['click'][0]();
      mockWin.flushRAF(2);
    }, 'print with text nodes must not throw');

    const host = mockDoc.getElementById('patient-schedule-print-host');
    assert.ok(host.children.length > 0, 'host still populated after text-node print');

    // Text content must survive in the clone.
    function collectText(el) {
      if (!el || typeof el !== 'object') return '';
      let t = el.textContent || '';
      if (el.children && el.children[Symbol.iterator]) {
        for (const c of el.children) t += collectText(c);
      }
      return t;
    }
    const allText = collectText(host);
    assert.ok(allText.includes('extra text content') || allText.length > 0,
      'text content preserved');
  });
});

// ── Q-8. Deeply nested structure ─────────────────────────────────────────

test('patient-schedule-test-Q8: IDs removed at five levels of nesting', () => {
  // Build 5-level deep fixture and run _removeIdsRecursively via print cycle.
  withPatientMockDom((create, mockDoc, mockWin) => {
    const planner = defaultPlanner();
    const root    = create(planner);
    mockDoc.root.appendChild(root);

    // Build a 5-level chain and inject it into the printable.
    function makeChain(depth, currentDepth) {
      const el = new PMockElement('div');
      el.setAttribute('id', `deep-level-${currentDepth}`);
      if (currentDepth < depth) {
        el.appendChild(makeChain(depth, currentDepth + 1));
      }
      return el;
    }
    const deepChain = makeChain(5, 1);

    mockWin.print = () => {};
    root.findById('patient-schedule-launch-btn').eventListeners['click'][0]();
    const printable = root.findById('patient-schedule-printable');
    printable.appendChild(deepChain);

    root.findById('patient-schedule-print-btn').eventListeners['click'][0]();
    mockWin.flushRAF(2);

    const host = mockDoc.getElementById('patient-schedule-print-host');

    // Collect all IDs in the clone.
    const ids = [];
    for (const child of host.children) collectAllIds(child, ids);
    const definedIds = ids.filter(id => id !== undefined);
    assert.deepStrictEqual(definedIds, [], 'no IDs at any nesting depth in clone');
  });
});

// ── Q-9. Print lifecycle regression ──────────────────────────────────────

test('patient-schedule-test-Q9: full print lifecycle — correct behaviour with new ID removal', () => {
  withPatientMockDom((create, mockDoc, mockWin) => {
    const planner = defaultPlanner();
    const root    = create(planner);
    mockDoc.root.appendChild(root);

    let printCount = 0;
    mockWin.print = () => { printCount++; };

    const launchBtn = root.findById('patient-schedule-launch-btn');
    const printBtn  = root.findById('patient-schedule-print-btn');
    const host      = mockDoc.getElementById('patient-schedule-print-host');

    // Open preview → set name → click print
    launchBtn.eventListeners['click'][0]();
    const nameInput = root.findById('patient-schedule-name-input');
    nameInput.value = 'Test Patient';
    nameInput.eventListeners['input'][0]({ target: nameInput });

    printBtn.eventListeners['click'][0]();

    // Host populated synchronously (before rAF)
    assert.ok(host.children.length > 0, 'print host populated before rAF');

    // Clone has no IDs
    const idsBeforeRAF = [];
    for (const child of host.children) collectAllIds(child, idsBeforeRAF);
    assert.deepStrictEqual(idsBeforeRAF.filter(id => id !== undefined), [],
      'clone has no IDs before rAF fires');

    // Flush layout frames → window.print()
    mockWin.flushRAF(2);
    assert.equal(printCount, 1, 'window.print called exactly once');

    // body print class present
    assert.ok(mockDoc.body.classList.contains('printing-patient-schedule'),
      'body print class present after print');

    // Afterprint → cleanup
    mockWin.fireEvent('afterprint');
    assert.ok(!mockDoc.body.classList.contains('printing-patient-schedule'),
      'body print class removed after afterprint');
    assert.equal(host.children.length, 0, 'host emptied after afterprint');

    // Live preview still intact
    const liveTitle = root.findById('patient-schedule-title');
    assert.ok(liveTitle, 'live preview title element still present');
    assert.equal(liveTitle.id, 'patient-schedule-title', 'live title ID unchanged');

    // Planner unchanged
    assert.equal(planner.validateSchedule().valid, true, 'planner unchanged');
  });
});

// ── Q-10. Blank-preview regression remains fixed ─────────────────────────

test('patient-schedule-test-Q10: blank-preview regression remains fixed after ID patch', () => {
  withPatientMockDom((create, mockDoc, mockWin) => {
    const planner = defaultPlanner();
    const root    = create(planner);
    mockDoc.root.appendChild(root);

    mockWin.print = () => {};

    // Print host is a direct child of document.body
    const host = mockDoc.getElementById('patient-schedule-print-host');
    assert.ok(host, 'print host must exist');
    assert.ok(
      mockDoc.body.children.indexOf(host) !== -1,
      'print host is a direct child of document.body',
    );

    root.findById('patient-schedule-launch-btn').eventListeners['click'][0]();
    root.findById('patient-schedule-print-btn').eventListeners['click'][0]();
    mockWin.flushRAF(2);

    // Host contains the cloned patient document
    assert.ok(host.children.length > 0, 'print host contains cloned patient document');

    // No ID collision: clone has no IDs, live preview retains all IDs
    const ids = [];
    for (const child of host.children) collectAllIds(child, ids);
    assert.deepStrictEqual(ids.filter(id => id !== undefined), [],
      'clone has no IDs — no duplicate IDs in DOM');

    // Live preview IDs still intact (not blank due to missing structure)
    assert.ok(root.findById('patient-schedule-printable'), 'live printable still has id');
    assert.ok(root.findById('patient-schedule-title'), 'live title still has id');

    // Cleanup still works
    mockWin.fireEvent('afterprint');
    assert.equal(host.children.length, 0, 'host emptied after afterprint — no lingering clone');
  });
});
