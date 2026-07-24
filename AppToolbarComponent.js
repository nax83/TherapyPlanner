function createAppToolbarComponent(options) {
    const toolbarOptions = options && typeof options === 'object' ? options : {};
    const title = typeof toolbarOptions.title === 'string' && toolbarOptions.title.trim()
        ? toolbarOptions.title.trim()
        : 'TherapyPlanner';
    const i18n = toolbarOptions.i18n || null;
    const actionElements = Array.isArray(toolbarOptions.actionElements)
        ? toolbarOptions.actionElements
        : [];

    const root = document.createElement('header');
    root.setAttribute('id', 'app-toolbar');
    root.classList.add('app-toolbar', 'no-print');

    const brand = document.createElement('div');
    brand.classList.add('app-toolbar-brand');

    const heading = document.createElement('h1');
    heading.classList.add('app-toolbar-title');
    heading.textContent = title;
    brand.appendChild(heading);

    const actions = document.createElement('div');
    actions.setAttribute('id', 'app-toolbar-actions');
    actions.classList.add('app-toolbar-actions');

    function updateTranslations() {
        const actionsLabel = i18n && typeof i18n.t === 'function'
            ? i18n.t('toolbar.actionsLabel')
            : 'Application actions';
        actions.setAttribute('aria-label', actionsLabel);
    }

    actionElements.forEach(function appendActionElement(actionElement) {
        if (!actionElement || typeof actionElement !== 'object') {
            return;
        }

        if (typeof actionElement.tagName !== 'string') {
            return;
        }

        actions.appendChild(actionElement);
    });

    root.appendChild(brand);
    root.appendChild(actions);
    if (i18n && typeof i18n.subscribe === 'function') {
        i18n.subscribe(updateTranslations);
    }
    updateTranslations();
    return root;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = createAppToolbarComponent;
}
