class TherapyPlanner {
    constructor() {
      this.lefteyeTherapy = [];
      this.righteyeTherapy = [];
      this.currentUnplanned = 1;
      this.therapyPlan = [];
    }
    // Constants for eye types
    static get RIGHTEYE() {
        return 'RIGHTEYE';
    }

    static get LEFTEYE() {
        return 'LEFTEYE';
    }

    mergeTherapies(firstEye = TherapyPlanner.LEFTEYE) {
        const mergedArray = [];
        const minLength = Math.min(this.lefteyeTherapy.length, this.righteyeTherapy.length);
      
        let currentLeft = firstEye === TherapyPlanner.LEFTEYE;
        for (let i = 0; i < minLength; i++) {
          if (currentLeft) {
            mergedArray.push(this.lefteyeTherapy[i]);
            mergedArray.push(this.righteyeTherapy[i]);
          } else {
            mergedArray.push(this.righteyeTherapy[i]);
            mergedArray.push(this.lefteyeTherapy[i]);
          }
        }
      
        //Add remaining elements from the longer array
        const remainingArray = this.lefteyeTherapy.length > minLength ? this.lefteyeTherapy.slice(minLength) : this.righteyeTherapy .slice(minLength);
        mergedArray.push(...remainingArray);
      
        return mergedArray;
      }
  
    init(lefteyeTherapy, righteyeTherapy, firstEye = LEFTEYE) {
      this.lefteyeTherapy = lefteyeTherapy;
      this.righteyeTherapy = righteyeTherapy;
      this.therapyPlan = this.mergeTherapies(firstEye);
      console.log(this.therapyPlan);
    } 
  
    next(inputDate, numberOfDates = 3) {

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
        const addDays = [1, 1, 1]; //Minimum number of days to add for each date
      
        const getNextValidDate = (startDate, daysToAdd) => {
          let nextDate = new Date(startDate.getTime() + daysToAdd * 24 * 60 * 60 * 1000);
          while (!daysToCheck.includes(nextDate.getUTCDay())) {
            nextDate = new Date(nextDate.getTime() + 24 * 60 * 60 * 1000);
          }
          return nextDate;
        };
      
        const validDates = [];
        let currentDate = inputDate;
      
        for (let i = 0; i < numberOfDates; i++) {
          currentDate = getNextValidDate(currentDate, addDays[i]);
          validDates.push(currentDate);
        }
      
        return validDates;
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
  
  //   const currentDate = new Date();
  //   // Example usage:
  //   const leftEye = [
  //       { type: "LEFTEYE", minWeeks: 6, plannedDate:currentDate, availableDates:[] },
  //       { type: "LEFTEYE", minWeeks: 4, plannedDate:"", availableDates:[] },
  //       { type: "LEFTEYE", minWeeks: 3, plannedDate:"", availableDates:[] }
  //   ];

  //   const rightEye = [
  //       { type: "RIGHTEYE", minWeeks: 4, plannedDate:"", availableDates:[] },
  //       { type: "RIGHTEYE", minWeeks: 4, plannedDate:"", availableDates:[] },
  //       { type: "RIGHTEYE", minWeeks: 3, plannedDate:"", availableDates:[] },
  //       { type: "RIGHTEYE", minWeeks: 4, plannedDate:"", availableDates:[] }
  //   ];

  // const planner = new TherapyPlanner();
  // planner.init(leftEye, rightEye, TherapyPlanner.LEFTEYE);

  // const nextDates = planner.next(currentDate);
  // console.log(nextDates);
  
  