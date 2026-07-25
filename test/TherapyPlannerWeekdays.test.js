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

function calendarDayDiff(dateA, dateB) {
  return Math.round(
    (
      Date.UTC(dateA.getFullYear(), dateA.getMonth(), dateA.getDate()) -
      Date.UTC(dateB.getFullYear(), dateB.getMonth(), dateB.getDate())
    ) / 86400000,
  );
}

function createPlannerWithToday(today, config) {
  return new TherapyPlanner(
    config || { validAppointmentWeekdays: [2, 3, 4], interEyeGapDays: 14 },
    { today },
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

function compactPlan(planner) {
  return [TherapyPlanner.RIGHTEYE, TherapyPlanner.LEFTEYE].map((eye) => (
    planner.getPlanByEye(eye).map((item) => ({
      eye,
      date: fmt(item.plannedDate),
      status: item.status,
      dateOrigin: item.dateOrigin,
    }))
  ));
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
    assert.equal(result.message, 'validAppointmentWeekdays must be a non-empty array containing integers between 0 and 6.');
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

test('weekday-config-D: generated appointments can move earlier under historical weekday replacement', () => {
  const planner = createPlannerWithToday(d(2026, 6, 25));
  const beforeRight0 = fmt(planner.getPlanByEye(TherapyPlanner.RIGHTEYE)[0].plannedDate);
  const beforeLeft0 = fmt(planner.getPlanByEye(TherapyPlanner.LEFTEYE)[0].plannedDate);

  const result = planner.setValidAppointmentWeekdays([1, 2, 3, 4]);
  const afterRight0 = planner.getPlanByEye(TherapyPlanner.RIGHTEYE)[0];
  const afterLeft0 = planner.getPlanByEye(TherapyPlanner.LEFTEYE)[0];

  assert.equal(result.success, true);
  assert.equal(result.changed, true);
  assert.equal(beforeRight0, '2026-07-28');
  assert.equal(fmt(afterRight0.plannedDate), '2026-07-27');
  assert.equal(beforeLeft0, '2026-08-11');
  assert.equal(fmt(afterLeft0.plannedDate), '2026-08-10');
  assert.equal(afterRight0.dateOrigin, 'generated');
  assert.equal(afterLeft0.dateOrigin, 'generated');
  assert.equal([1, 2, 3, 4].includes(afterRight0.plannedDate.getDay()), true);
  assert.equal([1, 2, 3, 4].includes(afterLeft0.plannedDate.getDay()), true);
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

test('weekday-config-F: eligible confirmed cross-eye anchor remains fixed and conflicting generated appointment moves around it', () => {
  const control = createPlannerWithToday(d(2026, 6, 25));
  control.setValidAppointmentWeekdays([1, 3, 5]);

  const anchored = createPlannerWithToday(d(2026, 6, 25));
  const updateResult = anchored.updateDateFor(TherapyPlanner.RIGHTEYE, 1, d(2026, 8, 2));
  const beforeConfirmed = anchored.getPlanByEye(TherapyPlanner.RIGHTEYE)[1];
  const result = anchored.setValidAppointmentWeekdays([1, 3, 5]);
  const afterConfirmed = anchored.getPlanByEye(TherapyPlanner.RIGHTEYE)[1];
  const conflictingLeft = anchored.getPlanByEye(TherapyPlanner.LEFTEYE)[1];

  assert.equal(updateResult.success, true);
  assert.equal(result.success, true);
  assert.equal(fmt(beforeConfirmed.plannedDate), '2026-09-02');
  assert.equal(fmt(afterConfirmed.plannedDate), '2026-09-02');
  assert.equal(afterConfirmed.dateOrigin, 'confirmed');
  assert.equal(fmt(control.getPlanByEye(TherapyPlanner.LEFTEYE)[1].plannedDate), '2026-09-07');
  assert.equal(fmt(conflictingLeft.plannedDate), '2026-09-16');
  assert.equal(conflictingLeft.dateOrigin, 'generated');
  assert.equal(calendarDayDiff(conflictingLeft.plannedDate, afterConfirmed.plannedDate) >= 14, true);
  assert.equal(anchored.validateSchedule().valid, true);
});

test('weekday-config-G: confirmed appointment on a removed weekday moves forward without moving backward in time', () => {
  const planner = createPlannerWithToday(d(2026, 6, 25));
  const updateResult = planner.updateDateFor(TherapyPlanner.RIGHTEYE, 1, d(2026, 8, 1));
  const beforeConfirmed = fmt(planner.getPlanByEye(TherapyPlanner.RIGHTEYE)[1].plannedDate);
  const result = planner.setValidAppointmentWeekdays([1, 3, 5]);
  const afterConfirmed = planner.getPlanByEye(TherapyPlanner.RIGHTEYE)[1];

  assert.equal(updateResult.success, true);
  assert.equal(result.success, true);
  assert.equal(beforeConfirmed, '2026-09-01');
  assert.equal(fmt(afterConfirmed.plannedDate), '2026-09-02');
  assert.notEqual(fmt(afterConfirmed.plannedDate), beforeConfirmed);
  assert.equal(calendarDayDiff(afterConfirmed.plannedDate, d(2026, 8, 1)) >= 0, true);
  assert.equal([1, 3, 5].includes(afterConfirmed.plannedDate.getDay()), true);
  assert.equal(afterConfirmed.dateOrigin, 'confirmed');
  assert.equal(planner.validateSchedule().valid, true);
});

test('weekday-config-H: multiple confirmed candidates remain deterministic across equivalent weekday inputs', () => {
  const runScenario = (input) => {
    const planner = createPlannerWithToday(d(2026, 6, 25));
    assert.equal(planner.updateDateFor(TherapyPlanner.RIGHTEYE, 1, d(2026, 8, 2)).success, true);
    assert.equal(planner.updateDateFor(TherapyPlanner.LEFTEYE, 1, d(2026, 8, 16)).success, true);

    const result = planner.setValidAppointmentWeekdays(input);
    return {
      result,
      plan: compactPlan(planner),
    };
  };

  const canonical = runScenario([1, 3, 5]);
  const duplicateOrder = runScenario([5, 1, 3, 3]);

  assert.equal(canonical.result.success, true);
  assert.equal(duplicateOrder.result.success, true);
  assert.deepEqual(canonical.result.weekdays, [1, 3, 5]);
  assert.deepEqual(duplicateOrder.result.weekdays, [1, 3, 5]);
  assert.deepEqual(canonical.plan, duplicateOrder.plan);
});

test('weekday-config-I: predecessor infeasibility demotes a same-eye confirmed successor and moves it forward', () => {
  const planner = createPlannerWithToday(d(2026, 6, 25));
  const updateResult = planner.updateDateFor(TherapyPlanner.RIGHTEYE, 2, d(2026, 8, 23));
  const originalScheduleMutable = planner._scheduleMutable;

  planner._scheduleMutable = function scheduleMutableWithLatePredecessor(type, i, finalized, mode, snapshot) {
    if (type === TherapyPlanner.RIGHTEYE && i === 1 && mode === 'historical') {
      const session = this.schedule[type][i];
      session.plannedDate = d(2026, 8, 3);
      session.status = TherapyPlanner.STATUS_PLANNED;
      session.dateOrigin = 'generated';
      return;
    }

    return originalScheduleMutable.call(this, type, i, finalized, mode, snapshot);
  };

  const result = planner.setValidAppointmentWeekdays([3, 4]);
  planner._scheduleMutable = originalScheduleMutable;

  const predecessor = planner.getPlanByEye(TherapyPlanner.RIGHTEYE)[1];
  const successor = planner.getPlanByEye(TherapyPlanner.RIGHTEYE)[2];

  assert.equal(updateResult.success, true);
  assert.equal(result.success, true);
  assert.equal(updateResult.changedAppointments.some((item) => item.index === 2 && item.type === TherapyPlanner.RIGHTEYE), true);
  assert.equal(fmt(predecessor.plannedDate), '2026-09-03');
  assert.equal(fmt(successor.plannedDate), '2026-10-01');
  assert.equal(successor.dateOrigin, 'confirmed');
  assert.equal([3, 4].includes(successor.plannedDate.getDay()), true);
  assert.equal(calendarDayDiff(successor.plannedDate, predecessor.plannedDate) >= successor.minWeeks * 7, true);
  assert.equal(planner.validateSchedule().valid, true);
});

test('weekday-config-J: sparse weekday sets still respect cross-eye gaps and same-eye minimum intervals', () => {
  const planner = createPlannerWithToday(d(2026, 7, 4));
  const result = planner.setValidAppointmentWeekdays([2]);

  assert.equal(result.success, true);
  assert.equal(result.changed, true);
  assertAllPlannedOnActiveWeekdays(planner);
  assert.equal(planner.validateSchedule().valid, true);

  const right = planner.getPlanByEye(TherapyPlanner.RIGHTEYE);
  const left = planner.getPlanByEye(TherapyPlanner.LEFTEYE);
  assert.equal(Math.abs(calendarDayDiff(left[0].plannedDate, right[0].plannedDate)) >= 14, true);
  assert.equal(Math.abs(calendarDayDiff(left[1].plannedDate, right[1].plannedDate)) >= 14, true);
  assert.equal(calendarDayDiff(right[1].plannedDate, right[0].plannedDate) >= right[1].minWeeks * 7, true);
  assert.equal(calendarDayDiff(right[2].plannedDate, right[1].plannedDate) >= right[2].minWeeks * 7, true);
});

test('weekday-config-K: DST-sensitive weekday changes preserve calendar-based dates across spring and autumn transitions', () => {
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

test('weekday-config-L: date guidance uses the active weekday set immediately after a successful change', () => {
  const planner = createPlannerWithToday(d(2026, 6, 25), {
    validAppointmentWeekdays: [2, 3, 4],
    interEyeGapDays: 14,
  });
  const before = planner.getDateGuidanceFor(TherapyPlanner.RIGHTEYE, 1);
  const beforeSuggestedDate = fmt(before.suggestedEarliestDate);
  const beforeSuggestedWeekday = before.suggestedEarliestDate.getDay();

  const result = planner.setValidAppointmentWeekdays([1, 3, 5]);
  const after = planner.getDateGuidanceFor(TherapyPlanner.RIGHTEYE, 1);

  assert.equal(result.success, true);
  assert.equal(beforeSuggestedDate, '2026-08-25');
  assert.equal(beforeSuggestedWeekday, 2);
  assert.equal(fmt(after.suggestedEarliestDate), '2026-08-24');
  assert.equal([1, 3, 5].includes(after.suggestedEarliestDate.getDay()), true);
  assert.equal([2, 4].includes(after.suggestedEarliestDate.getDay()), false);
});

test('weekday-config-M: recalculation failure rolls back weekdays and schedules atomically under historical mode', () => {
  const planner = createPlannerWithToday(d(2026, 7, 4));
  const before = snapshotWeekdayState(planner);
  let listenerCalls = 0;

  planner.addListener(() => {
    listenerCalls += 1;
  });

  const originalCascade = planner._cascade;
  planner._cascade = function failingCascade(snapshot, fixedKeys, mutableKeys, mode) {
    if (mode === 'historical' && this.getValidAppointmentWeekdays().join(',') === '1,3,5') {
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
  assert.equal(planner.getPlanByEye(TherapyPlanner.LEFTEYE)[0].plannedDate instanceof Date, true);
  assert.equal(planner.validateSchedule().valid, true);

  const recovery = planner.setValidAppointmentWeekdays([1, 3, 5]);
  assert.equal(recovery.success, true);
  assert.deepEqual(planner.getValidAppointmentWeekdays(), [1, 3, 5]);
});

test('weekday-config-N: listeners observe the final valid state exactly once', () => {
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
