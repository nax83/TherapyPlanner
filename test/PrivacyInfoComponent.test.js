const test = require('node:test');
const assert = require('node:assert/strict');

const translations = require('../translations.js');
const { createI18n, I18N_STORAGE_KEY } = require('../I18n.js');
const createPrivacyInfoComponent = require('../PrivacyInfoComponent.js');
const {
  MockDocument,
  createClickEvent,
  createKeydownEvent,
  createMockStorage,
} = require('./helpers/mockDom.js');

function withMockEnvironment(run, options) {
  const settings = options || {};
  const previousDocument = global.document;
  const previousWindow = global.window;
  const previousFetch = global.fetch;
  const mockDocument = new MockDocument();
  const windowObject = settings.windowObject || { document: mockDocument };

  global.document = mockDocument;
  global.window = windowObject;

  if (settings.fetch === undefined) {
    delete global.fetch;
  } else {
    global.fetch = settings.fetch;
  }

  try {
    run(mockDocument, windowObject);
  } finally {
    global.document = previousDocument;
    global.window = previousWindow;

    if (previousFetch === undefined) {
      delete global.fetch;
    } else {
      global.fetch = previousFetch;
    }
  }
}

function createTestI18n(documentObject, locale, storage) {
  return createI18n({
    translations,
    navigator: { language: locale || 'en-GB' },
    document: documentObject,
    storage: storage || createMockStorage(JSON.stringify({ locale: 'en' })),
  });
}

function createShiftTabEvent() {
  return {
    type: 'keydown',
    key: 'Tab',
    shiftKey: true,
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
  };
}

function collectPrivacyKeys(source, prefix, destination) {
  Object.keys(source).forEach((key) => {
    const value = source[key];
    const nextPrefix = prefix ? `${prefix}.${key}` : key;

    if (value && typeof value === 'object' && !Array.isArray(value)) {
      collectPrivacyKeys(value, nextPrefix, destination);
      return;
    }

    destination.push(nextPrefix);
  });
}

test('privacy info: factory returns a print-excluded component root with the required structure', () => {
  withMockEnvironment((mockDocument) => {
    const i18n = createTestI18n(mockDocument, 'en-GB');
    const root = createPrivacyInfoComponent({
      i18n,
      storageKey: I18N_STORAGE_KEY,
    });

    assert.ok(root);
    assert.equal(root.getAttribute('id'), 'privacy-info-root');
    assert.equal(root.classList.contains('no-print'), true);

    const launchButton = root.findById('privacy-info-launch-btn');
    assert.ok(launchButton);
    assert.equal(launchButton.getAttribute('type'), 'button');
    assert.ok(launchButton.textContent.includes('Privacy'));

    const icon = launchButton.querySelector('i');
    assert.ok(icon);
    assert.equal(icon.getAttribute('aria-hidden'), 'true');

    const overlay = root.findById('privacy-info-overlay');
    assert.ok(overlay);
    assert.equal(overlay.classList.contains('no-print'), true);

    const dialog = root.findById('privacy-info-dialog');
    assert.ok(dialog);
    assert.equal(dialog.getAttribute('role'), 'dialog');
    assert.equal(dialog.getAttribute('aria-modal'), 'true');
    assert.equal(dialog.getAttribute('aria-labelledby'), 'privacy-info-title');
    assert.equal(dialog.getAttribute('aria-describedby'), 'privacy-info-intro');

    assert.ok(root.findById('privacy-info-title'));
    assert.ok(root.findById('privacy-info-intro'));
    assert.ok(root.findById('privacy-info-close-btn'));

    const sections = dialog.querySelectorAll('section');
    assert.equal(sections.length, 5);
    assert.ok(root.findById('privacy-info-browser-session'));
    assert.ok(root.findById('privacy-info-stored-preference'));
    assert.ok(root.findById('privacy-info-network'));
    assert.ok(root.findById('privacy-info-printing'));
    assert.ok(root.findById('privacy-info-clinical-use'));

    const storageKeyCode = dialog.querySelector('code');
    assert.ok(storageKeyCode);
    assert.equal(storageKeyCode.textContent, 'therapyPlanner.preferences.v1');

    const closeButton = root.findById('privacy-info-close-btn');
    assert.ok(closeButton.textContent.includes('Close'));
  });
});

