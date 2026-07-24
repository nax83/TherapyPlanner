const test = require('node:test');
const assert = require('node:assert/strict');

const translations = require('../translations.js');
const { createI18n } = require('../I18n.js');
const createLanguageSelectorComponent = require('../LanguageSelectorComponent.js');
const { withMockDom, createChangeEvent, createMockStorage } = require('./helpers/mockDom.js');

test('language selector: renders a native select with three stable self-named options', () => {
  withMockDom((mockDocument) => {
    const i18n = createI18n({
      translations,
      storage: createMockStorage(JSON.stringify({ locale: 'de' })),
      navigator: { language: 'en-GB' },
      document: mockDocument,
    });

    const selector = createLanguageSelectorComponent(i18n);
    mockDocument.body.appendChild(selector);

    const select = mockDocument.getElementById('app-language-select');
    assert.ok(select);
    assert.equal(select.tagName, 'SELECT');
    assert.equal(select.children.length, 3);
    assert.equal(select.children[0].getAttribute('value'), 'en');
    assert.equal(select.children[0].textContent, 'English');
    assert.equal(select.children[1].getAttribute('value'), 'de');
    assert.equal(select.children[1].textContent, 'Deutsch');
    assert.equal(select.children[2].getAttribute('value'), 'it');
    assert.equal(select.children[2].textContent, 'Italiano');
    assert.equal(select.value, 'de');
    assert.equal(select.getAttribute('aria-label'), 'Sprache auswählen');
  });
});

test('language selector: user changes call setLocale and programmatic changes update the selected value', () => {
  withMockDom((mockDocument) => {
    const storage = createMockStorage();
    const i18n = createI18n({
      translations,
      storage,
      navigator: { language: 'en-GB' },
      document: mockDocument,
    });
    const selector = createLanguageSelectorComponent(i18n);
    mockDocument.body.appendChild(selector);

    const select = mockDocument.getElementById('app-language-select');
    select.dispatchEvent(createChangeEvent('it'));
    assert.equal(i18n.getLocale(), 'it');
    assert.equal(select.value, 'it');

    i18n.setLocale('de');
    assert.equal(select.value, 'de');
    assert.equal(JSON.parse(storage.getItem('therapyPlanner.preferences.v1')).locale, 'de');
  });
});
