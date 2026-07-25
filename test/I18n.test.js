const test = require('node:test');
const assert = require('node:assert/strict');

const translations = require('../translations.js');
const { createI18n, getSafeStorage, I18N_STORAGE_KEY } = require('../I18n.js');
const { MockDocument, createMockStorage } = require('./helpers/mockDom.js');

test('i18n: translation lookup, fallback, interpolation, and formatting work across locales', () => {
  const document = new MockDocument();
  const storage = createMockStorage(JSON.stringify({ locale: 'de' }));
  const i18n = createI18n({
    translations,
    storage,
    navigator: { languages: ['it-IT'], language: 'it-IT' },
    document,
  });

  assert.equal(i18n.getLocale(), 'de');
  assert.equal(i18n.t('therapy.add'), 'Hinzufügen');
  assert.equal(i18n.t('language.options.it'), 'Italiano');
  assert.equal(i18n.t('missing.key'), 'missing.key');
  assert.equal(i18n.t('therapy.aria.completeButton', { session: 2, eye: 'rechtes auge' }).includes('2'), true);
  assert.equal(document.documentElement.getAttribute('lang'), 'de');
  assert.equal(i18n.formatDate(new Date(2026, 7, 12)).includes('August'), true);
});

test('i18n: locale detection, normalisation, and safe storage recovery work', () => {
  const document = new MockDocument();
  const storage = createMockStorage('invalid-json');
  const i18n = createI18n({
    translations,
    storage,
    navigator: { languages: ['fr-FR', 'it-CH'], language: 'fr-FR' },
    document,
  });

  assert.equal(i18n.normaliseLocale('de-CH'), 'de');
  assert.equal(i18n.normaliseLocale('fr-FR'), null);
  assert.equal(i18n.getLocale(), 'it');
  i18n.setLocale('xx');
  assert.equal(i18n.getLocale(), 'en');
  assert.equal(document.documentElement.getAttribute('lang'), 'en');
  assert.equal(JSON.parse(storage.getItem(I18N_STORAGE_KEY)).locale, 'en');
});

test('i18n: subscribers notify once, same-locale does not notify, and unsubscribe works', () => {
  const document = new MockDocument();
  const i18n = createI18n({
    translations,
    storage: createMockStorage(),
    navigator: { language: 'en-GB' },
    document,
  });

  let notifications = 0;
  const unsubscribe = i18n.subscribe(() => {
    notifications += 1;
  });

  i18n.setLocale('de');
  i18n.setLocale('de');
  unsubscribe();
  i18n.setLocale('it');

  assert.equal(notifications, 1);
  assert.equal(document.documentElement.getAttribute('lang'), 'it');
});

test('i18n: storage failures do not break initialisation or locale switching', () => {
  const document = new MockDocument();
  const i18n = createI18n({
    translations,
    storage: {
      getItem() {
        throw new Error('read failed');
      },
      setItem() {
        throw new Error('write failed');
      },
    },
    navigator: null,
    document,
  });

  assert.equal(i18n.getLocale(), 'en');
  assert.doesNotThrow(() => i18n.setLocale('de'));
  assert.equal(i18n.getLocale(), 'de');
});

test('i18n: safe storage acquisition failure falls back to null storage', () => {
  const storage = getSafeStorage(() => {
    throw new Error('blocked');
  });

  assert.equal(storage, null);

  const document = new MockDocument();
  const i18n = createI18n({
    translations,
    storage,
    navigator: {
      language: 'de-DE',
    },
    document,
  });

  assert.equal(i18n.getLocale(), 'de');
  assert.doesNotThrow(() => i18n.setLocale('it'));
  assert.equal(i18n.getLocale(), 'it');
});
