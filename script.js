class TherapyPlanner {
    constructor() {
      this.lefteyeTherapy = [];
      this.righteyeTherapy = [];
      this.currentUnplanned = 1;
      this.therapyPlan = [{
        "type": "LEFTEYE",
        "minWeeks": "-",
        "availableDates": [
        ],
        "plannedDate": ""
      }];
    }
    // Constants for eye types
    static get RIGHTEYE() {
        return 'RIGHTEYE';
    }

    static get LEFTEYE() {
        return 'LEFTEYE';
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
        console.log("asdasdasdasda");
        console.log(currentDate);
        const validDates = getNextValidDates(currentDate);
        this.therapyPlan[target].availableDates = validDates;
      }
        return this.therapyPlan;
    }
  
    weeksToDays(weeks) {
      return weeks * 7 + 1;
    }
  } 
  