'use strict';
const test = require('node:test');
const assert = require('assert/strict');

const TherapyPlanner = require('../TherapyPlanner.js');
global.TherapyPlanner = TherapyPlanner;

// Re-require component freshly to pick up global.TherapyPlanner
delete require.cache[require.resolve('../TherapyListComponent.js')];
const createTherapyListComponent = require('../TherapyListComponent.js');

// ─── Mock DOM ────────────────────────────────────────────────────────────────

class MockClassList {
    constructor() { this.values = new Set(); }
    add(...names) { names.forEach((n) => this.values.add(n)); }
    contains(name) { return this.values.has(name); }
}

class MockElement {
    constructor(tagName, ownerDocument) {
        this.tagName = String(tagName).toUpperCase();
        this.ownerDocument = ownerDocument;
        this.children = [];
        this.parentNode = null;
        this.attributes = {};
        this.eventListeners = {};
        this.classList = new MockClassList();
        this.value = '';
        this.selected = false;
        this._textContent = '';
    }

    appendChild(child) {
        child.parentNode = this;
        this.children.push(child);
        return child;
    }

    removeChild(child) {
        const idx = this.children.indexOf(child);
        if (idx >= 0) this.children.splice(idx, 1);
        child.parentNode = null;
        return child;
    }

    get firstChild() { return this.children[0] || null; }

    setAttribute(name, value) {
        this.attributes[name] = String(value);
        if (name === 'id') this.id = String(value);
        if (name === 'value') this.value = String(value);
    }

    getAttribute(name) {
        return Object.prototype.hasOwnProperty.call(this.attributes, name)
            ? this.attributes[name]
            : null;
    }

    addEventListener(eventName, handler) {
        if (!this.eventListeners[eventName]) this.eventListeners[eventName] = [];
        this.eventListeners[eventName].push(handler);
    }

    focus() {
        if (this.ownerDocument) this.ownerDocument.activeElement = this;
    }

    findById(id) {
        if (this.id === id) return this;
        for (const child of this.children) {
            const found = child.findById ? child.findById(id) : null;
            if (found) return found;
        }
        return null;
    }

    get textContent() {
        return this._textContent + this.children.map((c) => c.textContent).join('');
    }

    set textContent(value) {
        this._textContent = String(value);
        this.children = [];
    }
}

class MockTextNode {
    constructor(text) { this.textContent = text; this.children = []; }
    findById() { return null; }
}

