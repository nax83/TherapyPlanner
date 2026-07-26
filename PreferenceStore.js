const DEFAULT_PREFERENCE_STORAGE_KEY = 'therapyPlanner.preferences.v1';

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function safeParsePreferenceDocument(rawValue) {
  if (typeof rawValue !== 'string') {
    return {};
  }

  try {
    const parsedValue = JSON.parse(rawValue);
    return isPlainObject(parsedValue) ? parsedValue : {};
  } catch (error) {
    return {};
  }
}

function normaliseValidAppointmentWeekdays(candidateWeekdays) {
  if (!Array.isArray(candidateWeekdays) || candidateWeekdays.length === 0) {
    return null;
  }

  const canonicalWeekdays = [];

  for (let index = 0; index < candidateWeekdays.length; index += 1) {
    const weekday = candidateWeekdays[index];
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
      return null;
    }

    if (canonicalWeekdays.indexOf(weekday) === -1) {
      canonicalWeekdays.push(weekday);
    }
  }

  canonicalWeekdays.sort(function compareWeekdays(left, right) {
    return left - right;
  });

  return canonicalWeekdays.length > 0 ? canonicalWeekdays : null;
}

function cloneWeekdays(weekdays) {
  return Array.isArray(weekdays) ? weekdays.slice() : null;
}

function createPreferenceStore(options) {
  const settings = options || {};
  const storage = settings.storage || null;
  const storageKey = settings.storageKey || DEFAULT_PREFERENCE_STORAGE_KEY;

  function canReadStorage() {
    return Boolean(storage) && typeof storage.getItem === 'function';
  }

  function canWriteStorage() {
    return Boolean(storage) && typeof storage.setItem === 'function';
  }

  function readRawDocument() {
    if (!canReadStorage()) {
      return {};
    }

    try {
      return safeParsePreferenceDocument(storage.getItem(storageKey));
    } catch (error) {
      return {};
    }
  }

  function writeRawDocument(nextDocument) {
    if (!canWriteStorage()) {
      return false;
    }

    try {
      storage.setItem(storageKey, JSON.stringify(nextDocument));
      return true;
    } catch (error) {
      return false;
    }
  }

  return {
    read: function read() {
      const rawDocument = readRawDocument();
      const safeDocument = {};

      if (typeof rawDocument.locale === 'string') {
        safeDocument.locale = rawDocument.locale;
      }

      const canonicalWeekdays = normaliseValidAppointmentWeekdays(rawDocument.validAppointmentWeekdays);
      if (canonicalWeekdays) {
        safeDocument.validAppointmentWeekdays = cloneWeekdays(canonicalWeekdays);
      }

      return safeDocument;
    },
    getStorageKey: function getStorageKey() {
      return storageKey;
    },
    getLocale: function getLocale() {
      const rawDocument = readRawDocument();
      return typeof rawDocument.locale === 'string' ? rawDocument.locale : null;
    },
    setLocale: function setLocale(locale) {
      const nextDocument = readRawDocument();
      nextDocument.locale = locale;
      return writeRawDocument(nextDocument);
    },
    getValidAppointmentWeekdays: function getValidAppointmentWeekdays() {
      const rawDocument = readRawDocument();
      const canonicalWeekdays = normaliseValidAppointmentWeekdays(rawDocument.validAppointmentWeekdays);
      return cloneWeekdays(canonicalWeekdays);
    },
    setValidAppointmentWeekdays: function setValidAppointmentWeekdays(weekdays) {
      const canonicalWeekdays = normaliseValidAppointmentWeekdays(weekdays);
      if (!canonicalWeekdays) {
        return false;
      }

      const nextDocument = readRawDocument();
      nextDocument.validAppointmentWeekdays = cloneWeekdays(canonicalWeekdays);
      return writeRawDocument(nextDocument);
    },
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    createPreferenceStore,
    DEFAULT_PREFERENCE_STORAGE_KEY,
  };
}

if (typeof globalThis !== 'undefined') {
  globalThis.createPreferenceStore = createPreferenceStore;
}
