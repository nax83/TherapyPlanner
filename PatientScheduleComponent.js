/* ─── PatientScheduleComponent.js ───────────────────────────────────────────
 * Patient-facing merged appointment list: preview component.
 *
 * Browser usage:  PatientSchedule.js must be loaded first (sets globals).
 * Node.js usage:  The component requires PatientSchedule.js automatically
 *                 when the globals are not set.
 *
 * API
 * ───
 * createPatientScheduleComponent(planner, options?) → Element
 *   Returns a root element containing:
 *     • launch button  (#patient-schedule-launch-btn)
 *     • preview overlay (#patient-schedule-overlay)
 *       – dialog with role="dialog" aria-modal="true"
 *       – patient-name input (not stored, cleared on close)
 *       – printable document (.patient-schedule-printable)
 *       – Print / Save as PDF button
 *       – Close button
 *       – accessible error area (role="alert")
 *
 * Keyboard: Escape closes the preview.
 * Focus:    moves into preview on open; returns to launch button on close.
 * Printing: document.body receives class 'printing-patient-schedule';
 *           print CSS makes only the patient document visible.
 *           Class is removed via the 'afterprint' event or on error.
 * ─────────────────────────────────────────────────────────────────────────── */

'use strict';

function createPatientScheduleComponent(planner, options) {
  options = options || {};

  // ── Resolve dependencies ───────────────────────────────────────────────────
  // In the browser PatientSchedule.js sets globals.  In Node.js we require it.
  let _buildList, _labels, _fmtDate, _fmtWeekday;
  if (typeof buildMergedAppointmentList === 'function') {
    _buildList   = buildMergedAppointmentList;        // eslint-disable-line no-undef
    _labels      = PATIENT_SCHEDULE_LABELS;           // eslint-disable-line no-undef
    _fmtDate     = formatPatientDate;                 // eslint-disable-line no-undef
    _fmtWeekday  = formatPatientWeekday;              // eslint-disable-line no-undef
  } else if (typeof require === 'function') {
    const ps     = require('./PatientSchedule.js');
    _buildList   = ps.buildMergedAppointmentList;
    _labels      = ps.PATIENT_SCHEDULE_LABELS;
    _fmtDate     = ps.formatPatientDate;
    _fmtWeekday  = ps.formatPatientWeekday;
  } else {
    throw new Error('PatientSchedule.js must be loaded before PatientScheduleComponent.js');
  }

  // Eye key constants (stable public API values).
  const RIGHTEYE = 'RIGHTEYE';
  const LEFTEYE  = 'LEFTEYE';

  // ── Build DOM ─────────────────────────────────────────────────────────────

  const root = document.createElement('div');
  root.setAttribute('id', 'patient-schedule-root');
  root.classList.add('patient-schedule-root');

  // ── Launch button ─────────────────────────────────────────────────────────

  const launchBtn = document.createElement('button');
  launchBtn.setAttribute('id', 'patient-schedule-launch-btn');
  launchBtn.setAttribute('type', 'button');
  launchBtn.setAttribute('aria-haspopup', 'dialog');
  launchBtn.textContent = 'Patient appointment list';
  launchBtn.classList.add('btn', 'btn-outline-primary', 'patient-schedule-launch', 'no-print');
  root.appendChild(launchBtn);

  // ── Overlay (full-screen backdrop) ────────────────────────────────────────

  const overlay = document.createElement('div');
  overlay.setAttribute('id', 'patient-schedule-overlay');
  overlay.classList.add('patient-schedule-overlay', 'hidden');
  root.appendChild(overlay);

  // ── Dialog ────────────────────────────────────────────────────────────────

  const dialog = document.createElement('div');
  dialog.setAttribute('id', 'patient-schedule-dialog');
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'patient-schedule-title');
  dialog.classList.add('patient-schedule-dialog');
  overlay.appendChild(dialog);

  // ── Error area (accessible, hidden until needed) ──────────────────────────

  const errorArea = document.createElement('div');
  errorArea.setAttribute('id', 'patient-schedule-error');
  errorArea.setAttribute('role', 'alert');
  errorArea.classList.add('patient-schedule-error', 'hidden', 'no-print');
  errorArea.textContent = '';
  dialog.appendChild(errorArea);

  // ── Patient-name row (screen only, not printed) ───────────────────────────

  const nameRow = document.createElement('div');
  nameRow.classList.add('patient-schedule-name-row', 'no-print');
  dialog.appendChild(nameRow);

  const nameLabel = document.createElement('label');
  nameLabel.setAttribute('for', 'patient-schedule-name-input');
  nameLabel.textContent = _labels.patientName + ':';
  nameRow.appendChild(nameLabel);

  const nameInput = document.createElement('input');
  nameInput.setAttribute('id', 'patient-schedule-name-input');
  nameInput.setAttribute('type', 'text');
  nameInput.setAttribute('placeholder', _labels.patientName);
  nameInput.classList.add('patient-schedule-name-input');
  nameRow.appendChild(nameInput);

  // ── Printable document ────────────────────────────────────────────────────

  const printable = document.createElement('div');
  printable.setAttribute('id', 'patient-schedule-printable');
  printable.classList.add('patient-schedule-printable');
  dialog.appendChild(printable);

  const titleEl = document.createElement('h2');
  titleEl.setAttribute('id', 'patient-schedule-title');
  titleEl.textContent = _labels.title;
  printable.appendChild(titleEl);

  const patientRow = document.createElement('p');
  patientRow.setAttribute('id', 'patient-schedule-patient-row');
  patientRow.classList.add('patient-schedule-patient-row', 'hidden');
  printable.appendChild(patientRow);

  const patientDisplay = document.createElement('span');
  patientDisplay.setAttribute('id', 'patient-schedule-patient-display');
  patientRow.appendChild(patientDisplay);

  const generatedOnP = document.createElement('p');
  generatedOnP.setAttribute('id', 'patient-schedule-generated-on');
  generatedOnP.textContent = '';
  printable.appendChild(generatedOnP);

  const table = document.createElement('table');
  table.setAttribute('id', 'patient-schedule-table');
  table.classList.add('patient-schedule-table');
  printable.appendChild(table);

  const thead = document.createElement('thead');
  table.appendChild(thead);
  const headerRow = document.createElement('tr');
  thead.appendChild(headerRow);
  for (const label of [_labels.date, _labels.day, _labels.treatment]) {
    const th = document.createElement('th');
    th.setAttribute('scope', 'col');
    th.textContent = label;
    headerRow.appendChild(th);
  }

  const tbody = document.createElement('tbody');
  tbody.setAttribute('id', 'patient-schedule-table-body');
  table.appendChild(tbody);

  const emptyMsg = document.createElement('p');
  emptyMsg.setAttribute('id', 'patient-schedule-empty');
  emptyMsg.classList.add('patient-schedule-empty', 'hidden');
  emptyMsg.textContent = _labels.empty;
  printable.appendChild(emptyMsg);

  const footerEl = document.createElement('p');
  footerEl.setAttribute('id', 'patient-schedule-footer');
  footerEl.classList.add('patient-schedule-footer');
  footerEl.textContent = _labels.footer;
  printable.appendChild(footerEl);

  // ── Action buttons (screen only, not printed) ─────────────────────────────

  const btnRow = document.createElement('div');
  btnRow.classList.add('patient-schedule-btn-row', 'no-print');
  dialog.appendChild(btnRow);

  const printBtn = document.createElement('button');
  printBtn.setAttribute('id', 'patient-schedule-print-btn');
  printBtn.setAttribute('type', 'button');
  printBtn.textContent = _labels.print;
  printBtn.classList.add('btn', 'btn-primary', 'patient-schedule-print-btn', 'no-print');
  btnRow.appendChild(printBtn);

  const closeBtn = document.createElement('button');
  closeBtn.setAttribute('id', 'patient-schedule-close-btn');
  closeBtn.setAttribute('type', 'button');
  closeBtn.setAttribute('aria-label', _labels.close);
  closeBtn.textContent = _labels.close;
  closeBtn.classList.add('btn', 'btn-secondary', 'patient-schedule-close-btn', 'no-print');
  btnRow.appendChild(closeBtn);

  // ── Internal state ────────────────────────────────────────────────────────

  let _printEnabled = false;

  // ── Helper functions ──────────────────────────────────────────────────────

  function _showError(msg) {
    errorArea.textContent = msg;
    errorArea.classList.remove('hidden');
  }

  function _clearError() {
    errorArea.textContent = '';
    errorArea.classList.add('hidden');
  }

  function _openOverlay() {
    overlay.classList.remove('hidden');
    overlay.classList.add('open');
  }

  function _closeOverlay() {
    overlay.classList.add('hidden');
    overlay.classList.remove('open');
  }

  function _setGeneratedOn() {
    const now = new Date();
    generatedOnP.textContent = _labels.generatedOn + ': ' + _fmtDate(now);
  }

  function _updatePatientDisplay() {
    const name = (nameInput.value || '').replace(/^\s+|\s+$/g, ''); // trim without relying on .trim()
    if (name) {
      patientDisplay.textContent = _labels.patientName + ': ' + name;
      patientRow.classList.remove('hidden');
    } else {
      patientDisplay.textContent = '';
      patientRow.classList.add('hidden');
    }
  }

  function _clearTable() {
    while (tbody.firstChild) tbody.removeChild(tbody.firstChild);
    emptyMsg.classList.add('hidden');
    table.classList.add('hidden');
  }

  function _renderRows(rows) {
    _clearTable();
    if (rows.length === 0) {
      emptyMsg.classList.remove('hidden');
      return;
    }
    table.classList.remove('hidden');
    for (const row of rows) {
      const tr = document.createElement('tr');

      const dateTd = document.createElement('td');
      const timeEl = document.createElement('time');
      timeEl.setAttribute('datetime', row.isoDate);
      timeEl.textContent = _fmtDate(row.date);
      dateTd.appendChild(timeEl);
      tr.appendChild(dateTd);

      const dayTd = document.createElement('td');
      dayTd.textContent = _fmtWeekday(row.date);
      tr.appendChild(dayTd);

      const eyeTd = document.createElement('td');
      eyeTd.textContent = row.eyeLabel;
      tr.appendChild(eyeTd);

      tbody.appendChild(tr);
    }
  }

  function _closePreview() {
    _closeOverlay();
    nameInput.value = '';
    _updatePatientDisplay();
    _clearError();
    if (typeof launchBtn.focus === 'function') launchBtn.focus();
  }

  // ── Event handlers ────────────────────────────────────────────────────────

  launchBtn.addEventListener('click', function () {
    _clearError();
    _printEnabled = false;
    printBtn.setAttribute('disabled', 'disabled');

    // Validate schedule before rendering.
    const v = planner.validateSchedule();
    if (!v.valid) {
      _clearTable();
      _showError('Schedule is not valid: ' + (v.violations || []).join('; '));
      _openOverlay();
      if (typeof closeBtn.focus === 'function') closeBtn.focus();
      return;
    }

    // Build the merged list from the current planner state (never cached).
    const schedule = {
      [RIGHTEYE]: planner.getPlanByEye(RIGHTEYE),
      [LEFTEYE]:  planner.getPlanByEye(LEFTEYE),
    };

    let rows;
    try {
      rows = _buildList(schedule);
    } catch (err) {
      _clearTable();
      _showError('Failed to build appointment list: ' + err.message);
      _openOverlay();
      if (typeof closeBtn.focus === 'function') closeBtn.focus();
      return;
    }

    _printEnabled = true;
    printBtn.removeAttribute('disabled');
    _setGeneratedOn();
    _renderRows(rows);

    // Reset patient name for each new opening.
    nameInput.value = '';
    _updatePatientDisplay();

    _openOverlay();
    if (typeof closeBtn.focus === 'function') closeBtn.focus();
  });

  closeBtn.addEventListener('click', _closePreview);

  // Escape key closes the preview.
  dialog.addEventListener('keydown', function (event) {
    if (event && event.key === 'Escape') _closePreview();
  });

  // Patient-name input updates the printable display live.
  nameInput.addEventListener('input',  _updatePatientDisplay);
  nameInput.addEventListener('change', _updatePatientDisplay);

  printBtn.addEventListener('click', function () {
    if (!_printEnabled) return;

    if (typeof window === 'undefined' || typeof window.print !== 'function') {
      _showError('Printing is not available in this environment.');
      return;
    }

    document.body.classList.add('printing-patient-schedule');

    const afterPrintCleanup = function () {
      document.body.classList.remove('printing-patient-schedule');
      window.removeEventListener('afterprint', afterPrintCleanup);
    };
    window.addEventListener('afterprint', afterPrintCleanup);

    try {
      window.print();
    } catch (err) {
      document.body.classList.remove('printing-patient-schedule');
      window.removeEventListener('afterprint', afterPrintCleanup);
      _showError('Printing failed: ' + (err.message || 'unknown error'));
    }
  });

  return root;
}

if (typeof module !== 'undefined') {
  module.exports = createPatientScheduleComponent;
}
