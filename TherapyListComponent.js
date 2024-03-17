function createTherapyListComponent(componentId, type, planner) {

    const eyes = {[TherapyPlanner.LEFTEYE]: 'Left eye', [TherapyPlanner.RIGHTEYE]: 'Right eye'};
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

    const card = document.createElement('div');
    card.classList.add('card');
    card.setAttribute('id', componentId); 
    
    const cardHeader = document.createElement('div');
    cardHeader.classList.add('card-header', 'd-flex');
    
    const cardHeaderLabel = document.createElement('span')
    cardHeaderLabel.classList.add('mr-auto', 'p-2');
    cardHeaderLabel.textContent = eyes[type];

    const addButton = document.createElement('button');
    addButton.classList.add('btn', 'btn-light', 'p-2');

    const plusIcon = document.createElement('span');
    plusIcon.classList.add('bi', 'bi-plus-circle', 'p-2');
    
    const removeButton = document.createElement('button');
    removeButton.classList.add('btn', 'btn-light');

    const minusIcon = document.createElement('span');
    minusIcon.classList.add('bi', 'bi-dash-circle');

    addButton.appendChild(plusIcon);
    addButton.addEventListener('click', (event) => {planner.addTherapy(type)});
    removeButton.appendChild(minusIcon);
    removeButton.addEventListener('click', (event) => {planner.removeTherapy(type)});

    cardHeader.appendChild(cardHeaderLabel);
    cardHeader.appendChild(addButton);
    cardHeader.appendChild(removeButton);

    const cardBody = document.createElement('div');
    cardBody.classList.add('card-body');

    card.appendChild(cardHeader);
    card.appendChild(cardBody);

    const headerContainer = document.createElement('div');
    headerContainer.classList.add('container');
    headerContainer.setAttribute('id', `header-container-${type}`);

    cardBody.appendChild(headerContainer);
    cardBody.appendChild(container);

    buildHeader();
    buildPlan();

    function onPlanUpdate(){
        buildPlan();
    }

    function buildPlan() {
        console.log("draw again")
        cleanupTherapyList();
        planner.getPlanByEye(type).forEach((item, index) => {
            const row = document.createElement('div');
            row.classList.add('row', 'align-items-center', 'mt-2');
        
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
                selectMinWeeksInput.setAttribute('id', `${type}-select-${index}`);
                TherapyPlanner.MINWEEKS.forEach((minWeek, i) => {
                    const option = document.createElement('option');
                    option.setAttribute('value', `${minWeek}`);
                    if(item.minWeeks === minWeek){
                        option.setAttribute('selected', 'selected');
                    }
                    const optionText = document.createTextNode(`q-${minWeek}`);
                    option.appendChild(optionText);
                    selectMinWeeksInput.appendChild(option);
                });

                selectMinWeeksInput.addEventListener('change', (event) => {
                    onChangeHandler(TARGETMINWEEKS, type, index, {minWeeks: event.target.value});
                });

                minWeeksCol.appendChild(selectMinWeeksInput);
            }
            row.appendChild(minWeeksCol);
            
            // Min Date column
            const minDateCol = document.createElement('div');
            minDateCol.classList.add(AVAILABLEDATESCOL,'d-flex', 'justify-content-center');
            console.log(index);
            console.log(item.minimumDate);
            minDateCol.textContent = index === 0 ? '-' : item.minimumDate.toLocaleDateString('it-IT', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
            row.appendChild(minDateCol);

            // Available Dates column
            const availableDatesCol = document.createElement('div');
            availableDatesCol.classList.add(AVAILABLEDATESCOL,'d-flex', 'justify-content-center');
        
            const datePickerInput = document.createElement('input');
            datePickerInput.classList.add('form-control');
            datePickerInput.setAttribute('type','date');
            datePickerInput.setAttribute('id',`${type}-date-${index}`);
            if(item.minimumDate){
                if(item.plannedDate - item.minimumDate < 0 ){
                    datePickerInput.setAttribute('value',formatDate(item.minimumDate));
                }else {
                    datePickerInput.setAttribute('value',formatDate(item.plannedDate));
                }
            }

            datePickerInput.addEventListener('change', (event) => {
                onChangeHandler(TARGETDATE, type, index, {date: event.target.value});
            });

            availableDatesCol.appendChild(datePickerInput);
            row.appendChild(availableDatesCol);
            container.appendChild(row);
        });
            
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

    function onChangeHandler(target, type, index, arg){
        console.log('index: ' + index + ' target: ' + target);
        switch (target) {
            case TARGETDATE:
                planner.updateDateFor(type, index, new Date(arg.date));
                break;
            case TARGETMINWEEKS:
                planner.updateMinWeeksFor(type, index, parseInt(arg.minWeeks));
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
    return card;
}