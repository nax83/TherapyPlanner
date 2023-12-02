class TherapyPlanner {
    constructor() {
      this.lefteyeTherapy = [];
      this.righteyeTherapy = [];
      this.currentUnplanned = 1;

      this.today = new Date("2023-11-04");

      this.therapyPlan = [{
        "type": "LEFTEYE",
        "minWeeks": "-",
        "availableDates": [
        ],
        "plannedDate": "2023-11-04"
      }];
    }
    // Constants for eye types
    static get RIGHTEYE() {
        return 'RIGHTEYE';
    }

    static get LEFTEYE() {
        return 'LEFTEYE';
    }

    static get MINWEEKS() {
        return [4, 6, 8, 12];
    }

    getPlan() {
      return this.therapyPlan;
    }

    next(inputDate) {

      const getMinimumInterval = () => {
        
        let previousSameEye = null;
        let previousOtherEye = null;
        let current = this.therapyPlan[this.currentUnplanned];
        for (let i = this.currentUnplanned-1; i >= 0; i--){
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

      if(this.currentUnplanned < this.therapyPlan.length){
        let target = this.currentUnplanned;
      
        let currentDate = inputDate;
  
        currentDate = getMinimumInterval();
        console.log(currentDate);
        const validDates = getNextValidDates(currentDate);
        this.therapyPlan[target].availableDates = validDates;
      }
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
        }
      }
      console.log(this.therapyPlan);
      return this.therapyPlan;
    }

    updateTypeFor(index, type){
      if(index >= 0 && index < this.therapyPlan.length){
        let therapy = this.therapyPlan[index];
        if((type === TherapyPlanner.RIGHTEYE || type === TherapyPlanner.LEFTEYE) && therapy.type != type){
          therapy.type = type;
          this.therapyPlan[index] = therapy;
          //TODO:update the schedule before returning the plan
        }
      }
      return this.therapyPlan;
    }

    updateDateFor(index, date){
      return this.therapyPlan;
    }

  } 
  