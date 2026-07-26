const test = require('node:test');
const assert = require('node:assert/strict');

const createClinicWeekdaysSettingsComponent = require('../ClinicWeekdaysSettingsComponent.js');
const TherapyPlanner = require('../TherapyPlanner.js');
const translations = require('../translations.js');
const { createI18n, I18N_STORAGE_KEY } = require('../I18n.js');
const {
  withMockDom,
  createClickEvent,
  createChangeEvent,
  createKeydownEvent,
  createMockStorage,
} = require('./helpers/mockDom.js');

const DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

function normalizeWeekdays(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return [...new Set(value.filter((weekday) => Number.isInteger(weekday) && weekday >= 0 && weekday <= 6))].sort((left, right) => left - right);
}

function d(year, month0, day) {
  return new Date(year, month0, day);
}

function createPlannerStub(initialWeekdays, options) {
  const plannerOptions = options || {};
  let weekdays = normalizeWeekdays(initialWeekdays);
  const listeners = [];
  const setCalls = [];
  const unrelatedPatientData = { patientName: 'Ada Example', status: 'unchanged' };

  const planner = {
    setCalls,
    notifyCalls: 0,
    unrelatedPatientData,
    addListener(listener) {
      listeners.push(listener);
    },
    getValidAppointmentWeekdays() {
      return weekdays.slice();
    },
    setValidAppointmentWeekdays(nextWeekdays) {
      setCalls.push(nextWeekdays.slice());
      if (plannerOptions.throwOnSet) {
        throw new Error('boom');
      }

      const response = typeof plannerOptions.buildResult === 'function'
        ? plannerOptions.buildResult(nextWeekdays.slice(), weekdays.slice())
        : null;
      const result = response || {
        success: true,
        changed: true,
        previousWeekdays: weekdays.slice(),
        weekdays: normalizeWeekdays(nextWeekdays),
        warnings: [],
      };

      if (result.success) {
        weekdays = normalizeWeekdays(result.weekdays);
      }

      return {
        ...result,
        previousWeekdays: Array.isArray(result.previousWeekdays) ? result.previousWeekdays.slice() : [],
        weekdays: Array.isArray(result.weekdays) ? result.weekdays.slice() : [],
        warnings: Array.isArray(result.warnings) ? result.warnings.slice() : [],
      };
    },
    notifyListeners() {
      planner.notifyCalls += 1;
    },
    emitExternalChange(nextWeekdays) {
      weekdays = normalizeWeekdays(nextWeekdays);
      listeners.forEach((listener) => listener());
    },
  };

  Object.defineProperty(planner, 'schedule', {
    get() {
      throw new Error('schedule should not be accessed');
    },
  });

  return planner;
}

function createTestI18n(documentObject, storage, subscribeCounter) {
  const i18n = createI18n({
    translations,
    storage,
    navigator: { language: 'en-US' },
    document: documentObject,
  });

  if (subscribeCounter) {
    const originalSubscribe = i18n.subscribe;
    i18n.subscribe = function instrumentedSubscribe(listener) {
      subscribeCounter.count += 1;
      return originalSubscribe(listener);
    };
  }

  return i18n;
}

function withMockEnvironment(runOrOptions, maybeOptions) {
  const run = typeof runOrOptions === 'function' ? runOrOptions : runOrOptions.run;
  const settings = typeof runOrOptions === 'function'
    ? (maybeOptions || {})
    : (runOrOptions || {});

  withMockDom((documentObject, windowObject) => {
    const storage = settings.storage || createMockStorage(JSON.stringify({ locale: 'en' }));
    const subscribeCounter = { count: 0 };
    const i18n = settings.i18n || createTestI18n(documentObject, storage, subscribeCounter);
    const planner = settings.planner || createPlannerStub([2, 3, 4]);
    const originalFetch = global.fetch;
    const originalWindowFetch = windowObject.fetch;
    let fetchCalls = 0;

    function fetchSpy() {
      fetchCalls += 1;
      throw new Error('fetch should not be called');
    }

    global.fetch = fetchSpy;
    windowObject.fetch = fetchSpy;

    try {
      run({
        documentObject,
        windowObject,
        storage,
        i18n,
        planner,
        subscribeCounter,
        getFetchCalls() {
          return fetchCalls;
        },
      });
    } finally {
      global.fetch = originalFetch;
      windowObject.fetch = originalWindowFetch;
    }
  });
}

