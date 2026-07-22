/* ─── TherapyPlanner.js ──────────────────────────────────────────────────────
 * Scheduling engine for intravitreal injection therapy.
 *
 * Appointment statuses
 * ────────────────────
 * 'planned'   – a current or future injection that has not yet occurred.
 * 'completed' – an injection that already took place (historical fact).
 *
 * For each eye, completed appointments form a contiguous prefix of the
 * treatment sequence.  All automatically generated appointments default to
 * 'planned'.  Historical dates are accepted even when they violate clinic-day,
 * same-eye interval, or cross-eye gap rules (historical exceptions).
 *
 * Cross-eye gap enforcement
 * ─────────────────────────
 * The interEyeGapDays rule is enforced for every pair where at least one
 * appointment is 'planned'.  Two completed appointments may be any distance
 * apart.
 * ─────────────────────────────────────────────────────────────────────────── */

const DEFAULT_VALID_WEEKDAYS = Object.freeze([2, 3, 4]);
const DEFAULT_INTER_EYE_GAP_DAYS = 14;

function cloneDefaultWeekdays() {
  return [...DEFAULT_VALID_WEEKDAYS];
}

function normalizeValidWeekdays(weekdays) {
  if (!Array.isArray(weekdays)) return cloneDefaultWeekdays();
  const sanitized = [...new Set(
    weekdays.map(d => Number(d)).filter(d => Number.isInteger(d) && d >= 0 && d <= 6),
  )].sort((a, b) => a - b);
  return sanitized.length > 0 ? sanitized : cloneDefaultWeekdays();
}

function loadScheduleConfig() {
  if (typeof window !== 'undefined' && window.THERAPY_PLANNER_CONFIG) {
    return window.THERAPY_PLANNER_CONFIG;
  }
  if (typeof module !== 'undefined' && module.exports && typeof require === 'function') {
    try {
      return require('./config/scheduleConfig.json');
    } catch (error) {
      console.warn('Unable to load schedule configuration file, falling back to defaults.', error);
    }
  }
  return { validAppointmentWeekdays: cloneDefaultWeekdays() };
}

/**
 * Strip time components; returns a new Date at local calendar midnight.
 */
