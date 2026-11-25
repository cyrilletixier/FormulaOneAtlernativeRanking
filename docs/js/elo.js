function createSvgEl(tag) {
    return document.createElementNS('http://www.w3.org/2000/svg', tag);
}

function addGridAndAxes(svg, pad, width, height, minY, maxY, yScale) {
    const ticks = 4;
    for (let i = 0; i <= ticks; i++) {
        const val = minY + ((maxY - minY) * i) / ticks;
        const y = yScale(val);

        if (i > 0) {
            const grid = createSvgEl('line');
            grid.setAttribute('x1', pad);
            grid.setAttribute('x2', width - pad);
            grid.setAttribute('y1', y);
            grid.setAttribute('y2', y);
            grid.setAttribute('class', 'elo-grid-line');
            svg.appendChild(grid);
        }

        const label = createSvgEl('text');
        label.setAttribute('x', pad - 8);
        label.setAttribute('y', y + 4);
        label.setAttribute('text-anchor', 'end');
        label.setAttribute('class', 'elo-label');
        label.textContent = Math.round(val);
        svg.appendChild(label);
    }

    const axis = createSvgEl('path');
    axis.setAttribute('d', `M ${pad} ${pad} L ${pad} ${height - pad} L ${width - pad} ${height - pad}`);
    axis.setAttribute('class', 'elo-axis');
    svg.appendChild(axis);
}

function parseMeanEloCurve(csvText, xColumnName) {
    const rows = globalThis.F1Utils.parseCsv(csvText);
    if (!rows.length) return [];

    const header = rows[0];
    const idxX = header.indexOf(xColumnName);
    const idxMean = header.indexOf('meanElo');
    const idxEntries = header.indexOf('nEntries');
    if (idxX < 0 || idxMean < 0) return [];

    const points = [];
    for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        const x = Number.parseInt(r[idxX] || '', 10);
        const mean = Number.parseFloat(r[idxMean] || '');
        const nEntries = idxEntries >= 0 ? Number.parseInt(r[idxEntries] || '', 10) : Number.NaN;
        if (!Number.isFinite(x) || !Number.isFinite(mean)) continue;
        points.push({ x, mean, nEntries: Number.isFinite(nEntries) ? nEntries : null });
    }

    points.sort((a, b) => a.x - b.x);
    return points;
}

function renderMeanEloChart(container, tooltip, points, { formatAxisX, formatTooltipX }) {
    container.replaceChildren();
    if (tooltip) {
        tooltip.classList.remove('visible');
        tooltip.textContent = '';
    }

    if (!points.length) {
        container.textContent = 'Aucune donnée.';
        return;
    }

    const width = 1000;
    const height = 340;
    const pad = 48;

    const xs = points.map(p => p.x);
    const ys = points.map(p => p.mean);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    const spanX = Math.max(1, maxX - minX);
    const spanY = Math.max(1e-9, maxY - minY);

    const xScale = (x) => pad + (x - minX) * ((width - 2 * pad) / spanX);
    const yScale = (y) => (height - pad) - (y - minY) * ((height - 2 * pad) / spanY);

    const svg = createSvgEl('svg');
    svg.setAttribute('class', 'elo-svg');
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', String(height));
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

    addGridAndAxes(svg, pad, width, height, minY, maxY, yScale);

    let d = '';
    for (let i = 0; i < points.length; i++) {
        const p = points[i];
        const x = xScale(p.x);
        const y = yScale(p.mean);
        const first = i === 0;
        const gap = first ? 1 : (p.x - points[i - 1].x);
        d += `${(first || gap > 1) ? 'M' : 'L'} ${x} ${y} `;
    }

    const line = createSvgEl('path');
    line.setAttribute('d', d);
    line.setAttribute('class', 'elo-line');
    svg.appendChild(line);

    const labelMinX = createSvgEl('text');
    labelMinX.setAttribute('x', pad);
    labelMinX.setAttribute('y', height - 14);
    labelMinX.setAttribute('class', 'elo-label');
    labelMinX.textContent = formatAxisX(minX);
    svg.appendChild(labelMinX);

    const labelMaxX = createSvgEl('text');
    labelMaxX.setAttribute('x', width - pad);
    labelMaxX.setAttribute('y', height - 14);
    labelMaxX.setAttribute('text-anchor', 'end');
    labelMaxX.setAttribute('class', 'elo-label');
    labelMaxX.textContent = formatAxisX(maxX);
    svg.appendChild(labelMaxX);

    // Curseur interactif au survol
    const hoverLine = createSvgEl('line');
    hoverLine.setAttribute('y1', pad);
    hoverLine.setAttribute('y2', height - pad);
    hoverLine.setAttribute('class', 'elo-hover-line');
    hoverLine.style.display = 'none';
    svg.appendChild(hoverLine);

    const hoverDot = createSvgEl('circle');
    hoverDot.setAttribute('r', '4.5');
    hoverDot.setAttribute('class', 'elo-hover-dot');
    hoverDot.style.display = 'none';
    svg.appendChild(hoverDot);

    svg.addEventListener('mousemove', (evt) => {
        const rect = svg.getBoundingClientRect();
        if (!rect.width) return;
        const svgX = ((evt.clientX - rect.left) / rect.width) * width;
        const targetX = minX + ((svgX - pad) / (width - 2 * pad)) * spanX;

        // Recherche binaire du point le plus proche
        let lo = 0;
        let hi = points.length - 1;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (points[mid].x < targetX) lo = mid + 1;
            else hi = mid;
        }
        let closest = points[lo];
        if (lo > 0 && Math.abs(points[lo - 1].x - targetX) < Math.abs(closest.x - targetX)) {
            closest = points[lo - 1];
        }

        const cx = xScale(closest.x);
        const cy = yScale(closest.mean);
        hoverLine.setAttribute('x1', cx);
        hoverLine.setAttribute('x2', cx);
        hoverLine.style.display = '';
        hoverDot.setAttribute('cx', cx);
        hoverDot.setAttribute('cy', cy);
        hoverDot.style.display = '';

        if (tooltip) {
            const entriesPart = closest.nEntries !== null
                ? ` (${closest.nEntries} pilote${closest.nEntries > 1 ? 's' : ''})`
                : '';
            tooltip.innerHTML = `${formatTooltipX(closest.x)}${entriesPart} · ELO moyen <strong>${closest.mean.toFixed(2)}</strong>`;
            tooltip.classList.add('visible');
        }
    });

    svg.addEventListener('mouseleave', () => {
        hoverLine.style.display = 'none';
        hoverDot.style.display = 'none';
        if (tooltip) tooltip.classList.remove('visible');
    });

    container.appendChild(svg);
}

