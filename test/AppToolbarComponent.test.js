const test = require('node:test');
const assert = require('node:assert/strict');

const TherapyPlanner = require('../TherapyPlanner.js');
const createAppToolbarComponent = require('../AppToolbarComponent.js');
const patientScheduleModule = require('../PatientSchedule.js');

class MockClassList {
  constructor(owner) {
    this.owner = owner;
    this._classes = new Set();
  }

  add(...names) {
    names.forEach((name) => this._classes.add(name));
    this._sync();
  }

  remove(...names) {
    names.forEach((name) => this._classes.delete(name));
    this._sync();
  }

  contains(name) {
    return this._classes.has(name);
  }

  toggle(name, force) {
    if (force === undefined ? !this._classes.has(name) : force) {
      this._classes.add(name);
    } else {
      this._classes.delete(name);
    }
    this._sync();
  }

  _sync() {
    this.owner.attributes.class = Array.from(this._classes).join(' ');
  }
}

class MockTextNode {
  constructor(text, ownerDocument) {
    this.nodeType = 3;
    this.textContent = text;
    this.ownerDocument = ownerDocument;
    this.parentNode = null;
  }

  cloneNode() {
    return new MockTextNode(this.textContent, this.ownerDocument);
  }
}

class MockElement {
  constructor(tagName, ownerDocument) {
    this.nodeType = 1;
    this.tagName = String(tagName).toUpperCase();
    this.ownerDocument = ownerDocument;
    this.parentNode = null;
    this.children = [];
    this.attributes = {};
    this.eventListeners = {};
    this.classList = new MockClassList(this);
    this._textContent = '';
    this._focused = false;
  }

  set textContent(value) {
    this._textContent = String(value);
    this.children = [];
  }

  get textContent() {
    if (this.children.length > 0) {
      return this.children.map((child) => child.textContent).join('');
    }
    return this._textContent;
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name === 'class') {
      this.classList._classes = new Set(String(value).split(/\s+/).filter(Boolean));
      this.classList._sync();
    }
  }

  getAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attributes, name)
      ? this.attributes[name]
      : null;
  }

  removeAttribute(name) {
    delete this.attributes[name];
  }

  appendChild(child) {
    if (child.parentNode) {
      child.parentNode.removeChild(child);
    }
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  removeChild(child) {
    const index = this.children.indexOf(child);
    if (index !== -1) {
      this.children.splice(index, 1);
      child.parentNode = null;
    }
    return child;
  }

  replaceChildren(...nodes) {
    while (this.children.length > 0) {
      this.removeChild(this.children[0]);
    }
    this._textContent = '';
    nodes.forEach((node) => {
      if (typeof node === 'string') {
        this.appendChild(new MockTextNode(node, this.ownerDocument));
      } else if (node) {
        this.appendChild(node);
      }
    });
  }

  addEventListener(type, handler) {
    if (!this.eventListeners[type]) {
      this.eventListeners[type] = [];
    }
    this.eventListeners[type].push(handler);
  }

  removeEventListener(type, handler) {
    const handlers = this.eventListeners[type] || [];
    const index = handlers.indexOf(handler);
    if (index !== -1) {
      handlers.splice(index, 1);
    }
  }

  dispatchEvent(event) {
    event.target = this;
    event.currentTarget = this;
    (this.eventListeners[event.type] || []).forEach((handler) => handler.call(this, event));
    return !event.defaultPrevented;
  }

  focus() {
    this.ownerDocument.activeElement = this;
    this._focused = true;
  }

  cloneNode(deep) {
    const clone = new MockElement(this.tagName, this.ownerDocument);
    Object.entries(this.attributes).forEach(([name, value]) => clone.setAttribute(name, value));
    clone._textContent = this._textContent;
    if (deep) {
      this.children.forEach((child) => clone.appendChild(child.cloneNode(true)));
    }
    return clone;
  }

  contains(node) {
    let current = node;
    while (current) {
      if (current === this) {
        return true;
      }
      current = current.parentNode;
    }
    return false;
  }

  findById(id) {
    if (this.getAttribute('id') === id) {
      return this;
    }

    for (const child of this.children) {
      if (child.nodeType === 1) {
        const found = child.findById(id);
        if (found) {
          return found;
        }
      }
    }

    return null;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    const matches = [];
    const isMatch = (element) => {
      if (selector.startsWith('#')) {
        return element.getAttribute('id') === selector.slice(1);
      }
      if (selector.startsWith('.')) {
        return element.classList.contains(selector.slice(1));
      }
      return element.tagName === selector.toUpperCase();
    };

    const walk = (node) => {
      node.children.forEach((child) => {
        if (child.nodeType !== 1) {
          return;
        }
        if (isMatch(child)) {
          matches.push(child);
        }
        walk(child);
      });
    };

    walk(this);
    return matches;
  }
}

