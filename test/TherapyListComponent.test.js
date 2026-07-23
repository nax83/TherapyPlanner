const test = require('node:test');
const assert = require('assert/strict');

const TherapyPlanner = require('../TherapyPlanner.js');
global.TherapyPlanner = TherapyPlanner;
const createTherapyListComponent = require('../TherapyListComponent.js');

class MockClassList {
  constructor() {
    this.values = new Set();
  }

  add(...names) {
    names.forEach((name) => this.values.add(name));
  }

  contains(name) {
    return this.values.has(name);
  }
}

class MockElement {
  constructor(tagName, ownerDocument) {
    this.tagName = String(tagName).toUpperCase();
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.parentNode = null;
    this.attributes = {};
    this.eventListeners = {};
    this.classList = new MockClassList();
    this.value = '';
    this.selected = false;
    this._textContent = '';
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    if (this.tagName === 'SELECT' && child.selected) {
      this.value = child.attributes.value || child.value || '';
    }
    return child;
  }

  removeChild(child) {
    const index = this.children.indexOf(child);
    if (index >= 0) this.children.splice(index, 1);
    child.parentNode = null;
    return child;
  }

  get firstChild() {
    return this.children[0] || null;
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name === 'id') this.id = String(value);
    if (name === 'value') this.value = String(value);
  }

  getAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attributes, name)
      ? this.attributes[name]
      : null;
  }

  addEventListener(eventName, handler) {
    if (!this.eventListeners[eventName]) this.eventListeners[eventName] = [];
    this.eventListeners[eventName].push(handler);
  }

  focus() {
    this.ownerDocument.activeElement = this;
  }

  findById(id) {
    if (this.id === id) return this;
    for (const child of this.children) {
      const found = child.findById(id);
      if (found) return found;
    }
    return null;
  }

  get textContent() {
    return this._textContent + this.children.map((child) => child.textContent).join('');
  }

  set textContent(value) {
    this._textContent = String(value);
    this.children = [];
  }
}

class MockDocument {
  constructor() {
    this.activeElement = null;
    this.body = new MockElement('body', this);
  }

  createElement(tagName) {
    return new MockElement(tagName, this);
  }
}

function withMockDom(run) {
  const previousDocument = global.document;
  const document = new MockDocument();
  global.document = document;
  try {
    return run(document);
  } finally {
    global.document = previousDocument;
  }
}

function click(element) {
  assert.ok(element, 'click target must exist');
  const handlers = element.eventListeners.click || [];
  assert.ok(handlers.length > 0, 'click handler must exist');
  handlers[0]({ target: element });
}

function changeValue(element, value) {
  assert.ok(element, 'change target must exist');
  element.value = value;
  const handlers = element.eventListeners.change || [];
  assert.ok(handlers.length > 0, 'change handler must exist');
  handlers[0]({ target: element });
}

function flatten(node) {
  const items = [node];
  node.children.forEach((child) => items.push(...flatten(child)));
  return items;
}

function collectByText(node, text) {
  return flatten(node).filter((entry) => entry.textContent.includes(text));
}

function collectDateInputs(node) {
  return flatten(node).filter((entry) =>
    entry.tagName === 'INPUT' &&
    entry.getAttribute('type') === 'date'
  );
}

