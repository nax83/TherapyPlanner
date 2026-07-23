/* ─── PatientSchedule.js ─────────────────────────────────────────────────────
 * Pure merge function for the patient-facing appointment list.
 * No scheduling logic, no side effects, no DOM access.
 *
 * Public API
 * ──────────
 * buildMergedAppointmentList(schedule)
 *   Input : { RIGHTEYE: [...], LEFTEYE: [...] }  (from planner.getPlanByEye())
 *   Output: sorted array of patient-facing row objects
 *   Throws: if any planned appointment has an invalid date
 *
 * PATIENT_SCHEDULE_LABELS  – English UI strings (localisation entry point)
 * formatIsoDate(date)      – "2026-08-12"
 * formatPatientDate(date)  – "12 August 2026"  (en-GB, deterministic)
 * formatPatientWeekday(d)  – "Wednesday"        (en-GB, deterministic)
 * ─────────────────────────────────────────────────────────────────────────── */

'use strict';

// ── UI strings (single localisation point) ────────────────────────────────────

const PATIENT_SCHEDULE_LABELS = {
  title:       'Therapy appointment plan',
  patientName: 'Patient name',
  generatedOn: 'Generated on',
  date:        'Date',
  day:         'Day',
  treatment:   'Treatment',
  rightEye:    'Right eye',
  leftEye:     'Left eye',
  print:       'Print / Save as PDF',
  close:       'Close',
  empty:       'No upcoming appointments.',
  footer:      'Please contact the clinic if you cannot attend an appointment.',
};

// Tie-break order: RIGHTEYE sorts before LEFTEYE on the same date.
const _EYE_ORDER = Object.freeze({ RIGHTEYE: 0, LEFTEYE: 1 });

const _EYE_LABEL = Object.freeze({
  RIGHTEYE: PATIENT_SCHEDULE_LABELS.rightEye,
  LEFTEYE:  PATIENT_SCHEDULE_LABELS.leftEye,
});

// ── Formatting helpers ────────────────────────────────────────────────────────

/**
 * Format a Date as 'YYYY-MM-DD' (suitable for <time datetime="…">).
 * @param {Date} date
 * @returns {string}
 */
function formatIsoDate(date) {
  const y  = date.getFullYear();
  const m  = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

/**
 * Patient-facing full date in en-GB locale, e.g. "12 August 2026".
 * Using a fixed locale produces deterministic output independent of the
 * machine's default locale setting.
 * @param {Date} date
 * @returns {string}
 */
function formatPatientDate(date) {
  return date.toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
}

/**
 * Patient-facing weekday name in en-GB locale, e.g. "Wednesday".
 * @param {Date} date
 * @returns {string}
 */
function formatPatientWeekday(date) {
  return date.toLocaleDateString('en-GB', { weekday: 'long' });
}

// ── Merge function ────────────────────────────────────────────────────────────

/**
 * Build a merged, chronologically ordered list of upcoming planned appointments.
 *
 * Sorting order (deterministic):
 *   1. date ascending;
 *   2. right eye before left eye on equal dates;
 *   3. lower original eye index first.
 *
 * Each returned row:
 *   type     – 'RIGHTEYE' | 'LEFTEYE'
 *   index    – original position within the eye plan
 *   date     – cloned Date (mutating it does not affect the source schedule)
 *   isoDate  – 'YYYY-MM-DD' string
 *   eyeLabel – patient-facing eye name (e.g. 'Right eye')
 *
 * Throws an Error if any planned appointment has an invalid or missing date.
 * Never mutates the input schedule.
 *
 * @param {{ RIGHTEYE: Array, LEFTEYE: Array }} schedule
 * @returns {Array<{type, index, date, isoDate, eyeLabel}>}
 */
function buildMergedAppointmentList(schedule) {
  const rows = [];

  for (const type of ['RIGHTEYE', 'LEFTEYE']) {
    const plan = (schedule && schedule[type]) || [];
    for (let i = 0; i < plan.length; i++) {
      const appt = plan[i];
      if (appt.status !== 'planned') continue;

      const raw = appt.plannedDate;
      if (!(raw instanceof Date) || isNaN(raw.getTime())) {
        throw new Error(
          `Planned appointment ${type}[${i}] has an invalid or missing date.`,
        );
      }

      // Clone the date so that mutating a returned row does not affect the source.
      const cloned = new Date(raw.getFullYear(), raw.getMonth(), raw.getDate());
      rows.push({
        type,
        index:    i,
        date:     cloned,
        isoDate:  formatIsoDate(cloned),
        eyeLabel: _EYE_LABEL[type] || type,
      });
    }
  }

  // Deterministic sort: date → eye order → index.
  rows.sort((a, b) => {
    const dd = a.date.getTime() - b.date.getTime();
    if (dd !== 0) return dd;
    const ed = (_EYE_ORDER[a.type] || 0) - (_EYE_ORDER[b.type] || 0);
    if (ed !== 0) return ed;
    return a.index - b.index;
  });

  return rows;
}

// ── Export ────────────────────────────────────────────────────────────────────

if (typeof module !== 'undefined') {
  module.exports = {
    buildMergedAppointmentList,
    PATIENT_SCHEDULE_LABELS,
    formatIsoDate,
    formatPatientDate,
    formatPatientWeekday,
  };
}
