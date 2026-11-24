document.addEventListener('DOMContentLoaded', () => {
    const {
        getEloIndex,
        getHistoriqueCsv,
        buildDriverNameToId,
        parseCsv,
        createDriverCell,
        createRankCell,
        renderStatusRow,
        normalizeSearch,
        debounce,
    } = globalThis.F1Utils;

    const tableBody = document.getElementById('historique-body');
    const tableHead = document.querySelector('#historique-table thead tr');
    const rangeSpan = document.getElementById('historique-range');
    const prevBtn = document.getElementById('historique-prev');
    const nextBtn = document.getElementById('historique-next');
    const searchInput = document.getElementById('historique-search');
    const countMeta = document.getElementById('historique-count');

    const yearsPerPage = 10;
    let currentStart = 0;
    let allYears = [];
    let allRows = [];
    let driverNameToId = new Map();
    let searchTerm = '';
    let initialized = false;

    function updateNavButtons() {
        prevBtn.disabled = currentStart <= 0;
        nextBtn.disabled = currentStart + yearsPerPage >= allYears.length;
    }

    function renderTable() {
        const end = Math.min(currentStart + yearsPerPage, allYears.length);
        const visibleYears = allYears.slice(currentStart, end);

        rangeSpan.textContent = visibleYears.length
            ? `${visibleYears[0]} – ${visibleYears[visibleYears.length - 1]}`
            : '—';

        // En-têtes via DocumentFragment (un seul reflow)
        const headFrag = document.createDocumentFragment();
        for (const label of ['Pilote', 'Rang', 'Points', ...visibleYears]) {
            const th = document.createElement('th');
            th.textContent = label;
            headFrag.appendChild(th);
        }
        tableHead.replaceChildren(headFrag);

        // Lignes filtrées via DocumentFragment
        const bodyFrag = document.createDocumentFragment();
        const needle = normalizeSearch(searchTerm);
        let displayed = 0;

        for (let i = 0; i < allRows.length; i++) {
            const entry = allRows[i];
            if (needle && !entry.searchKey.includes(needle)) continue;

            const tr = document.createElement('tr');
            tr.appendChild(createDriverCell(entry.name, driverNameToId));
            tr.appendChild(createRankCell(entry.rank));

            const tdPoints = document.createElement('td');
            tdPoints.className = 'points-cell';
            tdPoints.textContent = Number.isFinite(entry.points) ? String(entry.points) : '';
            tr.appendChild(tdPoints);

            for (let y = currentStart; y < end; y++) {
                const td = document.createElement('td');
                const val = entry.yearValues[y];
                if (val > 0) {
                    td.textContent = String(val);
                } else {
                    td.className = 'cell-empty';
                    td.textContent = '·';
                }
                tr.appendChild(td);
            }

            bodyFrag.appendChild(tr);
            displayed++;
        }

        if (displayed === 0) {
            renderStatusRow(tableBody, 3 + visibleYears.length, 'Aucun pilote trouvé.');
        } else {
            tableBody.replaceChildren(bodyFrag);
        }

        if (countMeta) {
            countMeta.textContent = needle
                ? `${displayed} / ${allRows.length} pilotes`
                : `${allRows.length} pilotes`;
        }

        updateNavButtons();
    }

    function init() {
        if (initialized) return;
        initialized = true;
        renderStatusRow(tableBody, 3, 'Chargement du classement historique…');

        Promise.all([getEloIndex(), getHistoriqueCsv()])
            .then(([indexData, csvText]) => {
                driverNameToId = buildDriverNameToId(indexData);
                const rows = parseCsv(csvText);
                if (!rows.length) {
                    renderStatusRow(tableBody, 3, 'Aucune donnée disponible.');
                    return;
                }

                allYears = rows[0].slice(3);
                // Pré-parse une seule fois pour rendre la pagination et la recherche instantanées
                allRows = [];
                for (let i = 1; i < rows.length; i++) {
                    const r = rows[i];
                    if (r.length < 3) continue;
                    const yearValues = new Int32Array(allYears.length);
                    for (let y = 0; y < allYears.length; y++) {
                        const v = Number.parseInt(r[3 + y], 10);
                        yearValues[y] = Number.isFinite(v) && v > 0 ? v : 0;
                    }
                    allRows.push({
                        name: r[0],
                        searchKey: normalizeSearch(r[0]),
                        rank: r[1],
                        points: Number.parseInt(r[2], 10),
                        yearValues,
                    });
                }

                // Démarre sur la décennie la plus récente pour montrer l'ère actuelle d'emblée
                currentStart = Math.max(0, Math.floor((allYears.length - 1) / yearsPerPage) * yearsPerPage);
                renderTable();
            })
            .catch(err => {
                console.error('Erreur chargement historique:', err);
                renderStatusRow(tableBody, 3, 'Erreur lors du chargement des données.');
            });
    }

    prevBtn.addEventListener('click', () => {
        if (currentStart > 0) {
            currentStart = Math.max(0, currentStart - yearsPerPage);
            renderTable();
        }
    });

    nextBtn.addEventListener('click', () => {
        if (currentStart + yearsPerPage < allYears.length) {
            currentStart += yearsPerPage;
            renderTable();
        }
    });

    if (searchInput) {
        searchInput.addEventListener('input', debounce(() => {
            searchTerm = searchInput.value;
            renderTable();
        }, 120));
    }

    document.addEventListener('f1:tab-activated', (e) => {
        if (e.detail?.tabId === 'historique') init();
    });

    if (document.getElementById('historique')?.classList.contains('active')) {
        init();
    }
});
