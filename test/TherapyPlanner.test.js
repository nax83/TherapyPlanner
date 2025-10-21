const test = require('node:test');
const assert = require('node:assert/strict');

const TherapyPlanner = require('../TherapyPlanner.js');
const scheduleConfig = require('../config/scheduleConfig.json');

const DAY_IN_MS = 24 * 60 * 60 * 1000;

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

    const tuesday = new Date(Date.UTC(2024, 0, 2));
    const nextValidDate = planner.getNextValidDate(tuesday);
    assert.equal(nextValidDate.getUTCDay(), 5, 'next available date should fall on Friday');

    const friday = new Date(Date.UTC(2024, 0, 5));
    assert.equal(planner.isValidWorkingDays(friday), true, 'Friday should be considered a valid working day');
    assert.equal(planner.isValidWorkingDays(tuesday), false, 'Tuesday should not be considered a valid working day');
  } finally {
    console.log = originalLog;
  }
});
