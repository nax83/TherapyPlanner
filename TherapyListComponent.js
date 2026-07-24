function createTherapyListComponent(cardId, type, planner) {
    const INDEXCOLWIDTH    = 'col-1';
    const ACTIONCOLWIDTH   = 'col-2';
    const MINWEEKSCOLWIDTH = 'col-2';
    const MINDATECOLWIDTH  = 'col-3';
    const DATECOLWIDTH     = 'col-4';
    const EM_DASH = '—';

    let _messages = {};
    let _pendingAction = null;
    let _selfUpdating = false;
    let _focusRequestId = null;

    const card = document.createElement('div');
    card.setAttribute('id', cardId);
    card.classList.add('card', 'mt-3');

    const container = document.createElement('div');
    container.setAttribute('id', `container-${type}`);

    function eyeLabel() {
        return type === TherapyPlanner.RIGHTEYE ? 'right eye' : 'left eye';
    }

    function headerLabel() {
        return type === TherapyPlanner.RIGHTEYE ? 'Right eye' : 'Left eye';
    }

    function msgKey(index) {
        return `${type}_${index}`;
    }

    function setMsg(index, field, value) {
        const key = msgKey(index);
        if (!_messages[key]) _messages[key] = { error: null, warning: null };
        _messages[key][field] = value || null;
    }

    function clearMsgs(index) {
        delete _messages[msgKey(index)];
    }

    function getMsg(index, field) {
        const entry = _messages[msgKey(index)];
        return entry ? entry[field] : null;
    }

    function formatDate(date) {
        if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
        const year = String(date.getFullYear());
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    function parseCalendarDate(rawValue) {
        const parts = String(rawValue || '').split('-').map(Number);
        if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
        return new Date(parts[0], parts[1] - 1, parts[2]);
    }

    function queueFocus(id) {
        _focusRequestId = id || null;
    }

    function applyQueuedFocus() {
        if (!_focusRequestId) return;
        const target = typeof card.findById === 'function'
            ? card.findById(_focusRequestId)
            : null;
        _focusRequestId = null;
        if (target && typeof target.focus === 'function') target.focus();
    }

    function clearPendingActionIfStale(plan) {
        if (_pendingAction && _pendingAction.index >= plan.length) {
            _pendingAction = null;
        }
    }

    function performPlannerMutation(index, mutation) {
        clearMsgs(index);
        _selfUpdating = true;
        const result = mutation();
        _selfUpdating = false;

        if (!result || result.success === false) {
            setMsg(index, 'error', result && result.message ? result.message : 'Unable to update this appointment.');
            buildPlan();
            return false;
        }

        setMsg(index, 'warning', result.warnings && result.warnings.length ? result.warnings[0] : null);
        _pendingAction = null;
        buildPlan();
        return true;
    }

    function onPlanUpdate() {
        if (!_selfUpdating) buildPlan();
    }

    function buildHeader() {
        const cardHeader = document.createElement('div');
        cardHeader.classList.add('card-header', 'd-flex', 'justify-content-between', 'align-items-center');

        const title = document.createElement('h5');
        title.classList.add('mb-0');
        title.textContent = headerLabel();

        const controls = document.createElement('div');
        controls.classList.add('d-flex', 'gap-2');

        const addButton = document.createElement('button');
        addButton.classList.add('btn', 'btn-sm', 'btn-outline-primary');
        addButton.setAttribute('type', 'button');
        addButton.setAttribute('id', `${type}-add-therapy`);
        addButton.textContent = 'Add';
        addButton.addEventListener('click', () => {
            planner.addTherapy(type);
        });

        const removeButton = document.createElement('button');
        removeButton.classList.add('btn', 'btn-sm', 'btn-outline-danger');
        removeButton.setAttribute('type', 'button');
        removeButton.setAttribute('id', `${type}-remove-therapy`);
        removeButton.textContent = 'Remove';
        removeButton.addEventListener('click', () => {
            planner.removeTherapy(type);
        });

        controls.appendChild(addButton);
        controls.appendChild(removeButton);
        cardHeader.appendChild(title);
        cardHeader.appendChild(controls);
        card.appendChild(cardHeader);
    }

    function buildGridHeader() {
        // Outer container matches the id used by existing tests for header lookup
        const headerContainer = document.createElement('div');
        headerContainer.setAttribute('id', `header-container-${type}`);

        const headerRow = document.createElement('div');
        headerRow.classList.add('row', 'fw-semibold', 'text-muted', 'small', 'mt-2', 'mb-1', 'align-items-center');

        const indexCol = document.createElement('div');
        indexCol.classList.add(INDEXCOLWIDTH);
        indexCol.textContent = '#';
        headerRow.appendChild(indexCol);

        const actionCol = document.createElement('div');
        actionCol.classList.add(ACTIONCOLWIDTH);
        actionCol.textContent = 'Action';
        headerRow.appendChild(actionCol);

        const minWeeksCol = document.createElement('div');
        minWeeksCol.classList.add(MINWEEKSCOLWIDTH);
        minWeeksCol.textContent = 'Min Weeks';
        headerRow.appendChild(minWeeksCol);

        // "Suggested earliest" column — exact wording and accessibility from main
        const midDateCol = document.createElement('div');
        midDateCol.classList.add(MINDATECOLWIDTH);
        midDateCol.textContent = 'Suggested earliest';
        midDateCol.setAttribute(
            'title',
            'Earliest clinic date that keeps the currently scheduled appointments in the other eye unchanged.'
        );
        midDateCol.setAttribute(
            'aria-label',
            'Suggested earliest: earliest clinic date that keeps the currently scheduled appointments in the other eye unchanged.'
        );
        headerRow.appendChild(midDateCol);

        const dateCol = document.createElement('div');
        dateCol.classList.add(DATECOLWIDTH);
        dateCol.textContent = 'Date';
        headerRow.appendChild(dateCol);

        headerContainer.appendChild(headerRow);
        container.appendChild(headerContainer);
    }

    function appendMessage(col, id, text, kind) {
        if (!text) return;
        const node = document.createElement('div');
        node.setAttribute('id', id);
        node.setAttribute('role', kind === 'error' ? 'alert' : 'status');
        node.setAttribute('aria-live', kind === 'error' ? 'assertive' : 'polite');
        node.classList.add('mt-1', 'small', kind === 'error' ? 'text-danger' : 'text-warning');
        node.textContent = text;
        col.appendChild(node);
    }

    function buildMinWeeksControl(item, index) {
        const col = document.createElement('div');
        col.classList.add(MINWEEKSCOLWIDTH);

        const select = document.createElement('select');
        select.classList.add('form-select', 'form-select-sm');
        select.setAttribute('id', `${type}-minweeks-${index}`);
        select.setAttribute('aria-label', `Minimum interval for session ${index + 1} of the ${eyeLabel()}`);

        TherapyPlanner.MINWEEKS.forEach((minWeek) => {
            const option = document.createElement('option');
            option.setAttribute('value', String(minWeek));
            option.textContent = `${minWeek} weeks`;
            if (minWeek === item.minWeeks) option.selected = true;
            select.appendChild(option);
        });

        select.addEventListener('change', (event) => {
            const result = planner.updateMinWeeksFor(type, index, Number(event.target.value));
            if (!result || result.success === false) {
                setMsg(index, 'error', result && result.message ? result.message : 'Unable to update the minimum interval.');
                buildPlan();
                return;
            }
            setMsg(index, 'error', null);
            setMsg(index, 'warning', result.warnings && result.warnings.length ? result.warnings[0] : null);
            buildPlan();
        });

        col.appendChild(select);
        return col;
    }

    // Suggested-earliest column cell — uses getDateGuidanceFor for planned rows.
    function buildSuggestedDateCol(item, index) {
        const col = document.createElement('div');
        col.classList.add(MINDATECOLWIDTH, 'd-flex', 'align-items-center');

        if (item.status === TherapyPlanner.STATUS_COMPLETED) {
            col.textContent = EM_DASH;
            return col;
        }

        const guidance = planner.getDateGuidanceFor(type, index);
        if (guidance.success && guidance.editable && guidance.suggestedEarliestDate instanceof Date) {
            col.textContent = guidance.suggestedEarliestDate.toLocaleDateString('it-IT', {
                weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
            });
        } else {
            col.textContent = EM_DASH;
        }

        return col;
    }

    // Ordinary date input — uses hardLowerBoundDate as min for planned, max for completed.
    function buildDateInput(item, index) {
        const dateInput = document.createElement('input');
        dateInput.classList.add('form-control', 'form-control-sm');
        dateInput.setAttribute('type', 'date');
        dateInput.setAttribute('id', `${type}-date-${index}`);
        dateInput.setAttribute('aria-label', `Date for session ${index + 1} of the ${eyeLabel()}`);
        dateInput.value = formatDate(item.plannedDate);

        if (item.status === TherapyPlanner.STATUS_COMPLETED) {
            dateInput.setAttribute('max', formatDate(planner.today));
        } else {
            const guidance = planner.getDateGuidanceFor(type, index);
            if (guidance.success && guidance.editable && guidance.hardLowerBoundDate instanceof Date) {
                dateInput.setAttribute('min', formatDate(guidance.hardLowerBoundDate));
            }
        }

        dateInput.addEventListener('change', (event) => {
            const nextDate = parseCalendarDate(event.target.value);
            const result = planner.updateDateFor(type, index, nextDate);
            if (!result || result.success === false) {
                setMsg(index, 'error', result && result.message ? result.message : 'Unable to update the date.');
                buildPlan();
                return;
            }
            setMsg(index, 'error', null);
            setMsg(index, 'warning', result.warnings && result.warnings.length ? result.warnings[0] : null);
            buildPlan();
        });

        return dateInput;
    }

    function buildCompletionForm(item, index, actionCol, dateCol) {
        const statusText = document.createElement('div');
        statusText.classList.add('small', 'text-muted');
        statusText.textContent = 'Completing...';
        actionCol.appendChild(statusText);

        const label = document.createElement('label');
        label.classList.add('form-label', 'small', 'mb-1');
        label.setAttribute('for', `${type}-complete-date-${index}`);
        label.textContent = 'Treatment date';

        const dateInput = document.createElement('input');
        dateInput.classList.add('form-control', 'form-control-sm');
        dateInput.setAttribute('type', 'date');
        dateInput.setAttribute('id', `${type}-complete-date-${index}`);
        dateInput.setAttribute('aria-label', `Treatment date for session ${index + 1} of the ${eyeLabel()}`);
        dateInput.setAttribute('max', formatDate(planner.today));
        dateInput.value = formatDate(planner.today);

        const buttons = document.createElement('div');
        buttons.classList.add('d-flex', 'gap-2', 'mt-2');

        const confirmBtn = document.createElement('button');
        confirmBtn.classList.add('btn', 'btn-sm', 'btn-success');
        confirmBtn.setAttribute('type', 'button');
        confirmBtn.setAttribute('id', `${type}-complete-confirm-${index}`);
        confirmBtn.textContent = 'Confirm';
        confirmBtn.addEventListener('click', () => {
            const treatmentDate = parseCalendarDate(dateInput.value);
            performPlannerMutation(index, () => planner.setStatus(
                type, index, TherapyPlanner.STATUS_COMPLETED, treatmentDate
            ));
        });

        const cancelBtn = document.createElement('button');
        cancelBtn.classList.add('btn', 'btn-sm', 'btn-outline-secondary');
        cancelBtn.setAttribute('type', 'button');
        cancelBtn.setAttribute('id', `${type}-complete-cancel-${index}`);
        cancelBtn.textContent = 'Cancel';
        cancelBtn.addEventListener('click', () => {
            clearMsgs(index);
            _pendingAction = null;
            queueFocus(`${type}-mark-completed-${index}`);
            buildPlan();
        });

        buttons.appendChild(confirmBtn);
        buttons.appendChild(cancelBtn);
        dateCol.appendChild(label);
        dateCol.appendChild(dateInput);
        dateCol.appendChild(buttons);
        queueFocus(`${type}-complete-date-${index}`);
    }

    function buildRestoreConfirmation(index, actionCol) {
        const badge = document.createElement('span');
        badge.classList.add('badge', 'bg-success');
        badge.setAttribute('id', `${type}-completed-badge-${index}`);
        badge.textContent = '✓ Completed';

        const prompt = document.createElement('div');
        prompt.classList.add('small');
        prompt.textContent = 'Restore this treatment as a planned appointment?';

        const buttons = document.createElement('div');
        buttons.classList.add('d-flex', 'gap-2');

        const restoreBtn = document.createElement('button');
        restoreBtn.classList.add('btn', 'btn-sm', 'btn-outline-secondary');
        restoreBtn.setAttribute('type', 'button');
        restoreBtn.setAttribute('id', `${type}-restore-confirm-${index}`);
        restoreBtn.textContent = 'Restore';
        restoreBtn.addEventListener('click', () => {
            performPlannerMutation(index, () => planner.setStatus(
                type, index, TherapyPlanner.STATUS_PLANNED
            ));
        });

        const cancelBtn = document.createElement('button');
        cancelBtn.classList.add('btn', 'btn-sm', 'btn-outline-secondary');
        cancelBtn.setAttribute('type', 'button');
        cancelBtn.setAttribute('id', `${type}-restore-cancel-${index}`);
        cancelBtn.textContent = 'Cancel';
        cancelBtn.addEventListener('click', () => {
            clearMsgs(index);
            _pendingAction = null;
            queueFocus(`${type}-restore-planned-${index}`);
            buildPlan();
        });

        buttons.appendChild(restoreBtn);
        buttons.appendChild(cancelBtn);
        actionCol.appendChild(badge);
        actionCol.appendChild(prompt);
        actionCol.appendChild(buttons);
    }

    function buildActionCol(item, index, actionCol, dateCol) {
        const isPending = _pendingAction && _pendingAction.index === index;

        if (item.status === TherapyPlanner.STATUS_COMPLETED) {
            actionCol.classList.add('d-flex', 'flex-column', 'gap-1');
            if (isPending && _pendingAction.kind === 'restore') {
                buildRestoreConfirmation(index, actionCol);
                return;
            }

            const badge = document.createElement('span');
            badge.classList.add('badge', 'bg-success', 'align-self-start');
            badge.setAttribute('id', `${type}-completed-badge-${index}`);
            badge.textContent = '✓ Completed';

            const restoreBtn = document.createElement('button');
            restoreBtn.classList.add('btn', 'btn-sm', 'btn-outline-secondary');
            restoreBtn.setAttribute('type', 'button');
            restoreBtn.setAttribute('id', `${type}-restore-planned-${index}`);
            restoreBtn.setAttribute('aria-label', `Restore session ${index + 1} for the ${eyeLabel()} as planned`);
            restoreBtn.textContent = 'Restore as planned';
            restoreBtn.addEventListener('click', () => {
                _pendingAction = { kind: 'restore', index };
                queueFocus(`${type}-restore-confirm-${index}`);
                buildPlan();
            });

            actionCol.appendChild(badge);
            actionCol.appendChild(restoreBtn);
            return;
        }

        if (isPending && _pendingAction.kind === 'complete') {
            actionCol.classList.add('d-flex', 'flex-column', 'gap-1');
            buildCompletionForm(item, index, actionCol, dateCol);
            return;
        }

        const button = document.createElement('button');
        button.classList.add('btn', 'btn-sm', 'btn-outline-success');
        button.setAttribute('type', 'button');
        button.setAttribute('id', `${type}-mark-completed-${index}`);
        button.setAttribute('aria-label', `Mark session ${index + 1} for the ${eyeLabel()} as completed`);
        button.textContent = 'Mark as completed';
        button.addEventListener('click', () => {
            _pendingAction = { kind: 'complete', index };
            queueFocus(`${type}-complete-date-${index}`);
            buildPlan();
        });
        actionCol.appendChild(button);
    }

    function buildPlan() {
        while (card.firstChild) card.removeChild(card.firstChild);
        while (container.firstChild) container.removeChild(container.firstChild);

        const plan = planner.getPlanByEye(type);
        clearPendingActionIfStale(plan);

        buildHeader();

        const body = document.createElement('div');
        body.classList.add('card-body');
        card.appendChild(body);
        body.appendChild(container);
        buildGridHeader();

        plan.forEach((item, index) => {
            const row = document.createElement('div');
            row.classList.add('row', 'align-items-center', 'mt-2');
            row.setAttribute('id', `${type}-row-${index}`);

            const isCompleting = _pendingAction
                && _pendingAction.kind === 'complete'
                && _pendingAction.index === index;

            const indexCol = document.createElement('div');
            indexCol.classList.add(INDEXCOLWIDTH);
            indexCol.textContent = String(index + 1);

            const actionCol = document.createElement('div');
            actionCol.classList.add(ACTIONCOLWIDTH);

            const minWeeksCol = buildMinWeeksControl(item, index);
            const suggestedDateCol = buildSuggestedDateCol(item, index);

            const dateCol = document.createElement('div');
            dateCol.classList.add(DATECOLWIDTH);
            // One-date-input invariant: ordinary input is absent while completing.
            if (!isCompleting) {
                dateCol.appendChild(buildDateInput(item, index));
            }

            buildActionCol(item, index, actionCol, dateCol);

            appendMessage(dateCol, `${type}-error-${index}`, getMsg(index, 'error'), 'error');
            appendMessage(dateCol, `${type}-warning-${index}`, getMsg(index, 'warning'), 'warning');

            row.appendChild(indexCol);
            row.appendChild(actionCol);
            row.appendChild(minWeeksCol);
            row.appendChild(suggestedDateCol);
            row.appendChild(dateCol);
            container.appendChild(row);
        });

        applyQueuedFocus();
    }

    planner.addListener(onPlanUpdate);
    buildPlan();
    return card;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = createTherapyListComponent;
}