function normalizeDate(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * Add `days` calendar days to `date` using setDate() — DST-safe.
 */
function addCalendarDays(date, days) {
  const d = normalizeDate(date);
  d.setDate(d.getDate() + days);
  return d;
}

/**
 * Return (dateB − dateA) in whole calendar days.
 * Math.round absorbs the ±1 h DST offset present between two local-midnight values.
 */
function calendarDayDifference(dateA, dateB) {
  return Math.round(
    (normalizeDate(dateB).getTime() - normalizeDate(dateA).getTime()) /
    (24 * 60 * 60 * 1000),
  );
}

class TherapyPlanner {
  constructor(config, options) {
    if (config === undefined || config === null) config = loadScheduleConfig();
    options = options || {};

    this.listeners = [];

    const todayRaw = (options.today instanceof Date) ? options.today : new Date();
    this.today = normalizeDate(todayRaw);

    this.daysToCheck = normalizeValidWeekdays(config && config.validAppointmentWeekdays);

    const rawGap = config && config.interEyeGapDays;
    this.interEyeGapDays = (typeof rawGap === 'number' && Number.isInteger(rawGap) && rawGap > 0)
      ? rawGap
      : DEFAULT_INTER_EYE_GAP_DAYS;

    const rightFirst = this.nextClinicDate(this.today);
    const leftFirst = this.nextClinicDate(addCalendarDays(rightFirst, this.interEyeGapDays));

    this.schedule = {
      [TherapyPlanner.RIGHTEYE]: [
        { type: TherapyPlanner.RIGHTEYE, minWeeks: 4, earliestSameEyeDate: normalizeDate(this.today), plannedDate: normalizeDate(rightFirst), status: TherapyPlanner.STATUS_PLANNED },
        { type: TherapyPlanner.RIGHTEYE, minWeeks: 4, earliestSameEyeDate: null, plannedDate: null, status: TherapyPlanner.STATUS_PLANNED },
        { type: TherapyPlanner.RIGHTEYE, minWeeks: 4, earliestSameEyeDate: null, plannedDate: null, status: TherapyPlanner.STATUS_PLANNED },
      ],
      [TherapyPlanner.LEFTEYE]: [
        { type: TherapyPlanner.LEFTEYE, minWeeks: 4, earliestSameEyeDate: normalizeDate(this.today), plannedDate: normalizeDate(leftFirst), status: TherapyPlanner.STATUS_PLANNED },
        { type: TherapyPlanner.LEFTEYE, minWeeks: 4, earliestSameEyeDate: null, plannedDate: null, status: TherapyPlanner.STATUS_PLANNED },
        { type: TherapyPlanner.LEFTEYE, minWeeks: 4, earliestSameEyeDate: null, plannedDate: null, status: TherapyPlanner.STATUS_PLANNED },
      ],
    };

    const frozenInit = new Set([
      `${TherapyPlanner.RIGHTEYE}_0`,
      `${TherapyPlanner.LEFTEYE}_0`,
    ]);
    this._iterateCascade(frozenInit, null);
  }

  static get RIGHTEYE() { return 'RIGHTEYE'; }
  static get LEFTEYE() { return 'LEFTEYE'; }
  static get MINWEEKS() { return [4, 6, 8, 10, 12, 14, 16]; }
  static get INTER_EYE_GAP_DAYS() { return DEFAULT_INTER_EYE_GAP_DAYS; }
  static get DEFAULT_VALID_WEEKDAYS() { return cloneDefaultWeekdays(); }
  static get STATUS_PLANNED() { return 'planned'; }
  static get STATUS_COMPLETED() { return 'completed'; }

  _otherEye(type) {
    return type === TherapyPlanner.RIGHTEYE ? TherapyPlanner.LEFTEYE : TherapyPlanner.RIGHTEYE;
  }

  isClinicDate(date) {
    return this.daysToCheck.includes(normalizeDate(date).getDay());
  }

  /** @deprecated Use isClinicDate */
  isValidWorkingDays(date) { return this.isClinicDate(date); }

  nextClinicDate(date) {
    let d = normalizeDate(date);
    while (!this.daysToCheck.includes(d.getDay())) {
      d = addCalendarDays(d, 1);
    }
    return d;
  }

  /** @deprecated Use nextClinicDate */
  getNextValidDate(startDate) { return this.nextClinicDate(startDate); }

  weeksToDays(weeks) { return weeks * 7; }

  /**
   * Find the earliest clinic date >= startDate that is at least
   * interEyeGapDays calendar days from every date in otherEyeDates.
   */
  _findValidDate(startDate, otherEyeDates) {
    let candidate = this.nextClinicDate(startDate);
    for (let guard = 0; guard < 3650; guard++) {
      let conflict = null;
      for (const od of otherEyeDates) {
        if (!(od instanceof Date)) continue;
        if (Math.abs(calendarDayDifference(candidate, od)) < this.interEyeGapDays) {
          conflict = od;
          break;
        }
      }
      if (!conflict) return candidate;
      candidate = this.nextClinicDate(addCalendarDays(conflict, this.interEyeGapDays));
    }
    return candidate;
  }

  _cloneSchedule() {
    const clone = {};
    for (const eye of [TherapyPlanner.RIGHTEYE, TherapyPlanner.LEFTEYE]) {
      clone[eye] = this.schedule[eye].map(s => ({
        type: s.type,
        minWeeks: s.minWeeks,
        earliestSameEyeDate: s.earliestSameEyeDate instanceof Date ? normalizeDate(s.earliestSameEyeDate) : null,
        plannedDate: s.plannedDate instanceof Date ? normalizeDate(s.plannedDate) : null,
        status: s.status,
      }));
    }
    return clone;
  }

  /**
   * Recompute one session in-place. Returns true when plannedDate changed.
   * Minimal disruption: does not move the session earlier than its snapshot date.
   */
  _recomputeSession(type, i, snapshot) {
    const plan = this.schedule[type];
    const session = plan[i];
    const otherEye = this._otherEye(type);

    let lowerBound = normalizeDate(this.today);

    if (i > 0) {
      const prev = plan[i - 1];
      if (prev.plannedDate instanceof Date) {
        const sameEyeLower = addCalendarDays(prev.plannedDate, session.minWeeks * 7);
        session.earliestSameEyeDate = normalizeDate(sameEyeLower);
        if (sameEyeLower > lowerBound) lowerBound = normalizeDate(sameEyeLower);
      }
    }

    if (snapshot) {
      const entry = snapshot[type] && snapshot[type][i];
      const preEdit = entry && entry.plannedDate;
      if (preEdit instanceof Date && preEdit > lowerBound) lowerBound = preEdit;
    }

    const otherEyeDates = this.schedule[otherEye]
      .filter(s => s.plannedDate instanceof Date)
      .map(s => s.plannedDate);

    const current = session.plannedDate;
    if (current instanceof Date && current >= lowerBound && this.isClinicDate(current)) {
      const crossOk = otherEyeDates.every(
        od => Math.abs(calendarDayDifference(current, od)) >= this.interEyeGapDays,
      );
      if (crossOk) return false;
    }

    const newDate = this._findValidDate(lowerBound, otherEyeDates);
    const changed = !(current instanceof Date) || current.getTime() !== newDate.getTime();
    if (changed) session.plannedDate = newDate;
    return changed;
  }

  /**
   * Iteratively recompute all sessions not in frozenSet until stable.
   * Completed sessions are always skipped — they are fixed historical anchors.
   */
  _iterateCascade(frozenSet, snapshot) {
    const eyes = [TherapyPlanner.RIGHTEYE, TherapyPlanner.LEFTEYE];
    const total = eyes.reduce((s, e) => s + this.schedule[e].length, 0);
    let changed = true;
    let maxIter = total * total + 10;

    while (changed && maxIter-- > 0) {
      changed = false;
      for (const type of eyes) {
        for (let i = 0; i < this.schedule[type].length; i++) {
          // Completed appointments are always fixed — never recomputed by cascade
          if (this.schedule[type][i].status === TherapyPlanner.STATUS_COMPLETED) continue;
          if (frozenSet && frozenSet.has(`${type}_${i}`)) continue;
          if (this._recomputeSession(type, i, snapshot)) changed = true;
        }
      }
    }
  }

  /**
   * Validate the full schedule against all invariants.
   * Returns { valid: true } or { valid: false, violations: string[] }.
   *
   * Historical exceptions:
   *  – Completed appointments may be on any weekday (no clinic-day check).
   *  – Completed-to-completed pairs are not checked for same-eye interval.
   *  – Completed-to-completed pairs are not checked for cross-eye gap.
   */
  validateSchedule(schedule) {
    schedule = schedule || this.schedule;
    const violations = [];
    const COMPLETED = TherapyPlanner.STATUS_COMPLETED;
    const PLANNED = TherapyPlanner.STATUS_PLANNED;
    const DAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    for (const eye of [TherapyPlanner.RIGHTEYE, TherapyPlanner.LEFTEYE]) {
      const plan = schedule[eye];
      let seenPlanned = false;

      for (let i = 0; i < plan.length; i++) {
        const s = plan[i];

        // Invariant 1: valid status value
        if (s.status !== COMPLETED && s.status !== PLANNED) {
          violations.push(`${eye}[${i}]: invalid status '${s.status}'`);
          continue;
        }

        // Invariant 2: completed appointments form a contiguous prefix
        if (s.status === COMPLETED && seenPlanned) {
          violations.push(`${eye}[${i}]: completed appointment appears after a planned appointment`);
        }
        if (s.status === PLANNED) seenPlanned = true;

        // Date must be a valid Date object
        if (!(s.plannedDate instanceof Date) || isNaN(s.plannedDate.getTime())) {
          violations.push(`${eye}[${i}]: plannedDate is not a valid Date`);
          continue;
        }

        // Invariant 3: no completed appointment is after today
        if (s.status === COMPLETED && calendarDayDifference(this.today, s.plannedDate) > 0) {
          violations.push(`${eye}[${i}]: completed appointment (${s.plannedDate.toLocaleDateString()}) is after today`);
        }

        // Invariant 4: no planned appointment is before today
        if (s.status === PLANNED && calendarDayDifference(this.today, s.plannedDate) < 0) {
          violations.push(`${eye}[${i}]: planned appointment (${s.plannedDate.toLocaleDateString()}) is before today`);
        }

        // Invariant 5: completed appointments are chronologically ordered
        if (s.status === COMPLETED && i > 0 && plan[i - 1].status === COMPLETED
            && plan[i - 1].plannedDate instanceof Date) {
          const diff = calendarDayDifference(plan[i - 1].plannedDate, s.plannedDate);
          if (diff <= 0) {
            violations.push(`${eye}[${i}]: completed appointment is not strictly after the previous completed appointment`);
          }
        }

        // Invariant 8: every planned appointment is on a configured clinic day
        if (s.status === PLANNED && !this.isClinicDate(s.plannedDate)) {
          violations.push(`${eye}[${i}]: planned appointment on ${DAY[s.plannedDate.getDay()]}, which is not a clinic day`);
        }

        // Invariant 9: every planned appointment respects the same-eye interval from
        // its predecessor (whether completed or planned)
        if (s.status === PLANNED && i > 0 && plan[i - 1].plannedDate instanceof Date) {
          const diff = calendarDayDifference(plan[i - 1].plannedDate, s.plannedDate);
          const req = s.minWeeks * 7;
          if (diff < req) {
            violations.push(`${eye}[${i}]: interval ${diff} days < required ${req} (${s.minWeeks} weeks)`);
          }
        }
      }
    }

    // Invariant 10: cross-eye gap — enforced when at least one appointment is planned
    const rPlan = schedule[TherapyPlanner.RIGHTEYE];
    const lPlan = schedule[TherapyPlanner.LEFTEYE];
    for (let ri = 0; ri < rPlan.length; ri++) {
      for (let li = 0; li < lPlan.length; li++) {
        const r = rPlan[ri];
        const l = lPlan[li];
        // Skip completed-vs-completed pairs — historical exceptions are accepted
        if (r.status === COMPLETED && l.status === COMPLETED) continue;
        const rDate = r.plannedDate;
        const lDate = l.plannedDate;
        if (!(rDate instanceof Date) || !(lDate instanceof Date)) continue;
        const diff = Math.abs(calendarDayDifference(rDate, lDate));
        if (diff < this.interEyeGapDays) {
          violations.push(
            `RIGHTEYE[${ri}] and LEFTEYE[${li}]: ${diff} day(s) apart (minimum ${this.interEyeGapDays})`,
          );
        }
      }
    }

    return violations.length === 0 ? { valid: true } : { valid: false, violations };
  }

  getPlanByEye(eye) {
    return this.schedule[eye || TherapyPlanner.RIGHTEYE];
  }

  addListener(listener) { this.listeners.push(listener); }
  notifyListeners() { this.listeners.forEach(l => l()); }

  /**
   * Attempt to set the planned/historical date for session `index` of `type`.
   *
   * For planned sessions: existing validation rules apply (clinic day, intervals,
   * cross-eye gap against all other-eye appointments).
   *
   * For completed sessions: only historical rules apply — date must be ≤ today,
   * same-eye ordering must remain strict, no clinic-day restriction (warning only).
   *
   * Returns { success: true, warnings: [] } or { success: false, reason, message }.
   */
  updateDateFor(type, index, date) {
    if (!(date instanceof Date) || isNaN(date.getTime())) {
      return { success: false, reason: 'INVALID_DATE', message: 'The provided date is not valid.' };
    }

    const plan = this.schedule[type];
    if (!plan || index < 0 || index >= plan.length) {
      return { success: false, reason: 'INVALID_INDEX', message: 'Invalid session index.' };
    }

    const nd = normalizeDate(date);
    const session = plan[index];

    // ── Completed appointment ──────────────────────────────────────────────
    if (session.status === TherapyPlanner.STATUS_COMPLETED) {
      if (calendarDayDifference(this.today, nd) > 0) {
        return { success: false, reason: 'COMPLETED_AFTER_TODAY', message: 'A completed appointment cannot be dated after today.' };
      }

      // Same-eye strict chronological ordering with adjacent completed sessions
      if (index > 0 && plan[index - 1].status === TherapyPlanner.STATUS_COMPLETED
          && plan[index - 1].plannedDate instanceof Date) {
        if (calendarDayDifference(plan[index - 1].plannedDate, nd) <= 0) {
          return { success: false, reason: 'CHRONOLOGICAL_ORDER', message: 'The date must be strictly after the previous completed appointment.' };
        }
      }
      if (index + 1 < plan.length && plan[index + 1].status === TherapyPlanner.STATUS_COMPLETED
          && plan[index + 1].plannedDate instanceof Date) {
        if (calendarDayDifference(nd, plan[index + 1].plannedDate) <= 0) {
          return { success: false, reason: 'CHRONOLOGICAL_ORDER', message: 'The date must be strictly before the next completed appointment.' };
        }
      }

      const warnings = [];
      if (!this.isClinicDate(nd)) {
        warnings.push('This completed appointment falls outside the currently configured clinic days. It will still be saved as historical data.');
      }

      const snapshot = this._cloneSchedule();
      session.plannedDate = nd;
      // All planned sessions are mutable; completed are auto-frozen in cascade
      this._iterateCascade(null, snapshot);

      const v = this.validateSchedule();
      if (!v.valid) {
        this.schedule = snapshot;
        return { success: false, reason: 'VALIDATION_FAILED', message: v.violations.join('; ') };
      }

      this.notifyListeners();
      return { success: true, changedAppointments: [], warnings };
    }

    // ── Planned appointment ────────────────────────────────────────────────
    if (calendarDayDifference(this.today, nd) < 0) {
      return { success: false, reason: 'BEFORE_TODAY', message: 'The selected date cannot be before today.' };
    }

    if (!this.isClinicDate(nd)) {
      const DAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      return {
        success: false,
        reason: 'NOT_CLINIC_DAY',
        message: `${DAY[nd.getDay()]} is not a configured clinic day.`,
      };
    }

    if (index > 0 && plan[index - 1].plannedDate instanceof Date) {
      const diff = calendarDayDifference(plan[index - 1].plannedDate, nd);
      const req = plan[index].minWeeks * 7;
      if (diff < req) {
        return {
          success: false,
          reason: 'SAME_EYE_INTERVAL',
          message: `The selected date is ${diff} calendar days after the previous session; minimum is ${req} days (${plan[index].minWeeks} weeks).`,
        };
      }
    }

    // Cross-eye pre-validation against every other-eye appointment.
    // Completed other-eye appointments are fixed; planned ones that come after
    // the target date will cascade.
    const otherEye = this._otherEye(type);
    for (const os of this.schedule[otherEye]) {
      if (!(os.plannedDate instanceof Date)) continue;
      const diff = calendarDayDifference(os.plannedDate, nd); // nd − os.date
      if (diff === 0) {
        return { success: false, reason: 'INTER_EYE_GAP', message: 'Same-day bilateral appointments are not allowed.' };
      }
      // For completed other-eye appointments (which cannot move): check both directions.
      // For planned other-eye appointments that precede nd: they are fixed by cascade logic.
      const absDiff = Math.abs(diff);
      const isFixed = os.status === TherapyPlanner.STATUS_COMPLETED || diff > 0;
      if (isFixed && absDiff < this.interEyeGapDays) {
        const eyeLabel = otherEye === TherapyPlanner.LEFTEYE ? 'left' : 'right';
        return {
          success: false,
          reason: 'INTER_EYE_GAP',
          message: `The selected date is only ${absDiff} day(s) from a ${eyeLabel}-eye appointment. Minimum separation is ${this.interEyeGapDays} days.`,
        };
      }
    }

    const snapshot = this._cloneSchedule();
    this.schedule[type][index].plannedDate = nd;

    // Build frozen set: same-eye sessions 0..index, plus other-eye sessions
    // whose pre-edit date precedes the selected date (they are anchors, not cascaded).
    const frozenSet = new Set();
    for (let i = 0; i <= index; i++) frozenSet.add(`${type}_${i}`);
    for (let i = 0; i < this.schedule[otherEye].length; i++) {
      const pe = snapshot[otherEye][i] && snapshot[otherEye][i].plannedDate;
      if (pe instanceof Date && calendarDayDifference(pe, nd) > 0) {
        frozenSet.add(`${otherEye}_${i}`);
      }
    }

    this._iterateCascade(frozenSet, snapshot);

    const v = this.validateSchedule();
    if (!v.valid) {
      this.schedule = snapshot;
      return { success: false, reason: 'VALIDATION_FAILED', message: v.violations.join('; ') };
    }

    this.notifyListeners();
    return { success: true, changedAppointments: [], warnings: [] };
  }

  /**
   * Attempt to change minWeeks for session `index` of `type`.
   * Returns { success: true } or { success: false, reason, message }.
   */
  updateMinWeeksFor(type, index, minWeeks) {
    const parsed = parseInt(minWeeks);
    if (!TherapyPlanner.MINWEEKS.includes(parsed)) {
      return {
        success: false,
        reason: 'INVALID_MINWEEKS',
        message: `minWeeks must be one of ${TherapyPlanner.MINWEEKS.join(', ')}.`,
      };
    }
    const plan = this.schedule[type];
    if (!plan || index < 0 || index >= plan.length) {
      return { success: false, reason: 'INVALID_INDEX', message: 'Invalid session index.' };
    }

    const snapshot = this._cloneSchedule();
    plan[index].minWeeks = parsed;

    // Freeze only sessions before index in the same eye; everything else may cascade.
    const frozenSet = new Set();
    for (let i = 0; i < index; i++) frozenSet.add(`${type}_${i}`);

    this._iterateCascade(frozenSet, snapshot);

    const v = this.validateSchedule();
    if (!v.valid) {
      this.schedule = snapshot;
      return { success: false, reason: 'VALIDATION_FAILED', message: v.violations.join('; ') };
    }

    this.notifyListeners();
    return { success: true };
  }

  /**
   * Attempt to change the status of session `index` of `type`.
   *
   * setStatus(type, index, 'completed', date)
   *   – date must be ≤ today
   *   – the session must belong to the completed prefix (all earlier sessions
   *     in the same eye must already be completed)
   *   – the date must be strictly after any preceding completed appointment
   *   – cascade recalculates all subsequent planned appointments
   *   – returns { success, warnings? } or { success: false, reason, message }
   *
   * setStatus(type, index, 'planned')
   *   – the session must be the last completed appointment in the eye
   *   – cascade recalculates the converted session and all that follow
   *   – returns { success } or { success: false, reason, message }
   */
  setStatus(type, index, newStatus, date) {
    const plan = this.schedule[type];
    if (!plan || index < 0 || index >= plan.length) {
      return { success: false, reason: 'INVALID_INDEX', message: 'Invalid session index.' };
    }

    if (newStatus === TherapyPlanner.STATUS_COMPLETED) {
      const nd = date instanceof Date ? normalizeDate(date) : null;
      if (!nd || isNaN(nd.getTime())) {
        return { success: false, reason: 'INVALID_DATE', message: 'A date is required when marking an appointment as completed.' };
      }

      if (calendarDayDifference(this.today, nd) > 0) {
        return { success: false, reason: 'COMPLETED_AFTER_TODAY', message: 'A completed appointment cannot be dated after today.' };
      }

      // Prefix check: all sessions before index must already be completed
      for (let i = 0; i < index; i++) {
        if (plan[i].status !== TherapyPlanner.STATUS_COMPLETED) {
          return { success: false, reason: 'NOT_PREFIX', message: 'Completed appointments must appear before planned appointments.' };
        }
      }

      // Chronological ordering with the preceding completed appointment
      if (index > 0 && plan[index - 1].status === TherapyPlanner.STATUS_COMPLETED
          && plan[index - 1].plannedDate instanceof Date) {
        if (calendarDayDifference(plan[index - 1].plannedDate, nd) <= 0) {
          return { success: false, reason: 'CHRONOLOGICAL_ORDER', message: 'The date must be strictly after the previous completed appointment.' };
        }
      }

      const warnings = [];
      if (!this.isClinicDate(nd)) {
        warnings.push('This completed appointment falls outside the currently configured clinic days. It will still be saved as historical data.');
      }

      const snapshot = this._cloneSchedule();
      plan[index].status = TherapyPlanner.STATUS_COMPLETED;
      plan[index].plannedDate = nd;
      // All planned sessions cascade; completed are auto-frozen
      this._iterateCascade(null, snapshot);

      const v = this.validateSchedule();
      if (!v.valid) {
        this.schedule = snapshot;
        return { success: false, reason: 'VALIDATION_FAILED', message: v.violations.join('; ') };
      }

      this.notifyListeners();
      return { success: true, warnings };
    }

    if (newStatus === TherapyPlanner.STATUS_PLANNED) {
      // The session must be the last completed in its eye
      for (let i = index + 1; i < plan.length; i++) {
        if (plan[i].status === TherapyPlanner.STATUS_COMPLETED) {
          return { success: false, reason: 'NOT_LAST_COMPLETED', message: 'Only the last completed appointment can be converted back to planned.' };
        }
      }

      const snapshot = this._cloneSchedule();
      plan[index].status = TherapyPlanner.STATUS_PLANNED;

      // If the stored date is in the past, start the cascade from today
      if (!(plan[index].plannedDate instanceof Date)
          || calendarDayDifference(this.today, plan[index].plannedDate) < 0) {
        plan[index].plannedDate = normalizeDate(this.today);
      }

      // Freeze sessions before index (all completed, auto-frozen anyway)
      const frozenSet = new Set();
      for (let i = 0; i < index; i++) frozenSet.add(`${type}_${i}`);
      this._iterateCascade(frozenSet, snapshot);

      const v = this.validateSchedule();
      if (!v.valid) {
        this.schedule = snapshot;
        return { success: false, reason: 'VALIDATION_FAILED', message: v.violations.join('; ') };
      }

      this.notifyListeners();
      return { success: true, warnings: [] };
    }

    return { success: false, reason: 'INVALID_STATUS', message: `Unknown status '${newStatus}'.` };
  }

  addTherapy(type) {
    const snapshot = this._cloneSchedule();

    this.schedule[type].push({ type, minWeeks: 4, earliestSameEyeDate: null, plannedDate: null, status: TherapyPlanner.STATUS_PLANNED });

    const newIndex = this.schedule[type].length - 1;
    const frozenSet = new Set();
    for (let i = 0; i < newIndex; i++) frozenSet.add(`${type}_${i}`);

    this._iterateCascade(frozenSet, snapshot);

    const v = this.validateSchedule();
    if (!v.valid) {
      this.schedule = snapshot;
      return false;
    }

    this.notifyListeners();
    return true;
  }

  removeTherapy(type) {
    if (this.schedule[type].length <= 1) return false;

    const snapshot = this._cloneSchedule();
    this.schedule[type].pop();

    const v = this.validateSchedule();
    if (!v.valid) {
      this.schedule = snapshot;
      return false;
    }

    this.notifyListeners();
    return true;
  }
}

if (typeof module !== 'undefined') {
  module.exports = TherapyPlanner;
}

