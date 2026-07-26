const test = require('node:test');
const assert = require('node:assert/strict');

const TherapyPlanner = require('../TherapyPlanner.js');
const {
  createPreferenceStore,
  DEFAULT_PREFERENCE_STORAGE_KEY,
} = require('../PreferenceStore.js');
const { I18N_STORAGE_KEY } = require('../I18n.js');
const { createMockStorage } = require('./helpers/mockDom.js');

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

function createStore(storage) {
  return createPreferenceStore({
    storage,
    storageKey: I18N_STORAGE_KEY,
  });
}

function buildPlannerFromPreferences(rawPreferenceValue, configOverride) {
  const storage = createMockStorage(rawPreferenceValue);
  const preferenceStore = createStore(storage);
  const baseConfig = {
    validAppointmentWeekdays: [2, 3, 4],
    interEyeGapDays: 14,
    ...(configOverride || {}),
  };
  const plannerConfig = { ...baseConfig };
  const storedWeekdays = preferenceStore.getValidAppointmentWeekdays();

  if (storedWeekdays) {
    plannerConfig.validAppointmentWeekdays = storedWeekdays.slice();
  }

  const planner = new TherapyPlanner(plannerConfig, {
    today: d(2026, 6, 26),
  });

  return {
    storage,
    preferenceStore,
    planner,
    plannerConfig,
  };
}

function collectPlannedWeekdays(planner, eye, count) {
  return planner.getPlanByEye(eye)
    .filter((item) => item.plannedDate instanceof Date)
    .slice(0, count)
    .map((item) => item.plannedDate.getDay());
}

test('preference-store-A1: empty storage returns no explicit weekday preference', () => {
  const store = createStore(createMockStorage());
  assert.equal(store.getValidAppointmentWeekdays(), null);
  assert.deepEqual(store.read(), {});
});

test('preference-store-A2: old locale-only JSON remains valid', () => {
  const store = createStore(createMockStorage(JSON.stringify({ locale: 'de' })));
  assert.equal(store.getLocale(), 'de');
  assert.equal(store.getValidAppointmentWeekdays(), null);
  assert.deepEqual(store.read(), { locale: 'de' });
});

test('preference-store-A3: valid weekdays read correctly', () => {
  const store = createStore(createMockStorage(JSON.stringify({
    validAppointmentWeekdays: [1, 3, 5],
  })));
  assert.deepEqual(store.getValidAppointmentWeekdays(), [1, 3, 5]);
});

test('preference-store-A4: reordered weekdays normalise', () => {
  const store = createStore(createMockStorage(JSON.stringify({
    validAppointmentWeekdays: [5, 1, 3],
  })));
  assert.deepEqual(store.getValidAppointmentWeekdays(), [1, 3, 5]);
});

test('preference-store-A5: duplicates normalise', () => {
  const store = createStore(createMockStorage(JSON.stringify({
    validAppointmentWeekdays: [3, 1, 3, 5, 1],
  })));
  assert.deepEqual(store.getValidAppointmentWeekdays(), [1, 3, 5]);
});

test('preference-store-A6: empty weekday array is rejected', () => {
  const store = createStore(createMockStorage(JSON.stringify({
    validAppointmentWeekdays: [],
  })));
  assert.equal(store.getValidAppointmentWeekdays(), null);
});

test('preference-store-A7: out-of-range weekday values are rejected', () => {
  const store = createStore(createMockStorage(JSON.stringify({
    validAppointmentWeekdays: [1, 7],
  })));
  assert.equal(store.getValidAppointmentWeekdays(), null);
});

test('preference-store-A8: strings are rejected', () => {
  const store = createStore(createMockStorage(JSON.stringify({
    validAppointmentWeekdays: ['1', '3'],
  })));
  assert.equal(store.getValidAppointmentWeekdays(), null);
});

test('preference-store-A9: fractional values are rejected', () => {
  const store = createStore(createMockStorage(JSON.stringify({
    validAppointmentWeekdays: [1, 2.5, 5],
  })));
  assert.equal(store.getValidAppointmentWeekdays(), null);
});

test('preference-store-A10: malformed JSON is tolerated', () => {
  const store = createStore(createMockStorage('invalid-json'));
  assert.deepEqual(store.read(), {});
});

test('preference-store-A11: getItem exceptions are tolerated', () => {
  const store = createPreferenceStore({
    storage: {
      getItem() {
        throw new Error('blocked');
      },
    },
    storageKey: I18N_STORAGE_KEY,
  });
  assert.deepEqual(store.read(), {});
  assert.equal(store.getLocale(), null);
  assert.equal(store.getValidAppointmentWeekdays(), null);
});

test('preference-store-A12: setItem exceptions are tolerated', () => {
  const store = createPreferenceStore({
    storage: {
      getItem() {
        return JSON.stringify({ locale: 'en' });
      },
      setItem() {
        throw new Error('blocked');
      },
    },
    storageKey: I18N_STORAGE_KEY,
  });
  assert.equal(store.setLocale('de'), false);
  assert.equal(store.setValidAppointmentWeekdays([1, 3, 5]), false);
});

