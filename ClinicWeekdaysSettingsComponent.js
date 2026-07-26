const DEFAULT_CLINIC_WEEKDAY_TRANSLATIONS = {
  clinicWeekdaysSettings: {
    launch: 'Clinic days',
    title: 'Clinic treatment days',
    intro: 'Choose the weekdays on which treatment appointments may be scheduled.',
    fieldsetLegend: 'Available clinic days',
    runtimeNote: 'Changes apply to the current page session only and are reset when the page is reloaded.',
    cancel: 'Cancel',
    apply: 'Apply',
    weekdays: {
      0: 'Sunday',
      1: 'Monday',
      2: 'Tuesday',
      3: 'Wednesday',
      4: 'Thursday',
      5: 'Friday',
      6: 'Saturday',
    },
    errors: {
      emptySelection: 'Select at least one clinic day.',
      invalidSelection: 'The selected clinic days are not valid.',
      recalculationFailed: 'The appointment plan could not be recalculated. No changes were applied.',
      conflict: 'Clinic days changed while this dialog was open. Cancel and reopen the dialog before applying changes.',
      unknown: 'The clinic days could not be updated.',
    },
  },
};

const CLINIC_WEEKDAY_DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

function getClinicWeekdayNestedValue(source, path) {
  return path.split('.').reduce(function reduceValue(current, key) {
    if (!current || typeof current !== 'object') {
      return undefined;
    }

    return current[key];
  }, source);
}

function normalizeClinicWeekdaySelection(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  const unique = [];
  for (const weekday of value) {
    if (Number.isInteger(weekday) && weekday >= 0 && weekday <= 6 && !unique.includes(weekday)) {
      unique.push(weekday);
    }
  }

  unique.sort(function sortWeekdays(left, right) {
    return left - right;
  });
  return unique;
}

function areClinicWeekdaySetsEqual(left, right) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every(function compareWeekday(weekday, index) {
    return weekday === right[index];
  });
}