class MockDocument {
    constructor() {
        this.activeElement = null;
        this.body = new MockElement('body', this);
    }
    createElement(tagName) { return new MockElement(tagName, this); }
    createTextNode(text) { return new MockTextNode(text); }
    getElementById(id) { return this.body.findById(id); }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function withMockDom(run) {
    const prev = global.document;
    const doc = new MockDocument();
    global.document = doc;
    try {
        return run(doc);
    } finally {
        global.document = prev;
    }
}

function click(element) {
    assert.ok(element, 'click target must exist');
    const handlers = element.eventListeners.click || [];
    assert.ok(handlers.length > 0, 'click handler must exist');
    handlers[0]({ target: element });
}

function changeValue(element, value) {
    assert.ok(element, 'change target must exist');
    element.value = value;
    const handlers = element.eventListeners.change || [];
    assert.ok(handlers.length > 0, 'change handler must exist');
    handlers[0]({ target: element });
}

function flatten(node) {
    const items = [node];
    (node.children || []).forEach((child) => items.push(...flatten(child)));
    return items;
}

function collectByText(node, text) {
    return flatten(node).filter((e) => e.textContent.includes(text));
}

function collectDateInputs(node) {
    return flatten(node).filter(
        (e) => e.tagName === 'INPUT' && e.getAttribute('type') === 'date'
    );
}

function fmt(date) {
    const y = String(date.getFullYear());
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function snapshotPlanner(planner) {
    return [TherapyPlanner.RIGHTEYE, TherapyPlanner.LEFTEYE].map((eye) =>
        planner.getPlanByEye(eye).map((item) => ({
            minWeeks: item.minWeeks,
            plannedDate: fmt(item.plannedDate),
            status: item.status,
            dateOrigin: item.dateOrigin,
        }))
    );
}

function createMountedComponents(planner) {
    const doc = new MockDocument();
    global.document = doc;
    const right = createTherapyListComponent('right-card', TherapyPlanner.RIGHTEYE, planner);
    const left  = createTherapyListComponent('left-card',  TherapyPlanner.LEFTEYE,  planner);
    doc.body.appendChild(right);
    doc.body.appendChild(left);
    return { doc, right, left };
}

function withFrozenNow(isoDate, run) {
    const RealDate = Date;
    const frozen = new RealDate(`${isoDate}T12:00:00`);
    function FakeDate(...args) {
        if (this instanceof FakeDate) {
            if (args.length === 0) return new RealDate(frozen.getTime());
            return new RealDate(...args);
        }
        return RealDate(...args);
    }
    FakeDate.UTC = RealDate.UTC;
    FakeDate.parse = RealDate.parse;
    FakeDate.now = () => frozen.getTime();
    FakeDate.prototype = RealDate.prototype;
    global.Date = FakeDate;
    try { return run(); } finally { global.Date = RealDate; }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test('ui-test-1: no status select is rendered for planned and completed rows', () => {
    withMockDom(() => {
        const planner = new TherapyPlanner({}, { today: new Date(2026, 6, 22) });
        planner.setStatus(TherapyPlanner.RIGHTEYE, 0, TherapyPlanner.STATUS_COMPLETED, new Date(2026, 6, 20));
        const { right } = createMountedComponents(planner);
        assert.equal(right.findById(`${TherapyPlanner.RIGHTEYE}-status-0`), null);
        assert.equal(right.findById(`${TherapyPlanner.RIGHTEYE}-status-1`), null);
        assert.equal(
            flatten(right).some((n) => n.tagName === 'SELECT' && /planned|completed/i.test(n.textContent)),
            false
        );
    });
});

test('ui-test-2: planned row shows mark-as-completed without planned badge', () => {
    withMockDom(() => {
        const planner = new TherapyPlanner({}, { today: new Date(2026, 0, 6) });
        const { right } = createMountedComponents(planner);
        const button = right.findById(`${TherapyPlanner.RIGHTEYE}-mark-completed-0`);
        assert.ok(button, 'mark-as-completed button must exist');
        assert.equal(button.textContent, 'Mark as completed');
        assert.equal(collectByText(right, 'Planned').length, 0);
    });
});

test('ui-test-3: opening completion form is mutation-free and has exactly one date input', () => {
    withMockDom(() => {
        const planner = new TherapyPlanner({}, { today: new Date(2026, 0, 6) });
        const before = snapshotPlanner(planner);
        const { right } = createMountedComponents(planner);
        click(right.findById(`${TherapyPlanner.RIGHTEYE}-mark-completed-0`));

        const row0 = right.findById(`${TherapyPlanner.RIGHTEYE}-row-0`);
        assert.ok(row0, 'row 0 must exist');
        const dateInput = right.findById(`${TherapyPlanner.RIGHTEYE}-complete-date-0`);
        assert.ok(dateInput, 'completion date input must exist');
        assert.equal(
            right.findById(`${TherapyPlanner.RIGHTEYE}-date-0`),
            null,
            'ordinary appointment date input must be absent in completion mode'
        );
        assert.equal(dateInput.value, fmt(planner.today));
        assert.equal(dateInput.getAttribute('max'), fmt(planner.today));
        assert.equal(collectDateInputs(row0).length, 1);
        assert.deepEqual(snapshotPlanner(planner), before);
    });
});

test('ui-test-4: cancelling completion keeps appointment planned and restores ordinary input', () => {
    withMockDom(() => {
        const planner = new TherapyPlanner({}, { today: new Date(2026, 0, 6) });
        const originalDate = fmt(planner.getPlanByEye(TherapyPlanner.RIGHTEYE)[0].plannedDate);
        const { right } = createMountedComponents(planner);
        click(right.findById(`${TherapyPlanner.RIGHTEYE}-mark-completed-0`));
        click(right.findById(`${TherapyPlanner.RIGHTEYE}-complete-cancel-0`));

        const appt0 = planner.getPlanByEye(TherapyPlanner.RIGHTEYE)[0];
        assert.equal(appt0.status, TherapyPlanner.STATUS_PLANNED);
        assert.equal(fmt(appt0.plannedDate), originalDate);
        assert.equal(right.findById(`${TherapyPlanner.RIGHTEYE}-complete-date-0`), null);
        const row0 = right.findById(`${TherapyPlanner.RIGHTEYE}-row-0`);
        assert.ok(row0, 'row 0 must exist after cancel');
        const ordinaryInput = right.findById(`${TherapyPlanner.RIGHTEYE}-date-0`);
        assert.ok(ordinaryInput, 'ordinary input must return after cancel');
        assert.equal(ordinaryInput.value, originalDate);
        assert.equal(collectDateInputs(row0).length, 1);
        assert.ok(right.findById(`${TherapyPlanner.RIGHTEYE}-mark-completed-0`), 'mark button must return');
    });
});

test('ui-test-5: successful completion stores treatment date and shows completed badge', () => {
    withMockDom(() => {
        const planner = new TherapyPlanner({}, { today: new Date(2026, 6, 22) });
        const { right } = createMountedComponents(planner);
        click(right.findById(`${TherapyPlanner.RIGHTEYE}-mark-completed-0`));
        right.findById(`${TherapyPlanner.RIGHTEYE}-complete-date-0`).value = '2026-07-20';
        click(right.findById(`${TherapyPlanner.RIGHTEYE}-complete-confirm-0`));

        const appt0 = planner.getPlanByEye(TherapyPlanner.RIGHTEYE)[0];
        assert.equal(appt0.status, TherapyPlanner.STATUS_COMPLETED);
        assert.equal(fmt(appt0.plannedDate), '2026-07-20');
        assert.equal(right.findById(`${TherapyPlanner.RIGHTEYE}-complete-date-0`), null);
        const ordinaryInput = right.findById(`${TherapyPlanner.RIGHTEYE}-date-0`);
        assert.ok(ordinaryInput, 'ordinary completed-date input must exist');
        assert.equal(ordinaryInput.value, '2026-07-20');
        assert.equal(ordinaryInput.getAttribute('max'), fmt(planner.today));
        const row0 = right.findById(`${TherapyPlanner.RIGHTEYE}-row-0`);
        assert.ok(row0);
        assert.equal(collectDateInputs(row0).length, 1);
        assert.ok(right.findById(`${TherapyPlanner.RIGHTEYE}-completed-badge-0`), 'completed badge must exist');
        assert.equal(right.findById(`${TherapyPlanner.RIGHTEYE}-mark-completed-0`), null);
    });
});

test('ui-test-6: failed completion preserves planned state and shows error, one treatment-date input', () => {
    withMockDom(() => {
        const planner = new TherapyPlanner({}, { today: new Date(2026, 0, 6) });
        const original = snapshotPlanner(planner);
        const { right } = createMountedComponents(planner);
        click(right.findById(`${TherapyPlanner.RIGHTEYE}-mark-completed-0`));
        // Future date — should be rejected
        right.findById(`${TherapyPlanner.RIGHTEYE}-complete-date-0`).value = '2026-12-25';
        click(right.findById(`${TherapyPlanner.RIGHTEYE}-complete-confirm-0`));

        assert.deepEqual(snapshotPlanner(planner), original);
        const completionInput = right.findById(`${TherapyPlanner.RIGHTEYE}-complete-date-0`);
        assert.ok(completionInput, 'pending form must stay visible');
        assert.equal(right.findById(`${TherapyPlanner.RIGHTEYE}-date-0`), null);
        const row0 = right.findById(`${TherapyPlanner.RIGHTEYE}-row-0`);
        assert.ok(row0);
        assert.equal(collectDateInputs(row0).length, 1);
        const error = right.findById(`${TherapyPlanner.RIGHTEYE}-error-0`);
        assert.ok(error, 'error node must exist');
        assert.match(error.textContent, /cannot be dated after today/i);
        assert.equal(right.findById(`${TherapyPlanner.RIGHTEYE}-completed-badge-0`), null);
    });
});

test('ui-test-7: completed row shows badge, restore action, em dash, and bounded date input', () => {
    withMockDom(() => {
        const planner = new TherapyPlanner({}, { today: new Date(2026, 6, 22) });
        planner.setStatus(TherapyPlanner.RIGHTEYE, 0, TherapyPlanner.STATUS_COMPLETED, new Date(2026, 6, 20));
        const { right } = createMountedComponents(planner);

        const badge = right.findById(`${TherapyPlanner.RIGHTEYE}-completed-badge-0`);
        const restore = right.findById(`${TherapyPlanner.RIGHTEYE}-restore-planned-0`);
        const dateInput = right.findById(`${TherapyPlanner.RIGHTEYE}-date-0`);
        assert.ok(badge, 'completed badge must exist');
        assert.match(badge.textContent, /completed/i);
        assert.ok(restore, 'restore button must exist');
        assert.ok(dateInput, 'date input must exist');
        assert.equal(dateInput.getAttribute('max'), fmt(planner.today));

        const emDashes = collectByText(right, '—');
        assert.ok(emDashes.length > 0, 'completed row must show em dash in suggested date column');
    });
});

test('ui-test-8: first restore click is mutation-free', () => {
    withMockDom(() => {
        const planner = new TherapyPlanner({}, { today: new Date(2026, 6, 22) });
        planner.setStatus(TherapyPlanner.RIGHTEYE, 0, TherapyPlanner.STATUS_COMPLETED, new Date(2026, 6, 20));
        const before = snapshotPlanner(planner);
        const { right } = createMountedComponents(planner);
        click(right.findById(`${TherapyPlanner.RIGHTEYE}-restore-planned-0`));

        assert.ok(right.findById(`${TherapyPlanner.RIGHTEYE}-restore-confirm-0`), 'restore confirmation must exist');
        assert.deepEqual(snapshotPlanner(planner), before);
    });
});

test('ui-test-9: cancelling restore keeps appointment completed', () => {
    withMockDom(() => {
        const planner = new TherapyPlanner({}, { today: new Date(2026, 6, 22) });
        planner.setStatus(TherapyPlanner.RIGHTEYE, 0, TherapyPlanner.STATUS_COMPLETED, new Date(2026, 6, 20));
        const originalDate = fmt(planner.getPlanByEye(TherapyPlanner.RIGHTEYE)[0].plannedDate);
        const { right } = createMountedComponents(planner);
        click(right.findById(`${TherapyPlanner.RIGHTEYE}-restore-planned-0`));
        click(right.findById(`${TherapyPlanner.RIGHTEYE}-restore-cancel-0`));

        const appt0 = planner.getPlanByEye(TherapyPlanner.RIGHTEYE)[0];
        assert.equal(appt0.status, TherapyPlanner.STATUS_COMPLETED);
        assert.equal(fmt(appt0.plannedDate), originalDate);
        assert.ok(right.findById(`${TherapyPlanner.RIGHTEYE}-completed-badge-0`), 'completed badge must remain');
        assert.ok(right.findById(`${TherapyPlanner.RIGHTEYE}-restore-planned-0`), 'restore action must return');
    });
});

test('ui-test-10: successful restore reverts to planned and redraws both eyes', () => {
    withMockDom(() => {
        const planner = new TherapyPlanner({}, { today: new Date(2026, 6, 22) });
        planner.setStatus(TherapyPlanner.RIGHTEYE, 0, TherapyPlanner.STATUS_COMPLETED, new Date(2026, 6, 20));
        const { right, left } = createMountedComponents(planner);
        const leftBefore = left.findById(`${TherapyPlanner.LEFTEYE}-date-0`).value;

        click(right.findById(`${TherapyPlanner.RIGHTEYE}-restore-planned-0`));
        click(right.findById(`${TherapyPlanner.RIGHTEYE}-restore-confirm-0`));

        const appt0 = planner.getPlanByEye(TherapyPlanner.RIGHTEYE)[0];
        assert.equal(appt0.status, TherapyPlanner.STATUS_PLANNED);
        assert.equal(right.findById(`${TherapyPlanner.RIGHTEYE}-completed-badge-0`), null);
        assert.ok(right.findById(`${TherapyPlanner.RIGHTEYE}-mark-completed-0`), 'mark button must reappear');
        assert.notEqual(left.findById(`${TherapyPlanner.LEFTEYE}-date-0`).value, leftBefore);
    });
});

test('ui-test-10b: other rows keep ordinary date inputs while row 0 is completing', () => {
    withMockDom(() => {
        const planner = new TherapyPlanner({}, { today: new Date(2026, 0, 6) });
        const { right } = createMountedComponents(planner);
        click(right.findById(`${TherapyPlanner.RIGHTEYE}-mark-completed-0`));

        const row0 = right.findById(`${TherapyPlanner.RIGHTEYE}-row-0`);
        const row1 = right.findById(`${TherapyPlanner.RIGHTEYE}-row-1`);
        const row2 = right.findById(`${TherapyPlanner.RIGHTEYE}-row-2`);
        assert.ok(row0); assert.ok(row1); assert.ok(row2);
        assert.ok(right.findById(`${TherapyPlanner.RIGHTEYE}-complete-date-0`));
        assert.equal(right.findById(`${TherapyPlanner.RIGHTEYE}-date-0`), null);
        assert.ok(right.findById(`${TherapyPlanner.RIGHTEYE}-date-1`));
        assert.ok(right.findById(`${TherapyPlanner.RIGHTEYE}-date-2`));
        assert.equal(collectDateInputs(row0).length, 1);
        assert.equal(collectDateInputs(row1).length, 1);
        assert.equal(collectDateInputs(row2).length, 1);
    });
});

test('ui-test-10c: opening completion on another row closes the previous completion form', () => {
    withMockDom(() => {
        const planner = new TherapyPlanner({}, { today: new Date(2026, 0, 6) });
        const { right } = createMountedComponents(planner);
        click(right.findById(`${TherapyPlanner.RIGHTEYE}-mark-completed-0`));
        click(right.findById(`${TherapyPlanner.RIGHTEYE}-mark-completed-1`));

        const row0 = right.findById(`${TherapyPlanner.RIGHTEYE}-row-0`);
        const row1 = right.findById(`${TherapyPlanner.RIGHTEYE}-row-1`);
        assert.ok(row0); assert.ok(row1);
        assert.ok(right.findById(`${TherapyPlanner.RIGHTEYE}-date-0`), 'row 0 ordinary date must return');
        assert.equal(right.findById(`${TherapyPlanner.RIGHTEYE}-complete-date-0`), null);
        assert.equal(right.findById(`${TherapyPlanner.RIGHTEYE}-date-1`), null);
        assert.ok(right.findById(`${TherapyPlanner.RIGHTEYE}-complete-date-1`));
        assert.equal(collectDateInputs(row0).length, 1);
        assert.equal(collectDateInputs(row1).length, 1);
        assert.equal(
            flatten(right).filter((e) =>
                e.getAttribute && e.getAttribute('type') === 'date' && e.id && e.id.includes('-complete-date-')
            ).length,
            1
        );
    });
});

test('ui-test-11: failed restore rolls back and keeps completed row intact', () => {
    withMockDom(() => {
        const planner = new TherapyPlanner({}, { today: new Date(2026, 6, 22) });
        planner.setStatus(TherapyPlanner.RIGHTEYE, 0, TherapyPlanner.STATUS_COMPLETED, new Date(2026, 6, 20));
        const original = snapshotPlanner(planner);
        const originalSetStatus = planner.setStatus.bind(planner);
        planner.setStatus = (t, i, status, d) => {
            if (status === TherapyPlanner.STATUS_PLANNED) {
                return { success: false, message: 'Restore blocked for test', changedAppointments: [], warnings: [] };
            }
            return originalSetStatus(t, i, status, d);
        };

        const { right } = createMountedComponents(planner);
        click(right.findById(`${TherapyPlanner.RIGHTEYE}-restore-planned-0`));
        click(right.findById(`${TherapyPlanner.RIGHTEYE}-restore-confirm-0`));

        assert.deepEqual(snapshotPlanner(planner), original);
        assert.ok(right.findById(`${TherapyPlanner.RIGHTEYE}-completed-badge-0`));
        const error = right.findById(`${TherapyPlanner.RIGHTEYE}-error-0`);
        assert.ok(error);
        assert.match(error.textContent, /restore blocked for test/i);
    });
});

test('ui-test-12: completed date correction keeps completed status and triggers historical cascade', () => {
    withFrozenNow('2026-03-17', () => {
        withMockDom(() => {
            const planner = new TherapyPlanner({}, { today: new Date(2026, 2, 17) });
            planner.setStatus(TherapyPlanner.RIGHTEYE, 0, TherapyPlanner.STATUS_COMPLETED, new Date(2026, 1, 10));
            assert.equal(fmt(planner.getPlanByEye(TherapyPlanner.RIGHTEYE)[0].plannedDate), '2026-02-10');

            const { right, left } = createMountedComponents(planner);
            changeValue(right.findById(`${TherapyPlanner.RIGHTEYE}-date-0`), '2026-03-10');

            const updatedRight0 = planner.getPlanByEye(TherapyPlanner.RIGHTEYE)[0];
            const updatedLeft0  = planner.getPlanByEye(TherapyPlanner.LEFTEYE)[0];
            assert.equal(updatedRight0.status, TherapyPlanner.STATUS_COMPLETED);
            assert.equal(fmt(updatedRight0.plannedDate), '2026-03-10');
            assert.equal(fmt(updatedLeft0.plannedDate), '2026-03-24');
            assert.equal(updatedLeft0.status, TherapyPlanner.STATUS_PLANNED);
            assert.equal(updatedLeft0.dateOrigin, 'generated');
            assert.equal(left.findById(`${TherapyPlanner.LEFTEYE}-date-0`).value, '2026-03-24');
        });
    });
});

test('ui-test-13: editing a planned date never infers completed status', () => {
    withMockDom(() => {
        const planner = new TherapyPlanner({}, { today: new Date(2026, 6, 22) });
        const { right } = createMountedComponents(planner);
        changeValue(right.findById(`${TherapyPlanner.RIGHTEYE}-date-1`), '2026-08-27');

        const appt1 = planner.getPlanByEye(TherapyPlanner.RIGHTEYE)[1];
        assert.equal(appt1.status, TherapyPlanner.STATUS_PLANNED);
        assert.equal(right.findById(`${TherapyPlanner.RIGHTEYE}-completed-badge-1`), null);
        assert.equal(right.findById(`${TherapyPlanner.RIGHTEYE}-complete-date-1`), null);
    });
});

test('ui-test-14: changing minWeeks cascades and does not restore status select', () => {
    withMockDom(() => {
        const planner = new TherapyPlanner({}, { today: new Date(2026, 0, 6) });
        const { right, left } = createMountedComponents(planner);
        const leftBefore = left.findById(`${TherapyPlanner.LEFTEYE}-date-1`).value;

        changeValue(right.findById(`${TherapyPlanner.RIGHTEYE}-minweeks-1`), '6');

        assert.equal(planner.getPlanByEye(TherapyPlanner.RIGHTEYE)[1].minWeeks, 6);
        assert.notEqual(left.findById(`${TherapyPlanner.LEFTEYE}-date-1`).value, leftBefore);
        assert.equal(right.findById(`${TherapyPlanner.RIGHTEYE}-status-1`), null);
    });
});

test('ui-test-15: add/remove works and stale pending action is cleared', () => {
    withMockDom(() => {
        const planner = new TherapyPlanner({}, { today: new Date(2026, 0, 6) });
        const { right } = createMountedComponents(planner);

        click(right.findById(`${TherapyPlanner.RIGHTEYE}-add-therapy`));
        assert.equal(planner.getPlanByEye(TherapyPlanner.RIGHTEYE).length, 4);
        assert.ok(right.findById(`${TherapyPlanner.RIGHTEYE}-mark-completed-3`));

        click(right.findById(`${TherapyPlanner.RIGHTEYE}-mark-completed-3`));
        click(right.findById(`${TherapyPlanner.RIGHTEYE}-remove-therapy`));

        assert.equal(planner.getPlanByEye(TherapyPlanner.RIGHTEYE).length, 3);
        assert.equal(right.findById(`${TherapyPlanner.RIGHTEYE}-complete-date-3`), null);
        assert.ok(right.findById(`${TherapyPlanner.RIGHTEYE}-mark-completed-2`));
    });
});

test('ui-test-16: planner is immutable under UI-only open/cancel actions', () => {
    withMockDom(() => {
        const planner = new TherapyPlanner({}, { today: new Date(2026, 6, 22) });
        planner.setStatus(TherapyPlanner.RIGHTEYE, 0, TherapyPlanner.STATUS_COMPLETED, new Date(2026, 6, 20));
        const { right } = createMountedComponents(planner);
        const before = snapshotPlanner(planner);

        click(right.findById(`${TherapyPlanner.RIGHTEYE}-restore-planned-0`));
        click(right.findById(`${TherapyPlanner.RIGHTEYE}-restore-cancel-0`));
        click(right.findById(`${TherapyPlanner.RIGHTEYE}-mark-completed-1`));
        click(right.findById(`${TherapyPlanner.RIGHTEYE}-complete-cancel-1`));

        assert.deepEqual(snapshotPlanner(planner), before);
    });
});

test('ui-test-17: completed row has exactly one date input in restore-confirmation state', () => {
    withMockDom(() => {
        const planner = new TherapyPlanner({}, { today: new Date(2026, 6, 22) });
        planner.setStatus(TherapyPlanner.RIGHTEYE, 0, TherapyPlanner.STATUS_COMPLETED, new Date(2026, 6, 20));
        const { right } = createMountedComponents(planner);

        const row0 = right.findById(`${TherapyPlanner.RIGHTEYE}-row-0`);
        assert.ok(row0);
        assert.ok(right.findById(`${TherapyPlanner.RIGHTEYE}-date-0`));
        assert.equal(right.findById(`${TherapyPlanner.RIGHTEYE}-complete-date-0`), null);
        assert.equal(collectDateInputs(row0).length, 1);

        click(right.findById(`${TherapyPlanner.RIGHTEYE}-restore-planned-0`));

        assert.ok(right.findById(`${TherapyPlanner.RIGHTEYE}-restore-confirm-0`));
        assert.ok(right.findById(`${TherapyPlanner.RIGHTEYE}-date-0`), 'completed-date input must remain');
        assert.equal(right.findById(`${TherapyPlanner.RIGHTEYE}-complete-date-0`), null);
        assert.equal(collectDateInputs(row0).length, 1);
    });
});

// ─── Interaction tests: status-actions × date guidance ───────────────────────

test('guidance-integration-1: planned rows show suggestedEarliestDate in suggestion column', () => {
    withMockDom(() => {
        const today = new Date(2026, 0, 6);
        const planner = new TherapyPlanner({}, { today });
        const { right } = createMountedComponents(planner);

        // right[0]: index=0, suggestedEarliestDate should be today (Jan6, no left conflicts)
        const g0 = planner.getDateGuidanceFor(TherapyPlanner.RIGHTEYE, 0);
        assert.ok(g0.success && g0.editable);
        const expected0 = g0.suggestedEarliestDate.toLocaleDateString('it-IT', {
            weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
        });
        assert.ok(
            collectByText(right, expected0).length > 0,
            `right[0] row must show "${expected0}"`
        );
    });
});

test('guidance-integration-2: planned date input uses hardLowerBoundDate as min', () => {
    withMockDom(() => {
        const today = new Date(2026, 0, 6);
        const planner = new TherapyPlanner({}, { today });
        const { right } = createMountedComponents(planner);

        for (let i = 0; i < planner.getPlanByEye(TherapyPlanner.RIGHTEYE).length; i++) {
            const input = right.findById(`${TherapyPlanner.RIGHTEYE}-date-${i}`);
            assert.ok(input, `date input ${i} must exist`);
            const g = planner.getDateGuidanceFor(TherapyPlanner.RIGHTEYE, i);
            assert.ok(g.success && g.editable);
            const hld = g.hardLowerBoundDate;
            const expectedMin = `${hld.getFullYear()}-${String(hld.getMonth()+1).padStart(2,'0')}-${String(hld.getDate()).padStart(2,'0')}`;
            assert.equal(input.getAttribute('min'), expectedMin,
                `date input ${i} min must be hardLowerBoundDate ${expectedMin}`);
        }
    });
});

test('guidance-integration-3: completed rows show em dash in suggestion column (no guidance)', () => {
    withMockDom(() => {
        const planner = new TherapyPlanner({}, { today: new Date(2026, 6, 22) });
        planner.setStatus(TherapyPlanner.RIGHTEYE, 0, TherapyPlanner.STATUS_COMPLETED, new Date(2026, 6, 20));
        const { right } = createMountedComponents(planner);

        const row0 = right.findById(`${TherapyPlanner.RIGHTEYE}-row-0`);
        assert.ok(row0, 'row 0 must exist');
        // Em dash in suggestion column
        assert.ok(collectByText(row0, '—').length > 0, 'completed row must show em dash in suggestion column');
        // Confirm no guidance min attr on completed date input
        const dateInput = right.findById(`${TherapyPlanner.RIGHTEYE}-date-0`);
        assert.ok(dateInput);
        assert.equal(dateInput.getAttribute('min'), null, 'completed input must not have min');
    });
});

test('guidance-integration-4: mutation in one eye refreshes suggestion in the other eye', () => {
    withMockDom(() => {
        const today = new Date(2026, 0, 6);
        const planner = new TherapyPlanner({}, { today });
        const { right, left } = createMountedComponents(planner);

        // Get initial left[0] suggestion
        const g1 = planner.getDateGuidanceFor(TherapyPlanner.LEFTEYE, 0);
        assert.ok(g1.success && g1.editable);
        const oldSuggestion = g1.suggestedEarliestDate.toLocaleDateString('it-IT', {
            weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
        });
        assert.ok(collectByText(left, oldSuggestion).length > 0, 'left must initially show old suggestion');

        // Move right[0] to Jan13 via real input handler
        const rightInput = right.findById(`${TherapyPlanner.RIGHTEYE}-date-0`);
        assert.ok(rightInput);
        rightInput.value = '2026-01-13';
        rightInput.eventListeners['change'][0]({ target: rightInput });

        // left[0] suggestion must now be Jan27 (Jan13+14)
        const g2 = planner.getDateGuidanceFor(TherapyPlanner.LEFTEYE, 0);
        const newSuggestion = g2.suggestedEarliestDate.toLocaleDateString('it-IT', {
            weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
        });
        assert.ok(collectByText(left, newSuggestion).length > 0, 'left must show updated suggestion');
        assert.equal(collectByText(left, oldSuggestion).length, 0, 'stale suggestion must be gone');
    });
});

test('guidance-integration-5: completion mode hides ordinary date input and shows exactly one treatment-date input', () => {
    withMockDom(() => {
        const today = new Date(2026, 0, 6);
        const planner = new TherapyPlanner({}, { today });
        const { right } = createMountedComponents(planner);

        // Row 0 in completion mode: ordinary date input gone, treatment-date input present
        click(right.findById(`${TherapyPlanner.RIGHTEYE}-mark-completed-0`));

        const row0 = right.findById(`${TherapyPlanner.RIGHTEYE}-row-0`);
        assert.ok(row0);
        assert.equal(right.findById(`${TherapyPlanner.RIGHTEYE}-date-0`), null,
            'ordinary planned-date input must be absent in completion mode');
        assert.ok(right.findById(`${TherapyPlanner.RIGHTEYE}-complete-date-0`),
            'treatment-date input must exist');
        assert.equal(collectDateInputs(row0).length, 1);
    });
});

test('guidance-integration-6: header says "Suggested earliest" with correct title and aria-label', () => {
    withMockDom(() => {
        const planner = new TherapyPlanner({}, { today: new Date(2026, 0, 6) });
        const { right } = createMountedComponents(planner);

        const headerContainer = right.findById(`header-container-${TherapyPlanner.RIGHTEYE}`);
        assert.ok(headerContainer, 'header-container must exist');

        function findWithAttr(el, attr) {
            if (!el) return null;
            if (el.getAttribute && el.getAttribute(attr)) return el;
            for (const child of (el.children || [])) {
                const f = findWithAttr(child, attr);
                if (f) return f;
            }
            return null;
        }

        const col = findWithAttr(headerContainer, 'title');
        assert.ok(col, 'suggested-earliest column must have title');
        assert.ok(col.textContent.includes('Suggested earliest'));
        assert.equal(
            col.getAttribute('title'),
            'Earliest clinic date that keeps the currently scheduled appointments in the other eye unchanged.'
        );
        assert.equal(
            col.getAttribute('aria-label'),
            'Suggested earliest: earliest clinic date that keeps the currently scheduled appointments in the other eye unchanged.'
        );
    });
});

// ─── Focus handling tests ─────────────────────────────────────────────────────

test('focus-1: opening completion workflow focuses the treatment-date input', () => {
    const planner = new TherapyPlanner({}, { today: new Date(2026, 0, 6) });
    const { doc, right } = createMountedComponents(planner);
    click(right.findById(`${TherapyPlanner.RIGHTEYE}-mark-completed-0`));
    const treatmentInput = doc.getElementById(`${TherapyPlanner.RIGHTEYE}-complete-date-0`);
    assert.ok(treatmentInput, 'treatment-date input must exist');
    assert.equal(doc.activeElement, treatmentInput, 'focus must be on treatment-date input');
    global.document = undefined;
});

test('focus-2: cancelling completion focuses the mark-as-completed button', () => {
    const planner = new TherapyPlanner({}, { today: new Date(2026, 0, 6) });
    const { doc, right } = createMountedComponents(planner);
    click(right.findById(`${TherapyPlanner.RIGHTEYE}-mark-completed-0`));
    click(right.findById(`${TherapyPlanner.RIGHTEYE}-complete-cancel-0`));
    const markBtn = doc.getElementById(`${TherapyPlanner.RIGHTEYE}-mark-completed-0`);
    assert.ok(markBtn, 'mark-as-completed button must exist after cancel');
    assert.equal(doc.activeElement, markBtn, 'focus must return to mark-as-completed button');
    global.document = undefined;
});

test('focus-3: opening restore confirmation focuses the restore-confirm button', () => {
    const planner = new TherapyPlanner({}, { today: new Date(2026, 6, 22) });
    planner.setStatus(TherapyPlanner.RIGHTEYE, 0, TherapyPlanner.STATUS_COMPLETED, new Date(2026, 6, 20));
    const { doc, right } = createMountedComponents(planner);
    click(right.findById(`${TherapyPlanner.RIGHTEYE}-restore-planned-0`));
    const confirmBtn = doc.getElementById(`${TherapyPlanner.RIGHTEYE}-restore-confirm-0`);
    assert.ok(confirmBtn, 'restore-confirm button must exist');
    assert.equal(doc.activeElement, confirmBtn, 'focus must be on restore-confirm button');
    global.document = undefined;
});

test('focus-4: cancelling restore focuses the restore-as-planned button', () => {
    const planner = new TherapyPlanner({}, { today: new Date(2026, 6, 22) });
    planner.setStatus(TherapyPlanner.RIGHTEYE, 0, TherapyPlanner.STATUS_COMPLETED, new Date(2026, 6, 20));
    const { doc, right } = createMountedComponents(planner);
    click(right.findById(`${TherapyPlanner.RIGHTEYE}-restore-planned-0`));
    click(right.findById(`${TherapyPlanner.RIGHTEYE}-restore-cancel-0`));
    const restoreBtn = doc.getElementById(`${TherapyPlanner.RIGHTEYE}-restore-planned-0`);
    assert.ok(restoreBtn, 'restore-as-planned button must exist after cancel');
    assert.equal(doc.activeElement, restoreBtn, 'focus must return to restore-as-planned button');
    global.document = undefined;
});

// ─── Min Weeks tests ──────────────────────────────────────────────────────────

test('minweeks-1: row zero has no Min Weeks select', () => {
    const planner = new TherapyPlanner({}, { today: new Date(2026, 0, 6) });
    const { right } = createMountedComponents(planner);
    assert.equal(right.findById(`${TherapyPlanner.RIGHTEYE}-minweeks-0`), null,
        'no minweeks select for row zero');
    const row0 = right.findById(`${TherapyPlanner.RIGHTEYE}-row-0`);
    assert.ok(row0);
    assert.equal(flatten(row0).filter((e) => e.tagName === 'SELECT').length, 0,
        'no select element at all in row zero');
    global.document = undefined;
});

test('minweeks-2: row zero shows a dash placeholder in the min-weeks column', () => {
    const planner = new TherapyPlanner({}, { today: new Date(2026, 0, 6) });
    const { right } = createMountedComponents(planner);
    const row0 = right.findById(`${TherapyPlanner.RIGHTEYE}-row-0`);
    assert.ok(row0);
    assert.ok(collectByText(row0, '—').length > 0,
        'row zero must display a dash placeholder for min weeks');
    global.document = undefined;
});

test('minweeks-3: later rows have editable Min Weeks selects', () => {
    const planner = new TherapyPlanner({}, { today: new Date(2026, 0, 6) });
    const { right } = createMountedComponents(planner);
    for (let i = 1; i < planner.getPlanByEye(TherapyPlanner.RIGHTEYE).length; i++) {
        const sel = right.findById(`${TherapyPlanner.RIGHTEYE}-minweeks-${i}`);
        assert.ok(sel, `minweeks select must exist for row ${i}`);
        assert.equal(sel.tagName, 'SELECT');
    }
    global.document = undefined;
});

test('minweeks-4: changing a later row Min Weeks invokes updateMinWeeksFor and redraws', () => {
    const planner = new TherapyPlanner({}, { today: new Date(2026, 0, 6) });
    const { right, left } = createMountedComponents(planner);
    const initialRight1Date = planner.getPlanByEye(TherapyPlanner.RIGHTEYE)[1].plannedDate;
    changeValue(right.findById(`${TherapyPlanner.RIGHTEYE}-minweeks-1`), '8');
    assert.equal(planner.getPlanByEye(TherapyPlanner.RIGHTEYE)[1].minWeeks, 8);
    const newRight1Date = planner.getPlanByEye(TherapyPlanner.RIGHTEYE)[1].plannedDate;
    assert.ok(newRight1Date >= initialRight1Date, 'right[1] date must not move earlier after minWeeks increase');
    assert.ok(right.findById(`${TherapyPlanner.RIGHTEYE}-minweeks-1`), 'minweeks select must still exist after redraw');
    assert.ok(left.findById(`${TherapyPlanner.LEFTEYE}-row-0`), 'left plan must still render after redraw');
    global.document = undefined;
});