test('preference-store-A13: setting locale preserves weekdays', () => {
  const storage = createMockStorage(JSON.stringify({
    locale: 'en',
    validAppointmentWeekdays: [1, 3, 5],
  }));
  const store = createStore(storage);

  assert.equal(store.setLocale('de'), true);
  assert.deepEqual(JSON.parse(storage.getItem(I18N_STORAGE_KEY)), {
    locale: 'de',
    validAppointmentWeekdays: [1, 3, 5],
  });
});

test('preference-store-A14: setting weekdays preserves locale', () => {
  const storage = createMockStorage(JSON.stringify({
    locale: 'it',
  }));
  const store = createStore(storage);

  assert.equal(store.setValidAppointmentWeekdays([5, 1, 3]), true);
  assert.deepEqual(JSON.parse(storage.getItem(I18N_STORAGE_KEY)), {
    locale: 'it',
    validAppointmentWeekdays: [1, 3, 5],
  });
});

test('preference-store-A15: returned arrays are defensive copies', () => {
  const store = createStore(createMockStorage(JSON.stringify({
    validAppointmentWeekdays: [1, 3, 5],
  })));
  const weekdays = store.getValidAppointmentWeekdays();
  weekdays.push(6);
  assert.deepEqual(store.getValidAppointmentWeekdays(), [1, 3, 5]);
});

test('preference-store-A16: configured storage key is used exactly', () => {
  const observedKeys = [];
  const store = createPreferenceStore({
    storage: {
      getItem(key) {
        observedKeys.push(key);
        return null;
      },
      setItem(key) {
        observedKeys.push(key);
      },
    },
    storageKey: 'therapyPlanner.preferences.v1',
  });

  store.read();
  store.setLocale('de');

  assert.ok(observedKeys.length >= 2);
  assert.ok(observedKeys.every((key) => key === 'therapyPlanner.preferences.v1'));
  assert.equal(store.getStorageKey(), I18N_STORAGE_KEY);
  assert.equal(DEFAULT_PREFERENCE_STORAGE_KEY, I18N_STORAGE_KEY);
});

test('preference-store-B1: no stored weekdays uses config defaults', () => {
  const { planner, plannerConfig } = buildPlannerFromPreferences(null);
  assert.deepEqual(planner.getValidAppointmentWeekdays(), [2, 3, 4]);
  assert.deepEqual(plannerConfig.validAppointmentWeekdays, [2, 3, 4]);
});

test('preference-store-B2: stored weekdays construct the planner with the stored set', () => {
  const { planner, plannerConfig } = buildPlannerFromPreferences(JSON.stringify({
    validAppointmentWeekdays: [1, 3, 5],
  }));
  assert.deepEqual(planner.getValidAppointmentWeekdays(), [1, 3, 5]);
  assert.deepEqual(plannerConfig.validAppointmentWeekdays, [1, 3, 5]);
});

test('preference-store-B3: initial schedule dates already use the stored weekdays', () => {
  const defaultPlanner = buildPlannerFromPreferences(null).planner;
  const storedPlanner = buildPlannerFromPreferences(JSON.stringify({
    validAppointmentWeekdays: [1, 3, 5],
  })).planner;

  const defaultRightWeekdays = collectPlannedWeekdays(defaultPlanner, TherapyPlanner.RIGHTEYE, 4);
  const storedRightWeekdays = collectPlannedWeekdays(storedPlanner, TherapyPlanner.RIGHTEYE, 4);

  assert.notDeepEqual(storedRightWeekdays, defaultRightWeekdays);
  assert.ok(storedRightWeekdays.every((weekday) => [1, 3, 5].includes(weekday)));
});

test('preference-store-B4: invalid stored weekdays fall back to config defaults', () => {
  const { planner } = buildPlannerFromPreferences(JSON.stringify({
    validAppointmentWeekdays: ['1', 3, 5],
  }));
  assert.deepEqual(planner.getValidAppointmentWeekdays(), [2, 3, 4]);
});

test('preference-store-B5: locale-only legacy preference still starts', () => {
  const { planner, preferenceStore } = buildPlannerFromPreferences(JSON.stringify({
    locale: 'de',
  }));
  assert.equal(preferenceStore.getLocale(), 'de');
  assert.deepEqual(planner.getValidAppointmentWeekdays(), [2, 3, 4]);
});

test('preference-store-B6: malformed storage does not prevent startup', () => {
  const { planner } = buildPlannerFromPreferences('invalid-json');
  assert.deepEqual(planner.getValidAppointmentWeekdays(), [2, 3, 4]);
});

test('preference-store-B7: startup applies stored weekdays before planned dates are read', () => {
  const { planner } = buildPlannerFromPreferences(JSON.stringify({
    validAppointmentWeekdays: [1, 3, 5],
  }));
  const firstPlannedDate = planner.getPlanByEye(TherapyPlanner.RIGHTEYE)[0].plannedDate;
  assert.ok(firstPlannedDate instanceof Date);
  assert.ok([1, 3, 5].includes(firstPlannedDate.getDay()), fmt(firstPlannedDate));
});
