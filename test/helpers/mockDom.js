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
    this.value = '';
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
    if (name === 'value') {
      this.value = String(value);
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
    const targetValue = event && event.target && event.target.value !== undefined
      ? event.target.value
      : undefined;
    if (!event.target) {
      event.target = this;
    }
    event.currentTarget = this;
    if (this.tagName === 'SELECT' && event.type === 'change' && targetValue !== undefined) {
      this.value = targetValue;
    }
    (this.eventListeners[event.type] || []).forEach((handler) => handler.call(this, event));
    if (event.bubbles && !event.cancelBubble && this.parentNode) {
      this.parentNode.dispatchEvent(event);
    }
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
    clone.value = this.value;
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

function createChangeEvent(value) {
  return {
    type: 'change',
    target: { value },
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
    bubbles: true,
    cancelBubble: false,
    shiftKey: false,
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
    stopPropagation() {
      this.cancelBubble = true;
    },
  };
}

function createMockStorage(initialValue) {
  const store = new Map();
  if (initialValue !== undefined) {
    store.set('therapyPlanner.preferences.v1', initialValue);
  }
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
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

  try {
    return run(mockDocument, mockWindow);
  } finally {
    global.document = originalDocument;
    global.window = originalWindow;
    global.requestAnimationFrame = originalRequestAnimationFrame;
  }
}

module.exports = {
  MockDocument,
  MockWindow,
  MockElement,
  withMockDom,
  createClickEvent,
  createChangeEvent,
  createKeydownEvent,
  createMockStorage,
};