class MockDocument {
  constructor() {
    this.body = new MockElement('body', this);
    this.documentElement = new MockElement('html', this);
    this.documentElement.appendChild(this.body);
    this.activeElement = null;
    this.eventListeners = {};
  }

  createElement(tagName) {
    return new MockElement(tagName, this);
  }

  createTextNode(text) {
    return new MockTextNode(text, this);
  }

  getElementById(id) {
    return this.documentElement.findById(id);
  }

  querySelector(selector) {
    return this.documentElement.querySelector(selector);
  }

  querySelectorAll(selector) {
    return this.documentElement.querySelectorAll(selector);
  }

  addEventListener(type, handler) {
    if (!this.eventListeners[type]) {
      this.eventListeners[type] = [];
    }
    this.eventListeners[type].push(handler);
  }

  removeEventListener(type, handler) {
    const handlers = this.eventListeners[type] || [];
    const index = handlers.indexOf(handler);
    if (index !== -1) {
      handlers.splice(index, 1);
    }
  }

  dispatchEvent(event) {
    event.target = this;
    (this.eventListeners[event.type] || []).forEach((handler) => handler.call(this, event));
  }
}

class MockWindow {
  constructor(document) {
    this.document = document;
    this.eventListeners = {};
    this._rafQueue = [];
    this.printCallCount = 0;
  }

  addEventListener(type, handler) {
    if (!this.eventListeners[type]) {
      this.eventListeners[type] = [];
    }
    this.eventListeners[type].push(handler);
  }

  removeEventListener(type, handler) {
    const handlers = this.eventListeners[type] || [];
    const index = handlers.indexOf(handler);
    if (index !== -1) {
      handlers.splice(index, 1);
    }
  }

  dispatchEvent(event) {
    event.target = this;
    (this.eventListeners[event.type] || []).forEach((handler) => handler.call(this, event));
  }

  requestAnimationFrame(callback) {
    this._rafQueue.push(callback);
    return this._rafQueue.length;
  }

  flushRAF(limit) {
    const max = limit === undefined ? Infinity : limit;
    let count = 0;
    while (this._rafQueue.length > 0 && count < max) {
      const callback = this._rafQueue.shift();
      callback(0);
      count += 1;
    }
  }

  print() {
    this.printCallCount += 1;
  }
}

function createClickEvent() {
  return {
    type: 'click',
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
  };
}

function createKeydownEvent(key) {
  return {
    type: 'keydown',
    key,
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
  };
}

function withMockDom(run) {
  const originalDocument = global.document;
  const originalWindow = global.window;
  const originalRequestAnimationFrame = global.requestAnimationFrame;

  const mockDocument = new MockDocument();
  const mockWindow = new MockWindow(mockDocument);

  global.document = mockDocument;
  global.window = mockWindow;
  global.requestAnimationFrame = mockWindow.requestAnimationFrame.bind(mockWindow);
  Object.assign(global, patientScheduleModule);

  try {
    return run(mockDocument, mockWindow);
  } finally {
    global.document = originalDocument;
    global.window = originalWindow;
    global.requestAnimationFrame = originalRequestAnimationFrame;
  }
}

function loadPatientScheduleComponent() {
  delete require.cache[require.resolve('../PatientScheduleComponent.js')];
  return require('../PatientScheduleComponent.js');
}

