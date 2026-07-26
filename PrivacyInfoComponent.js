const DEFAULT_PRIVACY_STORAGE_KEY = 'therapyPlanner.preferences.v1';

const DEFAULT_PRIVACY_TRANSLATIONS = {
  privacy: {
    launch: 'Privacy',
    title: 'Privacy and data handling',
    intro: 'TherapyPlanner runs in your browser. It does not provide a user account or use an application backend.',
    browserSession: {
      title: 'Information used in this browser',
      paragraph1: 'Patient names, appointment dates, treatment-status changes and generated schedules are handled only in the current page session.',
      paragraph2: 'TherapyPlanner does not persist this information. It is reset when the page is reloaded.',
    },
    storedPreference: {
      title: 'Information stored on this device',
      beforeKey: 'The application stores only your interface language and selected clinic weekdays in this browser under the following key:',
      afterKey: 'No patient name, appointment, treatment status or printed document is stored under this key.',
      unavailable: 'If browser storage is unavailable, the language selection remains active only for the current page session.',
    },
    network: {
      title: 'Network requests',
      paragraph1: 'TherapyPlanner does not send patient names, appointments or treatment statuses to an application backend and does not include analytics or advertising.',
      paragraph2: 'The page currently loads interface libraries and icons from external content-delivery networks. Those providers and the website host may receive technical request data such as the IP address, browser information, requested file, request time and referrer, according to their own policies.',
    },
    printing: {
      title: 'Printing and PDF files',
      paragraph1: 'Printing or saving as PDF is handled by your browser and operating system. TherapyPlanner does not upload the patient appointment list.',
      paragraph2: 'A PDF or printed copy may contain patient information. Store and share it appropriately.',
    },
    clinicalUse: {
      title: 'Use in a clinical context',
      paragraph1: 'Enter only the patient-identifying information that is necessary and verify the appointment plan with the clinic.',
      paragraph2: 'This notice describes the application\'s technical behaviour. It is not the legal privacy notice of a clinic or healthcare provider.',
    },
    close: 'Close',
  },
};

function getNestedValue(source, path) {
  return path.split('.').reduce(function reduceValue(current, key) {
    if (!current || typeof current !== 'object') {
      return undefined;
    }

    return current[key];
  }, source);
}

