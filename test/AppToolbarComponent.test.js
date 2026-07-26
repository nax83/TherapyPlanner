const test = require('node:test');
const assert = require('node:assert/strict');

const TherapyPlanner = require('../TherapyPlanner.js');
const translations = require('../translations.js');
const { createI18n } = require('../I18n.js');
const createAppToolbarComponent = require('../AppToolbarComponent.js');
const createLanguageSelectorComponent = require('../LanguageSelectorComponent.js');
const createPrivacyInfoComponent = require('../PrivacyInfoComponent.js');
const patientScheduleModule = require('../PatientSchedule.js');
const {
  withMockDom,
  createClickEvent,
  createChangeEvent,
  createKeydownEvent,
  createMockStorage,
} = require('./helpers/mockDom.js');

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
    assert.equal(toolbar.querySelector('h1').textContent, 'TherapyPlanner');
    assert.equal(toolbar.querySelector('#app-toolbar-actions').getAttribute('aria-label'), 'Application actions');
  });
});

test('app-toolbar integration: clinic weekday settings appears between language and privacy and remains isolated from patient print UI', () => {
  const createClinicWeekdaysSettingsComponent = require('../ClinicWeekdaysSettingsComponent.js');

  withMockDom((mockDocument, mockWindow) => {
    Object.assign(global, patientScheduleModule);
    const createPatientScheduleComponent = loadPatientScheduleComponent();
    const i18n = createI18n({
      translations: require('../translations.js'),
      storage: createMockStorage(JSON.stringify({ locale: 'en' })),
      navigator: mockWindow.navigator,
      document: mockDocument,
    });
    const planner = new TherapyPlanner(
      { validAppointmentWeekdays: [2, 3, 4], interEyeGapDays: 14 },
      { today: new Date(2026, 6, 26) },
    );

    const patientScheduleElement = createPatientScheduleComponent(planner, { i18n });
    const languageSelectorElement = createLanguageSelectorComponent(i18n);
    const clinicWeekdaysSettingsElement = createClinicWeekdaysSettingsComponent({ planner, i18n });
    const privacyElement = createPrivacyInfoComponent({
      i18n,
      storageKey: i18n.getStorageKey(),
    });

    const toolbar = createAppToolbarComponent({
      i18n,
      title: 'TherapyPlanner',
      actionElements: [
        patientScheduleElement,
        languageSelectorElement,
        clinicWeekdaysSettingsElement,
        privacyElement,
      ],
    });

    mockDocument.body.appendChild(toolbar);

    const actions = toolbar.querySelector('#app-toolbar-actions');
    assert.equal(actions.children[0], patientScheduleElement);
    assert.equal(actions.children[1], languageSelectorElement);
    assert.equal(actions.children[2], clinicWeekdaysSettingsElement);
    assert.equal(actions.children[3], privacyElement);

    assert.equal(mockDocument.querySelectorAll('#patient-schedule-launch-btn').length, 1);
    assert.equal(mockDocument.querySelectorAll('#app-language-select').length, 1);
    assert.equal(mockDocument.querySelectorAll('#clinic-weekdays-settings-launch-btn').length, 1);
    assert.equal(mockDocument.querySelectorAll('#privacy-info-launch-btn').length, 1);

    i18n.setLocale('de');
    assert.equal(mockDocument.getElementById('clinic-weekdays-settings-launch-btn').textContent.includes('Behandlungstage'), true);

    mockDocument.getElementById('clinic-weekdays-settings-launch-btn').dispatchEvent(createClickEvent());
    assert.equal(mockDocument.getElementById('clinic-weekdays-settings-overlay').getAttribute('aria-hidden'), 'false');
    assert.equal(mockDocument.getElementById('patient-schedule-overlay').classList.contains('hidden'), true);
    assert.equal(mockDocument.getElementById('privacy-info-overlay').getAttribute('aria-hidden'), 'true');

    const printHost = mockDocument.getElementById('patient-schedule-print-host');
    assert.equal(printHost.parentNode, mockDocument.body);
    assert.equal(printHost.querySelector('#clinic-weekdays-settings-overlay'), null);
    assert.equal(toolbar.classList.contains('no-print'), true);
  });
});

