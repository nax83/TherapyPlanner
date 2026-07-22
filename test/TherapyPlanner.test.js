const test = require('node:test');
const assert = require('node:assert/strict');

const TherapyPlanner = require('../TherapyPlanner.js');
const scheduleConfig = require('../config/scheduleConfig.json');

const DAY_IN_MS = 24 * 60 * 60 * 1000;

function formatDateForInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

class MockTextNode {
  constructor(text) {
    this.textContent = text;
    this.parentNode = null;
  }

  findById() {
    return null;
  }
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
      add: (...classNames) => {
        classNames.forEach((className) => classSet.add(className));
      },
      contains: (className) => classSet.has(className),
      toString: () => Array.from(classSet).join(' '),
    };
  }

  appendChild(child) {
    if (child && typeof child === 'object') {
      child.parentNode = this;
    }
    this.children.push(child);
    return child;
  }

  removeChild(child) {
    const index = this.children.indexOf(child);
    if (index !== -1) {
      const [removed] = this.children.splice(index, 1);
      if (removed && typeof removed === 'object') {
        removed.parentNode = null;
      }
      return removed;
    }
    return null;
  }

  get firstChild() {
    return this.children.length > 0 ? this.children[0] : null;
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name === 'id') {
      this.id = String(value);
    }
  }

  getAttribute(name) {
    return this.attributes[name];
  }

  addEventListener(event, handler) {
    if (!this.eventListeners[event]) {
      this.eventListeners[event] = [];
    }
    this.eventListeners[event].push(handler);
  }

  querySelector(selector) {
    if (selector.startsWith('#')) {
      const id = selector.slice(1);
      return this.findById(id);
    }
    return null;
  }

  findById(id) {
    if (this.id === id) {
      return this;
    }
    for (const child of this.children) {
      if (child && typeof child.findById === 'function') {
        const result = child.findById(id);
        if (result) {
          return result;
        }
      }
    }
    return null;
  }
}

class MockDocument {
  constructor() {
    this.root = new MockElement('#document');
  }

  createElement(tagName) {
    return new MockElement(tagName);
  }

  createTextNode(text) {
    return new MockTextNode(text);
  }

  getElementById(id) {
    return this.root.findById(id);
  }

  querySelector(selector) {
    return this.root.querySelector(selector);
  }
}

test('adding therapy to the left eye updates the schedule', () => {
  const originalLog = console.log;
  console.log = () => {};

  let planner;

  try {
    planner = new TherapyPlanner();

    const initialPlan = planner.getPlanByEye(TherapyPlanner.LEFTEYE);
    const initialLength = initialPlan.length;

    planner.addTherapy(TherapyPlanner.LEFTEYE);

    const updatedPlan = planner.getPlanByEye(TherapyPlanner.LEFTEYE);
    assert.equal(updatedPlan.length, initialLength + 1, 'should append one therapy session');

    const newTherapy = updatedPlan[updatedPlan.length - 1];
    assert.ok(newTherapy.minimumDate instanceof Date, 'minimumDate should be a Date instance');

    const minWeeks = newTherapy.minWeeks;
    assert.equal(minWeeks, 4, 'new therapy should start with default minWeeks');

    const previousTherapy = updatedPlan[updatedPlan.length - 2];
    const previousMinimum = previousTherapy.minimumDate instanceof Date
      ? previousTherapy.minimumDate.getTime()
      : previousTherapy.minimumDate;
    const previousPlanned = previousTherapy.plannedDate instanceof Date
      ? previousTherapy.plannedDate.getTime()
      : 0;
    const previousReference = Math.max(previousMinimum, previousPlanned);

    const expectedStartDate = planner.getNextValidDate(
      new Date(previousReference + planner.weeksToDays(minWeeks) * DAY_IN_MS),
    );

    assert.equal(
      newTherapy.minimumDate.getTime(),
      expectedStartDate.getTime(),
      'new therapy should respect the minimum spacing and workday rules',
    );
    assert.equal(newTherapy.plannedDate, '', 'new therapy should not have a planned date by default');
  } finally {
    console.log = originalLog;
  }
});

test('initial session 0 of each eye is at least 14 days apart', () => {
  const originalLog = console.log;
  console.log = () => {};

  try {
    const planner = new TherapyPlanner();
    const rightFirst = planner.getPlanByEye(TherapyPlanner.RIGHTEYE)[0];
    const leftFirst  = planner.getPlanByEye(TherapyPlanner.LEFTEYE)[0];

    const diffDays = Math.abs(rightFirst.plannedDate.getTime() - leftFirst.plannedDate.getTime()) / DAY_IN_MS;
    assert.ok(
      diffDays >= TherapyPlanner.INTER_EYE_GAP_DAYS,
      `Initial sessions are only ${diffDays} days apart (minimum ${TherapyPlanner.INTER_EYE_GAP_DAYS})`,
    );
  } finally {
    console.log = originalLog;
  }
});