test('privacy info: dialog opens, traps focus, closes, and does not duplicate nodes across repeated cycles', () => {
  withMockEnvironment((mockDocument) => {
    const i18n = createTestI18n(mockDocument, 'en-GB');
    const root = createPrivacyInfoComponent({ i18n });
    const launchButton = root.findById('privacy-info-launch-btn');
    const overlay = root.findById('privacy-info-overlay');
    const closeButton = root.findById('privacy-info-close-btn');

    assert.equal(overlay.classList.contains('open'), false);
    assert.equal(overlay.getAttribute('aria-hidden'), 'true');

    launchButton.dispatchEvent(createClickEvent());
    assert.equal(overlay.classList.contains('open'), true);
    assert.equal(overlay.getAttribute('aria-hidden'), 'false');
    assert.equal(mockDocument.activeElement, closeButton);

    const tabEvent = createKeydownEvent('Tab');
    closeButton.dispatchEvent(tabEvent);
    assert.equal(tabEvent.defaultPrevented, true);
    assert.equal(mockDocument.activeElement, closeButton);

    const shiftTabEvent = createShiftTabEvent();
    closeButton.dispatchEvent(shiftTabEvent);
    assert.equal(shiftTabEvent.defaultPrevented, true);
    assert.equal(mockDocument.activeElement, closeButton);

    closeButton.dispatchEvent(createClickEvent());
    assert.equal(overlay.classList.contains('open'), false);
    assert.equal(overlay.getAttribute('aria-hidden'), 'true');
    assert.equal(mockDocument.activeElement, launchButton);

    launchButton.dispatchEvent(createClickEvent());
    closeButton.dispatchEvent(createKeydownEvent('Escape'));
    assert.equal(overlay.classList.contains('open'), false);
    assert.equal(mockDocument.activeElement, launchButton);

    launchButton.dispatchEvent(createClickEvent());
    closeButton.dispatchEvent(createClickEvent());
    launchButton.dispatchEvent(createClickEvent());

    assert.equal(root.querySelectorAll('#privacy-info-overlay').length, 1);
    assert.equal(root.querySelectorAll('#privacy-info-dialog').length, 1);
    assert.equal(root.querySelectorAll('#privacy-info-close-btn').length, 1);
    assert.equal(closeButton.eventListeners.click.length, 1);
    assert.equal(closeButton.eventListeners.keydown.length, 1);
    assert.equal(overlay.eventListeners.keydown.length, 1);
  });
});

test('privacy info: localisation updates all visible text, keeps the dialog open, preserves focus, and does not duplicate subscriptions', () => {
  withMockEnvironment((mockDocument) => {
    const baseI18n = createTestI18n(mockDocument, 'en-GB');
    let subscribeCount = 0;
    const i18n = {
      has: baseI18n.has,
      t: baseI18n.t,
      getLocale: baseI18n.getLocale,
      setLocale: baseI18n.setLocale,
      getStorageKey: baseI18n.getStorageKey,
      subscribe(listener) {
        subscribeCount += 1;
        return baseI18n.subscribe(listener);
      },
    };

    const root = createPrivacyInfoComponent({
      i18n,
      storageKey: baseI18n.getStorageKey(),
    });
    const launchButton = root.findById('privacy-info-launch-btn');
    const closeButton = root.findById('privacy-info-close-btn');
    const overlay = root.findById('privacy-info-overlay');
    const title = root.findById('privacy-info-title');
    const intro = root.findById('privacy-info-intro');
    const headings = root.querySelectorAll('h3');
    const englishTitle = title.textContent;

    assert.equal(subscribeCount, 1);
    assert.equal(launchButton.textContent.includes('Privacy'), true);
    assert.equal(englishTitle, 'Privacy and data handling');
    assert.equal(intro.textContent, 'TherapyPlanner runs in your browser. It does not provide a user account or use an application backend.');

    launchButton.dispatchEvent(createClickEvent());
    assert.equal(mockDocument.activeElement, closeButton);

    i18n.setLocale('de');
    assert.equal(overlay.classList.contains('open'), true);
    assert.equal(title.textContent, 'Datenschutz und Datenverarbeitung');
    assert.notEqual(title.textContent, englishTitle);
    assert.notEqual(intro.textContent, 'TherapyPlanner runs in your browser. It does not provide a user account or use an application backend.');
    assert.deepEqual(headings.map((heading) => heading.textContent), [
      'In diesem Browser verwendete Informationen',
      'Auf diesem Gerät gespeicherte Informationen',
      'Netzwerkanfragen',
      'Drucken und PDF-Dateien',
      'Verwendung im klinischen Umfeld',
    ]);
    assert.equal(closeButton.textContent, 'Schließen');
    assert.equal(mockDocument.activeElement, closeButton);

    i18n.setLocale('it');
    assert.equal(overlay.classList.contains('open'), true);
    assert.equal(title.textContent, 'Privacy e trattamento dei dati');
    assert.deepEqual(headings.map((heading) => heading.textContent), [
      'Informazioni utilizzate nel browser',
      'Informazioni memorizzate sul dispositivo',
      'Richieste di rete',
      'Stampa e file PDF',
      'Uso in ambito clinico',
    ]);
    assert.equal(closeButton.textContent, 'Chiudi');
    assert.equal(root.querySelector('code').textContent, 'therapyPlanner.preferences.v1');
    assert.equal(mockDocument.activeElement, closeButton);

    i18n.setLocale('en');
    assert.equal(title.textContent, 'Privacy and data handling');
    assert.equal(root.querySelectorAll('#privacy-info-title').length, 1);
    assert.equal(root.querySelectorAll('#privacy-info-intro').length, 1);
    assert.equal(root.querySelectorAll('section').length, 5);
  });
});

