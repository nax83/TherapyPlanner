/* ─── TherapyPlanner.js ──────────────────────────────────────────────────────
 * Scheduling engine for intravitreal injection therapy.
 *
 * Appointment statuses
 * ────────────────────
 * 'planned'   – a current or future injection that has not yet occurred.
 * 'completed' – an injection that already took place (historical fact).
 *
 * Date origins (planned appointments only)
 * ────────────────────────────────────────
 * 'generated' – automatically assigned by the scheduling engine.  May be
 *               rebuilt to an earlier date during historical reconstruction.
 * 'confirmed' – explicitly selected or accepted by the user.  Never moves
 *               backward automatically.
 *
 * Cascade algorithm
 * ─────────────────
 * A deterministic single-pass cascade separates fixed appointments (completed,
 * same-eye predecessors, the edited anchor, opposite-eye appointments earlier
 * than the edit date) from mutable ones.  Mutable appointments are processed
 * in stable chronological order based on the pre-operation snapshot date,
 * validating each only against already-finalised appointments — not against
 * future mutable ones.  This produces the earliest valid minimally-disruptive
 * schedule.
 *
 * Cross-eye gap enforcement
 * ─────────────────────────
 * Enforced for every pair where at least one appointment is 'planned'.
 * Completed-vs-completed pairs are exempt (historical exceptions accepted).
 * ─────────────────────────────────────────────────────────────────────────── */

const DATE_ORIGIN_GENERATED = 'generated';
const DATE_ORIGIN_CONFIRMED  = 'confirmed';

const DEFAULT_VALID_WEEKDAYS    = Object.freeze([2, 3, 4]);
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
    try { return require('./config/scheduleConfig.json'); } catch (e) {
      console.warn('Unable to load schedule configuration file, falling back to defaults.', e);
    }
  }
  return { validAppointmentWeekdays: cloneDefaultWeekdays() };
}

