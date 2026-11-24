document.addEventListener('DOMContentLoaded', () => {
    const tabButtons = Array.from(document.querySelectorAll('.tab-button[data-tab]'));
    const tabPanels = new Map();
    document.querySelectorAll('.tab-content').forEach(panel => {
        if (panel.id) tabPanels.set(panel.id, panel);
    });

    function activateTab(tabId, { updateHash = true } = {}) {
        if (!tabPanels.has(tabId)) return;

        tabPanels.forEach((panel, id) => {
            const isActive = id === tabId;
            panel.classList.toggle('active', isActive);
            panel.hidden = !isActive;
        });

        tabButtons.forEach(btn => {
            const isActive = btn.getAttribute('data-tab') === tabId;
            btn.classList.toggle('active', isActive);
            btn.setAttribute('aria-selected', String(isActive));
        });

        if (updateHash && globalThis.location.hash !== `#${tabId}`) {
            history.replaceState(null, '', `#${tabId}`);
        }

        document.dispatchEvent(new CustomEvent('f1:tab-activated', {
            detail: { tabId },
        }));
    }

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tabId = button.getAttribute('data-tab');
            if (tabId) activateTab(tabId);
        });
    });

    // Restaure l'onglet depuis le hash de l'URL si présent, sinon active le premier.
    const initialHash = globalThis.location.hash.replace(/^#/, '');
    const initialTab = tabPanels.has(initialHash)
        ? initialHash
        : (tabButtons[0]?.getAttribute('data-tab') || 'historique');

    activateTab(initialTab, { updateHash: false });
});