document.addEventListener('DOMContentLoaded', () => {
    const {
        HIDDEN_DRIVER_RESULT_COLUMNS,
        getEloIndex,
        fetchTextCached,
        parseCsv,
        formatEloCell,
        renderStatusRow,
    } = globalThis.F1Utils;

    const viewSelector = document.getElementById('elo-view');
    const ageButton = document.getElementById('elo-age-button');
    const racesButton = document.getElementById('elo-races-button');
    const driverSelectorWrap = document.getElementById('elo-driver-selector');
    const driverSelector = document.getElementById('elo-driver');
    const yearSelectorWrap = document.getElementById('elo-year-selector');
    const yearSelector = document.getElementById('elo-year');
    const yearPrevBtn = document.getElementById('elo-year-prev');
    const yearNextBtn = document.getElementById('elo-year-next');
    const raceSelectorWrap = document.getElementById('elo-race-selector');
    const raceSelector = document.getElementById('elo-race');

    const chartContainer = document.getElementById('elo-age-container');
    const chartEl = document.getElementById('elo-age-chart');
    const chartTooltip = document.getElementById('elo-age-tooltip');
    const tableContainer = document.getElementById('elo-table-container');

    const headRow = document.getElementById('elo-head-row');
    const body = document.getElementById('elo-body');

    let indexData = null;
    let raceYears = [];
    let initialized = false;
    let loadSeq = 0;

    function setView(view) {
        const isDriver = view === 'driver';
        const isRace = view === 'race';
        const isAge = view === 'age';
        const isRaces = view === 'races';
        const isChart = isAge || isRaces;

        driverSelectorWrap.style.display = isDriver ? '' : 'none';
        yearSelectorWrap.style.display = isRace ? '' : 'none';
        raceSelectorWrap.style.display = isRace ? '' : 'none';
        if (chartContainer) chartContainer.style.display = isChart ? '' : 'none';
        if (tableContainer) tableContainer.style.display = isChart ? 'none' : '';
        if (ageButton) ageButton.classList.toggle('active', isAge);
        if (racesButton) racesButton.classList.toggle('active', isRaces);
    }

    function renderTable(csvText, { hideDriverDetails = false } = {}) {
        const rows = parseCsv(csvText);
        if (!rows.length) {
            renderStatusRow(body, 1, 'Aucune donnée disponible.');
            return;
        }

        const header = rows[0];
        const idxDriverId = header.indexOf('driverId');
        const idxDriverName = header.indexOf('driverName');

        const visibleCols = [];
        for (let j = 0; j < header.length; j++) {
            if (hideDriverDetails && HIDDEN_DRIVER_RESULT_COLUMNS.has(header[j])) {
                continue;
            }
            visibleCols.push({ index: j, name: header[j] });
        }

        const headFrag = document.createDocumentFragment();
        for (const col of visibleCols) {
            const th = document.createElement('th');
            th.textContent = col.name;
            headFrag.appendChild(th);
        }
        headRow.replaceChildren(headFrag);

        const bodyFrag = document.createDocumentFragment();
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            if (!row.length) continue;
            const tr = document.createElement('tr');
            for (const col of visibleCols) {
                const cell = row[col.index] || '';
                const td = document.createElement('td');
                if (col.index === idxDriverName && idxDriverId >= 0) {
                    const driverId = row[idxDriverId];
                    const a = document.createElement('a');
                    a.className = 'driver-link';
                    a.href = `driver.html?id=${encodeURIComponent(driverId)}`;
                    a.textContent = cell;
                    td.appendChild(a);
                } else {
                    td.textContent = formatEloCell(col.name, cell);
                }
                tr.appendChild(td);
            }
            bodyFrag.appendChild(tr);
        }
        body.replaceChildren(bodyFrag);
    }

    function loadDriver(driverId) {
        const seq = ++loadSeq;
        renderStatusRow(body, headRow.children.length || 1, 'Chargement du pilote…');
        fetchTextCached(`data/elo/drivers/${driverId}.csv`)
            .then(csvText => {
                if (seq !== loadSeq) return;
                renderTable(csvText, { hideDriverDetails: true });
            })
            .catch(err => {
                if (seq !== loadSeq) return;
                console.error('Erreur chargement pilote ELO:', err);
                renderStatusRow(body, 1, 'Erreur de chargement.');
            });
    }

    function loadRace(year, raceFile) {
        const seq = ++loadSeq;
        renderStatusRow(body, headRow.children.length || 1, 'Chargement de la course…');
        fetchTextCached(`data/elo/races/${year}/${raceFile}`)
            .then(csvText => {
                if (seq !== loadSeq) return;
                renderTable(csvText);
            })
            .catch(err => {
                if (seq !== loadSeq) return;
                console.error('Erreur chargement course ELO:', err);
                renderStatusRow(body, 1, 'Erreur de chargement.');
            });
    }

    function loadAgeCurve() {
        const seq = ++loadSeq;
        if (!chartEl) return;
        chartEl.setAttribute('aria-label', 'Graphique ELO moyen par âge');
        chartEl.textContent = 'Chargement du graphique…';
        fetchTextCached('data/elo/elo_by_age.csv')
            .then((t) => {
                if (seq !== loadSeq) return;
                const points = parseMeanEloCurve(t, 'age');
                renderMeanEloChart(chartEl, chartTooltip, points, {
                    formatAxisX: (v) => `${v} ans`,
                    formatTooltipX: (v) => `${v} ans`,
                });
            })
            .catch(err => {
                if (seq !== loadSeq) return;
                console.error('Erreur chargement ELO par âge:', err);
                chartEl.textContent = 'Erreur de chargement.';
            });
    }

    function loadRacesCurve() {
        const seq = ++loadSeq;
        if (!chartEl) return;
        chartEl.setAttribute('aria-label', 'Graphique ELO moyen par nombre de courses');
        chartEl.textContent = 'Chargement du graphique…';
        fetchTextCached('data/elo/elo_by_races.csv')
            .then((t) => {
                if (seq !== loadSeq) return;
                const points = parseMeanEloCurve(t, 'raceCount');
                renderMeanEloChart(chartEl, chartTooltip, points, {
                    formatAxisX: (v) => `${v} GP`,
                    formatTooltipX: (v) => `${v}${v === 1 ? 'ère' : 'e'} course`,
                });
            })
            .catch(err => {
                if (seq !== loadSeq) return;
                console.error('Erreur chargement ELO par nombre de courses:', err);
                chartEl.textContent = 'Données non générées. Lancez « python3 src/scripts/generate_elo_by_races.py » (ou updatedata.sh).';
            });
    }

    function populateDrivers() {
        const drivers = indexData?.drivers ? indexData.drivers.slice() : [];
        drivers.sort((a, b) => (a.name || '').localeCompare((b.name || ''), 'fr'));

        const frag = document.createDocumentFragment();
        for (const d of drivers) {
            const opt = document.createElement('option');
            opt.value = d.id;
            opt.textContent = d.name;
            frag.appendChild(opt);
        }
        driverSelector.replaceChildren(frag);

        if (drivers.length && viewSelector.value === 'driver') {
            loadDriver(drivers[0].id);
        }
    }

    function updateYearNavButtons() {
        if (!yearPrevBtn || !yearNextBtn) return;
        const idx = yearSelector.selectedIndex;
        const n = yearSelector.options.length;
        // Tri décroissant (plus récent en premier)
        yearPrevBtn.disabled = idx < 0 || idx >= n - 1;
        yearNextBtn.disabled = idx <= 0;
    }

    function populateRacesForYear(year, shouldLoad) {
        const races = (indexData?.racesByYear?.[year] || []).slice();
        races.sort((a, b) => (a.round || 0) - (b.round || 0));

        const frag = document.createDocumentFragment();
        for (const r of races) {
            const opt = document.createElement('option');
            opt.value = r.file;
            opt.textContent = r.officialName
                ? `${String(r.round).padStart(2, '0')} - ${r.officialName}`
                : `${String(r.round).padStart(2, '0')} - ${r.grandPrixId || r.file}`;
            frag.appendChild(opt);
        }
        raceSelector.replaceChildren(frag);

        if (shouldLoad && races.length) {
            loadRace(year, races[0].file);
        }
    }

    function populateYearsAndRaces() {
        const racesByYear = indexData?.racesByYear || {};
        raceYears = Object.keys(racesByYear).sort((a, b) => b.localeCompare(a, 'fr'));

        const frag = document.createDocumentFragment();
        for (const y of raceYears) {
            const opt = document.createElement('option');
            opt.value = y;
            opt.textContent = y;
            frag.appendChild(opt);
        }
        yearSelector.replaceChildren(frag);

        if (raceYears.length) {
            populateRacesForYear(raceYears[0], viewSelector.value === 'race');
        }
        updateYearNavButtons();
    }

    function stepYear(delta) {
        const idx = yearSelector.selectedIndex + delta;
        if (idx >= 0 && idx < yearSelector.options.length) {
            yearSelector.selectedIndex = idx;
            yearSelector.dispatchEvent(new Event('change'));
        }
    }

    function init() {
        if (initialized) return;
        initialized = true;
        setView(viewSelector.value);
        renderStatusRow(body, 1, 'Chargement…');

        getEloIndex()
            .then(data => {
                if (!data) throw new Error('Index ELO indisponible');
                indexData = data;
                populateDrivers();
                populateYearsAndRaces();
                if (viewSelector.value === 'age') {
                    loadAgeCurve();
                } else if (viewSelector.value === 'races') {
                    loadRacesCurve();
                }
            })
            .catch(err => {
                console.error('Erreur chargement index ELO:', err);
                renderStatusRow(body, 1, 'Erreur de chargement.');
            });
    }

    viewSelector.addEventListener('change', () => {
        setView(viewSelector.value);
        if (viewSelector.value === 'driver') {
            if (driverSelector.value) loadDriver(driverSelector.value);
        } else if (viewSelector.value === 'age') {
            loadAgeCurve();
        } else if (viewSelector.value === 'races') {
            loadRacesCurve();
        } else if (yearSelector.value && raceSelector.value) {
            loadRace(yearSelector.value, raceSelector.value);
        }
    });

    if (ageButton) {
        ageButton.addEventListener('click', () => {
            viewSelector.value = 'age';
            viewSelector.dispatchEvent(new Event('change'));
        });
    }

    if (racesButton) {
        racesButton.addEventListener('click', () => {
            viewSelector.value = 'races';
            viewSelector.dispatchEvent(new Event('change'));
        });
    }

    driverSelector.addEventListener('change', () => {
        loadDriver(driverSelector.value);
    });

    yearSelector.addEventListener('change', () => {
        populateRacesForYear(yearSelector.value, viewSelector.value === 'race');
        updateYearNavButtons();
    });

    if (yearPrevBtn) yearPrevBtn.addEventListener('click', () => stepYear(+1));
    if (yearNextBtn) yearNextBtn.addEventListener('click', () => stepYear(-1));

    raceSelector.addEventListener('change', () => {
        loadRace(yearSelector.value, raceSelector.value);
    });

    document.addEventListener('f1:tab-activated', (e) => {
        if (e.detail?.tabId === 'elo') init();
    });

    if (document.getElementById('elo')?.classList.contains('active')) {
        init();
    }
});