function fmt(date) {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function snapshotPlanner(planner) {
  return [TherapyPlanner.RIGHTEYE, TherapyPlanner.LEFTEYE].map((eye) =>
    planner.getPlanByEye(eye).map((item) => ({
      type: item.type,
      minWeeks: item.minWeeks,
      plannedDate: fmt(item.plannedDate),
      earliestSameEyeDate: fmt(item.earliestSameEyeDate),
      status: item.status,
      dateOrigin: item.dateOrigin,
    }))
  );
}

function createMountedComponents(planner) {
  const document = new MockDocument();
  global.document = document;
  const right = createTherapyListComponent('right-card', TherapyPlanner.RIGHTEYE, planner);
  const left = createTherapyListComponent('left-card', TherapyPlanner.LEFTEYE, planner);
  document.body.appendChild(right);
  document.body.appendChild(left);
  return { document, right, left };
}

function withFrozenNow(isoDate, run) {
  const RealDate = Date;
  const frozen = new RealDate(`${isoDate}T12:00:00`);

  function FakeDate(...args) {
    if (this instanceof FakeDate) {
      if (args.length === 0) return new RealDate(frozen.getTime());
      return new RealDate(...args);
    }
    return RealDate(...args);
  }

  FakeDate.UTC = RealDate.UTC;
  FakeDate.parse = RealDate.parse;
  FakeDate.now = () => frozen.getTime();
  FakeDate.prototype = RealDate.prototype;

  global.Date = FakeDate;
  try {
    return run();
  } finally {
    global.Date = RealDate;
  }
}

test('ui-test-1: no status select is rendered for planned and completed rows', () => {
  const planner = new TherapyPlanner();
  planner.setStatus(TherapyPlanner.RIGHTEYE, 0, TherapyPlanner.STATUS_COMPLETED, new Date(2026, 6, 20));

  const { right } = createMountedComponents(planner);
  assert.equal(right.findById(`${TherapyPlanner.RIGHTEYE}-status-0`), null);
  assert.equal(right.findById(`${TherapyPlanner.RIGHTEYE}-status-1`), null);
  assert.equal(flatten(right).some((node) => node.tagName === 'SELECT' && /planned|completed/i.test(node.textContent)), false);
});

test('ui-test-2: planned row shows mark-as-completed without planned badge', () => {
  const planner = new TherapyPlanner();
  const { right } = createMountedComponents(planner);
  const button = right.findById(`${TherapyPlanner.RIGHTEYE}-mark-completed-0`);
  assert.ok(button, 'mark-as-completed button must exist');
  assert.equal(button.textContent, 'Mark as completed');
  assert.equal(collectByText(right, 'Planned').length, 0);
});

test('ui-test-3: opening completion form is mutation-free', () => {
  const planner = new TherapyPlanner();
  const before = snapshotPlanner(planner);
  const { right } = createMountedComponents(planner);
  const button = right.findById(`${TherapyPlanner.RIGHTEYE}-mark-completed-0`);
  click(button);

  const row0 = right.findById(`${TherapyPlanner.RIGHTEYE}-row-0`);
  assert.ok(row0, 'row 0 must exist');
  const dateInput = right.findById(`${TherapyPlanner.RIGHTEYE}-complete-date-0`);
  assert.ok(dateInput, 'completion date input must exist');
  assert.equal(
    right.findById(`${TherapyPlanner.RIGHTEYE}-date-0`),
    null,
    'ordinary appointment date input must not exist while completing'
  );
  assert.equal(dateInput.value, fmt(planner.today));
  assert.equal(dateInput.getAttribute('max'), fmt(planner.today));
  assert.equal(collectDateInputs(row0).length, 1);
  assert.deepEqual(snapshotPlanner(planner), before);
});

test('ui-test-4: cancelling completion keeps appointment planned', () => {
  const planner = new TherapyPlanner();
  const originalDate = fmt(planner.getPlanByEye(TherapyPlanner.RIGHTEYE)[0].plannedDate);
  const { right } = createMountedComponents(planner);
  click(right.findById(`${TherapyPlanner.RIGHTEYE}-mark-completed-0`));
  click(right.findById(`${TherapyPlanner.RIGHTEYE}-complete-cancel-0`));

  const row0 = planner.getPlanByEye(TherapyPlanner.RIGHTEYE)[0];
  assert.equal(row0.status, TherapyPlanner.STATUS_PLANNED);
  assert.equal(fmt(row0.plannedDate), originalDate);
  assert.equal(right.findById(`${TherapyPlanner.RIGHTEYE}-complete-date-0`), null);
  const row0Node = right.findById(`${TherapyPlanner.RIGHTEYE}-row-0`);
  assert.ok(row0Node, 'row 0 must exist after cancel');
  const ordinaryDateInput = right.findById(`${TherapyPlanner.RIGHTEYE}-date-0`);
  assert.ok(ordinaryDateInput, 'ordinary input must return after cancel');
  assert.equal(ordinaryDateInput.value, originalDate);
  assert.equal(collectDateInputs(row0Node).length, 1);
  assert.ok(right.findById(`${TherapyPlanner.RIGHTEYE}-mark-completed-0`), 'mark button must return');
});

test('ui-test-5: successful completion stores selected treatment date and shows completed badge', () => {
  const planner = new TherapyPlanner();
  const { right } = createMountedComponents(planner);
  click(right.findById(`${TherapyPlanner.RIGHTEYE}-mark-completed-0`));
  right.findById(`${TherapyPlanner.RIGHTEYE}-complete-date-0`).value = '2026-07-20';
  click(right.findById(`${TherapyPlanner.RIGHTEYE}-complete-confirm-0`));

  const row0 = planner.getPlanByEye(TherapyPlanner.RIGHTEYE)[0];
  assert.equal(row0.status, TherapyPlanner.STATUS_COMPLETED);
  assert.equal(fmt(row0.plannedDate), '2026-07-20');
  assert.equal(right.findById(`${TherapyPlanner.RIGHTEYE}-complete-date-0`), null);
  const ordinaryDateInput = right.findById(`${TherapyPlanner.RIGHTEYE}-date-0`);
  assert.ok(ordinaryDateInput, 'ordinary completed-date input must exist');
  assert.equal(ordinaryDateInput.value, '2026-07-20');
  assert.equal(ordinaryDateInput.getAttribute('max'), fmt(planner.today));
  const row0Node = right.findById(`${TherapyPlanner.RIGHTEYE}-row-0`);
  assert.ok(row0Node, 'row 0 must exist after completion');
  assert.equal(collectDateInputs(row0Node).length, 1);
  assert.ok(right.findById(`${TherapyPlanner.RIGHTEYE}-completed-badge-0`), 'completed badge must exist');
  assert.equal(right.findById(`${TherapyPlanner.RIGHTEYE}-mark-completed-0`), null);
});

test('ui-test-6: failed completion preserves planned state and shows error', () => {
  const planner = new TherapyPlanner();
  const original = snapshotPlanner(planner);
  const { right } = createMountedComponents(planner);
  click(right.findById(`${TherapyPlanner.RIGHTEYE}-mark-completed-0`));
  right.findById(`${TherapyPlanner.RIGHTEYE}-complete-date-0`).value = '2026-12-25';
  click(right.findById(`${TherapyPlanner.RIGHTEYE}-complete-confirm-0`));

  assert.deepEqual(snapshotPlanner(planner), original);
  const completionInput = right.findById(`${TherapyPlanner.RIGHTEYE}-complete-date-0`);
  assert.ok(completionInput, 'pending form must stay visible');
  assert.equal(right.findById(`${TherapyPlanner.RIGHTEYE}-date-0`), null);
  const row0 = right.findById(`${TherapyPlanner.RIGHTEYE}-row-0`);
  assert.ok(row0, 'row 0 must exist while completion fails');
  assert.equal(collectDateInputs(row0).length, 1);
  const error = right.findById(`${TherapyPlanner.RIGHTEYE}-error-0`);
  assert.ok(error, 'error node must exist');
  assert.match(error.textContent, /cannot be dated after today/i);
  assert.equal(right.findById(`${TherapyPlanner.RIGHTEYE}-completed-badge-0`), null);
});

test('ui-test-7: completed row shows badge, restore action, em dash min date, and bounded date input', () => {
  const planner = new TherapyPlanner();
  planner.setStatus(TherapyPlanner.RIGHTEYE, 0, TherapyPlanner.STATUS_COMPLETED, new Date(2026, 6, 20));

  const { right } = createMountedComponents(planner);
  const badge = right.findById(`${TherapyPlanner.RIGHTEYE}-completed-badge-0`);
  const restore = right.findById(`${TherapyPlanner.RIGHTEYE}-restore-planned-0`);
  const dateInput = right.findById(`${TherapyPlanner.RIGHTEYE}-date-0`);
  assert.ok(badge, 'completed badge must exist');
  assert.match(badge.textContent, /completed/i);
  assert.ok(restore, 'restore button must exist');
  assert.ok(dateInput, 'date input must exist');
  assert.equal(dateInput.getAttribute('max'), fmt(planner.today));

  const minDateDashes = collectByText(right, '\u2014');
  assert.ok(minDateDashes.length > 0, 'completed row must show em dash in min date column');
  assert.equal(collectByText(right, 'Completed').length >= 2, true);
});

test('ui-test-8: first restore click is mutation-free', () => {
  const planner = new TherapyPlanner();
  planner.setStatus(TherapyPlanner.RIGHTEYE, 0, TherapyPlanner.STATUS_COMPLETED, new Date(2026, 6, 20));
  const before = snapshotPlanner(planner);
  const { right } = createMountedComponents(planner);
  click(right.findById(`${TherapyPlanner.RIGHTEYE}-restore-planned-0`));

  assert.ok(right.findById(`${TherapyPlanner.RIGHTEYE}-restore-confirm-0`), 'restore confirmation must exist');
  assert.deepEqual(snapshotPlanner(planner), before);
});

test('ui-test-9: cancelling restore keeps appointment completed', () => {
  const planner = new TherapyPlanner();
  planner.setStatus(TherapyPlanner.RIGHTEYE, 0, TherapyPlanner.STATUS_COMPLETED, new Date(2026, 6, 20));
  const originalDate = fmt(planner.getPlanByEye(TherapyPlanner.RIGHTEYE)[0].plannedDate);
  const { right } = createMountedComponents(planner);
  click(right.findById(`${TherapyPlanner.RIGHTEYE}-restore-planned-0`));
  click(right.findById(`${TherapyPlanner.RIGHTEYE}-restore-cancel-0`));

  const row0 = planner.getPlanByEye(TherapyPlanner.RIGHTEYE)[0];
  assert.equal(row0.status, TherapyPlanner.STATUS_COMPLETED);
  assert.equal(fmt(row0.plannedDate), originalDate);
  assert.ok(right.findById(`${TherapyPlanner.RIGHTEYE}-completed-badge-0`), 'completed badge must remain');
  assert.ok(right.findById(`${TherapyPlanner.RIGHTEYE}-restore-planned-0`), 'restore action must return');
});

test('ui-test-10: successful restore reverts to planned and redraws both eyes', () => {
  const planner = new TherapyPlanner();
  planner.setStatus(TherapyPlanner.RIGHTEYE, 0, TherapyPlanner.STATUS_COMPLETED, new Date(2026, 6, 20));
  const { right, left } = createMountedComponents(planner);
  const leftBefore = left.findById(`${TherapyPlanner.LEFTEYE}-date-0`).value;

  click(right.findById(`${TherapyPlanner.RIGHTEYE}-restore-planned-0`));
  click(right.findById(`${TherapyPlanner.RIGHTEYE}-restore-confirm-0`));

  const row0 = planner.getPlanByEye(TherapyPlanner.RIGHTEYE)[0];
  assert.equal(row0.status, TherapyPlanner.STATUS_PLANNED);
  assert.equal(right.findById(`${TherapyPlanner.RIGHTEYE}-completed-badge-0`), null);
  assert.ok(right.findById(`${TherapyPlanner.RIGHTEYE}-mark-completed-0`), 'mark button must reappear');
  assert.notEqual(left.findById(`${TherapyPlanner.LEFTEYE}-date-0`).value, leftBefore);
});

test('ui-test-10b: other rows keep ordinary date inputs while row 0 is completing', () => {
  const planner = new TherapyPlanner();
  const { right } = createMountedComponents(planner);

  click(right.findById(`${TherapyPlanner.RIGHTEYE}-mark-completed-0`));

  const row0 = right.findById(`${TherapyPlanner.RIGHTEYE}-row-0`);
  const row1 = right.findById(`${TherapyPlanner.RIGHTEYE}-row-1`);
  const row2 = right.findById(`${TherapyPlanner.RIGHTEYE}-row-2`);
  assert.ok(row0, 'row 0 must exist');
  assert.ok(row1, 'row 1 must exist');
  assert.ok(row2, 'row 2 must exist');
  assert.ok(right.findById(`${TherapyPlanner.RIGHTEYE}-complete-date-0`), 'row 0 treatment date must exist');
  assert.equal(right.findById(`${TherapyPlanner.RIGHTEYE}-date-0`), null);
  assert.ok(right.findById(`${TherapyPlanner.RIGHTEYE}-date-1`), 'row 1 ordinary date must exist');
  assert.ok(right.findById(`${TherapyPlanner.RIGHTEYE}-date-2`), 'row 2 ordinary date must exist');
  assert.equal(collectDateInputs(row0).length, 1);
  assert.equal(collectDateInputs(row1).length, 1);
  assert.equal(collectDateInputs(row2).length, 1);
});

test('ui-test-10c: opening completion on another row closes the previous completion form', () => {
  const planner = new TherapyPlanner();
  const { right } = createMountedComponents(planner);

  click(right.findById(`${TherapyPlanner.RIGHTEYE}-mark-completed-0`));
  click(right.findById(`${TherapyPlanner.RIGHTEYE}-mark-completed-1`));

  const row0 = right.findById(`${TherapyPlanner.RIGHTEYE}-row-0`);
  const row1 = right.findById(`${TherapyPlanner.RIGHTEYE}-row-1`);
  assert.ok(row0, 'row 0 must exist');
  assert.ok(row1, 'row 1 must exist');
  assert.ok(right.findById(`${TherapyPlanner.RIGHTEYE}-date-0`), 'row 0 ordinary date must return');
  assert.equal(right.findById(`${TherapyPlanner.RIGHTEYE}-complete-date-0`), null);
  assert.equal(right.findById(`${TherapyPlanner.RIGHTEYE}-date-1`), null);
  assert.ok(right.findById(`${TherapyPlanner.RIGHTEYE}-complete-date-1`), 'row 1 treatment date must exist');
  assert.equal(collectDateInputs(row0).length, 1);
  assert.equal(collectDateInputs(row1).length, 1);
  assert.equal(flatten(right).filter((entry) => entry.id === `${TherapyPlanner.RIGHTEYE}-complete-date-1`).length, 1);
  assert.equal(flatten(right).filter((entry) => entry.getAttribute && entry.getAttribute('type') === 'date' && entry.id && entry.id.includes('-complete-date-')).length, 1);
});

test('ui-test-11: failed restore rolls back and keeps completed row intact', () => {
  const planner = new TherapyPlanner();
  planner.setStatus(TherapyPlanner.RIGHTEYE, 0, TherapyPlanner.STATUS_COMPLETED, new Date(2026, 6, 20));
  const original = snapshotPlanner(planner);
  const originalSetStatus = planner.setStatus.bind(planner);
  planner.setStatus = (type, index, status, actualDate) => {
    if (status === TherapyPlanner.STATUS_PLANNED) {
      return {
        success: false,
        message: 'Restore blocked for test',
        changedAppointments: [],
        warnings: [],
      };
    }
    return originalSetStatus(type, index, status, actualDate);
  };

  const { right } = createMountedComponents(planner);
  click(right.findById(`${TherapyPlanner.RIGHTEYE}-restore-planned-0`));
  click(right.findById(`${TherapyPlanner.RIGHTEYE}-restore-confirm-0`));

  assert.deepEqual(snapshotPlanner(planner), original);
  assert.ok(right.findById(`${TherapyPlanner.RIGHTEYE}-completed-badge-0`), 'completed badge must remain');
  const error = right.findById(`${TherapyPlanner.RIGHTEYE}-error-0`);
  assert.ok(error, 'error must be visible');
  assert.match(error.textContent, /restore blocked for test/i);
});

test('ui-test-12: completed date correction keeps completed status and preserves historical cascade', () => {
  withFrozenNow('2026-03-17', () => {
    const planner = new TherapyPlanner();
    const right0 = planner.getPlanByEye(TherapyPlanner.RIGHTEYE)[0].plannedDate;
    planner.setStatus(TherapyPlanner.RIGHTEYE, 0, TherapyPlanner.STATUS_COMPLETED, new Date(2026, 1, 10));
    assert.equal(fmt(planner.getPlanByEye(TherapyPlanner.RIGHTEYE)[0].plannedDate), '2026-02-10');

    const { right, left } = createMountedComponents(planner);
    changeValue(right.findById(`${TherapyPlanner.RIGHTEYE}-date-0`), '2026-03-10');

    const updatedRight0 = planner.getPlanByEye(TherapyPlanner.RIGHTEYE)[0];
    const updatedLeft0 = planner.getPlanByEye(TherapyPlanner.LEFTEYE)[0];
    assert.equal(updatedRight0.status, TherapyPlanner.STATUS_COMPLETED);
    assert.equal(fmt(updatedRight0.plannedDate), '2026-03-10');
    assert.equal(fmt(updatedLeft0.plannedDate), '2026-03-24');
    assert.equal(updatedLeft0.status, TherapyPlanner.STATUS_PLANNED);
    assert.equal(updatedLeft0.dateOrigin, 'generated');
    assert.equal(left.findById(`${TherapyPlanner.LEFTEYE}-date-0`).value, '2026-03-24');
    assert.notEqual(fmt(right0), fmt(updatedRight0.plannedDate));
  });
});

test('ui-test-13: editing a planned date never infers completed status', () => {
  const planner = new TherapyPlanner();
  const { right } = createMountedComponents(planner);
  changeValue(right.findById(`${TherapyPlanner.RIGHTEYE}-date-1`), '2026-08-27');

  const row1 = planner.getPlanByEye(TherapyPlanner.RIGHTEYE)[1];
  assert.equal(row1.status, TherapyPlanner.STATUS_PLANNED);
  assert.equal(right.findById(`${TherapyPlanner.RIGHTEYE}-completed-badge-1`), null);
  assert.equal(right.findById(`${TherapyPlanner.RIGHTEYE}-complete-date-1`), null);
});

test('ui-test-14: changing minWeeks keeps cascades correct and does not restore the old status select', () => {
  const planner = new TherapyPlanner();
  const { right, left } = createMountedComponents(planner);
  const leftBefore = left.findById(`${TherapyPlanner.LEFTEYE}-date-1`).value;

  changeValue(right.findById(`${TherapyPlanner.RIGHTEYE}-minweeks-1`), '6');

  assert.equal(planner.getPlanByEye(TherapyPlanner.RIGHTEYE)[1].minWeeks, 6);
  assert.notEqual(left.findById(`${TherapyPlanner.LEFTEYE}-date-1`).value, leftBefore);
  assert.equal(right.findById(`${TherapyPlanner.RIGHTEYE}-status-1`), null);
});

test('ui-test-15: add/remove works and stale pending action is cleared', () => {
  const planner = new TherapyPlanner();
  const { right } = createMountedComponents(planner);

  click(right.findById(`${TherapyPlanner.RIGHTEYE}-add-therapy`));
  assert.equal(planner.getPlanByEye(TherapyPlanner.RIGHTEYE).length, 4);
  assert.ok(right.findById(`${TherapyPlanner.RIGHTEYE}-mark-completed-3`), 'new row must receive action controls');

  click(right.findById(`${TherapyPlanner.RIGHTEYE}-mark-completed-3`));
  click(right.findById(`${TherapyPlanner.RIGHTEYE}-remove-therapy`));

  assert.equal(planner.getPlanByEye(TherapyPlanner.RIGHTEYE).length, 3);
  assert.equal(right.findById(`${TherapyPlanner.RIGHTEYE}-complete-date-3`), null);
  assert.ok(right.findById(`${TherapyPlanner.RIGHTEYE}-mark-completed-2`), 'remaining rows must keep action controls');
});

test('ui-test-16: patient print regression stays on engine-side contract', () => {
  const planner = new TherapyPlanner();
  planner.setStatus(TherapyPlanner.RIGHTEYE, 0, TherapyPlanner.STATUS_COMPLETED, new Date(2026, 6, 20));

  const rightPlan = planner.getPlanByEye(TherapyPlanner.RIGHTEYE);
  const mergedPlannedOnly = rightPlan.filter((entry) => entry.status !== TherapyPlanner.STATUS_COMPLETED);
  assert.equal(mergedPlannedOnly.some((entry) => entry.status === TherapyPlanner.STATUS_COMPLETED), false);
});

test('ui-test-17: planner is immutable under UI-only open/cancel actions', () => {
  const planner = new TherapyPlanner();
  planner.setStatus(TherapyPlanner.RIGHTEYE, 0, TherapyPlanner.STATUS_COMPLETED, new Date(2026, 6, 20));
  const { right } = createMountedComponents(planner);
  const before = snapshotPlanner(planner);

  click(right.findById(`${TherapyPlanner.RIGHTEYE}-restore-planned-0`));
  click(right.findById(`${TherapyPlanner.RIGHTEYE}-restore-cancel-0`));
  click(right.findById(`${TherapyPlanner.RIGHTEYE}-mark-completed-1`));
  click(right.findById(`${TherapyPlanner.RIGHTEYE}-complete-cancel-1`));

  assert.deepEqual(snapshotPlanner(planner), before);
});

test('ui-test-18: completed rows keep a single ordinary date input during restore confirmation', () => {
  const planner = new TherapyPlanner();
  planner.setStatus(TherapyPlanner.RIGHTEYE, 0, TherapyPlanner.STATUS_COMPLETED, new Date(2026, 6, 20));
  const { right } = createMountedComponents(planner);

  const row0 = right.findById(`${TherapyPlanner.RIGHTEYE}-row-0`);
  assert.ok(row0, 'row 0 must exist');
  assert.ok(right.findById(`${TherapyPlanner.RIGHTEYE}-date-0`), 'ordinary completed-date input must exist');
  assert.equal(right.findById(`${TherapyPlanner.RIGHTEYE}-complete-date-0`), null);
  assert.equal(collectDateInputs(row0).length, 1);

  click(right.findById(`${TherapyPlanner.RIGHTEYE}-restore-planned-0`));

  assert.ok(right.findById(`${TherapyPlanner.RIGHTEYE}-restore-confirm-0`), 'restore confirm must exist');
  assert.ok(right.findById(`${TherapyPlanner.RIGHTEYE}-date-0`), 'ordinary completed-date input must remain');
  assert.equal(right.findById(`${TherapyPlanner.RIGHTEYE}-complete-date-0`), null);
  assert.equal(collectDateInputs(row0).length, 1);
});
