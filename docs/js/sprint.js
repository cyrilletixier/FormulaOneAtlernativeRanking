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
    } = globalThis.F1Utils;

    const yearSelector = document.getElementById('sprint-year');
    const prevBtn = document.getElementById('sprint-prev');
    const nextBtn = document.getElementById('sprint-next');
    const info = document.getElementById('sprint-info');
    const tableHead = document.querySelector('#sprint-table thead tr');
    const tableBody = document.getElementById('sprint-body');

    let driverNameToId = new Map();
    let seasons = [];
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

    function renderSeasonBanner(season) {
        info.replaceChildren();
        if (!season) return;

        const span = document.createElement('span');
        span.append(`Champion du monde sprint ${season.year} : `);
        const strong = document.createElement('strong');
        strong.textContent = season.champion;
        span.appendChild(strong);
        span.append(` — ${season.points} pts en ${season.sprints} sprints`);
        info.appendChild(span);
    }

    function loadYear(year) {
        const seq = ++loadSeq;
        const season = seasons.find(s => String(s.year) === String(year));
        renderSeasonBanner(season);
        renderStatusRow(tableBody, 3, `Chargement des sprints ${year}…`);

        fetchTextCached(`data/${year}/sprint.csv`)
            .then(text => {
                if (seq !== loadSeq) return;
                const rows = parseCsv(text);
                if (!rows.length) {
                    renderStatusRow(tableBody, 3, 'Aucune donnée disponible.');
                    return;
                }

                const header = rows[0];
                const headFrag = document.createDocumentFragment();
                header.forEach(col => {
                    const th = document.createElement('th');
                    th.textContent = col;
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
                        if (j === 0) {
                            tr.appendChild(createDriverCell(cell, driverNameToId));
                        } else if (j === 1) {
                            tr.appendChild(createRankCell(cell));
                        } else {
                            const td = document.createElement('td');
                            if (j === 2) {
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
                console.error(`Erreur lors du chargement des sprints ${year}:`, error);
                renderStatusRow(tableBody, 3, `Impossible de charger les sprints ${year}.`);
            });
    }

    function init() {
        if (initialized) return;
        initialized = true;
        renderStatusRow(tableBody, 3, 'Chargement…');

        Promise.all([
            getEloIndex(),
            fetchJsonCached('data/sprint/index.json'),
        ])
            .then(([eloIndex, sprintIndex]) => {
                driverNameToId = buildDriverNameToId(eloIndex);
                seasons = sprintIndex.years || [];

                const frag = document.createDocumentFragment();
                seasons.slice().reverse().forEach(s => {
                    const option = document.createElement('option');
                    option.value = s.year;
                    option.textContent = s.year;
                    frag.appendChild(option);
                });
                yearSelector.replaceChildren(frag);

                if (seasons.length) loadYear(yearSelector.value);
                updateNavButtons();
            })
            .catch(error => {
                console.error('Erreur lors du chargement des sprints:', error);
                renderStatusRow(tableBody, 3, 'Erreur de chargement.');
            });
    }

    yearSelector.addEventListener('change', () => {
        loadYear(yearSelector.value);
        updateNavButtons();
    });

    prevBtn.addEventListener('click', () => step(+1));
    nextBtn.addEventListener('click', () => step(-1));

    document.addEventListener('f1:tab-activated', (e) => {
        if (e.detail?.tabId === 'sprint') init();
    });

    if (document.getElementById('sprint')?.classList.contains('active')) {
        init();
    }
});
