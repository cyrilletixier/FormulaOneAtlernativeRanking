document.addEventListener('DOMContentLoaded', () => {
    const {
        getEloIndex,
        fetchJsonCached,
        fetchTextCached,
        buildDriverNameToId,
        parseCsv,
        createDriverCell,
        createRankCell,
        renderStatusRow,
        normalizeSearch,
        debounce,
    } = globalThis.F1Utils;

    const yearSelector = document.getElementById('checkpoints-year');
    const prevBtn = document.getElementById('checkpoints-prev');
    const nextBtn = document.getElementById('checkpoints-next');
    const searchInput = document.getElementById('checkpoints-search');
    const infoBanner = document.getElementById('checkpoints-info');
    const tableHead = document.querySelector('#checkpoints-table thead tr');
    const tableBody = document.getElementById('checkpoints-body');

    let driverNameToId = new Map();
    let seasons = [];
    let currentHeader = [];
    let currentRows = [];
    let searchTerm = '';
    let initialized = false;
    let loadSeq = 0;

    function updateNavButtons() {
        const idx = yearSelector.selectedIndex;
        const n = yearSelector.options.length;
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

    function renderBanner(season) {
        infoBanner.replaceChildren();
        if (!season) return;

        const span = document.createElement('span');
        if (season.hasLapData) {
            span.append(`Saison ${season.year} : `);
            const strong = document.createElement('strong');
            strong.textContent = `${season.racesWithLaps} / ${season.races} Grands Prix`;
            span.appendChild(strong);
            span.append(' avec données tour par tour (Tour 1, 10%, 50%, 90%).');
        } else {
            span.append(`Saison ${season.year} : `);
            const strong = document.createElement('strong');
            strong.textContent = 'données tour par tour indisponibles avant 1996';
            span.appendChild(strong);
            span.append(' — seuls Qualification, Grille de départ et Fin sont affichés.');
        }
        infoBanner.appendChild(span);
    }

    function renderTable() {
        if (!currentHeader.length) return;

        const headFrag = document.createDocumentFragment();
        currentHeader.forEach(col => {
            const th = document.createElement('th');
            th.textContent = col;
            headFrag.appendChild(th);
        });
        tableHead.replaceChildren(headFrag);

        const needle = normalizeSearch(searchTerm);
        const bodyFrag = document.createDocumentFragment();
        let displayed = 0;

        for (const entry of currentRows) {
            if (needle && !entry.searchKey.includes(needle)) continue;

            const tr = document.createElement('tr');
            for (let j = 0; j < currentHeader.length; j++) {
                const cell = entry.cells[j] || '';
                if (j === 0) {
                    tr.appendChild(createDriverCell(cell, driverNameToId));
                } else if (j === 1) {
                    tr.appendChild(createRankCell(cell));
                } else {
                    const td = document.createElement('td');
                    if (cell === '') {
                        td.className = 'cell-empty';
                        td.textContent = '—';
                    } else if (j === currentHeader.length - 1) {
                        td.className = 'points-cell';
                        td.textContent = cell;
                    } else if (cell === '0') {
                        td.className = 'cell-empty';
                        td.textContent = '0';
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
            renderStatusRow(tableBody, currentHeader.length, 'Aucun pilote trouvé.');
        } else {
            tableBody.replaceChildren(bodyFrag);
        }
    }

    function loadYear(year) {
        const seq = ++loadSeq;
        const season = seasons.find(s => String(s.year) === String(year));
        renderBanner(season);
        renderStatusRow(tableBody, 9, `Chargement de la saison ${year}…`);

        fetchTextCached(`data/${year}/checkpoints.csv`)
            .then(text => {
                if (seq !== loadSeq) return;
                const rows = parseCsv(text);
                if (!rows.length) {
                    renderStatusRow(tableBody, 9, 'Aucune donnée disponible.');
                    return;
                }
                currentHeader = rows[0];
                currentRows = rows.slice(1).map(cells => ({
                    cells,
                    searchKey: normalizeSearch(cells[0] || ''),
                }));
                renderTable();
            })
            .catch(err => {
                if (seq !== loadSeq) return;
                console.error(`Erreur chargement checkpoints ${year}:`, err);
                renderStatusRow(
                    tableBody,
                    9,
                    'Données non générées. Lancez « python3 src/scripts/generate_checkpoints.py » (ou updatedata.sh).'
                );
            });
    }

    function init() {
        if (initialized) return;
        initialized = true;
        renderStatusRow(tableBody, 9, 'Chargement…');

        Promise.all([
            getEloIndex(),
            fetchJsonCached('data/checkpoints/index.json'),
        ])
            .then(([eloIndex, cpIndex]) => {
                driverNameToId = buildDriverNameToId(eloIndex);
                seasons = cpIndex.years || [];

                const frag = document.createDocumentFragment();
                seasons.slice().reverse().forEach(s => {
                    const opt = document.createElement('option');
                    opt.value = s.year;
                    opt.textContent = s.hasLapData ? String(s.year) : `${s.year} (sans tours)`;
                    frag.appendChild(opt);
                });
                yearSelector.replaceChildren(frag);

                if (seasons.length) loadYear(yearSelector.value);
                updateNavButtons();
            })
            .catch(err => {
                console.error('Erreur chargement index checkpoints:', err);
                renderStatusRow(
                    tableBody,
                    9,
                    'Données non générées. Lancez « python3 src/scripts/generate_checkpoints.py » (ou updatedata.sh).'
                );
            });
    }

    yearSelector.addEventListener('change', () => {
        loadYear(yearSelector.value);
        updateNavButtons();
    });

    prevBtn.addEventListener('click', () => step(+1));
    nextBtn.addEventListener('click', () => step(-1));

    if (searchInput) {
        searchInput.addEventListener('input', debounce(() => {
            searchTerm = searchInput.value;
            renderTable();
        }, 120));
    }

    document.addEventListener('f1:tab-activated', (e) => {
        if (e.detail?.tabId === 'checkpoints') init();
    });

    if (document.getElementById('checkpoints')?.classList.contains('active')) {
        init();
    }
});
