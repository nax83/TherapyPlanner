const DEFAULT_VALID_WEEKDAYS = Object.freeze([2, 3, 4]);

function cloneDefaultWeekdays() {
  return [...DEFAULT_VALID_WEEKDAYS];
}

function normalizeValidWeekdays(weekdays) {
  if (!Array.isArray(weekdays)) {
    return cloneDefaultWeekdays();
  }

  const sanitized = [...new Set(
    weekdays
      .map((day) => Number(day))
      .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6),
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

class TherapyPlanner {
    constructor(config = loadScheduleConfig()) {

      this.listeners = [];

      this.today = new Date();
      this.today.setHours(0, 0, 0, 0);
      this.daysToCheck = normalizeValidWeekdays(config && config.validAppointmentWeekdays);

      const rightEyeFirst = this.getNextValidDate(this.today);
      const leftEyeFirst  = this.getNextValidDate(
        new Date(rightEyeFirst.getTime() + TherapyPlanner.INTER_EYE_GAP_DAYS * 24 * 60 * 60 * 1000)
      );

      this.newTherapyPlan = {
        [TherapyPlanner.RIGHTEYE] : [
          { "type": TherapyPlanner.RIGHTEYE, "minWeeks": 4, "minimumDate": rightEyeFirst, "plannedDate": rightEyeFirst },
          { "type": TherapyPlanner.RIGHTEYE, "minWeeks": 4, "minimumDate": '', "plannedDate": '' },
          { "type": TherapyPlanner.RIGHTEYE, "minWeeks": 4, "minimumDate": '', "plannedDate": '' }
        ],
        [TherapyPlanner.LEFTEYE] : [
          { "type": TherapyPlanner.LEFTEYE, "minWeeks": 4, "minimumDate": leftEyeFirst, "plannedDate": leftEyeFirst },
          { "type": TherapyPlanner.LEFTEYE, "minWeeks": 4, "minimumDate": '', "plannedDate": '' },
          { "type": TherapyPlanner.LEFTEYE, "minWeeks": 4, "minimumDate": '', "plannedDate": '' }
        ]
      };
      this.updatePlan(TherapyPlanner.RIGHTEYE);
      this.updatePlan(TherapyPlanner.LEFTEYE);
      this.updatePlan(TherapyPlanner.RIGHTEYE);
    }
    // Constants for eye types
    static get RIGHTEYE() {
        return 'RIGHTEYE';
    }

    static get LEFTEYE() {
        return 'LEFTEYE';
    }

    static get MINWEEKS() {
        return [4, 6, 8, 10, 12, 14, 16];
    }

    static get INTER_EYE_GAP_DAYS() {
        return 14;
    }

    static get DEFAULT_VALID_WEEKDAYS() {
        return cloneDefaultWeekdays();
    }

    addListener(listener) {
      this.listeners.push(listener);
    }

    notifyListeners() {
      this.listeners.forEach((listener)=>{
        listener();
      })
    }

    getPlanByEye(eye=TherapyPlanner.RIGHTEYE) {
      return this.newTherapyPlan[eye];
    }

    isValidWorkingDays(date){
      let nextDate = this.getNextValidDate(date);
      return nextDate.getTime() === date.getTime();
    }

    getNextValidDate(startDate) {

      let nextDate = new Date(startDate.getTime());
      while (!this.daysToCheck.includes(nextDate.getDay())) {
        nextDate = new Date(nextDate.getTime() + 24 * 60 * 60 * 1000);
      }
      return nextDate;
    }

    updatePlan(type=TherapyPlanner.RIGHTEYE, index=0) {

      if (index < 0 || index >= this.newTherapyPlan[type].length) {
        console.log("Invalid start index.");
        return;
      }

      const otherType = type === TherapyPlanner.RIGHTEYE ? TherapyPlanner.LEFTEYE : TherapyPlanner.RIGHTEYE;
      const interEyeMs = TherapyPlanner.INTER_EYE_GAP_DAYS * 24 * 60 * 60 * 1000;

      for (let i = index; i < this.newTherapyPlan[type].length; i++) {
        if(i === 0){
          continue;
        }
        let previousSameEye = this.newTherapyPlan[type][i-1];
        let current = this.newTherapyPlan[type][i];

        const previousSameEyeDate = Math.max(previousSameEye.minimumDate, previousSameEye.plannedDate);
        const minDays = this.weeksToDays(current.minWeeks);
        let minDateMs = (new Date(previousSameEyeDate)).getTime() + minDays * 24 * 60 * 60 * 1000;

        // enforce inter-eye gap: this session must be at least INTER_EYE_GAP_DAYS after
        // every session of the other eye
        const otherPlan = this.newTherapyPlan[otherType];
        for (let j = 0; j < otherPlan.length; j++) {
          const otherSession = otherPlan[j];
          const otherDate = Math.max(
            otherSession.minimumDate instanceof Date ? otherSession.minimumDate.getTime() : 0,
            otherSession.plannedDate instanceof Date ? otherSession.plannedDate.getTime() : 0,
          );
          if (otherDate > 0) {
            const gapAfter = otherDate + interEyeMs;
            const gapBefore = otherDate - interEyeMs;
            // current session must not fall within [otherDate - gap, otherDate + gap)
            if (minDateMs > gapBefore && minDateMs < gapAfter) {
              minDateMs = gapAfter;
            }
          }
        }

        const validDate = this.getNextValidDate(new Date(minDateMs));
        this.newTherapyPlan[type][i].minimumDate = validDate;
        // clear plannedDate if it's now before the new minimum
        const planned = this.newTherapyPlan[type][i].plannedDate;
        if (planned instanceof Date && planned.getTime() < validDate.getTime()) {
          this.newTherapyPlan[type][i].plannedDate = '';
        }
      }
      return;
    }

    weeksToDays(weeks) {
      return weeks * 7 + 1;
    }

    _otherEye(type) {
      return type === TherapyPlanner.RIGHTEYE ? TherapyPlanner.LEFTEYE : TherapyPlanner.RIGHTEYE;
    }

    updateMinWeeksFor(type, index, minWeeks){
      if(index >= 0 && index < this.newTherapyPlan[type].length){
        let therapy = this.newTherapyPlan[type][index];
        if (TherapyPlanner.MINWEEKS.includes(parseInt(minWeeks))){
          therapy.minWeeks = minWeeks;
          this.newTherapyPlan[type][index]= therapy;
          this.updatePlan(type);
          this.updatePlan(this._otherEye(type));
          this.notifyListeners();
        }
      }
      return;
    }

    updateDateFor(type, index, date){
      if(index > 0 && index < this.newTherapyPlan[type].length){
        if(date instanceof Date){
          let therapy = this.newTherapyPlan[type][index];
          if(date - therapy.minimumDate >= 0 && this.isValidWorkingDays(date)){
            therapy.plannedDate = date;
            this.newTherapyPlan[type][index] = therapy;
            this.updatePlan(type, index);
            this.updatePlan(this._otherEye(type));
          }
        }
      }
      if(index === 0){
        if(date instanceof Date){
          let therapy = this.newTherapyPlan[type][index];
          therapy.plannedDate = date;
          therapy.minimumDate = date;
          this.newTherapyPlan[type][index] = therapy;
          this.updatePlan(type);
          this.updatePlan(this._otherEye(type));
        }
      }
      this.notifyListeners();
      return;
    }

    addTherapy(type){
      let therapy = {
        "type": type,
        "minWeeks": 4,
        "minimumDate": '',
        "plannedDate": ''
      };
      this.newTherapyPlan[type].push(therapy);
      this.updatePlan(type);
      this.updatePlan(this._otherEye(type));
      this.notifyListeners();
    }

    removeTherapy(type){
      let therapy = this.newTherapyPlan[type].pop();
      if(therapy)
      {
        this.updatePlan(type);
        this.updatePlan(this._otherEye(type));
        this.notifyListeners();
      }
    }
  }

if (typeof module !== 'undefined') {
  module.exports = TherapyPlanner;
}

