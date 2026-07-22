function createTherapyListComponent(componentId, type, planner) {

    const eyes = { [TherapyPlanner.LEFTEYE]: 'Left eye', [TherapyPlanner.RIGHTEYE]: 'Right eye' };
    const TARGETMINWEEKS = 'minWeeks';
    const TARGETDATE = 'date';
    const INDEXCOLWIDTH = 'col-1';
    const STATUSCOLWIDTH = 'col-2';
    const MINWEEKSCOLWIDTH = 'col-2';
    const MINIMUMDATECOL = 'col-3';
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

    const cardHeaderLabel = document.createElement('span');
    cardHeaderLabel.classList.add('mr-auto', 'p-2');
    cardHeaderLabel.textContent = eyes[type];

    const addButton = document.createElement('button');
    addButton.classList.add('btn', 'btn-light', 'p-2');
    addButton.setAttribute('aria-label', `Add session for ${eyes[type]}`);

    const plusIcon = document.createElement('span');
    plusIcon.classList.add('bi', 'bi-plus-circle', 'p-2');

    const removeButton = document.createElement('button');
    removeButton.classList.add('btn', 'btn-light');
    removeButton.setAttribute('aria-label', `Remove last session for ${eyes[type]}`);

    const minusIcon = document.createElement('span');
    minusIcon.classList.add('bi', 'bi-dash-circle');

    addButton.appendChild(plusIcon);
    addButton.addEventListener('click', () => { planner.addTherapy(type); });
    removeButton.appendChild(minusIcon);
    removeButton.addEventListener('click', () => { planner.removeTherapy(type); });

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

    function onPlanUpdate() {
        buildPlan();
    }

    function buildPlan() {
        cleanupTherapyList();
        planner.getPlanByEye(type).forEach((item, index) => {
            const row = document.createElement('div');
            row.classList.add('row', 'align-items-center', 'mt-2');

            const isCompleted = item.status === TherapyPlanner.STATUS_COMPLETED;

            // Index column
            const indexCol = document.createElement('div');
            indexCol.classList.add(INDEXCOLWIDTH, 'd-flex', 'justify-content-center');
            indexCol.textContent = index + 1;
            row.appendChild(indexCol);

            // Status column
            const statusCol = document.createElement('div');
            statusCol.classList.add(STATUSCOLWIDTH, 'd-flex', 'justify-content-center');
            const statusSelect = document.createElement('select');
            statusSelect.classList.add('form-select', 'form-select-sm');
            statusSelect.setAttribute('id', `${type}-status-${index}`);
            statusSelect.setAttribute('aria-label', `Status for session ${index + 1}`);
            [TherapyPlanner.STATUS_PLANNED, TherapyPlanner.STATUS_COMPLETED].forEach(val => {
                const opt = document.createElement('option');
                opt.setAttribute('value', val);
                if (item.status === val) opt.setAttribute('selected', 'selected');
                opt.appendChild(document.createTextNode(val.charAt(0).toUpperCase() + val.slice(1)));
                statusSelect.appendChild(opt);
            });
            statusSelect.addEventListener('change', (event) => {
                const newStatus = event.target.value;
                if (newStatus === TherapyPlanner.STATUS_COMPLETED) {
                    // Use today as the historical date when marking completed
                    const today = planner.today;
                    const result = planner.setStatus(type, index, TherapyPlanner.STATUS_COMPLETED, today);
                    if (!result.success) {
                        event.target.value = item.status; // rollback
                        showRowError(row, result.message);
                    } else {
                        clearRowError(row);
                        if (result.warnings && result.warnings.length) showRowWarning(row, result.warnings[0]);
                    }
                } else {
                    const result = planner.setStatus(type, index, TherapyPlanner.STATUS_PLANNED);
                    if (!result.success) {
                        event.target.value = item.status; // rollback
                        showRowError(row, result.message);
                    } else {
                        clearRowError(row);
                    }
                }
            });
            statusCol.appendChild(statusSelect);
            row.appendChild(statusCol);

            // Min Weeks column
            const minWeeksCol = document.createElement('div');
            minWeeksCol.classList.add(MINWEEKSCOLWIDTH, 'd-flex', 'justify-content-center');
            if (index === 0) {
                minWeeksCol.textContent = '-';
            } else {
                const selectMinWeeksInput = document.createElement('select');
                selectMinWeeksInput.classList.add('form-select');
                selectMinWeeksInput.setAttribute('id', `${type}-select-${index}`);
                selectMinWeeksInput.setAttribute('aria-label', `Minimum interval for session ${index + 1}`);
                TherapyPlanner.MINWEEKS.forEach(minWeek => {
                    const option = document.createElement('option');
                    option.setAttribute('value', `${minWeek}`);
                    if (item.minWeeks === minWeek) option.setAttribute('selected', 'selected');
                    option.appendChild(document.createTextNode(`q-${minWeek}`));
                    selectMinWeeksInput.appendChild(option);
                });
                selectMinWeeksInput.addEventListener('change', (event) => {
                    planner.updateMinWeeksFor(type, index, parseInt(event.target.value));
                });
                minWeeksCol.appendChild(selectMinWeeksInput);
            }
            row.appendChild(minWeeksCol);

            // Min Date column (earliest same-eye date — shown for planned only)
            const minDateCol = document.createElement('div');
            minDateCol.classList.add(MINIMUMDATECOL, 'd-flex', 'justify-content-center');
            if (isCompleted) {
                const badge = document.createElement('span');
                badge.classList.add('badge', 'bg-secondary');
                badge.textContent = 'Completed';
                minDateCol.appendChild(badge);
            } else if (index === 0) {
                minDateCol.textContent = '-';
            } else if (item.earliestSameEyeDate instanceof Date) {
                minDateCol.textContent = item.earliestSameEyeDate.toLocaleDateString('it-IT', {
                    weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
                });
            }
            row.appendChild(minDateCol);

            // Date picker column
            const availableDatesCol = document.createElement('div');
            availableDatesCol.classList.add(AVAILABLEDATESCOL, 'd-flex', 'justify-content-center');

            const datePickerInput = document.createElement('input');
            datePickerInput.classList.add('form-control');
            datePickerInput.setAttribute('type', 'date');
            datePickerInput.setAttribute('id', `${type}-date-${index}`);
            datePickerInput.setAttribute('aria-label', `Appointment date for session ${index + 1}`);

            if (isCompleted) {
                // Completed: allow any past date up to today; no min restriction
                datePickerInput.setAttribute('max', formatDate(planner.today));
            } else if (index === 0) {
                datePickerInput.setAttribute('min', formatDate(planner.today));
            } else if (item.earliestSameEyeDate instanceof Date) {
                datePickerInput.setAttribute('min', formatDate(item.earliestSameEyeDate));
            }

            const valueToSet = item.plannedDate instanceof Date ? formatDate(item.plannedDate) : '';
            datePickerInput.value = valueToSet;
            const renderValue = valueToSet;

            datePickerInput.addEventListener('change', (event) => {
                const rawValue = event.target.value;
                if (!rawValue) return;
                const [y, m, d] = rawValue.split('-').map(Number);
                const result = planner.updateDateFor(type, index, new Date(y, m - 1, d));
                if (!result.success) {
                    event.target.value = renderValue;
                    showRowError(row, result.message);
                } else {
                    clearRowError(row);
                    if (result.warnings && result.warnings.length) showRowWarning(row, result.warnings[0]);
                }
            });

            availableDatesCol.appendChild(datePickerInput);
            row.appendChild(availableDatesCol);
            container.appendChild(row);
        });
    }

    function showRowError(row, message) {
        clearRowError(row);
        const errorDiv = document.createElement('div');
        errorDiv.classList.add('text-danger', 'w-100', 'mt-1', 'therapy-error');
        errorDiv.textContent = message;
        row.appendChild(errorDiv);
    }

    function showRowWarning(row, message) {
        const warnDiv = document.createElement('div');
        warnDiv.classList.add('text-warning', 'w-100', 'mt-1', 'therapy-warning');
        warnDiv.textContent = message;
        row.appendChild(warnDiv);
    }

    function clearRowError(row) {
        const toRemove = Array.from
            ? Array.from(row.children).filter(c => c.classList && c.classList.contains('therapy-error'))
            : row.children.filter(c => c.classList && c.classList.contains('therapy-error'));
        toRemove.forEach(e => row.removeChild(e));
    }

    function cleanupTherapyList() {
        while (container.firstChild) { container.removeChild(container.firstChild); }
    }

    function formatDate(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    function buildHeader() {
        const headerRow = document.createElement('div');
        headerRow.classList.add('row', 'align-items-center', 'g-2');

        const indexCol = document.createElement('div');
        indexCol.classList.add(INDEXCOLWIDTH, 'd-flex', 'justify-content-center');
        indexCol.textContent = 'Index';
        headerRow.appendChild(indexCol);

        const statusCol = document.createElement('div');
        statusCol.classList.add(STATUSCOLWIDTH, 'd-flex', 'justify-content-center');
        statusCol.textContent = 'Status';
        headerRow.appendChild(statusCol);

        const minWeeksCol = document.createElement('div');
        minWeeksCol.classList.add(MINWEEKSCOLWIDTH, 'd-flex', 'justify-content-center');
        minWeeksCol.textContent = 'Min Weeks';
        headerRow.appendChild(minWeeksCol);

        const midDateCol = document.createElement('div');
        midDateCol.classList.add(MINIMUMDATECOL, 'd-flex', 'justify-content-center');
        midDateCol.textContent = 'Min Date';
        headerRow.appendChild(midDateCol);

        const availableDatesCol = document.createElement('div');
        availableDatesCol.classList.add(AVAILABLEDATESCOL, 'd-flex', 'justify-content-center');
        availableDatesCol.textContent = 'Date';
        headerRow.appendChild(availableDatesCol);

        headerContainer.appendChild(headerRow);
    }

    return card;
}

if (typeof module !== 'undefined') {
    module.exports = createTherapyListComponent;
}
