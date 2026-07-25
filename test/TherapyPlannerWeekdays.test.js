const test = require('node:test');
const assert = require('node:assert/strict');

const TherapyPlanner = require('../TherapyPlanner.js');

function d(year, month0, day) {
  return new Date(year, month0, day);
}

function fmt(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function testCalDiff(dateA, dateB) {
  return Math.round(
    (
      Date.UTC(dateA.getFullYear(), dateA.getMonth(), dateA.getDate()) -
      Date.UTC(dateB.getFullYear(), dateB.getMonth(), dateB.getDate())
    ) / 86400000,
  );
}

function snapshotWeekdayState(planner) {
  const eyes = [TherapyPlanner.RIGHTEYE, TherapyPlanner.LEFTEYE];

  return {
    weekdays: planner.getValidAppointmentWeekdays(),
    schedule: Object.fromEntries(eyes.map((eye) => [
      eye,
      planner.getPlanByEye(eye).map((item) => ({
        type: item.type,
        minWeeks: item.minWeeks,
        plannedDate: item.plannedDate instanceof Date ? fmt(item.plannedDate) : null,
        plannedDateIsDate: item.plannedDate instanceof Date,
        status: item.status,
        dateOrigin: item.dateOrigin,
        earliestSameEyeDate: item.earliestSameEyeDate instanceof Date ? fmt(item.earliestSameEyeDate) : null,
        earliestSameEyeDateIsDate: item.earliestSameEyeDate instanceof Date,
      })),
    ])),
  };
}

function assertAllPlannedOnActiveWeekdays(planner) {
  const active = new Set(planner.getValidAppointmentWeekdays());

  for (const eye of [TherapyPlanner.RIGHTEYE, TherapyPlanner.LEFTEYE]) {
    for (const item of planner.getPlanByEye(eye)) {
      if (item.status === TherapyPlanner.STATUS_PLANNED) {
        assert.equal(active.has(item.plannedDate.getDay()), true, `${eye} planned appointment must use an active weekday`);
      }
    }
  }
}

function createPlannerWithToday(today, config) {
  return new TherapyPlanner(config || { validAppointmentWeekdays: [2, 3, 4], interEyeGapDays: 14 }, { today });
}

test('weekday-config-A1: constructor exposes configured weekdays and getter is defensive', () => {
  const planner = createPlannerWithToday(d(2026, 7, 4), {
    validAppointmentWeekdays: [4, 2, 4, 3],
    interEyeGapDays: 14,
  });

  assert.deepEqual(planner.getValidAppointmentWeekdays(), [2, 3, 4]);

  const days = planner.getValidAppointmentWeekdays();
  days.push(6);

  assert.deepEqual(planner.getValidAppointmentWeekdays(), [2, 3, 4]);
});

test('weekday-config-A2: constructor accepts single weekdays and all seven individual weekdays', () => {
  for (let weekday = 0; weekday <= 6; weekday += 1) {
    const planner = createPlannerWithToday(d(2026, 7, 4), {
      validAppointmentWeekdays: [weekday],
      interEyeGapDays: 14,
    });

    assert.deepEqual(planner.getValidAppointmentWeekdays(), [weekday]);
  }
});

test('weekday-config-B: invalid weekday setter inputs are rejected atomically', () => {
  const invalidInputs = [
    [],
    null,
    undefined,
    '2,3,4',
    [-1],
    [7],
    [2.5],
    [2, '3'],
    [NaN],
    [Infinity],
    {},
  ];

  for (const input of invalidInputs) {
    const planner = createPlannerWithToday(d(2026, 7, 4));
    const before = snapshotWeekdayState(planner);
    let listenerCalls = 0;
    planner.addListener(() => {
      listenerCalls += 1;
    });

    const result = planner.setValidAppointmentWeekdays(input);
    const after = snapshotWeekdayState(planner);

    assert.equal(result.success, false);
    assert.equal(result.changed, false);
    assert.equal(result.reason, 'INVALID_APPOINTMENT_WEEKDAYS');
    assert.deepEqual(result.previousWeekdays, [2, 3, 4]);
    assert.deepEqual(result.weekdays, [2, 3, 4]);
    assert.deepEqual(before, after);
    assert.equal(listenerCalls, 0);

    result.previousWeekdays.push(6);
    result.weekdays.push(5);
    assert.deepEqual(planner.getValidAppointmentWeekdays(), [2, 3, 4]);
  }
});

test('weekday-config-C: equivalent weekday sets are no-ops without recalculation or listener notification', () => {
  const planner = createPlannerWithToday(d(2026, 7, 4));
  const before = snapshotWeekdayState(planner);
  let listenerCalls = 0;
  planner.addListener(() => {
    listenerCalls += 1;
  });

  for (const input of [[2, 3, 4], [4, 3, 2], [4, 2, 3, 2]]) {
    const result = planner.setValidAppointmentWeekdays(input);
    assert.equal(result.success, true);
    assert.equal(result.changed, false);
    assert.deepEqual(result.previousWeekdays, [2, 3, 4]);
    assert.deepEqual(result.weekdays, [2, 3, 4]);
    assert.equal(listenerCalls, 0);
    assert.deepEqual(snapshotWeekdayState(planner), before);
  }
});

test('weekday-config-D: effective change recalculates planned appointments and notifies once', () => {
  const planner = createPlannerWithToday(d(2026, 7, 4));
  let listenerCalls = 0;

  planner.addListener(() => {
    listenerCalls += 1;
    assert.deepEqual(planner.getValidAppointmentWeekdays(), [1, 3, 5]);
    assert.equal(planner.validateSchedule().valid, true);
  });

  const result = planner.setValidAppointmentWeekdays([5, 1, 3]);

  assert.equal(result.success, true);
  assert.equal(result.changed, true);
  assert.deepEqual(result.previousWeekdays, [2, 3, 4]);
  assert.deepEqual(result.weekdays, [1, 3, 5]);
  assert.deepEqual(planner.getValidAppointmentWeekdays(), [1, 3, 5]);
  assert.equal(listenerCalls, 1);
  assertAllPlannedOnActiveWeekdays(planner);
  assert.equal(planner.validateSchedule().valid, true);
});

test('weekday-config-E: completed history remains unchanged on removed weekdays while planned successors are recalculated', () => {
  const planner = createPlannerWithToday(d(2026, 7, 4));
  planner.setStatus(TherapyPlanner.RIGHTEYE, 0, TherapyPlanner.STATUS_COMPLETED, d(2026, 0, 6));
  planner.setStatus(TherapyPlanner.LEFTEYE, 0, TherapyPlanner.STATUS_COMPLETED, d(2026, 0, 20));

  const before = snapshotWeekdayState(planner);
  const result = planner.setValidAppointmentWeekdays([1, 3, 5]);
  const after = snapshotWeekdayState(planner);

  assert.equal(result.success, true);
  assert.equal(result.changed, true);
  assert.deepEqual(after.schedule[TherapyPlanner.RIGHTEYE][0], before.schedule[TherapyPlanner.RIGHTEYE][0]);
  assert.deepEqual(after.schedule[TherapyPlanner.LEFTEYE][0], before.schedule[TherapyPlanner.LEFTEYE][0]);
  assertAllPlannedOnActiveWeekdays(planner);
  assert.equal(planner.validateSchedule().valid, true);
});

test('weekday-config-F: confirmed anchors remain when eligible and are rescheduled when their weekday is removed', () => {
  const eligible = createPlannerWithToday(d(2026, 6, 25));
  eligible.updateDateFor(TherapyPlanner.RIGHTEYE, 1, d(2026, 8, 2));
  const beforeEligible = fmt(eligible.getPlanByEye(TherapyPlanner.RIGHTEYE)[1].plannedDate);

  let result = eligible.setValidAppointmentWeekdays([2, 3, 4, 5]);
  assert.equal(result.success, true);
  assert.equal(fmt(eligible.getPlanByEye(TherapyPlanner.RIGHTEYE)[1].plannedDate), beforeEligible);
  assert.equal(eligible.getPlanByEye(TherapyPlanner.RIGHTEYE)[1].dateOrigin, 'confirmed');

  const removed = createPlannerWithToday(d(2026, 6, 25));
  removed.updateDateFor(TherapyPlanner.RIGHTEYE, 1, d(2026, 8, 1));
  const oldRemoved = fmt(removed.getPlanByEye(TherapyPlanner.RIGHTEYE)[1].plannedDate);

  result = removed.setValidAppointmentWeekdays([1, 3, 5]);
  assert.equal(result.success, true);
  assert.notEqual(fmt(removed.getPlanByEye(TherapyPlanner.RIGHTEYE)[1].plannedDate), oldRemoved);
  assert.deepEqual([1, 3, 5].includes(removed.getPlanByEye(TherapyPlanner.RIGHTEYE)[1].plannedDate.getDay()), true);
  assert.equal(removed.getPlanByEye(TherapyPlanner.RIGHTEYE)[1].dateOrigin, 'confirmed');
  assert.equal(removed.validateSchedule().valid, true);
});

test('weekday-config-G: sparse weekday sets keep cross-eye gaps valid', () => {
  const planner = createPlannerWithToday(d(2026, 7, 4));
  const result = planner.setValidAppointmentWeekdays([2]);

  assert.equal(result.success, true);
  assert.equal(result.changed, true);
  assertAllPlannedOnActiveWeekdays(planner);
  assert.equal(planner.validateSchedule().valid, true);

  const right = planner.getPlanByEye(TherapyPlanner.RIGHTEYE);
  const left = planner.getPlanByEye(TherapyPlanner.LEFTEYE);
  assert.equal(Math.abs(testCalDiff(left[0].plannedDate, right[0].plannedDate)) >= 14, true);
  assert.equal(Math.abs(testCalDiff(left[1].plannedDate, right[1].plannedDate)) >= 14, true);
});

test('weekday-config-H: sparse weekday sets still respect same-eye minimum intervals', () => {
  const planner = createPlannerWithToday(d(2026, 7, 4));
  const result = planner.setValidAppointmentWeekdays([2]);

  assert.equal(result.success, true);
  assert.equal(result.changed, true);

  const right = planner.getPlanByEye(TherapyPlanner.RIGHTEYE);
  assert.equal(testCalDiff(right[1].plannedDate, right[0].plannedDate) >= right[1].minWeeks * 7, true);
  assert.equal(testCalDiff(right[2].plannedDate, right[1].plannedDate) >= right[2].minWeeks * 7, true);
});

test('weekday-config-I: DST-sensitive weekday changes preserve calendar-based dates across spring and autumn transitions', () => {
  const springPlanner = createPlannerWithToday(d(2026, 2, 10));
  let result = springPlanner.setValidAppointmentWeekdays([1]);
  assert.equal(result.success, true);
  assert.deepEqual(
    springPlanner.getPlanByEye(TherapyPlanner.RIGHTEYE).map((item) => fmt(item.plannedDate)),
    ['2026-03-16', '2026-04-13', '2026-05-11'],
  );

  const autumnPlanner = createPlannerWithToday(d(2026, 9, 15));
  result = autumnPlanner.setValidAppointmentWeekdays([4]);
  assert.equal(result.success, true);
  assert.deepEqual(
    autumnPlanner.getPlanByEye(TherapyPlanner.RIGHTEYE).map((item) => fmt(item.plannedDate)),
    ['2026-10-15', '2026-11-12', '2026-12-10'],
  );
});

test('weekday-config-J: date guidance uses the active weekday set immediately after a successful change', () => {
  const planner = createPlannerWithToday(d(2026, 6, 25), {
    validAppointmentWeekdays: [2, 3, 4],
    interEyeGapDays: 14,
  });
  const before = planner.getDateGuidanceFor(TherapyPlanner.RIGHTEYE, 1);

  const result = planner.setValidAppointmentWeekdays([1, 3, 5]);
  const after = planner.getDateGuidanceFor(TherapyPlanner.RIGHTEYE, 1);

  assert.equal(result.success, true);
  assert.equal(before.suggestedEarliestDate.getDay(), 2);
  assert.equal([1, 3, 5].includes(after.suggestedEarliestDate.getDay()), true);
  assert.equal([2, 4].includes(after.suggestedEarliestDate.getDay()), false);
});

test('weekday-config-K: recalculation failure rolls back weekdays and schedules atomically', () => {
  const planner = createPlannerWithToday(d(2026, 7, 4));
  const before = snapshotWeekdayState(planner);
  let listenerCalls = 0;
  planner.addListener(() => {
    listenerCalls += 1;
  });

  const originalCascade = planner._cascade;
  planner._cascade = function failingCascade(snapshot, fixedKeys, mutableKeys, mode) {
    if (this.getValidAppointmentWeekdays().join(',') === '1,3,5') {
      throw new Error('forced weekday recalculation failure');
    }

    return originalCascade.call(this, snapshot, fixedKeys, mutableKeys, mode);
  };

  const result = planner.setValidAppointmentWeekdays([1, 3, 5]);
  planner._cascade = originalCascade;

  assert.equal(result.success, false);
  assert.equal(result.changed, false);
  assert.equal(result.reason, 'WEEKDAY_RECALCULATION_FAILED');
  assert.deepEqual(result.previousWeekdays, [2, 3, 4]);
  assert.deepEqual(result.weekdays, [2, 3, 4]);
  assert.deepEqual(snapshotWeekdayState(planner), before);
  assert.equal(listenerCalls, 0);
  assert.equal(planner.getPlanByEye(TherapyPlanner.RIGHTEYE)[0].plannedDate instanceof Date, true);
  assert.equal(planner.validateSchedule().valid, true);
});

test('weekday-config-L: listeners observe the final valid state exactly once', () => {
  const planner = createPlannerWithToday(d(2026, 7, 4));
  const observations = [];

  planner.addListener(() => {
    observations.push({
      weekdays: planner.getValidAppointmentWeekdays(),
      right: planner.getPlanByEye(TherapyPlanner.RIGHTEYE).map((item) => fmt(item.plannedDate)),
      left: planner.getPlanByEye(TherapyPlanner.LEFTEYE).map((item) => fmt(item.plannedDate)),
      valid: planner.validateSchedule().valid,
    });
  });

  const result = planner.setValidAppointmentWeekdays([1, 3, 5]);

  assert.equal(result.success, true);
  assert.equal(observations.length, 1);
  assert.deepEqual(observations[0].weekdays, [1, 3, 5]);
  assert.equal(observations[0].valid, true);
});