function createPrivacyInfoComponent(options) {
  const settings = options || {};
  const i18n = settings.i18n || null;
  const storageKey = typeof settings.storageKey === 'string' && settings.storageKey
    ? settings.storageKey
    : DEFAULT_PRIVACY_STORAGE_KEY;
  const documentObject = typeof document !== 'undefined' ? document : null;

  if (!documentObject || typeof documentObject.createElement !== 'function') {
    throw new Error('PrivacyInfoComponent requires a document.');
  }

  function translate(key) {
    if (i18n && typeof i18n.has === 'function' && i18n.has(key) && typeof i18n.t === 'function') {
      return i18n.t(key);
    }

    return getNestedValue(DEFAULT_PRIVACY_TRANSLATIONS, key) || key;
  }

  const root = documentObject.createElement('div');
  root.setAttribute('id', 'privacy-info-root');
  root.classList.add('privacy-info-root', 'no-print');

  const launchButton = documentObject.createElement('button');
  launchButton.setAttribute('id', 'privacy-info-launch-btn');
  launchButton.setAttribute('type', 'button');
  launchButton.classList.add('btn', 'btn-outline-secondary', 'privacy-info-launch-btn');

  const launchIcon = documentObject.createElement('i');
  launchIcon.classList.add('bi', 'bi-shield-lock');
  launchIcon.setAttribute('aria-hidden', 'true');

  const launchText = documentObject.createElement('span');
  launchText.classList.add('privacy-info-launch-text');

  launchButton.appendChild(launchIcon);
  launchButton.appendChild(launchText);

  const overlay = documentObject.createElement('div');
  overlay.setAttribute('id', 'privacy-info-overlay');
  overlay.setAttribute('aria-hidden', 'true');
  overlay.classList.add('privacy-info-overlay', 'no-print');

  const dialog = documentObject.createElement('div');
  dialog.setAttribute('id', 'privacy-info-dialog');
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'privacy-info-title');
  dialog.setAttribute('aria-describedby', 'privacy-info-intro');
  dialog.classList.add('privacy-info-dialog');

  const title = documentObject.createElement('h2');
  title.setAttribute('id', 'privacy-info-title');
  title.classList.add('privacy-info-title');

  const intro = documentObject.createElement('p');
  intro.setAttribute('id', 'privacy-info-intro');
  intro.classList.add('privacy-info-intro');

  function createSection(sectionId) {
    const section = documentObject.createElement('section');
    section.setAttribute('id', sectionId);
    section.classList.add('privacy-info-section');

    const heading = documentObject.createElement('h3');
    heading.classList.add('privacy-info-section-title');
    section.appendChild(heading);

    return {
      section,
      heading,
    };
  }

  const browserSession = createSection('privacy-info-browser-session');
  const browserSessionParagraph1 = documentObject.createElement('p');
  const browserSessionParagraph2 = documentObject.createElement('p');
  browserSession.section.appendChild(browserSessionParagraph1);
  browserSession.section.appendChild(browserSessionParagraph2);

  const storedPreference = createSection('privacy-info-stored-preference');
  const storedPreferenceBeforeKey = documentObject.createElement('p');
  const storedPreferenceKey = documentObject.createElement('code');
  storedPreferenceKey.classList.add('privacy-info-storage-key');
  storedPreferenceKey.textContent = storageKey;
  const storedPreferenceAfterKey = documentObject.createElement('p');
  const storedPreferenceUnavailable = documentObject.createElement('p');
  storedPreference.section.appendChild(storedPreferenceBeforeKey);
  storedPreference.section.appendChild(storedPreferenceKey);
  storedPreference.section.appendChild(storedPreferenceAfterKey);
  storedPreference.section.appendChild(storedPreferenceUnavailable);

  const network = createSection('privacy-info-network');
  const networkParagraph1 = documentObject.createElement('p');
  const networkParagraph2 = documentObject.createElement('p');
  network.section.appendChild(networkParagraph1);
  network.section.appendChild(networkParagraph2);

  const printing = createSection('privacy-info-printing');
  const printingParagraph1 = documentObject.createElement('p');
  const printingParagraph2 = documentObject.createElement('p');
  printing.section.appendChild(printingParagraph1);
  printing.section.appendChild(printingParagraph2);

  const clinicalUse = createSection('privacy-info-clinical-use');
  const clinicalUseParagraph1 = documentObject.createElement('p');
  const clinicalUseParagraph2 = documentObject.createElement('p');
  clinicalUse.section.appendChild(clinicalUseParagraph1);
  clinicalUse.section.appendChild(clinicalUseParagraph2);

  const closeButton = documentObject.createElement('button');
  closeButton.setAttribute('id', 'privacy-info-close-btn');
  closeButton.setAttribute('type', 'button');
  closeButton.classList.add('btn', 'btn-primary', 'privacy-info-close-btn');

  dialog.appendChild(title);
  dialog.appendChild(intro);
  dialog.appendChild(browserSession.section);
  dialog.appendChild(storedPreference.section);
  dialog.appendChild(network.section);
  dialog.appendChild(printing.section);
  dialog.appendChild(clinicalUse.section);
  dialog.appendChild(closeButton);
  overlay.appendChild(dialog);

  root.appendChild(launchButton);
  root.appendChild(overlay);

  let isOpen = false;

  function restoreFocusedControl(previousActiveElement) {
    if (previousActiveElement === closeButton || previousActiveElement === launchButton) {
      previousActiveElement.focus();
    }
  }

  function updateTranslations() {
    const previousActiveElement = documentObject.activeElement;

    launchText.textContent = translate('privacy.launch');
    title.textContent = translate('privacy.title');
    intro.textContent = translate('privacy.intro');

    browserSession.heading.textContent = translate('privacy.browserSession.title');
    browserSessionParagraph1.textContent = translate('privacy.browserSession.paragraph1');
    browserSessionParagraph2.textContent = translate('privacy.browserSession.paragraph2');

    storedPreference.heading.textContent = translate('privacy.storedPreference.title');
    storedPreferenceBeforeKey.textContent = translate('privacy.storedPreference.beforeKey');
    storedPreferenceAfterKey.textContent = translate('privacy.storedPreference.afterKey');
    storedPreferenceUnavailable.textContent = translate('privacy.storedPreference.unavailable');

    network.heading.textContent = translate('privacy.network.title');
    networkParagraph1.textContent = translate('privacy.network.paragraph1');
    networkParagraph2.textContent = translate('privacy.network.paragraph2');

    printing.heading.textContent = translate('privacy.printing.title');
    printingParagraph1.textContent = translate('privacy.printing.paragraph1');
    printingParagraph2.textContent = translate('privacy.printing.paragraph2');

    clinicalUse.heading.textContent = translate('privacy.clinicalUse.title');
    clinicalUseParagraph1.textContent = translate('privacy.clinicalUse.paragraph1');
    clinicalUseParagraph2.textContent = translate('privacy.clinicalUse.paragraph2');

    closeButton.textContent = translate('privacy.close');

    if (isOpen) {
      overlay.classList.add('open');
      overlay.setAttribute('aria-hidden', 'false');
    } else {
      overlay.classList.remove('open');
      overlay.setAttribute('aria-hidden', 'true');
    }

    restoreFocusedControl(previousActiveElement);
  }

  function openDialog() {
    isOpen = true;
    overlay.classList.add('open');
    overlay.setAttribute('aria-hidden', 'false');
    closeButton.focus();
  }

  function closeDialog() {
    if (!isOpen) {
      return;
    }

    isOpen = false;
    overlay.classList.remove('open');
    overlay.setAttribute('aria-hidden', 'true');
    launchButton.focus();
  }

  function trapFocus(event) {
    if (event.key === 'Tab') {
      event.preventDefault();
      closeButton.focus();
    }
  }

  function handleKeydown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeDialog();
      return;
    }

    trapFocus(event);
  }

  launchButton.addEventListener('click', openDialog);
  closeButton.addEventListener('click', closeDialog);
  closeButton.addEventListener('keydown', handleKeydown);
  dialog.addEventListener('keydown', handleKeydown);
  overlay.addEventListener('keydown', handleKeydown);

  if (i18n && typeof i18n.subscribe === 'function') {
    i18n.subscribe(updateTranslations);
  }

  updateTranslations();

  return root;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = createPrivacyInfoComponent;
}
