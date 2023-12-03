function createTherapyListComponent(headerDiv, rootDiv) {

    const planner = new TherapyPlanner();
    planner.addListener(onPlanUpdate);
    const eyes = [{type: TherapyPlanner.LEFTEYE, text: 'Left eye'}, {type: TherapyPlanner.RIGHTEYE, text: 'Right eye'}];
    const TARGETTYPE = 'type';
    const TARGETMINWEEKS = 'minWeeks';
    const TARGETDATE = 'date';
    const container = document.getElementById(rootDiv);
    const headerContainer = document.getElementById(headerDiv);
    
    buildHeader();
    
    const plan = planner.getPlan();
    buildPlan();

    function onPlanUpdate(){
        planner.getPlan();
        buildPlan();
    }

    function buildPlan() {
        cleanupTherapyList();
        plan.forEach((item, index) => {
            const row = document.createElement('div');
            row.classList.add('row', 'align-items-center', 'mt-3');
        
            // Index column
            const indexCol = document.createElement('div');
            indexCol.classList.add('col-1', 'd-flex', 'justify-content-center');
            indexCol.textContent = index + 1;
            row.appendChild(indexCol);
        
            // Type column
            const typeCol = document.createElement('div');
            typeCol.classList.add('col-4', 'd-flex', 'justify-content-center');
            const eyesRadioGroup = document.createElement('div');
            eyesRadioGroup.classList.add('btn-group');
            eyesRadioGroup.setAttribute('therapy-id', index);
            
            eyes.forEach((eye, i) => {
                const radioLabel = document.createElement('label');
                radioLabel.classList.add('btn', 'btn-secondary');
                radioLabel.setAttribute('for', `eye-${index}-${i}`);
                const radioInput = document.createElement('input');
                radioInput.setAttribute('type', 'radio');
                radioInput.setAttribute('name', `options-${index}`);
                radioInput.setAttribute('autocomplete', 'off');
                radioInput.setAttribute('class', 'btn-check');
                radioInput.setAttribute('id',`eye-${index}-${i}`);
                radioInput.addEventListener('change', () => {
                    onChangeHandler(TARGETTYPE, index, {type: eye.type});
                });
                if (item.type === eye.type) {
                    radioInput.setAttribute('checked', true);
                }
                const radioText = document.createTextNode(eye.text);
                eyesRadioGroup.appendChild(radioInput);
                radioLabel.appendChild(radioText);
                eyesRadioGroup.appendChild(radioLabel);
                typeCol.appendChild(eyesRadioGroup);
            });
            row.appendChild(typeCol);
        
            // Min Weeks column
            const minWeeksCol = document.createElement('div');
            minWeeksCol.classList.add('col-1', 'd-flex', 'justify-content-center');
            if(index === 0){
                minWeeksCol.textContent = '-';
            }else{
                const selectMinWeeksInput = document.createElement('select');
                selectMinWeeksInput.classList.add('form-select');
                selectMinWeeksInput.setAttribute('id', `select-${index}`);
                TherapyPlanner.MINWEEKS.forEach((minWeek, i) => {
                    const option = document.createElement('option');
                    option.setAttribute('value', `${minWeek}`);
                    if(item.minWeeks === minWeek){
                        console.log('selected');
                        option.setAttribute('selected', 'selected');
                    }
                    const optionText = document.createTextNode(`q-${minWeek}`);
                    option.appendChild(optionText);
                    selectMinWeeksInput.appendChild(option);
                });

                selectMinWeeksInput.addEventListener('change', (event) => {
                    onChangeHandler(TARGETMINWEEKS, index, {minWeeks: event.target.value});
                });

                minWeeksCol.appendChild(selectMinWeeksInput);
            }
            row.appendChild(minWeeksCol);
            
            // Available Dates column
            const availableDatesCol = document.createElement('div');
            availableDatesCol.classList.add('col-5','d-flex', 'justify-content-center');
        
            const datePickerInput = document.createElement('input');
            datePickerInput.classList.add('form-control');
            datePickerInput.setAttribute('type','date');
            datePickerInput.setAttribute('id',`date-${index}`);
            if(item.plannedDate){
                datePickerInput.setAttribute('value',formatDate(item.plannedDate));
            }

            datePickerInput.addEventListener('change', (event) => {
                onChangeHandler(TARGETDATE, index, {date: event.target.value});
            });

            availableDatesCol.appendChild(datePickerInput);
            row.appendChild(availableDatesCol);
            
            container.appendChild(row);
        });
            
    }

    function addRow(){
        console.log("dummy");
    }
    
    function cleanupTherapyList(){
        while (container.firstChild) { container.removeChild(container.firstChild); }
    }

    function formatDate(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0'); // Adding 1 because January is 0-indexed
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    function onChangeHandler(target, index, arg){
        console.log('index: ' + index + ' target: ' + target);
        switch (target) {
            case TARGETTYPE:
                console.log(arg.type);
                planner.updateTypeFor(index, arg.type);
                break;
            case TARGETDATE:
                planner.updateDateFor(index, new Date(arg.date));
                break;
            case TARGETMINWEEKS:
                planner.updateMinWeeksFor(index, parseInt(arg.minWeeks));
                break;
        }
    }

    function buildHeader(){
        const headerRow = document.createElement('div');
        headerRow.classList.add('row', 'align-items-center', 'mt-3');

        // Index column
        const indexCol = document.createElement('div');
        indexCol.classList.add('col-1', 'd-flex', 'justify-content-center');
        indexCol.textContent = 'Index';
        headerRow.appendChild(indexCol);

        // Type column
        const typeCol = document.createElement('div');
        typeCol.classList.add('col-4', 'd-flex', 'justify-content-center');
        typeCol.textContent = 'Type';
        headerRow.appendChild(typeCol);

        // Min Weeks column
        const minWeeksCol = document.createElement('div');
        minWeeksCol.classList.add('col-1', 'd-flex', 'justify-content-center');
        minWeeksCol.textContent = 'Min Weeks';
        headerRow.appendChild(minWeeksCol);
      
        // Available Dates column
        const availableDatesCol = document.createElement('div');
        availableDatesCol.classList.add('col-5', 'd-flex', 'justify-content-center');
        availableDatesCol.textContent = 'Date';
        headerRow.appendChild(availableDatesCol);
        headerContainer.appendChild(headerRow);
    }
    return{
        addRow: addRow
    }
}