class TherapyPlanner {
    constructor() {

      this.listeners = [];

      this.today = new Date();
      this.daysToCheck = [2, 3, 4]; // Tuesday, Wednesday, Thursday represented as 2, 3, 4 (respectively)
    
      this.therapyPlan = [{
        "type": TherapyPlanner.RIGHTEYE,
        "minWeeks": '-',
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
      }];
      this.updatePlan();
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
        listener(this.therapyPlan);
      })
    }

    getPlan() {
      return this.therapyPlan;
    }

    getPlanByEye(eye=TherapyPlanner.RIGHTEYE) {
      return this.therapyPlan.filter(item => item.type === eye);
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

    getNextValidDates(inputDate, numberOfDates = 3) {
      
      const validDates = [];
      let currentDate = inputDate;
      currentDate = this.getNextValidDate(currentDate);
    
      return [currentDate];
    }

    updatePlan(root = -1) {
      this.therapyPlan.forEach((therapy, index) => {
        if(index === 0 || index < root){
          //doctor freely plan the first therapy
          console.log("update is not needed");
          return;
        } else{
          const getMinimumInterval = () => {
        
            let previousSameEye = null;
            let previousOtherEye = null;
            let current = this.therapyPlan[index];
            for (let i = index-1; i >= 0; i--){
                if(previousSameEye!==null && previousOtherEye!==null){
                    break;
                }
                if(previousSameEye == null && current.type === this.therapyPlan[i].type){
                    previousSameEye = this.therapyPlan[i];
                }
                if(previousOtherEye == null && current.type !== this.therapyPlan[i].type){
                    previousOtherEye = this.therapyPlan[i];
                }
            }
            let minDays = this.weeksToDays(current.minWeeks);
            let minSameEyeDate = 0;
            let minOtherEyeDate = 0;
    
            if(previousSameEye){
              const previousSameEyeDate = Math.max(previousSameEye.minimumDate, previousSameEye.plannedDate);
              console.log("########");
              console.log(previousSameEyeDate);
              minDays = this.weeksToDays(current.minWeeks);
              minSameEyeDate = (new Date (previousSameEyeDate)).getTime()+minDays * 24 * 60 * 60 * 1000;
            }
            if(previousOtherEye){
              const previousOtherEyeDate = Math.max(previousOtherEye.minimumDate, previousOtherEye.plannedDate);
              minDays = this.weeksToDays(2);
              minOtherEyeDate = (new Date (previousOtherEyeDate)).getTime()+minDays * 24 * 60 * 60 * 1000;
            }
            let currentDate = Math.max(minSameEyeDate, minOtherEyeDate);
            return new Date(currentDate);
          }
          

          let currentDate;
    
          currentDate = getMinimumInterval();
          console.log(currentDate);
          const validDates = this.getNextValidDates(currentDate);
          this.therapyPlan[index].minimumDate = validDates[0];
          }
      });
      console.log(this.therapyPlan);
      return this.therapyPlan;
    }

    weeksToDays(weeks) {
      return weeks * 7 + 1;
    }

    updateMinWeeksFor(index, minWeeks){
      if(index >= 0 && index < this.therapyPlan.length){
        let therapy = this.therapyPlan[index];
        console.log(TherapyPlanner.MINWEEKS);
        console.log(minWeeks);
        if (TherapyPlanner.MINWEEKS.includes(parseInt(minWeeks))){
          therapy.minWeeks = minWeeks;
          this.therapyPlan[index]= therapy;
          this.updatePlan();
          this.notifyListeners();
        }
      }
      console.log(this.therapyPlan);
      return;
    }

    updateTypeFor(index, type){
      if(index >= 0 && index < this.therapyPlan.length){
        let therapy = this.therapyPlan[index];
        if((type === TherapyPlanner.RIGHTEYE || type === TherapyPlanner.LEFTEYE) && therapy.type != type){
          therapy.type = type;
          this.therapyPlan[index] = therapy;
          this.updatePlan();
          this.notifyListeners();
        }
      }
      return;
    }

    updateDateFor(index, date){
      if(index > 0 && index < this.therapyPlan.length){
        if(date instanceof Date){
          let therapy = this.therapyPlan[index];
          if(date - therapy.minimumDate > 0 && this.isValidWorkingDays(date)){
            therapy.plannedDate = date;
            this.therapyPlan[index] = therapy;
            this.updatePlan(index);
          }
          this.notifyListeners();
        }
      }
      if(index === 0 ){
        if(date instanceof Date){
          let therapy = this.therapyPlan[index];
          therapy.plannedDate = date;
          therapy.minimumDate = date;
          this.therapyPlan[index] = therapy;
          this.updatePlan();
          this.notifyListeners();
        }
      }
      console.log(this.therapyPlan);
      return;
    }

  } 
  