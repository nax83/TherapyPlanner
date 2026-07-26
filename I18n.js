const I18N_SUPPORTED_LOCALES = ['en', 'de', 'it'];
const I18N_STORAGE_KEY = 'therapyPlanner.preferences.v1';
const I18N_LOCALE_FORMATS = {
  en: 'en-GB',
  de: 'de-DE',
  it: 'it-IT',
};

function resolvePreferenceStoreFactory() {
  if (typeof globalThis !== 'undefined' && typeof globalThis.createPreferenceStore === 'function') {
    return globalThis.createPreferenceStore;
  }

  if (typeof require === 'function') {
    try {
      return require('./PreferenceStore.js').createPreferenceStore;
    } catch (error) {
      return null;
    }
  }

  return null;
}

function createI18n(options) {
  const settings = options && typeof options === 'object' ? options : {};
  const createPreferenceStoreFactory = resolvePreferenceStoreFactory();
  const translations = settings.translations && typeof settings.translations === 'object'
    ? settings.translations
    : {};
  const storage = settings.storage || null;
  const navigatorObject = settings.navigator || null;
  const documentObject = settings.document || null;
  const preferenceStore = settings.preferenceStore || (
    createPreferenceStoreFactory
      ? createPreferenceStoreFactory({
          storage,
          storageKey: I18N_STORAGE_KEY,
        })
      : null
  );
  const listeners = new Set();

  function getNestedValue(locale, key) {
    const catalog = translations[locale];
    if (!catalog) {
      return undefined;
    }

    return key.split('.').reduce(function resolvePart(current, part) {
      if (!current || typeof current !== 'object') {
        return undefined;
      }
      return current[part];
    }, catalog);
  }

  function interpolate(text, parameters) {
    if (!parameters || typeof parameters !== 'object') {
      return text;
    }

    return text.replace(/\{([^}]+)\}/g, function replaceToken(_, token) {
      return Object.prototype.hasOwnProperty.call(parameters, token)
        ? String(parameters[token])
        : `{${token}}`;
    });
  }

  function safeParsePreferences(rawValue) {
    if (typeof rawValue !== 'string') {
      return {};
    }

    try {
      const parsed = JSON.parse(rawValue);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (error) {
      return {};
    }
  }

  function readPreferences() {
    if (preferenceStore && typeof preferenceStore.read === 'function') {
      return preferenceStore.read();
    }

    return {};
  }

  function persistLocale(locale) {
    if (!preferenceStore || typeof preferenceStore.setLocale !== 'function') {
      return;
    }

    preferenceStore.setLocale(locale);
  }

  function updateDocumentLanguage(locale) {
    if (
      documentObject &&
      documentObject.documentElement &&
      typeof documentObject.documentElement.setAttribute === 'function'
    ) {
      documentObject.documentElement.setAttribute('lang', locale);
    }
  }

  function normaliseLocale(input) {
    if (typeof input !== 'string') {
      return null;
    }

    const trimmed = input.trim().toLowerCase();
    if (!trimmed) {
      return null;
    }

    const base = trimmed.split(/[-_]/)[0];
    return I18N_SUPPORTED_LOCALES.includes(base) ? base : null;
  }

  function detectBrowserLocale() {
    if (!navigatorObject || typeof navigatorObject !== 'object') {
      return null;
    }

    if (Array.isArray(navigatorObject.languages)) {
      for (const entry of navigatorObject.languages) {
        const locale = normaliseLocale(entry);
        if (locale) {
          return locale;
        }
      }
    }

    return normaliseLocale(navigatorObject.language);
  }

  function detectInitialLocale() {
    const storedLocale = normaliseLocale(readPreferences().locale);
    if (storedLocale) {
      return storedLocale;
    }

    return detectBrowserLocale() || 'en';
  }

  let locale = detectInitialLocale();
  updateDocumentLanguage(locale);

  function notifyListeners() {
    Array.from(listeners).forEach(function notify(listener) {
      try {
        listener(locale);
      } catch (error) {
        // Do not let one listener corrupt locale state.
      }
    });
  }

  function t(key, parameters) {
    const translated = getNestedValue(locale, key);
    if (typeof translated === 'string') {
      return interpolate(translated, parameters);
    }

    const fallback = getNestedValue('en', key);
    if (typeof fallback === 'string') {
      return interpolate(fallback, parameters);
    }

    return key;
  }

  function has(key) {
    return typeof getNestedValue(locale, key) === 'string'
      || typeof getNestedValue('en', key) === 'string';
  }

  function formatDate(date, dateTimeFormatOptions) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
      return '';
    }

    const localeName = I18N_LOCALE_FORMATS[locale] || I18N_LOCALE_FORMATS.en;
    const options = dateTimeFormatOptions || {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    };
    return new Intl.DateTimeFormat(localeName, options).format(date);
  }

  function formatWeekday(date, dateTimeFormatOptions) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
      return '';
    }

    const localeName = I18N_LOCALE_FORMATS[locale] || I18N_LOCALE_FORMATS.en;
    const options = dateTimeFormatOptions || { weekday: 'long' };
    return new Intl.DateTimeFormat(localeName, options).format(date);
  }

  function setLocale(nextLocale) {
    const normalised = normaliseLocale(nextLocale) || 'en';
    if (normalised === locale) {
      return locale;
    }

    locale = normalised;
    updateDocumentLanguage(locale);
    persistLocale(locale);
    notifyListeners();
    return locale;
  }

  function subscribe(listener) {
    if (typeof listener !== 'function') {
      return function noop() {};
    }

    listeners.add(listener);
    return function unsubscribe() {
      listeners.delete(listener);
    };
  }

  return {
    t,
    has,
    getLocale: function getLocale() {
      return locale;
    },
    setLocale,
    subscribe,
    formatDate,
    formatWeekday,
    normaliseLocale,
    detectBrowserLocale,
    getStorageKey: function getStorageKey() {
      return I18N_STORAGE_KEY;
    },
  };
}

function getSafeStorage(getStorage) {
  try {
    return typeof getStorage === 'function' ? getStorage() : getStorage;
  } catch (error) {
    return null;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    createI18n,
    getSafeStorage,
    I18N_SUPPORTED_LOCALES,
    I18N_STORAGE_KEY,
  };
}
