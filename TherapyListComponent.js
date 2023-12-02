function createTherapyListComponent(rootDiv) {
    const container = document.getElementById(rootDiv);
    
    buildHeader();

    const planner = new TherapyPlanner();
    const plan = planner.getPlan();
    buildPlan();

    function buildPlan() {
    
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
            const eyes = [{type: TherapyPlanner.LEFTEYE, text: 'Left eye'}, {type: TherapyPlanner.RIGHTEYE, text: 'Right eye'}];
            eyes.forEach((eye, i) => {
                const radioLabel = document.createElement('label');
                radioLabel.classList.add('btn', 'btn-secondary');
                radioLabel.setAttribute('for', `eye-${i}`);
                const radioInput = document.createElement('input');
                radioInput.setAttribute('type', 'radio');
                radioInput.setAttribute('name', 'options');
                radioInput.setAttribute('autocomplete', 'off');
                radioInput.setAttribute('class', 'btn-check');
                radioInput.setAttribute('id',`eye-${i}`);
                radioInput.addEventListener('change', () => {
                    onChangeHandler(date, index + 1); // Pass date and index
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
            minWeeksCol.classList.add('col-2', 'd-flex', 'justify-content-center');
            minWeeksCol.textContent = item.minWeeks;
            row.appendChild(minWeeksCol);
            
            // Available Dates column
            const availableDatesCol = document.createElement('div');
            availableDatesCol.classList.add('col-6','d-flex', 'justify-content-center');
        
            if (index == 0 && item.plannedDate) {
                const initialDate = new Date(item.plannedDate);
                const dateText = initialDate.toLocaleDateString('it-IT', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
                availableDatesCol.textContent = dateText;
            }else{
                const radioGroup = document.createElement('div');
                radioGroup.classList.add('btn-group');
                const plannedDateIndex = item.availableDates.indexOf(item.plannedDate);
                item.availableDates.forEach((date, i) => {
                    const radioLabel = document.createElement('label');
                    radioLabel.classList.add('btn', 'btn-secondary');
                    radioLabel.setAttribute('for', `success-outlined-${i}`);
                    const radioInput = document.createElement('input');
                    radioInput.setAttribute('type', 'radio');
                    radioInput.setAttribute('name', 'options');
                    radioInput.setAttribute('autocomplete', 'off');
                    radioInput.setAttribute('class', 'btn-check');
                    radioInput.setAttribute('id',`success-outlined-${i}`);
                    radioInput.addEventListener('change', () => {
                        onChangeHandler(date, index + 1); // Pass date and index
                    });
                    if (i === plannedDateIndex) {
                        radioInput.setAttribute('checked', true);
                    }
                    const formatDate = new Date(date);
                    const dateText = formatDate.toLocaleDateString('it-IT', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
                    const radioText = document.createTextNode(dateText);
                    radioGroup.appendChild(radioInput);
                    radioLabel.appendChild(radioText);
                    radioGroup.appendChild(radioLabel);
                    availableDatesCol.appendChild(radioGroup);
                    
                });
            }
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

    function onChangeHandler(){

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
        minWeeksCol.classList.add('col-2', 'd-flex', 'justify-content-center');
        minWeeksCol.textContent = 'Min Weeks';
        headerRow.appendChild(minWeeksCol);
      
        // Available Dates column
        const availableDatesCol = document.createElement('div');
        availableDatesCol.classList.add('col-4', 'd-flex', 'justify-content-center');
        availableDatesCol.textContent = 'Date';
        headerRow.appendChild(availableDatesCol);
        container.appendChild(headerRow);
    }
    return{
        addRow: addRow
    }
}