document.addEventListener('DOMContentLoaded', () => {
    const {
        getEloIndex,
        getHistoriqueCsv,
        fetchTextCached,
        buildDriverNameToId,
        parseCsv,
        createDriverCell,
        createRankCell,
        renderStatusRow,
    } = globalThis.F1Utils;

    const yearSelector = document.getElementById('qualif-year');
    const prevBtn = document.getElementById('qualif-prev');
    const nextBtn = document.getElementById('qualif-next');
    const tableBody = document.getElementById('qualifications-body');
    const tableHead = document.querySelector('#qualifications-table thead tr');

    let driverNameToId = new Map();
    let eloIndexData = null;
    let years = [];
    let initialized = false;
    let loadSeq = 0;

    function updateNavButtons() {
        if (!prevBtn || !nextBtn) return;
        const idx = yearSelector.selectedIndex;
        const n = yearSelector.options.length;
        // Années triées de la plus récente à la plus ancienne : « ‹ » = année précédente (plus ancienne)
        prevBtn.disabled = idx < 0 || idx >= n - 1;
        nextBtn.disabled = idx <= 0;
    }

    function step(delta) {
        const idx = yearSelector.selectedIndex + delta;
        if (idx >= 0 && idx < yearSelector.options.length) {
            yearSelector.selectedIndex = idx;
            yearSelector.dispatchEvent(new Event('change'));
        }
    }

    function loadQualificationsData(year) {
        const seq = ++loadSeq;
        renderStatusRow(tableBody, 3, `Chargement des qualifications ${year}…`);

        fetchTextCached(`data/${year}/qualifications.csv`)
            .then(data => {
                if (seq !== loadSeq) return;
                let rows = parseCsv(data);
                if (!rows.length) {
                    renderStatusRow(tableBody, 3, 'Aucune donnée disponible.');
                    return;
                }

                let header = rows[0];
                const reordered = reorderQualificationColumns(header, rows, eloIndexData, year);
                header = reordered.header;
                rows = reordered.rows;

                const idxDriverName = header.indexOf('Pilote');
                const idxRank = header.indexOf('Rang');
                const idxPoints = header.indexOf('Points');

                const headFrag = document.createDocumentFragment();
                header.forEach(column => {
                    const th = document.createElement('th');
                    th.textContent = column;
                    headFrag.appendChild(th);
                });
                tableHead.replaceChildren(headFrag);

                const bodyFrag = document.createDocumentFragment();
                for (let i = 1; i < rows.length; i++) {
                    const row = rows[i];
                    if (row.length < 3) continue;

                    const tr = document.createElement('tr');
                    for (let j = 0; j < header.length; j++) {
                        const cell = row[j] || '';
                        if (j === idxDriverName) {
                            tr.appendChild(createDriverCell(cell, driverNameToId));
                        } else if (j === idxRank) {
                            tr.appendChild(createRankCell(cell));
                        } else {
                            const td = document.createElement('td');
                            if (j === idxPoints) {
                                td.className = 'points-cell';
                                td.textContent = cell;
                            } else if (cell === '' || cell === '0') {
                                td.className = 'cell-empty';
                                td.textContent = cell === '' ? '·' : '0';
                            } else {
                                td.textContent = cell;
                            }
                            tr.appendChild(td);
                        }
                    }
                    bodyFrag.appendChild(tr);
                }
                tableBody.replaceChildren(bodyFrag);
            })
            .catch(error => {
                if (seq !== loadSeq) return;
                console.error(`Erreur lors du chargement des données pour ${year}:`, error);
                renderStatusRow(tableBody, 3, `Impossible de charger les qualifications ${year}.`);
            });
    }

    function init() {
        if (initialized) return;
        initialized = true;
        renderStatusRow(tableBody, 3, 'Chargement…');

        Promise.all([getEloIndex(), getHistoriqueCsv()])
            .then(([indexData, data]) => {
                eloIndexData = indexData;
                driverNameToId = buildDriverNameToId(indexData);

                const firstLine = data.split(/\r?\n/, 1)[0] || '';
                if (!firstLine) return;

                years = firstLine.split(',').slice(3).reverse(); // Plus récent en premier
                const frag = document.createDocumentFragment();
                for (const year of years) {
                    const option = document.createElement('option');
                    option.value = year;
                    option.textContent = year;
                    frag.appendChild(option);
                }
                yearSelector.replaceChildren(frag);

                if (years.length > 0) {
                    loadQualificationsData(years[0]);
                }
                updateNavButtons();
            })
            .catch(error => {
                console.error('Erreur lors du chargement des années:', error);
                renderStatusRow(tableBody, 3, 'Erreur de chargement.');
            });
    }

    yearSelector.addEventListener('change', () => {
        loadQualificationsData(yearSelector.value);
        updateNavButtons();
    });

    if (prevBtn) prevBtn.addEventListener('click', () => step(+1));
    if (nextBtn) nextBtn.addEventListener('click', () => step(-1));

    document.addEventListener('f1:tab-activated', (e) => {
        if (e.detail?.tabId === 'qualifications') init();
    });

    if (document.getElementById('qualifications')?.classList.contains('active')) {
        init();
    }
});

function normalizeKey(s) {
    return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function guessGpColumnKey(grandPrixId) {
    const norm = normalizeKey(grandPrixId);
    const prefix = norm.slice(0, 3).toUpperCase();
    return `${prefix}R`;
}

function reorderQualificationColumns(header, rows, indexData, year) {
    if (!header?.length || !rows?.length) return { header, rows };
    const races = indexData?.racesByYear?.[String(year)] || [];
    if (!Array.isArray(races) || races.length === 0) return { header, rows };

    const fixed = ['Pilote', 'Rang', 'Points'];
    const fixedSet = new Set(fixed);

    const eventCols = header.filter(h => !fixedSet.has(h));
    const eventNormToActual = new Map();
    for (const col of eventCols) {
        eventNormToActual.set(normalizeKey(col), col);
    }

    const used = new Set();
    const orderedEvents = [];

    const racesSorted = races.slice().sort((a, b) => (a.round || 0) - (b.round || 0));
    for (const r of racesSorted) {
        const gpId = r?.grandPrixId || '';
        if (!gpId) continue;

        const guess = guessGpColumnKey(gpId);
        const guessNorm = normalizeKey(guess);

        let picked = eventNormToActual.get(guessNorm) || '';
        if (!picked) {
            const prefix = guessNorm.slice(0, 3);
            for (const c of eventCols) {
                const cn = normalizeKey(c);
                if (cn.startsWith(prefix) && cn.endsWith('r')) {
                    picked = c;
                    break;
                }
            }
        }

        if (picked && !used.has(picked)) {
            used.add(picked);
            orderedEvents.push(picked);
        }
    }

    const remaining = eventCols.filter(c => !used.has(c));
    const newHeader = [...fixed, ...orderedEvents, ...remaining];

    const idx = newHeader.map(col => header.indexOf(col));
    const newRows = rows.map(r => idx.map(i => (i >= 0 ? (r[i] || '') : '')));

    return { header: newHeader, rows: newRows };
}
