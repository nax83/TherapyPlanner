function createTherapyListComponent(componentId, type, planner) {

    const eyes = { [TherapyPlanner.LEFTEYE]: 'Left eye', [TherapyPlanner.RIGHTEYE]: 'Right eye' };
    const TARGETMINWEEKS    = 'minWeeks';
    const TARGETDATE        = 'date';
    const INDEXCOLWIDTH     = 'col-1';
    const STATUSCOLWIDTH    = 'col-2';
    const MINWEEKSCOLWIDTH  = 'col-2';
    const MINIMUMDATECOL    = 'col-3';
    const AVAILABLEDATESCOL = 'col-4';

    // ── Component state ───────────────────────────────────────────────────────
    // Keyed message state survives planner-triggered redraws.
    const _messages = {};   // { "RIGHTEYE_0": { error: null, warning: null }, ... }
    let _pendingCompletion = null; // { index } — row waiting for a historical date
    let _selfUpdating = false;     // suppress listener-triggered rebuild during own operations

    function msgKey(idx) { return `${type}_${idx}`; }

    function setMsg(idx, field, value) {
        const k = msgKey(idx);
        if (!_messages[k]) _messages[k] = { error: null, warning: null };
        _messages[k][field] = value || null;
    }
    function clearMsgs(idx) { _messages[msgKey(idx)] = { error: null, warning: null }; }
    function getMsg(idx, field) { return (_messages[msgKey(idx)] || {})[field] || null; }

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
    addButton.addEventListener('click', () => {
        _selfUpdating = true;
        planner.addTherapy(type);
        _selfUpdating = false;
        buildPlan();
    });
    removeButton.appendChild(minusIcon);
    removeButton.addEventListener('click', () => {
        _selfUpdating = true;
        planner.removeTherapy(type);
        _selfUpdating = false;
        buildPlan();
    });

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

    // ── Listeners ─────────────────────────────────────────────────────────────

    function onPlanUpdate() {
        // Suppress re-entry during own operations; external triggers always rebuild.
        if (!_selfUpdating) buildPlan();
    }

    // ── Build DOM ─────────────────────────────────────────────────────────────

    function buildPlan() {
        cleanupTherapyList();
        planner.getPlanByEye(type).forEach((item, index) => {
            const row = document.createElement('div');
            row.classList.add('row', 'align-items-center', 'mt-2');

            const isCompleted = item.status === TherapyPlanner.STATUS_COMPLETED;
            const isPending   = _pendingCompletion !== null && _pendingCompletion.index === index;

            // ── Index column ─────────────────────────────────────────────────
            const indexCol = document.createElement('div');
            indexCol.classList.add(INDEXCOLWIDTH, 'd-flex', 'justify-content-center');
            indexCol.textContent = index + 1;
            row.appendChild(indexCol);

            // ── Status column ────────────────────────────────────────────────
            const statusCol = document.createElement('div');
            statusCol.classList.add(STATUSCOLWIDTH, 'd-flex', 'justify-content-center');

            const statusSelect = document.createElement('select');
            statusSelect.classList.add('form-select', 'form-select-sm');
            statusSelect.setAttribute('id', `${type}-status-${index}`);
            statusSelect.setAttribute('aria-label', `Status for session ${index + 1}`);

            [TherapyPlanner.STATUS_PLANNED, TherapyPlanner.STATUS_COMPLETED].forEach(val => {
                const opt = document.createElement('option');
                opt.setAttribute('value', val);
                // If pending, show "completed" selected but not yet committed
                const effectiveStatus = isPending ? TherapyPlanner.STATUS_COMPLETED : item.status;
                if (effectiveStatus === val) opt.setAttribute('selected', 'selected');
                opt.appendChild(document.createTextNode(val.charAt(0).toUpperCase() + val.slice(1)));
                statusSelect.appendChild(opt);
            });

            statusSelect.addEventListener('change', (event) => {
                const newStatus = event.target.value;
                if (newStatus === TherapyPlanner.STATUS_COMPLETED) {
                    // Open inline date picker — do NOT commit yet
                    _pendingCompletion = { index };
                    _selfUpdating = true;
                    // (no planner mutation — just show form)
                    _selfUpdating = false;
                    buildPlan();
                } else {
                    // If a pending completion for this row is open, cancelling via the selector
                    // is a UI-only cancellation — the underlying appointment is still planned.
                    if (_pendingCompletion !== null && _pendingCompletion.index === index) {
                        _pendingCompletion = null;
                        clearMsgs(index);
                        buildPlan();
                        return;
                    }
                    // Revert completed → planned
                    _selfUpdating = true;
                    const result = planner.setStatus(type, index, TherapyPlanner.STATUS_PLANNED);
                    _selfUpdating = false;
                    clearMsgs(index);
                    if (!result.success) {
                        event.target.value = item.status;
                        setMsg(index, 'error', result.message);
                    }
                    buildPlan();
                }
            });

            statusSelect.value = isPending ? TherapyPlanner.STATUS_COMPLETED : item.status;
            statusCol.appendChild(statusSelect);
            row.appendChild(statusCol);

            // ── Min Weeks column ─────────────────────────────────────────────
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
                    const oldMinWeeks = item.minWeeks;
                    const newVal = parseInt(event.target.value);
                    _selfUpdating = true;
                    const result = planner.updateMinWeeksFor(type, index, newVal);
                    _selfUpdating = false;
                    clearMsgs(index);
                    if (!result.success) {
                        event.target.value = String(oldMinWeeks); // restore dropdown
                        setMsg(index, 'error', result.message);
                    }
                    buildPlan();
                });
                minWeeksCol.appendChild(selectMinWeeksInput);
            }
            row.appendChild(minWeeksCol);

            // ── Min Date column ──────────────────────────────────────────────
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

            // ── Date / form column ───────────────────────────────────────────
            const availableDatesCol = document.createElement('div');
            availableDatesCol.classList.add(AVAILABLEDATESCOL, 'd-flex', 'justify-content-center');

            if (isPending) {
                // Inline atomic form: user picks the historical date and confirms/cancels.
                const completeDateInput = document.createElement('input');
                completeDateInput.classList.add('form-control');
                completeDateInput.setAttribute('type', 'date');
                completeDateInput.setAttribute('id', `${type}-complete-date-${index}`);
                completeDateInput.setAttribute('aria-label', `Historical date for session ${index + 1}`);
                completeDateInput.setAttribute('max', formatDate(planner.today));

                const confirmBtn = document.createElement('button');
                confirmBtn.classList.add('btn', 'btn-sm', 'btn-success', 'ms-1');
                confirmBtn.setAttribute('id', `${type}-complete-confirm-${index}`);
                confirmBtn.textContent = 'OK';
                confirmBtn.addEventListener('click', () => {
                    const raw = completeDateInput.value;
                    if (!raw) { setMsg(index, 'error', 'Please enter a date.'); buildPlan(); return; }
                    const [y, m, d] = raw.split('-').map(Number);
                    _selfUpdating = true;
                    const result = planner.setStatus(type, index, TherapyPlanner.STATUS_COMPLETED, new Date(y, m - 1, d));
                    _selfUpdating = false;
                    _pendingCompletion = null;
                    clearMsgs(index);
                    if (!result.success) {
                        setMsg(index, 'error', result.message);
                    } else if (result.warnings && result.warnings.length) {
                        setMsg(index, 'warning', result.warnings[0]);
                    }
                    buildPlan();
                });

                const cancelBtn = document.createElement('button');
                cancelBtn.classList.add('btn', 'btn-sm', 'btn-secondary', 'ms-1');
                cancelBtn.setAttribute('id', `${type}-complete-cancel-${index}`);
                cancelBtn.textContent = 'Cancel';
                cancelBtn.addEventListener('click', () => {
                    _pendingCompletion = null;
                    clearMsgs(index);
                    buildPlan();
                });

                availableDatesCol.appendChild(completeDateInput);
                availableDatesCol.appendChild(confirmBtn);
                availableDatesCol.appendChild(cancelBtn);
            } else {
                const datePickerInput = document.createElement('input');
                datePickerInput.classList.add('form-control');
                datePickerInput.setAttribute('type', 'date');
                datePickerInput.setAttribute('id', `${type}-date-${index}`);
                datePickerInput.setAttribute('aria-label', `Appointment date for session ${index + 1}`);

                if (isCompleted) {
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
                    _selfUpdating = true;
                    const result = planner.updateDateFor(type, index, new Date(y, m - 1, d));
                    _selfUpdating = false;
                    clearMsgs(index);
                    if (!result.success) {
                        event.target.value = renderValue;
                        setMsg(index, 'error', result.message);
                    } else if (result.warnings && result.warnings.length) {
                        setMsg(index, 'warning', result.warnings[0]);
                    }
                    buildPlan();
                });

                availableDatesCol.appendChild(datePickerInput);
            }

            row.appendChild(availableDatesCol);

            // ── Persistent messages ──────────────────────────────────────────
            const err  = getMsg(index, 'error');
            const warn = getMsg(index, 'warning');
            if (err) {
                const errorDiv = document.createElement('div');
                errorDiv.classList.add('text-danger', 'w-100', 'mt-1', 'therapy-error');
                errorDiv.textContent = err;
                row.appendChild(errorDiv);
            }
            if (warn) {
                const warnDiv = document.createElement('div');
                warnDiv.classList.add('text-warning', 'w-100', 'mt-1', 'therapy-warning');
                warnDiv.textContent = warn;
                row.appendChild(warnDiv);
            }

            container.appendChild(row);
        });
    }

    function cleanupTherapyList() {
        while (container.firstChild) { container.removeChild(container.firstChild); }
    }

    function formatDate(date) {
        const year  = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day   = String(date.getDate()).padStart(2, '0');
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
