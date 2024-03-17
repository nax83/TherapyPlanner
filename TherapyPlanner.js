class TherapyPlanner {
    constructor() {

      this.listeners = [];

      this.today = new Date();
      this.today.setHours(0, 0, 0, 0);
      this.daysToCheck = [2, 3, 4]; // Tuesday, Wednesday, Thursday represented as 2, 3, 4 (respectively)
    
      this.newTherapyPlan = {
        [TherapyPlanner.RIGHTEYE] : [
          {
          "type": TherapyPlanner.RIGHTEYE,
          "minWeeks": 4,
          "minimumDate": this.today,
          "plannedDate": this.today
        },
        {
          "type": TherapyPlanner.RIGHTEYE,
          "minWeeks": 4,
          "minimumDate": '',
          "plannedDate": ''
        },
        {
          "type": TherapyPlanner.RIGHTEYE,
          "minWeeks": 4,
          "minimumDate": '',
          "plannedDate": ''
        }],
        [TherapyPlanner.LEFTEYE] : [
          {
          "type": TherapyPlanner.LEFTEYE,
          "minWeeks": 4,
          "minimumDate": this.today,
          "plannedDate": this.today
        },
        {
          "type": TherapyPlanner.LEFTEYE,
          "minWeeks": 4,
          "minimumDate": '',
          "plannedDate": ''
        },
        {
          "type": TherapyPlanner.LEFTEYE,
          "minWeeks": 4,
          "minimumDate": '',
          "plannedDate": ''
        }]
      };
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
      while (!this.daysToCheck.includes(nextDate.getUTCDay())) {
        nextDate = new Date(nextDate.getTime() + 24 * 60 * 60 * 1000);
      }
      return nextDate;
    }

    updatePlan(type=TherapyPlanner.RIGHTEYE, index=0) {

      if (index < 0 || index >= this.newTherapyPlan[type].length) {
        console.log("Invalid start index.");
        return;
      }
      
      for (let i = index; i < this.newTherapyPlan[type].length; i++) {
        if(i === 0){
          //first appointment is free
          console.log('first appointment');
          continue;
        }
        let previousSameEye = this.newTherapyPlan[type][i-1];
        let current = this.newTherapyPlan[type][i];
        
        let minDays = this.weeksToDays(current.minWeeks);
        let minSameEyeDate = 0;
  
        const previousSameEyeDate = Math.max(previousSameEye.minimumDate, previousSameEye.plannedDate);
        minDays = this.weeksToDays(current.minWeeks);
        minSameEyeDate = (new Date (previousSameEyeDate)).getTime()+minDays * 24 * 60 * 60 * 1000;

        let currentDate =new Date(minSameEyeDate);
        const validDate = this.getNextValidDate(currentDate);
        this.newTherapyPlan[type][i].minimumDate = validDate;
      }
      console.log(this.newTherapyPlan);
      return;
    }

    weeksToDays(weeks) {
      return weeks * 7 + 1;
    }

    updateMinWeeksFor(type, index, minWeeks){
      if(index >= 0 && index < this.newTherapyPlan[type].length){
        let therapy = this.newTherapyPlan[type][index];
        if (TherapyPlanner.MINWEEKS.includes(parseInt(minWeeks))){
          therapy.minWeeks = minWeeks;
          this.newTherapyPlan[type][index]= therapy;
          this.updatePlan(type);
          this.notifyListeners();
        }
      }
      return;
    }

    updateDateFor(type, index, date){
      if(index > 0 && index < this.newTherapyPlan[type].length){
        if(date instanceof Date){
          let therapy = this.newTherapyPlan[type][index];
          if(date - therapy.minimumDate > 0 && this.isValidWorkingDays(date)){
            therapy.plannedDate = date;
            this.newTherapyPlan[type][index] = therapy;
            this.updatePlan(type, index);
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
      this.updatePlan();
      this.notifyListeners();
    }
    removeTherapy(type){
      let therapy = this.newTherapyPlan[type].pop();
      if(therapy)
      {
        this.updatePlan();
        this.notifyListeners();
      }
    }
  } 
  