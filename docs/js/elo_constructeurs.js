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

function renderConstructorChart(container, tooltip, points) {
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

    const ys = points.map(p => p.elo);
    const rs = points.map(p => p.raceNo);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const spanY = Math.max(1e-9, maxY - minY);
    const minR = Math.min(...rs);
    const maxR = Math.max(...rs);
    const spanR = Math.max(1, maxR - minR);

    const xScale = (raceNo) => pad + (raceNo - minR) * ((width - 2 * pad) / spanR);
    const yScale = (y) => (height - pad) - (y - minY) * ((height - 2 * pad) / spanY);

    const svg = createSvgEl('svg');
    svg.setAttribute('class', 'elo-svg');
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', String(height));
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

    addGridAndAxes(svg, pad, width, height, minY, maxY, yScale);

    // Courbe principale + pointillés pour les pauses (> 5 courses)
    let mainD = '';
    let offD = '';
    for (let i = 0; i < points.length; i++) {
        const p = points[i];
        const x = xScale(p.raceNo);
        const y = yScale(p.elo);
        const isFirst = i === 0;
        const gap = isFirst ? 1 : (p.raceNo - points[i - 1].raceNo);
        mainD += `${(isFirst || gap > 5) ? 'M' : 'L'} ${x} ${y} `;
        if (!isFirst && gap > 5) {
            const prev = points[i - 1];
            const xPrev = xScale(prev.raceNo);
            const yPrev = yScale(prev.elo);
            offD += `M ${xPrev} ${yPrev} L ${x} ${yPrev} L ${x} ${y} `;
        }
    }

    const line = createSvgEl('path');
    line.setAttribute('d', mainD);
    line.setAttribute('class', 'elo-line');
    svg.appendChild(line);

    if (offD) {
        const offLine = createSvgEl('path');
        offLine.setAttribute('d', offD);
        offLine.setAttribute('class', 'elo-off-line');
        svg.appendChild(offLine);
    }

    const firstYear = String(points[0]?.year || '');
    const lastYear = String(points[points.length - 1]?.year || '');
    if (firstYear) {
        const l1 = createSvgEl('text');
        l1.setAttribute('x', pad);
        l1.setAttribute('y', height - 14);
        l1.setAttribute('class', 'elo-label');
        l1.textContent = firstYear;
        svg.appendChild(l1);
    }
    if (lastYear && lastYear !== firstYear) {
        const l2 = createSvgEl('text');
        l2.setAttribute('x', width - pad);
        l2.setAttribute('y', height - 14);
        l2.setAttribute('text-anchor', 'end');
        l2.setAttribute('class', 'elo-label');
        l2.textContent = lastYear;
        svg.appendChild(l2);
    }

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
        const targetRace = minR + ((svgX - pad) / (width - 2 * pad)) * spanR;

        let lo = 0;
        let hi = points.length - 1;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (points[mid].raceNo < targetRace) lo = mid + 1;
            else hi = mid;
        }
        let closest = points[lo];
        if (lo > 0 && Math.abs(points[lo - 1].raceNo - targetRace) < Math.abs(closest.raceNo - targetRace)) {
            closest = points[lo - 1];
        }

        const cx = xScale(closest.raceNo);
        const cy = yScale(closest.elo);
        hoverLine.setAttribute('x1', cx);
        hoverLine.setAttribute('x2', cx);
        hoverLine.style.display = '';
        hoverDot.setAttribute('cx', cx);
        hoverDot.setAttribute('cy', cy);
        hoverDot.style.display = '';

        if (tooltip) {
            tooltip.innerHTML = `${closest.year} R${closest.round} (${closest.gp}) · Pos: ${closest.positions} · ELO <strong>${closest.elo.toFixed(2)}</strong>`;
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
        fetchJsonCached,
        fetchTextCached,
        parseCsv,
        formatEloCell,
        createRankCell,
        renderStatusRow,
        normalizeSearch,
        debounce,
    } = globalThis.F1Utils;

    const subtitle = document.getElementById('constructors-subtitle');
    const viewSelector = document.getElementById('c-elo-view');
    const searchWrap = document.getElementById('c-elo-search-wrap');
    const searchInput = document.getElementById('c-elo-search');
    const constructorWrap = document.getElementById('c-elo-constructor-wrap');
    const constructorSelect = document.getElementById('c-elo-constructor');
    const yearWrap = document.getElementById('c-elo-year-wrap');
    const yearSelect = document.getElementById('c-elo-year');
    const yearPrevBtn = document.getElementById('c-elo-year-prev');
    const yearNextBtn = document.getElementById('c-elo-year-next');
    const raceWrap = document.getElementById('c-elo-race-wrap');
    const raceSelect = document.getElementById('c-elo-race');
    const countMeta = document.getElementById('c-elo-count');

    const kpiContainer = document.getElementById('c-elo-kpis');
    const chartContainer = document.getElementById('c-elo-chart-container');
    const chartEl = document.getElementById('c-elo-chart');
    const chartTooltip = document.getElementById('c-elo-chart-tooltip');
    const headRow = document.getElementById('c-elo-head-row');
    const body = document.getElementById('c-elo-body');

    const HIDDEN_CONSTRUCTOR_COLS = new Set(['date', 'careerRaceNumber']);

    let indexData = null;
    let constructorsRanked = [];
    let searchTerm = '';
    let loadSeq = 0;

    function setView(view) {
        const isRanking = view === 'ranking';
        const isConstructor = view === 'constructor';
        const isRace = view === 'race';

        searchWrap.style.display = isRanking ? '' : 'none';
        constructorWrap.style.display = isConstructor ? '' : 'none';
        yearWrap.style.display = isRace ? '' : 'none';
        raceWrap.style.display = isRace ? '' : 'none';
        kpiContainer.style.display = isConstructor ? '' : 'none';
        chartContainer.style.display = isConstructor ? '' : 'none';
    }

    function renderRanking() {
        const headers = ['Constructeur', 'Rang', 'ELO pic', 'Année pic', 'Dernier ELO', 'Courses', 'Période'];
        const headFrag = document.createDocumentFragment();
        for (const h of headers) {
            const th = document.createElement('th');
            th.textContent = h;
            headFrag.appendChild(th);
        }
        headRow.replaceChildren(headFrag);

        const needle = normalizeSearch(searchTerm);
        const bodyFrag = document.createDocumentFragment();
        let displayed = 0;

        constructorsRanked.forEach((c, idx) => {
            if (needle && !c.searchKey.includes(needle)) return;

            const tr = document.createElement('tr');

            const tdName = document.createElement('td');
            const link = document.createElement('a');
            link.className = 'driver-link';
            link.href = `#${encodeURIComponent(c.id)}`;
            link.textContent = c.name;
            link.addEventListener('click', (evt) => {
                evt.preventDefault();
                constructorSelect.value = c.id;
                viewSelector.value = 'constructor';
                viewSelector.dispatchEvent(new Event('change'));
            });
            tdName.appendChild(link);
            tr.appendChild(tdName);

            tr.appendChild(createRankCell(String(idx + 1)));

            const tdPeak = document.createElement('td');
            tdPeak.className = 'points-cell';
            tdPeak.textContent = Number(c.peakElo).toFixed(2);
            tr.appendChild(tdPeak);

            const tdPeakYear = document.createElement('td');
            tdPeakYear.textContent = c.peakYear ? String(c.peakYear) : '·';
            tr.appendChild(tdPeakYear);

            const tdLast = document.createElement('td');
            tdLast.textContent = Number(c.lastElo).toFixed(2);
            tr.appendChild(tdLast);

            const tdRaces = document.createElement('td');
            tdRaces.textContent = String(c.races);
            tr.appendChild(tdRaces);

            const tdPeriod = document.createElement('td');
            tdPeriod.textContent = c.firstYear === c.lastYear
                ? String(c.firstYear || '')
                : `${c.firstYear}–${c.lastYear}`;
            tr.appendChild(tdPeriod);

            bodyFrag.appendChild(tr);
            displayed++;
        });

        if (displayed === 0) {
            renderStatusRow(body, headers.length, 'Aucun constructeur trouvé.');
        } else {
            body.replaceChildren(bodyFrag);
        }

        countMeta.textContent = needle
            ? `${displayed} / ${constructorsRanked.length} constructeurs`
            : `${constructorsRanked.length} constructeurs`;
    }

    function renderKpis(points) {
        kpiContainer.replaceChildren();
        if (!points.length) return;

        let peak = points[0];
        let sum = 0;
        for (const p of points) {
            if (p.elo > peak.elo) peak = p;
            sum += p.elo;
        }
        const last = points[points.length - 1];
        const firstYear = points[0].year;
        const lastYear = last.year;

        const items = [
            { label: 'ELO pic', value: peak.elo.toFixed(2), sub: `${peak.year} · ${peak.gp}` },
            { label: 'Dernier ELO', value: last.elo.toFixed(2), sub: `${last.year} · ${last.gp}` },
            { label: 'ELO moyen', value: (sum / points.length).toFixed(2), sub: `${points.length} Grands Prix` },
            { label: 'Période', value: firstYear === lastYear ? String(firstYear) : `${firstYear}–${lastYear}`, sub: 'Hors DNF pilote' },
        ];

        const frag = document.createDocumentFragment();
        for (const item of items) {
            const card = document.createElement('div');
            card.className = 'kpi-card';
            const lbl = document.createElement('div');
            lbl.className = 'kpi-label';
            lbl.textContent = item.label;
            const val = document.createElement('div');
            val.className = 'kpi-value';
            val.textContent = item.value;
            const sub = document.createElement('div');
            sub.className = 'kpi-sub';
            sub.textContent = item.sub;
            card.append(lbl, val, sub);
            frag.appendChild(card);
        }
        kpiContainer.appendChild(frag);
    }

    function renderCsvTable(csvText, hiddenCols) {
        const rows = parseCsv(csvText);
        if (!rows.length) {
            renderStatusRow(body, 1, 'Aucune donnée disponible.');
            return rows;
        }

        const header = rows[0];
        const visibleCols = [];
        for (let j = 0; j < header.length; j++) {
            if (!hiddenCols || !hiddenCols.has(header[j])) {
                visibleCols.push({ index: j, name: header[j] });
            }
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
                const td = document.createElement('td');
                td.textContent = formatEloCell(col.name, row[col.index] || '');
                tr.appendChild(td);
            }
            bodyFrag.appendChild(tr);
        }
        body.replaceChildren(bodyFrag);
        return rows;
    }

    function loadConstructor(constructorId) {
        const seq = ++loadSeq;
        renderStatusRow(body, headRow.children.length || 1, 'Chargement du constructeur…');
        fetchTextCached(`data/elo_constructeurs/constructors/${constructorId}.csv`)
            .then(csvText => {
                if (seq !== loadSeq) return;
                const rows = renderCsvTable(csvText, HIDDEN_CONSTRUCTOR_COLS);
                const header = rows[0] || [];
                const idxYear = header.indexOf('year');
                const idxRound = header.indexOf('round');
                const idxGp = header.indexOf('grandPrixId');
                const idxRaceNo = header.indexOf('careerRaceNumber');
                const idxPos = header.indexOf('positions');
                const idxElo = header.indexOf('eloAfter');

                const points = [];
                for (let i = 1; i < rows.length; i++) {
                    const r = rows[i];
                    const elo = Number.parseFloat(r[idxElo]);
                    const raceNo = Number.parseInt(r[idxRaceNo], 10);
                    if (!Number.isFinite(elo) || !Number.isFinite(raceNo)) continue;
                    points.push({
                        year: r[idxYear] || '',
                        round: r[idxRound] || '',
                        gp: r[idxGp] || '',
                        positions: r[idxPos] || '',
                        raceNo,
                        elo,
                    });
                }
                points.sort((a, b) => a.raceNo - b.raceNo);
                renderKpis(points);
                renderConstructorChart(chartEl, chartTooltip, points);
                countMeta.textContent = `${points.length} Grands Prix`;
            })
            .catch(err => {
                if (seq !== loadSeq) return;
                console.error('Erreur chargement constructeur ELO:', err);
                renderStatusRow(body, 1, 'Erreur de chargement.');
            });
    }

    function loadRace(year, raceFile) {
        const seq = ++loadSeq;
        renderStatusRow(body, headRow.children.length || 1, 'Chargement de la course…');
        fetchTextCached(`data/elo_constructeurs/races/${year}/${raceFile}`)
            .then(csvText => {
                if (seq !== loadSeq) return;
                const rows = renderCsvTable(csvText, new Set(['constructorId']));
                countMeta.textContent = `${Math.max(0, rows.length - 1)} constructeurs`;
            })
            .catch(err => {
                if (seq !== loadSeq) return;
                console.error('Erreur chargement course ELO constructeurs:', err);
                renderStatusRow(body, 1, 'Erreur de chargement.');
            });
    }

    function updateYearNavButtons() {
        const idx = yearSelect.selectedIndex;
        const n = yearSelect.options.length;
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
        raceSelect.replaceChildren(frag);
        if (shouldLoad && races.length) loadRace(year, races[0].file);
    }

    function stepYear(delta) {
        const idx = yearSelect.selectedIndex + delta;
        if (idx >= 0 && idx < yearSelect.options.length) {
            yearSelect.selectedIndex = idx;
            yearSelect.dispatchEvent(new Event('change'));
        }
    }

    viewSelector.addEventListener('change', () => {
        const view = viewSelector.value;
        setView(view);
        if (view === 'ranking') {
            renderRanking();
        } else if (view === 'constructor' && constructorSelect.value) {
            loadConstructor(constructorSelect.value);
        } else if (view === 'race' && yearSelect.value && raceSelect.value) {
            loadRace(yearSelect.value, raceSelect.value);
        }
    });

    constructorSelect.addEventListener('change', () => {
        loadConstructor(constructorSelect.value);
    });

    yearSelect.addEventListener('change', () => {
        populateRacesForYear(yearSelect.value, viewSelector.value === 'race');
        updateYearNavButtons();
    });

    yearPrevBtn.addEventListener('click', () => stepYear(+1));
    yearNextBtn.addEventListener('click', () => stepYear(-1));

    raceSelect.addEventListener('change', () => {
        loadRace(yearSelect.value, raceSelect.value);
    });

    searchInput.addEventListener('input', debounce(() => {
        searchTerm = searchInput.value;
        if (viewSelector.value === 'ranking') renderRanking();
    }, 120));

    renderStatusRow(body, 1, 'Chargement des données ELO constructeurs…');

    fetchJsonCached('data/elo_constructeurs/index.json')
        .then(data => {
            indexData = data;
            if (subtitle && data.k && data.scale) {
                subtitle.textContent = `ELO initial ${data.initialElo} · K=${data.k} · échelle ${data.scale} · hors DNF pilote`;
            }

            constructorsRanked = (data.constructors || [])
                .map(c => ({ ...c, searchKey: normalizeSearch(c.name) }))
                .sort((a, b) => (b.peakElo || 0) - (a.peakElo || 0));

            const byName = constructorsRanked
                .slice()
                .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'fr'));
            const cFrag = document.createDocumentFragment();
            for (const c of byName) {
                const opt = document.createElement('option');
                opt.value = c.id;
                opt.textContent = c.name;
                cFrag.appendChild(opt);
            }
            constructorSelect.replaceChildren(cFrag);

            const years = Object.keys(data.racesByYear || {}).sort((a, b) => b.localeCompare(a, 'fr'));
            const yFrag = document.createDocumentFragment();
            for (const y of years) {
                const opt = document.createElement('option');
                opt.value = y;
                opt.textContent = y;
                yFrag.appendChild(opt);
            }
            yearSelect.replaceChildren(yFrag);
            if (years.length) populateRacesForYear(years[0], false);
            updateYearNavButtons();

            const hashId = decodeURIComponent(globalThis.location.hash.replace(/^#/, ''));
            if (hashId && byName.some(c => c.id === hashId)) {
                constructorSelect.value = hashId;
                viewSelector.value = 'constructor';
                setView('constructor');
                loadConstructor(hashId);
            } else {
                setView('ranking');
                renderRanking();
            }
        })
        .catch(err => {
            console.error('Erreur chargement index ELO constructeurs:', err);
            headRow.innerHTML = '<th>Données non générées</th>';
            renderStatusRow(
                body,
                1,
                'Lancez « python3 src/scripts/generate_elo_constructeurs.py » (ou updatedata.sh) pour générer les données.'
            );
        });
});