function createClinicWeekdaysSettingsComponent(options) {
  const settings = options || {};
  const planner = settings.planner || null;
  const i18n = settings.i18n || null;
  const documentObject = typeof document !== 'undefined' ? document : null;

  if (!documentObject || typeof documentObject.createElement !== 'function') {
    throw new Error('ClinicWeekdaysSettingsComponent requires a document.');
  }

  function translate(key) {
    if (i18n && typeof i18n.has === 'function' && i18n.has(key) && typeof i18n.t === 'function') {
      return i18n.t(key);
    }

    return getClinicWeekdayNestedValue(DEFAULT_CLINIC_WEEKDAY_TRANSLATIONS, key) || key;
  }

  function hasPlannerWeekdayApi() {
    return !!(
      planner &&
      typeof planner.getValidAppointmentWeekdays === 'function' &&
      typeof planner.setValidAppointmentWeekdays === 'function'
    );
  }

  function readPlannerWeekdays() {
    if (!hasPlannerWeekdayApi()) {
      return [];
    }

    try {
      return normalizeClinicWeekdaySelection(planner.getValidAppointmentWeekdays());
    } catch (error) {
      return [];
    }
  }

  const root = documentObject.createElement('div');
  root.id = 'clinic-weekdays-settings-root';
  root.setAttribute('id', 'clinic-weekdays-settings-root');
  root.classList.add('clinic-weekdays-settings-root', 'no-print');

  const launchButton = documentObject.createElement('button');
  launchButton.id = 'clinic-weekdays-settings-launch-btn';
  launchButton.type = 'button';
  launchButton.setAttribute('id', 'clinic-weekdays-settings-launch-btn');
  launchButton.setAttribute('type', 'button');
  launchButton.classList.add('btn', 'btn-outline-secondary', 'clinic-weekdays-settings-launch-btn');

  const launchIcon = documentObject.createElement('i');
  launchIcon.classList.add('bi', 'bi-calendar3');
  launchIcon.setAttribute('aria-hidden', 'true');

  const launchText = documentObject.createElement('span');
  launchText.classList.add('clinic-weekdays-settings-launch-text');

  launchButton.appendChild(launchIcon);
  launchButton.appendChild(launchText);

  const overlay = documentObject.createElement('div');
  overlay.id = 'clinic-weekdays-settings-overlay';
  overlay.setAttribute('id', 'clinic-weekdays-settings-overlay');
  overlay.setAttribute('aria-hidden', 'true');
  overlay.classList.add('clinic-weekdays-settings-overlay', 'no-print');

  const dialog = documentObject.createElement('div');
  dialog.id = 'clinic-weekdays-settings-dialog';
  dialog.setAttribute('id', 'clinic-weekdays-settings-dialog');
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'clinic-weekdays-settings-title');
  dialog.setAttribute('aria-describedby', 'clinic-weekdays-settings-intro clinic-weekdays-settings-runtime-note');
  dialog.classList.add('clinic-weekdays-settings-dialog');

  const title = documentObject.createElement('h2');
  title.id = 'clinic-weekdays-settings-title';
  title.setAttribute('id', 'clinic-weekdays-settings-title');
  title.classList.add('clinic-weekdays-settings-title');

  const intro = documentObject.createElement('p');
  intro.id = 'clinic-weekdays-settings-intro';
  intro.setAttribute('id', 'clinic-weekdays-settings-intro');
  intro.classList.add('clinic-weekdays-settings-intro');

  const form = documentObject.createElement('form');
  form.id = 'clinic-weekdays-settings-form';
  form.setAttribute('id', 'clinic-weekdays-settings-form');
  form.classList.add('clinic-weekdays-settings-form');

  const fieldset = documentObject.createElement('fieldset');
  fieldset.classList.add('clinic-weekdays-settings-fieldset');

  const legend = documentObject.createElement('legend');
  legend.classList.add('clinic-weekdays-settings-legend');

  const weekdayGrid = documentObject.createElement('div');
  weekdayGrid.classList.add('clinic-weekdays-settings-grid');

  const weekdayControls = {};
  CLINIC_WEEKDAY_DISPLAY_ORDER.forEach(function createWeekdayControl(weekday) {
    const item = documentObject.createElement('label');
    item.classList.add('clinic-weekdays-settings-option');
    item.setAttribute('for', `clinic-weekday-${weekday}`);

    const input = documentObject.createElement('input');
    input.id = `clinic-weekday-${weekday}`;
    input.type = 'checkbox';
    input.name = 'clinic-weekdays';
    input.value = String(weekday);
    input.setAttribute('id', `clinic-weekday-${weekday}`);
    input.setAttribute('type', 'checkbox');
    input.setAttribute('name', 'clinic-weekdays');
    input.setAttribute('value', String(weekday));
    input.classList.add('clinic-weekdays-settings-checkbox');

    const labelText = documentObject.createElement('span');
    labelText.classList.add('clinic-weekdays-settings-option-label');

    item.appendChild(input);
    item.appendChild(labelText);
    weekdayGrid.appendChild(item);

    weekdayControls[weekday] = {
      input,
      labelText,
    };
  });

  fieldset.appendChild(legend);
  fieldset.appendChild(weekdayGrid);
  form.appendChild(fieldset);

  const errorArea = documentObject.createElement('div');
  errorArea.id = 'clinic-weekdays-settings-error';
  errorArea.setAttribute('id', 'clinic-weekdays-settings-error');
  errorArea.setAttribute('tabindex', '-1');
  errorArea.classList.add('clinic-weekdays-settings-error');

  const runtimeNote = documentObject.createElement('p');
  runtimeNote.id = 'clinic-weekdays-settings-runtime-note';
  runtimeNote.setAttribute('id', 'clinic-weekdays-settings-runtime-note');
  runtimeNote.classList.add('clinic-weekdays-settings-runtime-note');

  const actions = documentObject.createElement('div');
  actions.classList.add('clinic-weekdays-settings-actions');

  const cancelButton = documentObject.createElement('button');
  cancelButton.id = 'clinic-weekdays-settings-cancel-btn';
  cancelButton.type = 'button';
  cancelButton.setAttribute('id', 'clinic-weekdays-settings-cancel-btn');
  cancelButton.setAttribute('type', 'button');
  cancelButton.classList.add('btn', 'btn-secondary', 'clinic-weekdays-settings-cancel-btn');

  const applyButton = documentObject.createElement('button');
  applyButton.id = 'clinic-weekdays-settings-apply-btn';
  applyButton.type = 'button';
  applyButton.setAttribute('id', 'clinic-weekdays-settings-apply-btn');
  applyButton.setAttribute('type', 'button');
  applyButton.classList.add('btn', 'btn-primary', 'clinic-weekdays-settings-apply-btn');

  actions.appendChild(cancelButton);
  actions.appendChild(applyButton);

  dialog.appendChild(title);
  dialog.appendChild(intro);
  dialog.appendChild(form);
  dialog.appendChild(errorArea);
  dialog.appendChild(runtimeNote);
  dialog.appendChild(actions);
  overlay.appendChild(dialog);

  root.appendChild(launchButton);
  root.appendChild(overlay);

  let isOpen = false;
  let draftWeekdays = [];
  let baselineWeekdays = readPlannerWeekdays();
  let errorState = hasPlannerWeekdayApi() ? null : { type: 'unknown' };
  let isDirty = false;
  let hasConflict = false;
  let isApplying = false;

  function getWeekdayLabel(weekday) {
    return translate(`clinicWeekdaysSettings.weekdays.${weekday}`);
  }

  function getErrorMessage() {
    if (!errorState) {
      return '';
    }

    if (errorState.type === 'engine') {
      if (errorState.reason === 'INVALID_APPOINTMENT_WEEKDAYS') {
        return translate('clinicWeekdaysSettings.errors.invalidSelection');
      }

      if (errorState.reason === 'WEEKDAY_RECALCULATION_FAILED') {
        return translate('clinicWeekdaysSettings.errors.recalculationFailed');
      }

      return translate('clinicWeekdaysSettings.errors.unknown');
    }

    return translate(`clinicWeekdaysSettings.errors.${errorState.type}`) || translate('clinicWeekdaysSettings.errors.unknown');
  }

  function getFocusableControls() {
    const controls = [];

    CLINIC_WEEKDAY_DISPLAY_ORDER.forEach(function collectWeekdayInput(weekday) {
      const input = weekdayControls[weekday].input;
      if (!input.disabled) {
        controls.push(input);
      }
    });

    if (!cancelButton.disabled) {
      controls.push(cancelButton);
    }

    if (!applyButton.disabled) {
      controls.push(applyButton);
    }

    return controls;
  }

  function focusByIdOrNode(previousFocusIdentifier) {
    if (!previousFocusIdentifier) {
      return false;
    }

    if (typeof previousFocusIdentifier === 'string') {
      const target = documentObject.getElementById(previousFocusIdentifier);
      if (target && typeof target.focus === 'function') {
        target.focus();
        return true;
      }
      return false;
    }

    if (previousFocusIdentifier && typeof previousFocusIdentifier.focus === 'function') {
      previousFocusIdentifier.focus();
      return true;
    }

    return false;
  }

  function getCurrentFocusIdentifier() {
    const activeElement = documentObject.activeElement;
    if (!activeElement) {
      return null;
    }

    return activeElement.id || activeElement;
  }

  function focusFirstSelectedCheckbox() {
    const selection = normalizeClinicWeekdaySelection(draftWeekdays);
    const firstSelected = CLINIC_WEEKDAY_DISPLAY_ORDER.find(function findSelectedWeekday(weekday) {
      return selection.includes(weekday);
    });
    const targetWeekday = typeof firstSelected === 'number' ? firstSelected : 1;
    const targetInput = weekdayControls[targetWeekday] && weekdayControls[targetWeekday].input;

    if (targetInput && typeof targetInput.focus === 'function') {
      targetInput.focus();
    }
  }

  function updateDerivedState() {
    isDirty = !areClinicWeekdaySetsEqual(normalizeClinicWeekdaySelection(draftWeekdays), normalizeClinicWeekdaySelection(baselineWeekdays));
  }

  function clearNonConflictErrorOnValidDraft() {
    if (!errorState || hasConflict) {
      return;
    }

    if (draftWeekdays.length > 0) {
      errorState = null;
    }
  }

  function render() {
    const previousFocusIdentifier = isOpen ? getCurrentFocusIdentifier() : null;
    const plannerReady = hasPlannerWeekdayApi();
    const normalizedDraft = normalizeClinicWeekdaySelection(draftWeekdays);

    launchText.textContent = translate('clinicWeekdaysSettings.launch');
    title.textContent = translate('clinicWeekdaysSettings.title');
    intro.textContent = translate('clinicWeekdaysSettings.intro');
    legend.textContent = translate('clinicWeekdaysSettings.fieldsetLegend');
    runtimeNote.textContent = translate('clinicWeekdaysSettings.runtimeNote');
    cancelButton.textContent = translate('clinicWeekdaysSettings.cancel');
    applyButton.textContent = translate('clinicWeekdaysSettings.apply');

    CLINIC_WEEKDAY_DISPLAY_ORDER.forEach(function updateWeekdayControl(weekday) {
      const control = weekdayControls[weekday];
      control.labelText.textContent = getWeekdayLabel(weekday);
      control.input.checked = normalizedDraft.includes(weekday);
    });

    const showError = !!errorState;
    errorArea.textContent = showError ? getErrorMessage() : '';
    if (showError) {
      errorArea.setAttribute('role', 'alert');
      errorArea.setAttribute('aria-live', 'assertive');
      errorArea.classList.add('clinic-weekdays-settings-error-visible');
    } else {
      errorArea.removeAttribute('role');
      errorArea.removeAttribute('aria-live');
      errorArea.classList.remove('clinic-weekdays-settings-error-visible');
    }

    applyButton.disabled = !plannerReady || hasConflict || isApplying;
    if (!plannerReady) {
      errorState = { type: 'unknown' };
      errorArea.textContent = getErrorMessage();
      errorArea.setAttribute('role', 'alert');
      errorArea.setAttribute('aria-live', 'assertive');
      errorArea.classList.add('clinic-weekdays-settings-error-visible');
    }

    overlay.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
    overlay.classList.toggle('clinic-weekdays-settings-open', isOpen);

    if (isOpen) {
      focusByIdOrNode(previousFocusIdentifier);
    }
  }

  function setOpen(nextOpen) {
    isOpen = nextOpen;
    render();
  }

  function syncFromPlanner() {
    baselineWeekdays = readPlannerWeekdays();
    draftWeekdays = baselineWeekdays.slice();
    hasConflict = false;
    errorState = hasPlannerWeekdayApi() ? null : { type: 'unknown' };
    updateDerivedState();
  }

  function openDialog() {
    syncFromPlanner();
    setOpen(true);
    focusFirstSelectedCheckbox();
  }

  function closeDialog() {
    isApplying = false;
    syncFromPlanner();
    setOpen(false);
    launchButton.focus();
  }

  function handleCancel() {
    closeDialog();
  }

  function showError(nextErrorState, options) {
    const errorOptions = options || {};
    errorState = nextErrorState;
    render();

    if (errorOptions.focusError && typeof errorArea.focus === 'function') {
      errorArea.focus();
      return;
    }

    if (errorOptions.focusFirstCheckbox) {
      focusFirstSelectedCheckbox();
      return;
    }

    if (errorOptions.keepApplyFocus && typeof applyButton.focus === 'function' && !applyButton.disabled) {
      applyButton.focus();
    }
  }

  function collectSelectedWeekdays() {
    return CLINIC_WEEKDAY_DISPLAY_ORDER.filter(function isWeekdayChecked(weekday) {
      return !!weekdayControls[weekday].input.checked;
    });
  }

  function handleApply() {
    if (applyButton.disabled) {
      return;
    }

    const selectedWeekdays = collectSelectedWeekdays();
    draftWeekdays = normalizeClinicWeekdaySelection(selectedWeekdays);
    updateDerivedState();

    if (draftWeekdays.length === 0) {
      showError({ type: 'emptySelection' }, {
        focusError: true,
      });
      return;
    }

    if (!hasPlannerWeekdayApi()) {
      showError({ type: 'unknown' }, {
        focusError: true,
      });
      return;
    }

    try {
      isApplying = true;
      render();
      const result = planner.setValidAppointmentWeekdays(selectedWeekdays.slice());
      isApplying = false;

      if (result && result.success === true) {
        closeDialog();
        return;
      }

      const reason = result && result.reason ? result.reason : 'UNKNOWN';
      showError({ type: 'engine', reason }, {
        focusError: true,
      });
    } catch (error) {
      isApplying = false;
      showError({ type: 'unknown' }, {
        focusError: true,
      });
    }
  }

  function handleCheckboxChange() {
    draftWeekdays = collectSelectedWeekdays();
    updateDerivedState();
    clearNonConflictErrorOnValidDraft();
    render();
  }

  function handlePlannerChange() {
    try {
      const nextWeekdays = readPlannerWeekdays();

      if (!isOpen) {
        baselineWeekdays = nextWeekdays;
        return;
      }

      const previousFocusIdentifier = getCurrentFocusIdentifier();
      baselineWeekdays = nextWeekdays;

      if (!isDirty && !hasConflict) {
        draftWeekdays = nextWeekdays.slice();
        errorState = null;
        hasConflict = false;
        updateDerivedState();
        render();
        focusByIdOrNode(previousFocusIdentifier);
        return;
      }

      hasConflict = true;
      errorState = { type: 'conflict' };
      render();
      focusByIdOrNode(previousFocusIdentifier);
    } catch (error) {
      if (isOpen) {
        showError({ type: 'unknown' }, {
          focusError: true,
        });
      }
    }
  }

  function trapFocus(event) {
    if (!isOpen || event.key !== 'Tab') {
      return;
    }

    const focusableControls = getFocusableControls();
    if (focusableControls.length === 0) {
      event.preventDefault();
      return;
    }

    const activeElement = documentObject.activeElement;
    const currentIndex = focusableControls.indexOf(activeElement);
    const fallbackIndex = event.shiftKey
      ? focusableControls.length - 1
      : 0;
    const normalizedIndex = currentIndex >= 0
      ? currentIndex
      : fallbackIndex;
    const nextIndex = event.shiftKey
      ? (normalizedIndex - 1 + focusableControls.length) % focusableControls.length
      : (normalizedIndex + 1) % focusableControls.length;

    event.preventDefault();
    focusableControls[nextIndex].focus();
  }

  function handleKeydown(event) {
    if (!isOpen) {
      return;
    }

    if (event.key === 'Escape' && !isApplying) {
      event.preventDefault();
      handleCancel();
      return;
    }

    trapFocus(event);
  }

  launchButton.addEventListener('click', openDialog);
  cancelButton.addEventListener('click', handleCancel);
  applyButton.addEventListener('click', handleApply);
  dialog.addEventListener('keydown', handleKeydown);
  overlay.addEventListener('keydown', handleKeydown);
  form.addEventListener('submit', function preventSubmit(event) {
    event.preventDefault();
    handleApply();
  });

  CLINIC_WEEKDAY_DISPLAY_ORDER.forEach(function bindWeekdayChange(weekday) {
    weekdayControls[weekday].input.addEventListener('change', handleCheckboxChange);
  });

  if (planner && typeof planner.addListener === 'function') {
    planner.addListener(handlePlannerChange);
  }

  if (i18n && typeof i18n.subscribe === 'function') {
    i18n.subscribe(function handleLocaleChange() {
      const previousFocusIdentifier = isOpen ? getCurrentFocusIdentifier() : null;
      render();
      focusByIdOrNode(previousFocusIdentifier);
    });
  }

  syncFromPlanner();
  render();

  return root;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = createClinicWeekdaysSettingsComponent;
}