/** Strip time — returns a new Date at local calendar midnight. */
function normalizeDate(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Add `days` calendar days — DST-safe. */
function addCalendarDays(date, days) {
  const d = normalizeDate(date);
  d.setDate(d.getDate() + days);
  return d;
}

/**
 * (dateB − dateA) in whole calendar days.
 * Math.round absorbs the ±1 h DST offset between two local-midnight values.
 */
function calendarDayDifference(dateA, dateB) {
  return Math.round(
    (normalizeDate(dateB).getTime() - normalizeDate(dateA).getTime()) /
    (24 * 60 * 60 * 1000),
  );
}

/** Format a Date as 'YYYY-MM-DD'. */
function fmtDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// ─────────────────────────────────────────────────────────────────────────────

class TherapyPlanner {
  constructor(config, options) {
    if (config === undefined || config === null) config = loadScheduleConfig();
    options = options || {};

    this.listeners = [];

    const todayRaw = (options.today instanceof Date) ? options.today : new Date();
    this.today = normalizeDate(todayRaw);

    this.daysToCheck = normalizeValidWeekdays(config && config.validAppointmentWeekdays);

    const rawGap = config && config.interEyeGapDays;
    this.interEyeGapDays =
      (typeof rawGap === 'number' && Number.isInteger(rawGap) && rawGap > 0)
        ? rawGap
        : DEFAULT_INTER_EYE_GAP_DAYS;

    const rightFirst = this.nextClinicDate(this.today);
    const leftFirst  = this.nextClinicDate(addCalendarDays(rightFirst, this.interEyeGapDays));

    this.schedule = {
      [TherapyPlanner.RIGHTEYE]: [
        this._makeAppt(TherapyPlanner.RIGHTEYE, 4, normalizeDate(this.today), normalizeDate(rightFirst)),
        this._makeAppt(TherapyPlanner.RIGHTEYE, 4, null, null),
        this._makeAppt(TherapyPlanner.RIGHTEYE, 4, null, null),
      ],
      [TherapyPlanner.LEFTEYE]: [
        this._makeAppt(TherapyPlanner.LEFTEYE, 4, normalizeDate(this.today), normalizeDate(leftFirst)),
        this._makeAppt(TherapyPlanner.LEFTEYE, 4, null, null),
        this._makeAppt(TherapyPlanner.LEFTEYE, 4, null, null),
      ],
    };

    const snapshot  = this._cloneSchedule();
    const fixedKeys = new Set([`${TherapyPlanner.RIGHTEYE}_0`, `${TherapyPlanner.LEFTEYE}_0`]);
    this._cascade(snapshot, fixedKeys, this._allPlannedKeys(fixedKeys));
  }

  // ── static identifiers ──────────────────────────────────────────────────────
  static get RIGHTEYE()              { return 'RIGHTEYE'; }
  static get LEFTEYE()               { return 'LEFTEYE'; }
  static get MINWEEKS()              { return [4, 6, 8, 10, 12, 14, 16]; }
  static get INTER_EYE_GAP_DAYS()    { return DEFAULT_INTER_EYE_GAP_DAYS; }
  static get DEFAULT_VALID_WEEKDAYS(){ return cloneDefaultWeekdays(); }
  static get STATUS_PLANNED()        { return 'planned'; }
  static get STATUS_COMPLETED()      { return 'completed'; }
  static get DATE_ORIGIN_GENERATED() { return DATE_ORIGIN_GENERATED; }
  static get DATE_ORIGIN_CONFIRMED() { return DATE_ORIGIN_CONFIRMED; }

  // ── private helpers ─────────────────────────────────────────────────────────

  _otherEye(type) {
    return type === TherapyPlanner.RIGHTEYE ? TherapyPlanner.LEFTEYE : TherapyPlanner.RIGHTEYE;
  }

  _makeAppt(type, minWeeks, earliestSameEyeDate, plannedDate) {
    return {
      type,
      minWeeks,
      earliestSameEyeDate,
      plannedDate,
      status:     TherapyPlanner.STATUS_PLANNED,
      dateOrigin: DATE_ORIGIN_GENERATED,
    };
  }

  /** Keys for all planned (non-completed) appointments not in excludeKeys. */
  _allPlannedKeys(excludeKeys) {
    const keys = new Set();
    for (const eye of [TherapyPlanner.RIGHTEYE, TherapyPlanner.LEFTEYE]) {
      for (let i = 0; i < this.schedule[eye].length; i++) {
        const key = `${eye}_${i}`;
        if (!excludeKeys.has(key) &&
            this.schedule[eye][i].status !== TherapyPlanner.STATUS_COMPLETED) {
          keys.add(key);
        }
      }
    }
    return keys;
  }

  _cloneSchedule() {
    const clone = {};
    for (const eye of [TherapyPlanner.RIGHTEYE, TherapyPlanner.LEFTEYE]) {
      clone[eye] = this.schedule[eye].map(s => ({
        type:               s.type,
        minWeeks:           s.minWeeks,
        earliestSameEyeDate: s.earliestSameEyeDate instanceof Date
          ? normalizeDate(s.earliestSameEyeDate) : null,
        plannedDate: s.plannedDate instanceof Date ? normalizeDate(s.plannedDate) : null,
        status:      s.status,
        dateOrigin:  s.dateOrigin || DATE_ORIGIN_GENERATED,
      }));
    }
    return clone;
  }

  isClinicDate(date) {
    return this.daysToCheck.includes(normalizeDate(date).getDay());
  }
  /** @deprecated */
  isValidWorkingDays(date) { return this.isClinicDate(date); }

  nextClinicDate(date) {
    let d = normalizeDate(date);
    while (!this.daysToCheck.includes(d.getDay())) d = addCalendarDays(d, 1);
    return d;
  }
  /** @deprecated */
  getNextValidDate(startDate) { return this.nextClinicDate(startDate); }

  weeksToDays(weeks) { return weeks * 7; }

  /**
   * Earliest clinic date >= startDate that is at least interEyeGapDays from
   * every date in otherEyeDates.
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

  /**
   * Schedule one mutable planned appointment to its earliest valid date.
   * Uses ONLY `finalized` keys for cross-eye validation — not future mutable ones.
   * Confirmed dates never move backward (their confirmed date is included in lowerBound).
   * Generated dates are rebuilt to max(today, prevSameEye + interval).
   */
  _scheduleMutable(type, i, finalized) {
    const plan    = this.schedule[type];
    const session = plan[i];
    const other   = this._otherEye(type);

    let lowerBound = normalizeDate(this.today);

    if (i > 0) {
      const prev = plan[i - 1];
      if (prev.plannedDate instanceof Date) {
        const sameEyeLower = addCalendarDays(prev.plannedDate, session.minWeeks * 7);
        session.earliestSameEyeDate = normalizeDate(sameEyeLower);
        if (sameEyeLower > lowerBound) lowerBound = normalizeDate(sameEyeLower);
      }
    } else {
      session.earliestSameEyeDate = normalizeDate(this.today);
    }

    // Confirmed dates never move backward
    if (session.dateOrigin === DATE_ORIGIN_CONFIRMED && session.plannedDate instanceof Date) {
      const floor = normalizeDate(session.plannedDate);
      if (floor > lowerBound) lowerBound = floor;
    }

    // Cross-eye: only finalized other-eye appointments
    const otherEyeDates = [];
    for (let j = 0; j < this.schedule[other].length; j++) {
      if (finalized.has(`${other}_${j}`)) {
        const od = this.schedule[other][j].plannedDate;
        if (od instanceof Date) otherEyeDates.push(od);
      }
    }

    session.plannedDate = this._findValidDate(lowerBound, otherEyeDates);
  }

  /**
   * Deterministic cascade.
   *
   * Mutable appointments are processed in stable chronological order
   * (by pre-operation snapshot date).  Tiebreak: right before left, lower
   * index first.  A same-eye predecessor must be finalised before its successor.
   */
  _cascade(snapshot, fixedKeys, mutableKeys) {
    // Build sorted work list from snapshot dates
    const items = [];
    for (const key of mutableKeys) {
      const under = key.lastIndexOf('_');
      const type  = key.slice(0, under);
      const i     = parseInt(key.slice(under + 1), 10);
      const snap  = snapshot[type] && snapshot[type][i];
      items.push({ type, i, key, snapDate: snap ? snap.plannedDate : null });
    }

    items.sort((a, b) => {
      const ta = a.snapDate instanceof Date ? a.snapDate.getTime() : Infinity;
      const tb = b.snapDate instanceof Date ? b.snapDate.getTime() : Infinity;
      if (ta !== tb) return ta - tb;
      const eo = t => t === TherapyPlanner.RIGHTEYE ? 0 : 1;
      if (a.type !== b.type) return eo(a.type) - eo(b.type);
      return a.i - b.i;
    });

    // Initialise finalized set: fixed keys + all completed (always immutable)
    const finalized = new Set(fixedKeys);
    for (const eye of [TherapyPlanner.RIGHTEYE, TherapyPlanner.LEFTEYE]) {
      for (let i = 0; i < this.schedule[eye].length; i++) {
        if (this.schedule[eye][i].status === TherapyPlanner.STATUS_COMPLETED) {
          finalized.add(`${eye}_${i}`);
        }
      }
    }

    const remaining = [...items];
    let guard = remaining.length * remaining.length + 20;

    while (remaining.length > 0 && guard-- > 0) {
      // Pick first item in sorted order whose same-eye predecessor is finalised
      let idx = -1;
      for (let j = 0; j < remaining.length; j++) {
        const { type, i } = remaining[j];
        const predKey = i > 0 ? `${type}_${i - 1}` : null;
        if (!predKey || finalized.has(predKey)) { idx = j; break; }
      }
      if (idx === -1) break; // no progress — should not happen

      const { type, i, key } = remaining.splice(idx, 1)[0];
      this._scheduleMutable(type, i, finalized);
      finalized.add(key);
    }
  }

  /** Compare snapshot vs current schedule; return appointments whose date changed. */
  _buildChangedAppointments(snapshot) {
    const changed = [];
    for (const eye of [TherapyPlanner.RIGHTEYE, TherapyPlanner.LEFTEYE]) {
      const prev = snapshot[eye];
      const curr = this.schedule[eye];
      const len  = Math.max(prev ? prev.length : 0, curr.length);
      for (let i = 0; i < len; i++) {
        const ps = prev && prev[i];
        const cs = curr[i];
        if (!cs) continue;
        const oldDate = ps ? ps.plannedDate : null;
        const newDate = cs.plannedDate;
        const ot = oldDate instanceof Date ? oldDate.getTime() : null;
        const nt = newDate instanceof Date ? newDate.getTime() : null;
        if (ot !== nt) {
          changed.push({
            type:       eye,
            index:      i,
            oldDate:    oldDate instanceof Date ? fmtDate(oldDate) : null,
            newDate:    newDate instanceof Date ? fmtDate(newDate) : null,
            status:     cs.status,
            dateOrigin: cs.dateOrigin,
          });
        }
      }
    }
    return changed;
  }

  // ── public schedule queries ──────────────────────────────────────────────────

  getPlanByEye(eye) { return this.schedule[eye || TherapyPlanner.RIGHTEYE]; }
  addListener(listener)  { this.listeners.push(listener); }
  notifyListeners()      { this.listeners.forEach(l => l()); }

  // ── mutations ────────────────────────────────────────────────────────────────

  /**
   * Set the planned/historical date for session `index` of `type`.
   *
   * Planned path  — clinic-day + interval + cross-eye pre-validation against
   *                 fixed appointments; dateOrigin becomes 'confirmed'.
   * Completed path — historical rules only (≤ today, same-eye ordering);
   *                  all generated planned appointments may rebuild backward.
   */
  updateDateFor(type, index, date) {
    if (!(date instanceof Date) || isNaN(date.getTime())) {
      return { success: false, reason: 'INVALID_DATE', message: 'The provided date is not valid.' };
    }
    const plan = this.schedule[type];
    if (!plan || index < 0 || index >= plan.length) {
      return { success: false, reason: 'INVALID_INDEX', message: 'Invalid session index.' };
    }

    const nd      = normalizeDate(date);
    const session = plan[index];

    // ── completed appointment ─────────────────────────────────────────────────
    if (session.status === TherapyPlanner.STATUS_COMPLETED) {
      if (calendarDayDifference(this.today, nd) > 0) {
        return { success: false, reason: 'COMPLETED_AFTER_TODAY',
          message: 'A completed appointment cannot be dated after today.' };
      }

      if (index > 0 &&
          plan[index - 1].status === TherapyPlanner.STATUS_COMPLETED &&
          plan[index - 1].plannedDate instanceof Date) {
        if (calendarDayDifference(plan[index - 1].plannedDate, nd) <= 0) {
          return { success: false, reason: 'CHRONOLOGICAL_ORDER',
            message: 'The date must be strictly after the previous completed appointment.' };
        }
      }
      if (index + 1 < plan.length &&
          plan[index + 1].status === TherapyPlanner.STATUS_COMPLETED &&
          plan[index + 1].plannedDate instanceof Date) {
        if (calendarDayDifference(nd, plan[index + 1].plannedDate) <= 0) {
          return { success: false, reason: 'CHRONOLOGICAL_ORDER',
            message: 'The date must be strictly before the next completed appointment.' };
        }
      }

      const warnings = [];
      if (!this.isClinicDate(nd)) {
        warnings.push(
          'This completed appointment falls outside the currently configured clinic days.' +
          ' It will still be saved as historical data.',
        );
      }

      const snapshot = this._cloneSchedule();
      session.plannedDate = nd;

      // Historical cascade: all planned appointments are mutable
      const fixedKeys  = new Set();
      const mutableKeys = this._allPlannedKeys(fixedKeys);
      this._cascade(snapshot, fixedKeys, mutableKeys);

      const v = this.validateSchedule();
      if (!v.valid) {
        this.schedule = snapshot;
        return { success: false, reason: 'VALIDATION_FAILED', message: v.violations.join('; ') };
      }

      const changedAppointments = this._buildChangedAppointments(snapshot);
      this.notifyListeners();
      return { success: true, changedAppointments, warnings };
    }

    // ── planned appointment ───────────────────────────────────────────────────
    if (calendarDayDifference(this.today, nd) < 0) {
      return { success: false, reason: 'BEFORE_TODAY',
        message: 'The selected date cannot be before today.' };
    }

    if (!this.isClinicDate(nd)) {
      const DAY = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
      return { success: false, reason: 'NOT_CLINIC_DAY',
        message: `${DAY[nd.getDay()]} is not a configured clinic day.` };
    }

    if (index > 0 && plan[index - 1].plannedDate instanceof Date) {
      const diff = calendarDayDifference(plan[index - 1].plannedDate, nd);
      const req  = session.minWeeks * 7;
      if (diff < req) {
        return { success: false, reason: 'SAME_EYE_INTERVAL',
          message: `The selected date is ${diff} calendar days after the previous session;` +
                   ` minimum is ${req} days (${session.minWeeks} weeks).` };
      }
    }

    const otherEye    = this._otherEye(type);
    const snapshot    = this._cloneSchedule();
    const snapOther   = snapshot[otherEye];

    // Build fixed/mutable sets
    const fixedKeys  = new Set();
    const mutableKeys = new Set();

    for (let i = 0; i <= index; i++) fixedKeys.add(`${type}_${i}`);
    for (let i = index + 1; i < plan.length; i++) {
      if (plan[i].status !== TherapyPlanner.STATUS_COMPLETED) mutableKeys.add(`${type}_${i}`);
    }

    // Opposite-eye: snapshotDate < nd  → fixed; snapshotDate >= nd → mutable
    for (let j = 0; j < this.schedule[otherEye].length; j++) {
      if (this.schedule[otherEye][j].status === TherapyPlanner.STATUS_COMPLETED) continue;
      const snapDate = snapOther[j] && snapOther[j].plannedDate;
      // calendarDayDifference(nd, snapDate) = snapDate − nd;  < 0 ⟹ snapDate < nd
      if (snapDate instanceof Date && calendarDayDifference(nd, snapDate) < 0) {
        fixedKeys.add(`${otherEye}_${j}`);
      } else {
        mutableKeys.add(`${otherEye}_${j}`);
      }
    }

    // Pre-validation: reject only against fixed or completed opposite-eye appointments
    for (let j = 0; j < this.schedule[otherEye].length; j++) {
      const oe = this.schedule[otherEye][j];
      if (!(oe.plannedDate instanceof Date)) continue;
      const isFixedOrCompleted =
        oe.status === TherapyPlanner.STATUS_COMPLETED || fixedKeys.has(`${otherEye}_${j}`);
      if (!isFixedOrCompleted) continue;
      const absDiff = Math.abs(calendarDayDifference(oe.plannedDate, nd));
      if (absDiff < this.interEyeGapDays) {
        const label = otherEye === TherapyPlanner.LEFTEYE ? 'left' : 'right';
        if (absDiff === 0) {
          return { success: false, reason: 'INTER_EYE_GAP',
            message: 'Same-day bilateral appointments are not allowed.' };
        }
        return { success: false, reason: 'INTER_EYE_GAP',
          message: `The selected date is only ${absDiff} day(s) from a ${label}-eye` +
                   ` appointment. Minimum separation is ${this.interEyeGapDays} days.` };
      }
    }

    // Apply edit — mark as confirmed anchor
    plan[index].plannedDate = nd;
    plan[index].dateOrigin  = DATE_ORIGIN_CONFIRMED;

    this._cascade(snapshot, fixedKeys, mutableKeys);

    const v = this.validateSchedule();
    if (!v.valid) {
      this.schedule = snapshot;
      return { success: false, reason: 'VALIDATION_FAILED', message: v.violations.join('; ') };
    }

    const changedAppointments = this._buildChangedAppointments(snapshot);
    this.notifyListeners();
    return { success: true, changedAppointments, warnings: [] };
  }

  /**
   * Change the interval for session `index` of `type`.
   * Same-eye predecessors stay fixed; everything else recalculates.
   */
  updateMinWeeksFor(type, index, minWeeks) {
    const parsed = parseInt(minWeeks);
    if (!TherapyPlanner.MINWEEKS.includes(parsed)) {
      return { success: false, reason: 'INVALID_MINWEEKS',
        message: `minWeeks must be one of ${TherapyPlanner.MINWEEKS.join(', ')}.` };
    }
    const plan = this.schedule[type];
    if (!plan || index < 0 || index >= plan.length) {
      return { success: false, reason: 'INVALID_INDEX', message: 'Invalid session index.' };
    }

    const otherEye = this._otherEye(type);
    const snapshot = this._cloneSchedule();
    plan[index].minWeeks = parsed;

    const fixedKeys  = new Set();
    const mutableKeys = new Set();
    for (let i = 0; i < index; i++) fixedKeys.add(`${type}_${i}`);
    for (let i = index; i < plan.length; i++) {
      if (plan[i].status !== TherapyPlanner.STATUS_COMPLETED) mutableKeys.add(`${type}_${i}`);
    }
    for (let j = 0; j < this.schedule[otherEye].length; j++) {
      if (this.schedule[otherEye][j].status !== TherapyPlanner.STATUS_COMPLETED) {
        mutableKeys.add(`${otherEye}_${j}`);
      }
    }

    this._cascade(snapshot, fixedKeys, mutableKeys);

    const v = this.validateSchedule();
    if (!v.valid) {
      this.schedule = snapshot;
      return { success: false, reason: 'VALIDATION_FAILED', message: v.violations.join('; ') };
    }

    const changedAppointments = this._buildChangedAppointments(snapshot);
    this.notifyListeners();
    return { success: true, changedAppointments };
  }

  /**
   * Change the status of session `index` of `type`.
   *
   * → 'completed': date required; prefix check; chronological order;
   *                historical cascade rebuilds all generated planned appointments.
   * → 'planned'  : must be last completed; historical cascade.
   */
  setStatus(type, index, newStatus, date) {
    const plan = this.schedule[type];
    if (!plan || index < 0 || index >= plan.length) {
      return { success: false, reason: 'INVALID_INDEX', message: 'Invalid session index.' };
    }

    // ── → completed ───────────────────────────────────────────────────────────
    if (newStatus === TherapyPlanner.STATUS_COMPLETED) {
      const nd = date instanceof Date ? normalizeDate(date) : null;
      if (!nd || isNaN(nd.getTime())) {
        return { success: false, reason: 'INVALID_DATE',
          message: 'A date is required when marking an appointment as completed.' };
      }
      if (calendarDayDifference(this.today, nd) > 0) {
        return { success: false, reason: 'COMPLETED_AFTER_TODAY',
          message: 'A completed appointment cannot be dated after today.' };
      }
      for (let i = 0; i < index; i++) {
        if (plan[i].status !== TherapyPlanner.STATUS_COMPLETED) {
          return { success: false, reason: 'NOT_PREFIX',
            message: 'Completed appointments must appear before planned appointments.' };
        }
      }
      if (index > 0 &&
          plan[index - 1].status === TherapyPlanner.STATUS_COMPLETED &&
          plan[index - 1].plannedDate instanceof Date) {
        if (calendarDayDifference(plan[index - 1].plannedDate, nd) <= 0) {
          return { success: false, reason: 'CHRONOLOGICAL_ORDER',
            message: 'The date must be strictly after the previous completed appointment.' };
        }
      }

      const warnings = [];
      if (!this.isClinicDate(nd)) {
        warnings.push(
          'This completed appointment falls outside the currently configured clinic days.' +
          ' It will still be saved as historical data.',
        );
      }

      const snapshot = this._cloneSchedule();
      plan[index].status     = TherapyPlanner.STATUS_COMPLETED;
      plan[index].plannedDate = nd;

      // Historical cascade: all planned appointments mutable
      const fixedKeys  = new Set();
      const mutableKeys = this._allPlannedKeys(fixedKeys);
      this._cascade(snapshot, fixedKeys, mutableKeys);

      const v = this.validateSchedule();
      if (!v.valid) {
        this.schedule = snapshot;
        return { success: false, reason: 'VALIDATION_FAILED', message: v.violations.join('; ') };
      }

      const changedAppointments = this._buildChangedAppointments(snapshot);
      this.notifyListeners();
      return { success: true, changedAppointments, warnings };
    }

    // ── → planned ─────────────────────────────────────────────────────────────
    if (newStatus === TherapyPlanner.STATUS_PLANNED) {
      for (let i = index + 1; i < plan.length; i++) {
        if (plan[i].status === TherapyPlanner.STATUS_COMPLETED) {
          return { success: false, reason: 'NOT_LAST_COMPLETED',
            message: 'Only the last completed appointment can be converted back to planned.' };
        }
      }

      const snapshot = this._cloneSchedule();
      plan[index].status     = TherapyPlanner.STATUS_PLANNED;
      plan[index].dateOrigin = DATE_ORIGIN_GENERATED;
      plan[index].plannedDate = null; // will be recomputed

      // Historical cascade: all planned mutable
      const fixedKeys  = new Set();
      const mutableKeys = this._allPlannedKeys(fixedKeys);
      this._cascade(snapshot, fixedKeys, mutableKeys);

      const v = this.validateSchedule();
      if (!v.valid) {
        this.schedule = snapshot;
        return { success: false, reason: 'VALIDATION_FAILED', message: v.violations.join('; ') };
      }

      const changedAppointments = this._buildChangedAppointments(snapshot);
      this.notifyListeners();
      return { success: true, changedAppointments, warnings: [] };
    }

    return { success: false, reason: 'INVALID_STATUS',
      message: `Unknown status '${newStatus}'.` };
  }

  addTherapy(type) {
    const otherEye = this._otherEye(type);
    const snapshot = this._cloneSchedule();

    this.schedule[type].push(this._makeAppt(type, 4, null, null));

    const newIndex   = this.schedule[type].length - 1;
    const fixedKeys  = new Set();
    const mutableKeys = new Set([`${type}_${newIndex}`]);
    for (let i = 0; i < newIndex; i++) fixedKeys.add(`${type}_${i}`);
    for (let j = 0; j < this.schedule[otherEye].length; j++) fixedKeys.add(`${otherEye}_${j}`);

    this._cascade(snapshot, fixedKeys, mutableKeys);

    const v = this.validateSchedule();
    if (!v.valid) { this.schedule = snapshot; return false; }

    this.notifyListeners();
    return true;
  }

  removeTherapy(type) {
    if (this.schedule[type].length <= 1) return false;
    const snapshot = this._cloneSchedule();
    this.schedule[type].pop();
    const v = this.validateSchedule();
    if (!v.valid) { this.schedule = snapshot; return false; }
    this.notifyListeners();
    return true;
  }

  // ── validation ───────────────────────────────────────────────────────────────

  /**
   * Validate the full schedule against all invariants.
   * Returns { valid: true } or { valid: false, violations: string[] }.
   *
   * Historical exceptions:
   *  • Completed appointments may be on any weekday.
   *  • Completed-vs-completed pairs are exempt from same-eye interval and
   *    cross-eye gap checks.
   */
  validateSchedule(schedule) {
    schedule = schedule || this.schedule;
    const violations = [];
    const COMPLETED = TherapyPlanner.STATUS_COMPLETED;
    const PLANNED   = TherapyPlanner.STATUS_PLANNED;
    const DAY = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

    for (const eye of [TherapyPlanner.RIGHTEYE, TherapyPlanner.LEFTEYE]) {
      const plan = schedule[eye];
      let seenPlanned = false;

      for (let i = 0; i < plan.length; i++) {
        const s = plan[i];

        if (s.status !== COMPLETED && s.status !== PLANNED) {
          violations.push(`${eye}[${i}]: invalid status '${s.status}'`);
          continue;
        }

        if (s.status === COMPLETED && seenPlanned) {
          violations.push(`${eye}[${i}]: completed appointment appears after a planned appointment`);
        }
        if (s.status === PLANNED) seenPlanned = true;

        if (!(s.plannedDate instanceof Date) || isNaN(s.plannedDate.getTime())) {
          violations.push(`${eye}[${i}]: plannedDate is not a valid Date`); continue;
        }

        if (s.status === COMPLETED && calendarDayDifference(this.today, s.plannedDate) > 0) {
          violations.push(
            `${eye}[${i}]: completed appointment (${s.plannedDate.toLocaleDateString()}) is after today`,
          );
        }
        if (s.status === PLANNED && calendarDayDifference(this.today, s.plannedDate) < 0) {
          violations.push(
            `${eye}[${i}]: planned appointment (${s.plannedDate.toLocaleDateString()}) is before today`,
          );
        }
        if (s.status === COMPLETED && i > 0 &&
            plan[i - 1].status === COMPLETED &&
            plan[i - 1].plannedDate instanceof Date) {
          if (calendarDayDifference(plan[i - 1].plannedDate, s.plannedDate) <= 0) {
            violations.push(
              `${eye}[${i}]: completed appointment is not strictly after the previous completed appointment`,
            );
          }
        }
        if (s.status === PLANNED && !this.isClinicDate(s.plannedDate)) {
          violations.push(
            `${eye}[${i}]: planned appointment on ${DAY[s.plannedDate.getDay()]}, which is not a clinic day`,
          );
        }
        if (s.status === PLANNED && i > 0 && plan[i - 1].plannedDate instanceof Date) {
          const diff = calendarDayDifference(plan[i - 1].plannedDate, s.plannedDate);
          const req  = s.minWeeks * 7;
          if (diff < req) {
            violations.push(
              `${eye}[${i}]: interval ${diff} days < required ${req} (${s.minWeeks} weeks)`,
            );
          }
        }
      }
    }

    const rPlan = schedule[TherapyPlanner.RIGHTEYE];
    const lPlan = schedule[TherapyPlanner.LEFTEYE];
    for (let ri = 0; ri < rPlan.length; ri++) {
      for (let li = 0; li < lPlan.length; li++) {
        const r = rPlan[ri]; const l = lPlan[li];
        if (r.status === COMPLETED && l.status === COMPLETED) continue;
        const rd = r.plannedDate; const ld = l.plannedDate;
        if (!(rd instanceof Date) || !(ld instanceof Date)) continue;
        const diff = Math.abs(calendarDayDifference(rd, ld));
        if (diff < this.interEyeGapDays) {
          violations.push(
            `RIGHTEYE[${ri}] and LEFTEYE[${li}]: ${diff} day(s) apart (minimum ${this.interEyeGapDays})`,
          );
        }
      }
    }

    return violations.length === 0 ? { valid: true } : { valid: false, violations };
  }
}

if (typeof module !== 'undefined') {
  module.exports = TherapyPlanner;
}
