function createLanguageSelectorComponent(i18n) {
  const root = document.createElement('div');
  root.classList.add('language-selector', 'no-print');

  const label = document.createElement('label');
  label.setAttribute('for', 'app-language-select');
  label.classList.add('visually-hidden');

  const select = document.createElement('select');
  select.setAttribute('id', 'app-language-select');
  select.classList.add('form-select', 'form-select-sm');

  [
    { value: 'en', label: 'English' },
    { value: 'de', label: 'Deutsch' },
    { value: 'it', label: 'Italiano' },
  ].forEach(function appendOption(optionConfig) {
    const option = document.createElement('option');
    option.setAttribute('value', optionConfig.value);
    option.textContent = optionConfig.label;
    select.appendChild(option);
  });

  function updateTranslations() {
    const labelText = i18n && typeof i18n.t === 'function'
      ? i18n.t('language.label')
      : 'Language';
    const ariaLabel = i18n && typeof i18n.t === 'function'
      ? i18n.t('language.selectAriaLabel')
      : 'Select language';
    const locale = i18n && typeof i18n.getLocale === 'function'
      ? i18n.getLocale()
      : 'en';

    label.textContent = labelText;
    select.setAttribute('aria-label', ariaLabel);
    select.value = locale;
  }

  select.addEventListener('change', function handleLanguageChange() {
    if (i18n && typeof i18n.setLocale === 'function') {
      i18n.setLocale(select.value);
    }
  });

  if (i18n && typeof i18n.subscribe === 'function') {
    i18n.subscribe(updateTranslations);
  }

  updateTranslations();

  root.appendChild(label);
  root.appendChild(select);
  return root;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = createLanguageSelectorComponent;
}
