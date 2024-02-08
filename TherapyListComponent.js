function createTherapyListComponent(rootDiv, type, planner) {

    const eyes = [{type: TherapyPlanner.LEFTEYE, text: 'Left eye'}, {type: TherapyPlanner.RIGHTEYE, text: 'Right eye'}];
    const TARGETTYPE = 'type';
    const TARGETMINWEEKS = 'minWeeks';
    const TARGETDATE = 'date';
    const INDEXCOLWIDTH = 'col-1';
    const MINWEEKSCOLWIDTH = 'col-3';
    const MINIMUMDATECOL = 'col-4';
    const AVAILABLEDATESCOL = 'col-4';

    planner.addListener(onPlanUpdate);

    const container = document.createElement('div');
    container.classList.add('container');
    container.setAttribute('id', `container-${type}`);

    const headerContainer = document.createElement('div');
    headerContainer.classList.add('container');
    headerContainer.setAttribute('id', `header-container-${type}`);
    
    const root = document.getElementById(rootDiv);
    root.appendChild(headerContainer);
    root.appendChild(container);

    buildHeader();
    
    const plan = planner.getPlanByEye(type);
    buildPlan();

    function onPlanUpdate(){
        planner.getPlan();
        buildPlan();
    }

    function buildPlan() {
        cleanupTherapyList();
        plan.forEach((item, index) => {
            const row = document.createElement('div');
            row.classList.add('row', 'align-items-center', 'g-2');
        
            // Index column
            const indexCol = document.createElement('div');
            indexCol.classList.add(INDEXCOLWIDTH, 'd-flex', 'justify-content-center');
            indexCol.textContent = index + 1;
            row.appendChild(indexCol);
        
            // Min Weeks column
            const minWeeksCol = document.createElement('div');
            minWeeksCol.classList.add(MINWEEKSCOLWIDTH, 'd-flex', 'justify-content-center');
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
            
            // Min Date column
            const minDateCol = document.createElement('div');
            minDateCol.classList.add(AVAILABLEDATESCOL,'d-flex', 'justify-content-center');
            minDateCol.textContent = index === 0 ? '-' : item.minimumDate.toLocaleDateString('it-IT', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });


            row.appendChild(minDateCol);

            // Available Dates column
            const availableDatesCol = document.createElement('div');
            availableDatesCol.classList.add(AVAILABLEDATESCOL,'d-flex', 'justify-content-center');
        
            const datePickerInput = document.createElement('input');
            datePickerInput.classList.add('form-control');
            datePickerInput.setAttribute('type','date');
            datePickerInput.setAttribute('id',`date-${index}`);
            if(item.minimumDate){
                if(item.plannedDate - item.minimumDate < 0 ){
                    datePickerInput.setAttribute('value',formatDate(item.minimumDate));
                }else {
                    datePickerInput.setAttribute('value',formatDate(item.plannedDate));
                }
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
        headerRow.classList.add('row', 'align-items-center', 'g-2');

        // Index column
        const indexCol = document.createElement('div');
        indexCol.classList.add(INDEXCOLWIDTH, 'd-flex', 'justify-content-center');
        indexCol.textContent = 'Index';
        headerRow.appendChild(indexCol);

        // Min Weeks column
        const minWeeksCol = document.createElement('div');
        minWeeksCol.classList.add(MINWEEKSCOLWIDTH, 'd-flex', 'justify-content-center');
        minWeeksCol.textContent = 'Min Weeks';
        headerRow.appendChild(minWeeksCol);

        // Min Weeks column
        const midDateCol = document.createElement('div');
        midDateCol.classList.add(MINIMUMDATECOL, 'd-flex', 'justify-content-center');
        midDateCol.textContent = 'Min Date';
        headerRow.appendChild(midDateCol);
        
      
        // Available Dates column
        const availableDatesCol = document.createElement('div');
        availableDatesCol.classList.add(AVAILABLEDATESCOL, 'd-flex', 'justify-content-center');
        availableDatesCol.textContent = 'Date';
        headerRow.appendChild(availableDatesCol);
        headerContainer.appendChild(headerRow);
    }
    return{
        addRow: addRow
    }
}