test('privacy info: every privacy translation key exists in English, German, and Italian without locale fallback dependence', () => {
  const englishKeys = [];
  collectPrivacyKeys(translations.en.privacy, 'privacy', englishKeys);

  const germanKeys = [];
  collectPrivacyKeys(translations.de.privacy, 'privacy', germanKeys);

  const italianKeys = [];
  collectPrivacyKeys(translations.it.privacy, 'privacy', italianKeys);

  assert.deepEqual(germanKeys, englishKeys);
  assert.deepEqual(italianKeys, englishKeys);
});

test('privacy info: creating and opening the component does not access storage, mutate unrelated data, or make network requests', () => {
  let localStorageReadCount = 0;
  let localStorageWriteCount = 0;
  let fetchCalled = false;

  const windowObject = {
    get localStorage() {
      localStorageReadCount += 1;
      return {
        getItem() {
          localStorageReadCount += 1;
          return null;
        },
        setItem() {
          localStorageWriteCount += 1;
        },
      };
    },
  };

  withMockEnvironment((mockDocument) => {
    const unrelatedPlannerSnapshot = {
      items: [{ date: '2026-01-06', status: 'planned' }],
      patientName: 'Example Patient',
    };
    const beforeSnapshot = JSON.stringify(unrelatedPlannerSnapshot);
    const localePreference = { locale: 'de' };
    const beforePreference = JSON.stringify(localePreference);
    const i18n = createTestI18n(mockDocument, 'en-GB');
    const root = createPrivacyInfoComponent({
      i18n,
      planner: unrelatedPlannerSnapshot,
      existingPreference: localePreference,
    });
    const launchButton = root.findById('privacy-info-launch-btn');
    const closeButton = root.findById('privacy-info-close-btn');

    launchButton.dispatchEvent(createClickEvent());
    closeButton.dispatchEvent(createClickEvent());

    assert.equal(JSON.stringify(unrelatedPlannerSnapshot), beforeSnapshot);
    assert.equal(JSON.stringify(localePreference), beforePreference);
    assert.equal(localStorageReadCount, 0);
    assert.equal(localStorageWriteCount, 0);
    assert.equal(fetchCalled, false);
  }, {
    windowObject,
    fetch() {
      fetchCalled = true;
      throw new Error('fetch should not run');
    },
  });
});

test('privacy info: component still works when window.localStorage getter throws', () => {
  const windowObject = {};

  Object.defineProperty(windowObject, 'localStorage', {
    get() {
      throw new Error('blocked');
    },
  });

  withMockEnvironment((mockDocument) => {
    const i18n = createTestI18n(mockDocument, 'en-GB');
    const root = createPrivacyInfoComponent({ i18n });
    const launchButton = root.findById('privacy-info-launch-btn');
    const overlay = root.findById('privacy-info-overlay');

    launchButton.dispatchEvent(createClickEvent());
    assert.equal(overlay.classList.contains('open'), true);
  }, { windowObject });
});