test('app-toolbar: renders header shell with default title and labelled actions container', () => {
  withMockDom(() => {
    const toolbar = createAppToolbarComponent();

    assert.equal(toolbar.tagName, 'HEADER');
    assert.equal(toolbar.getAttribute('id'), 'app-toolbar');
    assert.equal(toolbar.classList.contains('app-toolbar'), true);
    assert.equal(toolbar.classList.contains('no-print'), true);

    const heading = toolbar.querySelector('h1');
    assert.ok(heading);
    assert.equal(heading.textContent, 'TherapyPlanner');

    const actions = toolbar.querySelector('#app-toolbar-actions');
    assert.ok(actions);
    assert.equal(actions.getAttribute('id'), 'app-toolbar-actions');
    assert.equal(actions.getAttribute('aria-label'), 'Application actions');
  });
});

test('app-toolbar: renders a supplied title', () => {
  withMockDom(() => {
    const toolbar = createAppToolbarComponent({ title: 'Clinic Planner' });
    assert.equal(toolbar.querySelector('h1').textContent, 'Clinic Planner');
  });
});

test('app-toolbar: appends supplied action elements without cloning and preserves order', () => {
  withMockDom((mockDocument) => {
    const firstAction = mockDocument.createElement('button');
    const secondAction = mockDocument.createElement('button');
    firstAction.textContent = 'First';
    secondAction.textContent = 'Second';

    const toolbar = createAppToolbarComponent({
      actionElements: [firstAction, secondAction],
    });

    const actions = toolbar.querySelector('#app-toolbar-actions');
    assert.equal(actions.children.length, 2);
    assert.equal(actions.children[0], firstAction);
    assert.equal(actions.children[1], secondAction);
  });
});

test('app-toolbar: tolerates missing, empty, and invalid action entries', () => {
  withMockDom((mockDocument) => {
    const validAction = mockDocument.createElement('button');
    validAction.textContent = 'Valid';

    const toolbar = createAppToolbarComponent({
      actionElements: [null, undefined, 'invalid', { foo: 'bar' }, validAction],
    });

    const actions = toolbar.querySelector('#app-toolbar-actions');
    assert.equal(actions.children.length, 1);
    assert.equal(actions.children[0], validAction);

    const emptyToolbar = createAppToolbarComponent({ actionElements: [] });
    assert.equal(emptyToolbar.querySelector('#app-toolbar-actions').children.length, 0);
  });
});

test('app-toolbar integration: composes patient schedule component inside the action area', () => {
  withMockDom((mockDocument) => {
    const createPatientScheduleComponent = loadPatientScheduleComponent();
    const planner = new TherapyPlanner();
    const patientScheduleElement = createPatientScheduleComponent(planner);
    const toolbar = createAppToolbarComponent({
      title: 'TherapyPlanner',
      actionElements: [patientScheduleElement],
    });

    mockDocument.body.appendChild(toolbar);

    const actions = mockDocument.getElementById('app-toolbar-actions');
    const launchButtons = mockDocument.querySelectorAll('#patient-schedule-launch-btn');
    const launchButton = launchButtons[0];
    const overlay = mockDocument.getElementById('patient-schedule-overlay');
    const dialog = mockDocument.getElementById('patient-schedule-dialog');
    const closeButton = mockDocument.getElementById('patient-schedule-close-btn');
    const printHost = mockDocument.getElementById('patient-schedule-print-host');

    assert.equal(actions.children.length, 1);
    assert.equal(actions.children[0], patientScheduleElement);
    assert.equal(launchButtons.length, 1);
    assert.equal(actions.contains(launchButton), true);
    assert.equal(overlay.classList.contains('open'), false);

    launchButton.dispatchEvent(createClickEvent());
    assert.equal(overlay.classList.contains('open'), true);

    dialog.dispatchEvent(createKeydownEvent('Escape'));
    assert.equal(overlay.classList.contains('open'), false);
    assert.equal(mockDocument.activeElement, launchButton);

    launchButton.dispatchEvent(createClickEvent());
    assert.equal(overlay.classList.contains('open'), true);

    closeButton.dispatchEvent(createClickEvent());
    assert.equal(overlay.classList.contains('open'), false);
    assert.equal(mockDocument.activeElement, launchButton);

    assert.equal(printHost.parentNode, mockDocument.body);
    assert.equal(toolbar.contains(printHost), false);
  });
});
