class TherapyPlanner {
    constructor() {

      this.listeners = [];

      this.today = new Date();

      this.therapyPlan = [{
        "type": TherapyPlanner.LEFTEYE,
        "minWeeks": '-',
        "availableDates": [
        ],
        "plannedDate": this.today
      },
      {
        "type": TherapyPlanner.LEFTEYE,
        "minWeeks": 4,
        "availableDates": [
        ],
        "plannedDate": ''
      },
      {
        "type": TherapyPlanner.RIGHTEYE,
        "minWeeks": 8,
        "availableDates": [
        ],
        "plannedDate": ''
      },
      {
        "type": TherapyPlanner.RIGHTEYE,
        "minWeeks": 8,
        "availableDates": [
        ],
        "plannedDate": ''
      },
      {
        "type": TherapyPlanner.RIGHTEYE,
        "minWeeks": 8,
        "availableDates": [
        ],
        "plannedDate": ''
      },
      {
        "type": TherapyPlanner.RIGHTEYE,
        "minWeeks": 8,
        "availableDates": [
        ],
        "plannedDate": ''
      },
      {
        "type": TherapyPlanner.RIGHTEYE,
        "minWeeks": 8,
        "availableDates": [
        ],
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

    updatePlan() {
      this.therapyPlan.forEach((therapy, index) => {
        if(index === 0){
          //first therapy is planned freely
          return false;
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
              const previousSameEyeDate = new Date(previousSameEye.plannedDate);
              minDays = this.weeksToDays(current.minWeeks);
              minSameEyeDate = previousSameEyeDate.getTime()+minDays * 24 * 60 * 60 * 1000;
              console.log("previousSameEyeDate");
              console.log(new Date(minSameEyeDate));
            }
            if(previousOtherEye){
              const previousOtherEyeDate = new Date(previousOtherEye.plannedDate);
              minDays = this.weeksToDays(2);
              minOtherEyeDate = previousOtherEyeDate.getTime()+minDays * 24 * 60 * 60 * 1000;
              console.log("previousOtherEyeDate");
              console.log(new Date(minOtherEyeDate));
            }
            let currentDate = Math.max(minSameEyeDate, minOtherEyeDate);
            console.log("#######");
            console.log(new Date(currentDate));
            return new Date(currentDate);
          }

          const getNextValidDates = (inputDate, numberOfDates = 3) =>{
            const daysToCheck = [2, 3, 4]; // Tuesday, Wednesday, Thursday represented as 2, 3, 4 (respectively)
          
            const getNextValidDate = (startDate) => {
              let nextDate = new Date(startDate.getTime());
              while (!daysToCheck.includes(nextDate.getUTCDay())) {
                nextDate = new Date(nextDate.getTime() + 24 * 60 * 60 * 1000);
              }
              return nextDate;
            };
          
            const validDates = [];
            let currentDate = inputDate;
            currentDate = getNextValidDate(currentDate);
          
            return [currentDate];
          }
          let currentDate;
    
          currentDate = getMinimumInterval();
          console.log(currentDate);
          const validDates = getNextValidDates(currentDate);
          this.therapyPlan[index].plannedDate = validDates[0];
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
      if(index >= 0 && index < this.therapyPlan.length){
        if(date instanceof Date){
          let therapy = this.therapyPlan[index];
          therapy.plannedDate = date;
          this.therapyPlan[index] = therapy;
          this.updatePlan();
          this.notifyListeners();
        }
      }
      console.log(this.therapyPlan);
      return;
    }

  } 
  