document.addEventListener('DOMContentLoaded', () => {
    const {
        getEloIndex,
        fetchTextCached,
        buildDriverNameToId,
        parseCsv,
        createDriverCell,
        renderStatusRow,
        normalizeSearch,
        debounce,
    } = globalThis.F1Utils;

    const headRow = document.getElementById('champions-head-row');
    const body = document.getElementById('champions-body');
    const searchInput = document.getElementById('champions-search');
    const countMeta = document.getElementById('champions-count');

    let header = [];
    let allRows = [];
    let driverNameToId = new Map();
    let searchTerm = '';

    // Colonnes susceptibles de contenir un nom de pilote
    const DRIVER_COL_KEYWORDS = ['pilote', 'qualif', 'sprint'];

    function isDriverColumn(colName) {
        const norm = normalizeSearch(colName);
        if (norm.includes('constructeur')) return false;
        return DRIVER_COL_KEYWORDS.some(k => norm.includes(k));
    }

    function renderTable() {
        const headFrag = document.createDocumentFragment();
        header.forEach(col => {
            const th = document.createElement('th');
            th.textContent = col;
            headFrag.appendChild(th);
        });
        headRow.replaceChildren(headFrag);

        const needle = normalizeSearch(searchTerm);
        const driverColFlags = header.map(isDriverColumn);
        const bodyFrag = document.createDocumentFragment();
        let displayed = 0;

        for (const entry of allRows) {
            if (needle && !entry.searchKey.includes(needle)) continue;

            const tr = document.createElement('tr');
            for (let j = 0; j < header.length; j++) {
                const cell = entry.cells[j] || '';
                if (driverColFlags[j] && cell) {
                    tr.appendChild(createDriverCell(cell, driverNameToId));
                } else {
                    const td = document.createElement('td');
                    if (j === 0) {
                        td.className = 'points-cell';
                        td.textContent = cell;
                    } else if (!cell) {
                        td.className = 'cell-empty';
                        td.textContent = '·';
                    } else {
                        td.textContent = cell;
                    }
                    tr.appendChild(td);
                }
            }
            bodyFrag.appendChild(tr);
            displayed++;
        }

        if (displayed === 0) {
            renderStatusRow(body, header.length || 1, 'Aucune saison correspondante.');
        } else {
            body.replaceChildren(bodyFrag);
        }

        if (countMeta) {
            countMeta.textContent = needle
                ? `${displayed} / ${allRows.length} saisons`
                : `${allRows.length} saisons`;
        }
    }

    renderStatusRow(body, 1, 'Chargement des champions…');

    Promise.all([
        getEloIndex(),
        fetchTextCached('data/champions.csv'),
    ])
        .then(([indexData, text]) => {
            driverNameToId = buildDriverNameToId(indexData);
            const rows = parseCsv(text);
            if (!rows.length) {
                renderStatusRow(body, 1, 'Aucune donnée disponible.');
                return;
            }

            header = rows[0];
            // Années les plus récentes en premier
            allRows = rows.slice(1).reverse().map(cells => ({
                cells,
                searchKey: normalizeSearch(cells.join(' ')),
            }));
            renderTable();
        })
        .catch(err => {
            console.error('Erreur chargement champions:', err);
            headRow.innerHTML = '<th>Erreur</th>';
            renderStatusRow(body, 1, 'Erreur de chargement.');
        });

    if (searchInput) {
        searchInput.addEventListener('input', debounce(() => {
            searchTerm = searchInput.value;
            renderTable();
        }, 120));
    }
});