test('app-toolbar integration: keeps privacy as the third action and isolates privacy and patient-schedule overlays', () => {
  const createPatientScheduleComponent = loadPatientScheduleComponent();

  withMockDom((mockDocument) => {
    const previousTherapyPlanner = global.TherapyPlanner;

    global.TherapyPlanner = TherapyPlanner;

    try {
      const i18n = createI18n({
        translations,
        navigator: { language: 'en-GB' },
        document: mockDocument,
        storage: createMockStorage(JSON.stringify({ locale: 'en' })),
      });

      const patientScheduleElement = createPatientScheduleComponent({
        validateSchedule: () => ({ valid: true }),
        getPlanByEye: () => [],
      }, { i18n });
      const languageSelectorElement = createLanguageSelectorComponent(i18n);
      const privacyInfoElement = createPrivacyInfoComponent({
        i18n,
        storageKey: i18n.getStorageKey(),
      });

      const toolbar = createAppToolbarComponent({
        title: 'TherapyPlanner',
        i18n,
        actionElements: [patientScheduleElement, languageSelectorElement, privacyInfoElement],
      });

      mockDocument.body.appendChild(toolbar);

      const actions = toolbar.querySelector('.app-toolbar-actions');
      assert.equal(actions.children[0], patientScheduleElement);
      assert.equal(actions.children[1], languageSelectorElement);
      assert.equal(actions.children[2], privacyInfoElement);
      assert.equal(toolbar.querySelectorAll('#patient-schedule-launch-btn').length, 1);
      assert.equal(toolbar.querySelectorAll('#app-language-select').length, 1);
      assert.equal(toolbar.querySelectorAll('#privacy-info-launch-btn').length, 1);

      const languageSelect = mockDocument.getElementById('app-language-select');
      languageSelect.dispatchEvent(createChangeEvent('de'));

      assert.equal(mockDocument.getElementById('privacy-info-launch-btn').textContent.includes('Datenschutz'), true);

      const privacyLaunchButton = mockDocument.getElementById('privacy-info-launch-btn');
      const privacyOverlay = mockDocument.getElementById('privacy-info-overlay');
      const patientLaunchButton = mockDocument.getElementById('patient-schedule-launch-btn');
      const patientOverlay = mockDocument.getElementById('patient-schedule-overlay');
      const printHost = mockDocument.getElementById('patient-schedule-print-host');

      privacyLaunchButton.dispatchEvent(createClickEvent());
      assert.equal(privacyOverlay.classList.contains('open'), true);
      assert.equal(patientOverlay.classList.contains('open'), false);

      patientLaunchButton.dispatchEvent(createClickEvent());
      assert.equal(patientOverlay.classList.contains('open'), true);
      assert.equal(privacyOverlay.classList.contains('open'), true);
      assert.equal(mockDocument.body.children.indexOf(printHost) >= 0, true);
      assert.equal(printHost.parentNode, mockDocument.body);
      assert.equal(printHost.querySelectorAll('#privacy-info-dialog').length, 0);
    } finally {
      global.TherapyPlanner = previousTherapyPlanner;
    }
  });
});

test('app-toolbar: renders a supplied title and preserves action element identity and order', () => {
  withMockDom((mockDocument) => {
    const firstAction = mockDocument.createElement('button');
    const secondAction = mockDocument.createElement('button');
    const toolbar = createAppToolbarComponent({
      title: 'Clinic Planner',
      actionElements: [firstAction, secondAction],
    });

    const actions = toolbar.querySelector('#app-toolbar-actions');
    assert.equal(toolbar.querySelector('h1').textContent, 'Clinic Planner');
    assert.equal(actions.children[0], firstAction);
    assert.equal(actions.children[1], secondAction);
  });
});

test('app-toolbar: tolerates missing, empty, and invalid action entries', () => {
  withMockDom((mockDocument) => {
    const validAction = mockDocument.createElement('button');
    const toolbar = createAppToolbarComponent({
      actionElements: [null, undefined, 'invalid', { foo: 'bar' }, validAction],
    });

    assert.equal(toolbar.querySelector('#app-toolbar-actions').children.length, 1);
    assert.equal(toolbar.querySelector('#app-toolbar-actions').children[0], validAction);
  });
});

test('app-toolbar integration: patient schedule remains first, language selector second, and locale updates labels', () => {
  withMockDom((mockDocument) => {
    Object.assign(global, patientScheduleModule);
    const i18n = createI18n({
      translations,
      document: mockDocument,
      storage: createMockStorage(),
      navigator: { language: 'en-GB' },
    });
    const createPatientScheduleComponent = loadPatientScheduleComponent();
    const planner = new TherapyPlanner();
    const patientScheduleElement = createPatientScheduleComponent(planner, { i18n });
    const languageSelectorElement = createLanguageSelectorComponent(i18n);
    const toolbar = createAppToolbarComponent({
      title: 'TherapyPlanner',
      i18n,
      actionElements: [patientScheduleElement, languageSelectorElement],
    });

    mockDocument.body.appendChild(toolbar);

    const actions = mockDocument.getElementById('app-toolbar-actions');
    const launchButton = mockDocument.getElementById('patient-schedule-launch-btn');
    const languageSelect = mockDocument.getElementById('app-language-select');
    const overlay = mockDocument.getElementById('patient-schedule-overlay');
    const dialog = mockDocument.getElementById('patient-schedule-dialog');
    const closeButton = mockDocument.getElementById('patient-schedule-close-btn');
    const printHost = mockDocument.getElementById('patient-schedule-print-host');

    assert.equal(actions.children[0], patientScheduleElement);
    assert.equal(actions.children[1], languageSelectorElement);
    assert.equal(mockDocument.querySelectorAll('#patient-schedule-launch-btn').length, 1);
    assert.equal(mockDocument.querySelectorAll('#app-language-select').length, 1);
    assert.equal(actions.getAttribute('aria-label'), 'Application actions');

    languageSelect.dispatchEvent(createChangeEvent('de'));
    assert.equal(i18n.getLocale(), 'de');
    assert.equal(actions.getAttribute('aria-label'), 'Anwendungsaktionen');

    launchButton.dispatchEvent(createClickEvent());
    assert.equal(overlay.classList.contains('open'), true);

    dialog.dispatchEvent(createKeydownEvent('Escape'));
    assert.equal(overlay.classList.contains('open'), false);
    assert.equal(mockDocument.activeElement, launchButton);

    launchButton.dispatchEvent(createClickEvent());
    closeButton.dispatchEvent(createClickEvent());
    assert.equal(mockDocument.activeElement, launchButton);
    assert.equal(printHost.parentNode, mockDocument.body);
    assert.equal(toolbar.contains(printHost), false);
  });
});