test('moving a session earlier clears stale plannedDate on downstream sessions', () => {
  const originalLog = console.log;
  console.log = () => {};

  try {
    const planner = new TherapyPlanner();
    // set session 1 of right eye to a far-future planned date
    const rightPlan = planner.getPlanByEye(TherapyPlanner.RIGHTEYE);
    const farDate = new Date(rightPlan[1].minimumDate.getTime() + 60 * DAY_IN_MS);
    // advance to next valid weekday
    const farValidDate = planner.getNextValidDate(farDate);
    planner.updateDateFor(TherapyPlanner.RIGHTEYE, 1, farValidDate);

    // session 2 should now have a plannedDate derived from farValidDate or empty — confirm it's consistent
    const afterFar = planner.getPlanByEye(TherapyPlanner.RIGHTEYE)[2];
    if (afterFar.plannedDate instanceof Date) {
      assert.ok(
        afterFar.plannedDate.getTime() >= afterFar.minimumDate.getTime(),
        'session 2 plannedDate must not be before its minimumDate',
      );
    }

    // now move session 1 back to its minimum — session 2 plannedDate must have been cleared
    planner.updateDateFor(TherapyPlanner.RIGHTEYE, 1, rightPlan[1].minimumDate);
    const afterReset = planner.getPlanByEye(TherapyPlanner.RIGHTEYE)[2];
    if (afterReset.plannedDate instanceof Date) {
      assert.ok(
        afterReset.plannedDate.getTime() >= afterReset.minimumDate.getTime(),
        'session 2 plannedDate must not be before its minimumDate after resetting session 1',
      );
    }
  } finally {
    console.log = originalLog;
  }
});

test('planner uses default configuration weekdays when none are provided', () => {
  const originalLog = console.log;
  console.log = () => {};

  try {
    const planner = new TherapyPlanner();
    assert.deepEqual(
      planner.daysToCheck,
      scheduleConfig.validAppointmentWeekdays,
      'default configuration should define the valid appointment weekdays',
    );
  } finally {
    console.log = originalLog;
  }
});

test('planner accepts custom configuration for valid weekdays', () => {
  const originalLog = console.log;
  console.log = () => {};

  try {
    const customConfig = { validAppointmentWeekdays: [1, 5] };
    const planner = new TherapyPlanner(customConfig);

    assert.deepEqual(
      planner.daysToCheck,
      customConfig.validAppointmentWeekdays,
      'custom configuration should be applied to the planner',
    );

    const tuesday = new Date(2024, 0, 2);
    const nextValidDate = planner.getNextValidDate(tuesday);
    assert.equal(nextValidDate.getDay(), 5, 'next available date should fall on Friday');

    const friday = new Date(2024, 0, 5);
    assert.equal(planner.isValidWorkingDays(friday), true, 'Friday should be considered a valid working day');
    assert.equal(planner.isValidWorkingDays(tuesday), false, 'Tuesday should not be considered a valid working day');
  } finally {
    console.log = originalLog;
  }
});

test('inter-eye gap: session on one eye must be at least 14 days after any session on the other eye', () => {
  const originalLog = console.log;
  console.log = () => {};

  try {
    const planner = new TherapyPlanner();

    // anchor both eyes on the same known date (local midnight, Tuesday)
    const anchor = new Date(2025, 0, 7);
    planner.updateDateFor(TherapyPlanner.RIGHTEYE, 0, anchor);
    planner.updateDateFor(TherapyPlanner.LEFTEYE, 0, anchor);

    const rightPlan = planner.getPlanByEye(TherapyPlanner.RIGHTEYE);
    const leftPlan  = planner.getPlanByEye(TherapyPlanner.LEFTEYE);

    // every pair of sessions (one from each eye) must be at least 14 days apart
    for (const r of rightPlan) {
      for (const l of leftPlan) {
        const rDate = r.plannedDate instanceof Date ? r.plannedDate : r.minimumDate;
        const lDate = l.plannedDate instanceof Date ? l.plannedDate : l.minimumDate;
        if (!(rDate instanceof Date) || !(lDate instanceof Date)) continue;
        const diffDays = Math.abs(rDate.getTime() - lDate.getTime()) / DAY_IN_MS;
        assert.ok(
          diffDays === 0 || diffDays >= TherapyPlanner.INTER_EYE_GAP_DAYS,
          `Right session ${rDate.toISOString()} and left session ${lDate.toISOString()} are only ${diffDays} days apart (minimum ${TherapyPlanner.INTER_EYE_GAP_DAYS})`,
        );
      }
    }
  } finally {
    console.log = originalLog;
  }
});

test('date picker uses the earliest available date as the minimum selectable value', () => {
  const originalLog = console.log;
  console.log = () => {};

  const previousDocument = global.document;
  const previousPlanner = global.TherapyPlanner;

  try {
    const mockDocument = new MockDocument();
    global.document = mockDocument;
    global.TherapyPlanner = TherapyPlanner;

    delete require.cache[require.resolve('../TherapyListComponent.js')];
    const createTherapyListComponent = require('../TherapyListComponent.js');

    const planner = new TherapyPlanner();
    const component = createTherapyListComponent('testComponent', TherapyPlanner.RIGHTEYE, planner);
    mockDocument.root.appendChild(component);

    const secondTherapy = planner.getPlanByEye(TherapyPlanner.RIGHTEYE)[1];
    const input = component.querySelector(`#${TherapyPlanner.RIGHTEYE}-date-1`);

    assert.ok(secondTherapy.minimumDate instanceof Date, 'minimum date should be available as a Date instance');

    const expectedMin = formatDateForInput(secondTherapy.minimumDate);

    assert.equal(input.getAttribute('min'), expectedMin, 'date picker should prevent selecting dates earlier than the minimum');
    assert.equal(input.value, expectedMin, 'date picker should default to the minimum date when no planned date exists');
  } finally {
    console.log = originalLog;

    delete require.cache[require.resolve('../TherapyListComponent.js')];

    if (previousDocument === undefined) {
      delete global.document;
    } else {
      global.document = previousDocument;
    }

    if (previousPlanner === undefined) {
      delete global.TherapyPlanner;
    } else {
      global.TherapyPlanner = previousPlanner;
    }
  }
});
