document.addEventListener('DOMContentLoaded', () => {
    const {
        getHistoriqueCsv,
        fetchTextCached,
        parseCsv,
        createRankCell,
        renderStatusRow,
    } = globalThis.F1Utils;

    const yearSelector = document.getElementById('deuxieme-year');
    const prevBtn = document.getElementById('deuxieme-prev');
    const nextBtn = document.getElementById('deuxieme-next');
    const tableBody = document.getElementById('deuxieme-pilote-body');
    const tableHead = document.querySelector('#deuxieme-pilote-table thead tr');

    let years = [];
    let initialized = false;
    let loadSeq = 0;

    function updateNavButtons() {
        if (!prevBtn || !nextBtn) return;
        const idx = yearSelector.selectedIndex;
        const n = yearSelector.options.length;
        // Années triées de la plus récente à la plus ancienne
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

    function loadDeuxiemePiloteData(year) {
        const seq = ++loadSeq;
        renderStatusRow(tableBody, 3, `Chargement ${year}…`);

        fetchTextCached(`data/${year}/deuxieme_pilote.csv`)
            .then(data => {
                if (seq !== loadSeq) return;
                const rows = parseCsv(data);
                if (!rows.length) {
                    renderStatusRow(tableBody, 3, 'Aucune donnée disponible.');
                    return;
                }

                const header = rows[0];
                const headFrag = document.createDocumentFragment();
                for (const column of header) {
                    const th = document.createElement('th');
                    th.textContent = column;
                    headFrag.appendChild(th);
                }
                tableHead.replaceChildren(headFrag);

                const bodyFrag = document.createDocumentFragment();
                for (let i = 1; i < rows.length; i++) {
                    const row = rows[i];
                    if (row.length < 3) continue;

                    const tr = document.createElement('tr');
                    for (let j = 0; j < header.length; j++) {
                        const cell = row[j] || '';
                        if (j === 1) {
                            tr.appendChild(createRankCell(cell));
                        } else {
                            const td = document.createElement('td');
                            if (j === 2) {
                                td.className = 'points-cell';
                                td.textContent = cell;
                            } else if (j >= 3 && (cell === '' || cell === '0')) {
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
                renderStatusRow(tableBody, 3, `Impossible de charger les données ${year}.`);
            });
    }

    function init() {
        if (initialized) return;
        initialized = true;
        renderStatusRow(tableBody, 3, 'Chargement…');

        getHistoriqueCsv()
            .then(data => {
                const firstLine = data.split(/\r?\n/, 1)[0] || '';
                if (!firstLine) return;

                years = firstLine.split(',').slice(3).reverse();
                const frag = document.createDocumentFragment();
                for (const year of years) {
                    const option = document.createElement('option');
                    option.value = year;
                    option.textContent = year;
                    frag.appendChild(option);
                }
                yearSelector.replaceChildren(frag);

                if (years.length > 0) {
                    loadDeuxiemePiloteData(years[0]);
                }
                updateNavButtons();
            })
            .catch(error => {
                console.error('Erreur lors du chargement des années:', error);
                renderStatusRow(tableBody, 3, 'Erreur de chargement.');
            });
    }

    yearSelector.addEventListener('change', () => {
        loadDeuxiemePiloteData(yearSelector.value);
        updateNavButtons();
    });

    if (prevBtn) prevBtn.addEventListener('click', () => step(+1));
    if (nextBtn) nextBtn.addEventListener('click', () => step(-1));

    document.addEventListener('f1:tab-activated', (e) => {
        if (e.detail?.tabId === 'deuxieme-pilote') init();
    });

    if (document.getElementById('deuxieme-pilote')?.classList.contains('active')) {
        init();
    }
});