function openDialog(root, documentObject) {
  const launchButton = documentObject.getElementById('clinic-weekdays-settings-launch-btn');
  launchButton.dispatchEvent(createClickEvent());
  return launchButton;
}

function getCheckboxes(documentObject) {
  return DISPLAY_ORDER.map((weekday) => documentObject.getElementById(`clinic-weekday-${weekday}`));
}

function setCheckboxValue(input, checked) {
  input.checked = checked;
  input.dispatchEvent(createChangeEvent(String(input.value)));
}

function checkedWeekdays(documentObject) {
  return DISPLAY_ORDER.filter((weekday) => documentObject.getElementById(`clinic-weekday-${weekday}`).checked);
}

function weekdayLabels(documentObject) {
  return DISPLAY_ORDER.map((weekday) => documentObject.getElementById(`clinic-weekday-${weekday}`).parentNode.textContent.trim());
}

test('clinic-weekdays-settings-A: structure, IDs and accessibility are correct', () => {
  withMockEnvironment(({ documentObject, planner, i18n }) => {
    const root = createClinicWeekdaysSettingsComponent({ planner, i18n });
    documentObject.body.appendChild(root);

    assert.equal(root.id, 'clinic-weekdays-settings-root');
    assert.equal(root.classList.contains('no-print'), true);

    const launchButton = documentObject.getElementById('clinic-weekdays-settings-launch-btn');
    const overlay = documentObject.getElementById('clinic-weekdays-settings-overlay');
    const dialog = documentObject.getElementById('clinic-weekdays-settings-dialog');
    const form = documentObject.getElementById('clinic-weekdays-settings-form');
    const errorArea = documentObject.getElementById('clinic-weekdays-settings-error');
    const runtimeNote = documentObject.getElementById('clinic-weekdays-settings-runtime-note');
    const cancelButton = documentObject.getElementById('clinic-weekdays-settings-cancel-btn');
    const applyButton = documentObject.getElementById('clinic-weekdays-settings-apply-btn');

    assert.equal(launchButton.tagName, 'BUTTON');
    assert.equal(launchButton.getAttribute('type'), 'button');
    assert.equal(launchButton.textContent.includes('Clinic days'), true);
    assert.equal(launchButton.querySelector('i').getAttribute('aria-hidden'), 'true');
    assert.equal(overlay.getAttribute('aria-hidden'), 'true');
    assert.equal(overlay.classList.contains('no-print'), true);
    assert.equal(dialog.getAttribute('role'), 'dialog');
    assert.equal(dialog.getAttribute('aria-modal'), 'true');
    assert.equal(dialog.getAttribute('aria-labelledby'), 'clinic-weekdays-settings-title');
    assert.equal(
      dialog.getAttribute('aria-describedby'),
      'clinic-weekdays-settings-intro clinic-weekdays-settings-runtime-note',
    );
    assert.equal(form.tagName, 'FORM');
    assert.equal(runtimeNote.id, 'clinic-weekdays-settings-runtime-note');
    assert.equal(cancelButton.textContent, 'Cancel');
    assert.equal(applyButton.textContent, 'Apply');
    assert.equal(errorArea.getAttribute('role'), null);

    const fieldset = form.querySelector('fieldset');
    const legend = fieldset.querySelector('legend');
    assert.equal(fieldset.tagName, 'FIELDSET');
    assert.equal(legend.textContent, 'Available clinic days');

    const inputs = getCheckboxes(documentObject);
    assert.deepEqual(inputs.map((input) => input.id), [
      'clinic-weekday-1',
      'clinic-weekday-2',
      'clinic-weekday-3',
      'clinic-weekday-4',
      'clinic-weekday-5',
      'clinic-weekday-6',
      'clinic-weekday-0',
    ]);
    assert.deepEqual(inputs.map((input) => input.getAttribute('name')), [
      'clinic-weekdays',
      'clinic-weekdays',
      'clinic-weekdays',
      'clinic-weekdays',
      'clinic-weekdays',
      'clinic-weekdays',
      'clinic-weekdays',
    ]);
    assert.deepEqual(inputs.map((input) => input.getAttribute('value')), ['1', '2', '3', '4', '5', '6', '0']);
    assert.deepEqual(weekdayLabels(documentObject), ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']);

    openDialog(root, documentObject);
    const errorBox = documentObject.getElementById('clinic-weekdays-settings-error');
    const monday = documentObject.getElementById('clinic-weekday-1');
    setCheckboxValue(monday, false);
    const tuesday = documentObject.getElementById('clinic-weekday-2');
    const wednesday = documentObject.getElementById('clinic-weekday-3');
    const thursday = documentObject.getElementById('clinic-weekday-4');
    setCheckboxValue(tuesday, false);
    setCheckboxValue(wednesday, false);
    setCheckboxValue(thursday, false);
    applyButton.dispatchEvent(createClickEvent());
    assert.equal(errorBox.getAttribute('role'), 'alert');
    assert.equal(errorBox.getAttribute('aria-live'), 'assertive');
  });
});

test('clinic-weekdays-settings-B: initial state and opening reflect planner weekdays and focus the first selected day', () => {
  withMockEnvironment(({ documentObject, planner, i18n, subscribeCounter }) => {
    const listenerSpy = { count: 0 };
    const originalAddListener = planner.addListener;
    planner.addListener = function instrumentedAddListener(listener) {
      listenerSpy.count += 1;
      return originalAddListener.call(this, listener);
    };

    const root = createClinicWeekdaysSettingsComponent({ planner, i18n });
    documentObject.body.appendChild(root);

    const launchButton = openDialog(root, documentObject);
    const overlay = documentObject.getElementById('clinic-weekdays-settings-overlay');
    const errorArea = documentObject.getElementById('clinic-weekdays-settings-error');

    assert.equal(overlay.getAttribute('aria-hidden'), 'false');
    assert.deepEqual(checkedWeekdays(documentObject), [2, 3, 4]);
    assert.equal(documentObject.activeElement.id, 'clinic-weekday-2');
    assert.equal(errorArea.textContent, '');
    assert.equal(listenerSpy.count, 1);
    assert.equal(subscribeCounter.count, 1);

    documentObject.getElementById('clinic-weekdays-settings-cancel-btn').dispatchEvent(createClickEvent());
    launchButton.dispatchEvent(createClickEvent());
    assert.equal(documentObject.querySelectorAll('#clinic-weekdays-settings-dialog').length, 1);
    assert.equal(documentObject.querySelectorAll('#clinic-weekdays-settings-launch-btn').length, 1);
  });
});

test('clinic-weekdays-settings-C: cancel discards draft changes and does not call the planner setter', () => {
  withMockEnvironment(({ documentObject, planner, i18n }) => {
    const root = createClinicWeekdaysSettingsComponent({ planner, i18n });
    documentObject.body.appendChild(root);

    const launchButton = openDialog(root, documentObject);
    const monday = documentObject.getElementById('clinic-weekday-1');
    setCheckboxValue(monday, true);
    documentObject.getElementById('clinic-weekdays-settings-cancel-btn').dispatchEvent(createClickEvent());

    assert.equal(documentObject.getElementById('clinic-weekdays-settings-overlay').getAttribute('aria-hidden'), 'true');
    assert.equal(documentObject.activeElement, launchButton);
    assert.equal(planner.setCalls.length, 0);

    launchButton.dispatchEvent(createClickEvent());
    assert.deepEqual(checkedWeekdays(documentObject), [2, 3, 4]);
  });
});

test('clinic-weekdays-settings-D: Escape behaves like cancel', () => {
  withMockEnvironment(({ documentObject, planner, i18n }) => {
    const root = createClinicWeekdaysSettingsComponent({ planner, i18n });
    documentObject.body.appendChild(root);

    const launchButton = openDialog(root, documentObject);
    const monday = documentObject.getElementById('clinic-weekday-1');
    setCheckboxValue(monday, true);
    documentObject.getElementById('clinic-weekdays-settings-dialog').dispatchEvent(createKeydownEvent('Escape'));

    assert.equal(documentObject.getElementById('clinic-weekdays-settings-overlay').getAttribute('aria-hidden'), 'true');
    assert.equal(documentObject.activeElement, launchButton);

    launchButton.dispatchEvent(createClickEvent());
    assert.deepEqual(checkedWeekdays(documentObject), [2, 3, 4]);
    assert.equal(documentObject.getElementById('clinic-weekdays-settings-error').textContent, '');
  });
});

test('clinic-weekdays-settings-E: empty selection shows a local error, keeps the dialog open and clears after a valid choice', () => {
  withMockEnvironment(({ documentObject, planner, i18n }) => {
    const root = createClinicWeekdaysSettingsComponent({ planner, i18n });
    documentObject.body.appendChild(root);

    openDialog(root, documentObject);
    getCheckboxes(documentObject).forEach((input) => setCheckboxValue(input, false));
    documentObject.getElementById('clinic-weekdays-settings-apply-btn').dispatchEvent(createClickEvent());

    const errorArea = documentObject.getElementById('clinic-weekdays-settings-error');
    assert.equal(planner.setCalls.length, 0);
    assert.equal(documentObject.getElementById('clinic-weekdays-settings-overlay').getAttribute('aria-hidden'), 'false');
    assert.equal(errorArea.textContent, 'Select at least one clinic day.');
    assert.equal(documentObject.activeElement, errorArea);

    setCheckboxValue(documentObject.getElementById('clinic-weekday-1'), true);
    assert.equal(documentObject.getElementById('clinic-weekdays-settings-apply-btn').disabled, false);
    assert.equal(errorArea.textContent, '');
  });
});

test('clinic-weekdays-settings-F: successful effective change calls the planner API and closes cleanly', () => {
  withMockEnvironment({
    run: ({ documentObject, planner, i18n }) => {
      const root = createClinicWeekdaysSettingsComponent({ planner, i18n });
      documentObject.body.appendChild(root);

      const launchButton = openDialog(root, documentObject);
      getCheckboxes(documentObject).forEach((input) => setCheckboxValue(input, false));
      setCheckboxValue(documentObject.getElementById('clinic-weekday-1'), true);
      setCheckboxValue(documentObject.getElementById('clinic-weekday-3'), true);
      setCheckboxValue(documentObject.getElementById('clinic-weekday-5'), true);
      documentObject.getElementById('clinic-weekdays-settings-apply-btn').dispatchEvent(createClickEvent());

      assert.deepEqual(planner.setCalls[0], [1, 3, 5]);
      assert.equal(documentObject.getElementById('clinic-weekdays-settings-overlay').getAttribute('aria-hidden'), 'true');
      assert.equal(documentObject.activeElement, launchButton);
      assert.equal(documentObject.getElementById('clinic-weekdays-settings-error').textContent, '');
      assert.equal(planner.notifyCalls, 0);
    },
  });
});

test('clinic-weekdays-settings-G: successful no-op closes without warning', () => {
  const planner = createPlannerStub([2, 3, 4], {
    buildResult(nextWeekdays, previousWeekdays) {
      return {
        success: true,
        changed: false,
        previousWeekdays,
        weekdays: normalizeWeekdays(nextWeekdays),
        warnings: [],
      };
    },
  });

  withMockEnvironment({ planner, run: ({ documentObject, i18n }) => {
    const root = createClinicWeekdaysSettingsComponent({ planner, i18n });
    documentObject.body.appendChild(root);

    const launchButton = openDialog(root, documentObject);
    documentObject.getElementById('clinic-weekdays-settings-apply-btn').dispatchEvent(createClickEvent());
    assert.equal(documentObject.getElementById('clinic-weekdays-settings-overlay').getAttribute('aria-hidden'), 'true');
    assert.equal(documentObject.activeElement, launchButton);
    assert.equal(documentObject.getElementById('clinic-weekdays-settings-error').textContent, '');
  } });
});

test('clinic-weekdays-settings-H: engine invalid-selection failure stays open and does not expose raw messages', () => {
  const planner = createPlannerStub([2, 3, 4], {
    buildResult(nextWeekdays, previousWeekdays) {
      return {
        success: false,
        changed: false,
        reason: 'INVALID_APPOINTMENT_WEEKDAYS',
        message: 'raw internal detail',
        previousWeekdays,
        weekdays: previousWeekdays,
        warnings: [],
      };
    },
  });

  withMockEnvironment({ planner, run: ({ documentObject, i18n }) => {
    const root = createClinicWeekdaysSettingsComponent({ planner, i18n });
    documentObject.body.appendChild(root);

    openDialog(root, documentObject);
    setCheckboxValue(documentObject.getElementById('clinic-weekday-1'), true);
    documentObject.getElementById('clinic-weekdays-settings-apply-btn').dispatchEvent(createClickEvent());

    const errorArea = documentObject.getElementById('clinic-weekdays-settings-error');
    assert.equal(documentObject.getElementById('clinic-weekdays-settings-overlay').getAttribute('aria-hidden'), 'false');
    assert.equal(errorArea.textContent, 'The selected clinic days are not valid.');
    assert.equal(errorArea.textContent.includes('raw internal detail'), false);
    assert.equal(documentObject.activeElement, errorArea);
    assert.deepEqual(checkedWeekdays(documentObject), [1, 2, 3, 4]);
  } });
});

test('clinic-weekdays-settings-I: recalculation failure preserves the draft and re-translates with locale changes', () => {
  const planner = createPlannerStub([2, 3, 4], {
    buildResult(nextWeekdays, previousWeekdays) {
      return {
        success: false,
        changed: false,
        reason: 'WEEKDAY_RECALCULATION_FAILED',
        previousWeekdays,
        weekdays: previousWeekdays,
        warnings: [],
      };
    },
  });

  withMockEnvironment({ planner, run: ({ documentObject, i18n }) => {
    const root = createClinicWeekdaysSettingsComponent({ planner, i18n });
    documentObject.body.appendChild(root);

    openDialog(root, documentObject);
    setCheckboxValue(documentObject.getElementById('clinic-weekday-1'), true);
    documentObject.getElementById('clinic-weekdays-settings-apply-btn').dispatchEvent(createClickEvent());

    const errorArea = documentObject.getElementById('clinic-weekdays-settings-error');
    assert.equal(errorArea.textContent, 'The appointment plan could not be recalculated. No changes were applied.');
    assert.deepEqual(checkedWeekdays(documentObject), [1, 2, 3, 4]);
    assert.deepEqual(planner.getValidAppointmentWeekdays(), [2, 3, 4]);

    i18n.setLocale('de');
    assert.equal(errorArea.textContent, 'Der Terminplan konnte nicht neu berechnet werden. Es wurden keine Änderungen übernommen.');
  } });
});

test('clinic-weekdays-settings-J: unknown failures, thrown exceptions and missing planner API map to the generic error', () => {
  const unknownPlanner = createPlannerStub([2, 3, 4], {
    buildResult(nextWeekdays, previousWeekdays) {
      return {
        success: false,
        changed: false,
        reason: 'SOMETHING_ELSE',
        previousWeekdays,
        weekdays: previousWeekdays,
        warnings: [],
      };
    },
  });

  withMockEnvironment({ planner: unknownPlanner, run: ({ documentObject, i18n }) => {
    const root = createClinicWeekdaysSettingsComponent({ planner: unknownPlanner, i18n });
    documentObject.body.appendChild(root);
    openDialog(root, documentObject);
    documentObject.getElementById('clinic-weekdays-settings-apply-btn').dispatchEvent(createClickEvent());
    assert.equal(documentObject.getElementById('clinic-weekdays-settings-error').textContent, 'The clinic days could not be updated.');
    documentObject.getElementById('clinic-weekdays-settings-cancel-btn').dispatchEvent(createClickEvent());
  } });

  const throwingPlanner = createPlannerStub([2, 3, 4], { throwOnSet: true });
  withMockEnvironment({ planner: throwingPlanner, run: ({ documentObject, i18n }) => {
    const root = createClinicWeekdaysSettingsComponent({ planner: throwingPlanner, i18n });
    documentObject.body.appendChild(root);
    openDialog(root, documentObject);
    documentObject.getElementById('clinic-weekdays-settings-apply-btn').dispatchEvent(createClickEvent());
    assert.equal(documentObject.getElementById('clinic-weekdays-settings-error').textContent, 'The clinic days could not be updated.');
  } });

  withMockEnvironment(({ documentObject, i18n }) => {
    const root = createClinicWeekdaysSettingsComponent({ planner: {}, i18n });
    documentObject.body.appendChild(root);
    openDialog(root, documentObject);
    assert.equal(documentObject.getElementById('clinic-weekdays-settings-apply-btn').disabled, true);
    assert.equal(documentObject.getElementById('clinic-weekdays-settings-error').textContent, 'The clinic days could not be updated.');
  });
});

test('clinic-weekdays-settings-K: while closed, external planner changes are reflected on the next open', () => {
  withMockEnvironment(({ documentObject, planner, i18n }) => {
    const root = createClinicWeekdaysSettingsComponent({ planner, i18n });
    documentObject.body.appendChild(root);

    planner.emitExternalChange([1, 3, 5]);
    openDialog(root, documentObject);
    assert.deepEqual(checkedWeekdays(documentObject), [1, 3, 5]);
  });
});

test('clinic-weekdays-settings-L: while open and pristine, external planner changes update checkboxes and preserve focus', () => {
  withMockEnvironment(({ documentObject, planner, i18n }) => {
    const root = createClinicWeekdaysSettingsComponent({ planner, i18n });
    documentObject.body.appendChild(root);

    openDialog(root, documentObject);
    const tuesday = documentObject.getElementById('clinic-weekday-2');
    tuesday.focus();
    planner.emitExternalChange([1, 3, 5]);

    assert.deepEqual(checkedWeekdays(documentObject), [1, 3, 5]);
    assert.equal(documentObject.activeElement, tuesday);
    assert.equal(documentObject.getElementById('clinic-weekdays-settings-error').textContent, '');
    assert.equal(documentObject.getElementById('clinic-weekdays-settings-apply-btn').disabled, false);
  });
});

test('clinic-weekdays-settings-M: while open and dirty, external planner changes keep the draft, show conflict and disable apply', () => {
  withMockEnvironment(({ documentObject, planner, i18n }) => {
    const root = createClinicWeekdaysSettingsComponent({ planner, i18n });
    documentObject.body.appendChild(root);

    openDialog(root, documentObject);
    setCheckboxValue(documentObject.getElementById('clinic-weekday-1'), true);
    const tuesday = documentObject.getElementById('clinic-weekday-2');
    tuesday.focus();

    planner.emitExternalChange([1, 3, 5]);
    assert.deepEqual(checkedWeekdays(documentObject), [1, 2, 3, 4]);
    assert.equal(documentObject.getElementById('clinic-weekdays-settings-error').textContent, 'Clinic days changed while this dialog was open. Cancel and reopen the dialog before applying changes.');
    assert.equal(documentObject.getElementById('clinic-weekdays-settings-apply-btn').disabled, true);
    assert.equal(documentObject.activeElement, tuesday);

    i18n.setLocale('it');
    assert.equal(documentObject.getElementById('clinic-weekdays-settings-error').textContent, 'I giorni della clinica sono cambiati mentre questa finestra era aperta. Annulla e riapri la finestra prima di applicare le modifiche.');

    documentObject.getElementById('clinic-weekdays-settings-cancel-btn').dispatchEvent(createClickEvent());
    openDialog(root, documentObject);
    assert.deepEqual(checkedWeekdays(documentObject), [1, 3, 5]);
    assert.equal(documentObject.getElementById('clinic-weekdays-settings-apply-btn').disabled, false);
  });
});

test('clinic-weekdays-settings-N: locale changes while open preserve draft values, open state, focus and translate all visible text', () => {
  withMockEnvironment(({ documentObject, planner, i18n, subscribeCounter }) => {
    const root = createClinicWeekdaysSettingsComponent({ planner, i18n });
    documentObject.body.appendChild(root);

    openDialog(root, documentObject);
    setCheckboxValue(documentObject.getElementById('clinic-weekday-1'), true);
    const tuesday = documentObject.getElementById('clinic-weekday-2');
    tuesday.focus();
    getCheckboxes(documentObject).forEach((input) => setCheckboxValue(input, false));
    documentObject.getElementById('clinic-weekdays-settings-apply-btn').dispatchEvent(createClickEvent());

    i18n.setLocale('de');
    assert.equal(documentObject.getElementById('clinic-weekdays-settings-title').textContent, 'Behandlungstage der Klinik');
    assert.equal(documentObject.getElementById('clinic-weekdays-settings-intro').textContent, 'Wählen Sie die Wochentage aus, an denen Behandlungstermine geplant werden dürfen.');
    assert.equal(documentObject.getElementById('clinic-weekdays-settings-runtime-note').textContent, 'Änderungen gelten nur für die aktuelle Seitensitzung und werden beim Neuladen der Seite zurückgesetzt.');
    assert.deepEqual(weekdayLabels(documentObject), ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag']);
    assert.equal(documentObject.getElementById('clinic-weekdays-settings-cancel-btn').textContent, 'Abbrechen');
    assert.equal(documentObject.getElementById('clinic-weekdays-settings-apply-btn').textContent, 'Übernehmen');
    assert.equal(documentObject.getElementById('clinic-weekdays-settings-error').textContent, 'Wählen Sie mindestens einen Behandlungstag aus.');
    assert.equal(documentObject.activeElement, documentObject.getElementById('clinic-weekdays-settings-error'));

    setCheckboxValue(documentObject.getElementById('clinic-weekday-2'), true);
    tuesday.focus();
    i18n.setLocale('it');
    assert.equal(documentObject.getElementById('clinic-weekdays-settings-title').textContent, 'Giorni di trattamento della clinica');
    assert.equal(documentObject.activeElement, tuesday);
    assert.deepEqual(checkedWeekdays(documentObject), [2]);
    assert.equal(documentObject.getElementById('clinic-weekdays-settings-overlay').getAttribute('aria-hidden'), 'false');
    assert.equal(subscribeCounter.count, 1);
  });
});

test('clinic-weekdays-settings-O: focus trap cycles through enabled controls and is inactive while closed', () => {
  withMockEnvironment(({ documentObject, planner, i18n }) => {
    const root = createClinicWeekdaysSettingsComponent({ planner, i18n });
    documentObject.body.appendChild(root);

    const dialog = documentObject.getElementById('clinic-weekdays-settings-dialog');
    openDialog(root, documentObject);
    const applyButton = documentObject.getElementById('clinic-weekdays-settings-apply-btn');
    applyButton.focus();
    dialog.dispatchEvent(createKeydownEvent('Tab'));
    assert.equal(documentObject.activeElement.id, 'clinic-weekday-1');

    const shiftTabEvent = createKeydownEvent('Tab');
    shiftTabEvent.shiftKey = true;
    documentObject.getElementById('clinic-weekday-1').focus();
    dialog.dispatchEvent(shiftTabEvent);
    assert.equal(documentObject.activeElement, applyButton);

    setCheckboxValue(documentObject.getElementById('clinic-weekday-1'), true);
    planner.emitExternalChange([1, 3, 5]);
    documentObject.getElementById('clinic-weekdays-settings-cancel-btn').focus();
    dialog.dispatchEvent(createKeydownEvent('Tab'));
    assert.equal(documentObject.activeElement.id, 'clinic-weekday-1');

    documentObject.getElementById('clinic-weekdays-settings-cancel-btn').dispatchEvent(createClickEvent());
    const launchButton = documentObject.getElementById('clinic-weekdays-settings-launch-btn');
    launchButton.focus();
    dialog.dispatchEvent(createKeydownEvent('Tab'));
    assert.equal(documentObject.activeElement, launchButton);
  });
});

test('clinic-weekdays-settings-P: component is isolated from storage, fetch, planner internals and privacy UI', () => {
  withMockEnvironment(({ documentObject, planner, i18n, getFetchCalls, windowObject }) => {
    Object.defineProperty(windowObject, 'localStorage', {
      get() {
        throw new Error('localStorage should not be accessed');
      },
    });

    const beforePatientSnapshot = JSON.stringify(planner.unrelatedPatientData);
    const root = createClinicWeekdaysSettingsComponent({ planner, i18n });
    documentObject.body.appendChild(root);

    openDialog(root, documentObject);
    documentObject.getElementById('clinic-weekdays-settings-cancel-btn').dispatchEvent(createClickEvent());

    assert.equal(getFetchCalls(), 0);
    assert.equal(JSON.stringify(planner.unrelatedPatientData), beforePatientSnapshot);
    assert.equal(documentObject.getElementById('privacy-info-launch-btn'), null);
  });
});

test('clinic-weekdays-settings-Q: component throws without a usable document and falls back to English without i18n', () => {
  const previousDocument = global.document;
  try {
    delete global.document;
    assert.throws(
      () => createClinicWeekdaysSettingsComponent({ planner: createPlannerStub([2, 3, 4]) }),
      /requires a document/,
    );
  } finally {
    global.document = previousDocument;
  }

  withMockDom((documentObject) => {
    const planner = createPlannerStub([2, 3, 4]);
    const root = createClinicWeekdaysSettingsComponent({ planner });
    documentObject.body.appendChild(root);
    assert.equal(documentObject.getElementById('clinic-weekdays-settings-launch-btn').textContent.includes('Clinic days'), true);
  });
});

test('clinic-weekdays-settings-R: translations are complete in English, German and Italian', () => {
  function getNestedValue(source, path) {
    return path.split('.').reduce((current, key) => (current ? current[key] : undefined), source);
  }

  const requiredPaths = [
    'clinicWeekdaysSettings.launch',
    'clinicWeekdaysSettings.title',
    'clinicWeekdaysSettings.intro',
    'clinicWeekdaysSettings.fieldsetLegend',
    'clinicWeekdaysSettings.runtimeNote',
    'clinicWeekdaysSettings.cancel',
    'clinicWeekdaysSettings.apply',
    'clinicWeekdaysSettings.errors.emptySelection',
    'clinicWeekdaysSettings.errors.invalidSelection',
    'clinicWeekdaysSettings.errors.recalculationFailed',
    'clinicWeekdaysSettings.errors.conflict',
    'clinicWeekdaysSettings.errors.unknown',
    'clinicWeekdaysSettings.weekdays.0',
    'clinicWeekdaysSettings.weekdays.1',
    'clinicWeekdaysSettings.weekdays.2',
    'clinicWeekdaysSettings.weekdays.3',
    'clinicWeekdaysSettings.weekdays.4',
    'clinicWeekdaysSettings.weekdays.5',
    'clinicWeekdaysSettings.weekdays.6',
  ];

  ['en', 'de', 'it'].forEach((locale) => {
    requiredPaths.forEach((path) => {
      assert.equal(typeof getNestedValue(translations[locale], path), 'string', `${locale} should define ${path}`);
    });
  });

  assert.equal(translations.en.clinicWeekdaysSettings.launch, 'Clinic days');
  assert.equal(translations.de.clinicWeekdaysSettings.launch, 'Behandlungstage');
  assert.equal(translations.it.clinicWeekdaysSettings.launch, 'Giorni della clinica');
  assert.equal(translations.en.clinicWeekdaysSettings.weekdays[1], 'Monday');
  assert.equal(translations.de.clinicWeekdaysSettings.weekdays[1], 'Montag');
  assert.equal(translations.it.clinicWeekdaysSettings.weekdays[1], 'Lunedì');
});

test('clinic-weekdays-settings-S: integration with the real planner updates runtime weekdays and keeps schedule validation green', () => {
  withMockEnvironment(({ documentObject, i18n, storage }) => {
    const planner = new TherapyPlanner(
      { validAppointmentWeekdays: [2, 3, 4], interEyeGapDays: 14 },
      { today: d(2026, 6, 26) },
    );
    const root = createClinicWeekdaysSettingsComponent({ planner, i18n });
    documentObject.body.appendChild(root);

    openDialog(root, documentObject);
    assert.deepEqual(checkedWeekdays(documentObject), [2, 3, 4]);

    getCheckboxes(documentObject).forEach((input) => setCheckboxValue(input, false));
    setCheckboxValue(documentObject.getElementById('clinic-weekday-1'), true);
    setCheckboxValue(documentObject.getElementById('clinic-weekday-3'), true);
    setCheckboxValue(documentObject.getElementById('clinic-weekday-5'), true);
    documentObject.getElementById('clinic-weekdays-settings-apply-btn').dispatchEvent(createClickEvent());

    assert.deepEqual(planner.getValidAppointmentWeekdays(), [1, 3, 5]);
    assert.equal(planner.validateSchedule().valid, true);
    assert.equal(documentObject.getElementById('clinic-weekdays-settings-overlay').getAttribute('aria-hidden'), 'true');

    openDialog(root, documentObject);
    assert.deepEqual(checkedWeekdays(documentObject), [1, 3, 5]);
    assert.equal(storage.getItem(I18N_STORAGE_KEY), JSON.stringify({ locale: 'en' }));
  });
});
