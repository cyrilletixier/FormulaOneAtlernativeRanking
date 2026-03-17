function parseCsv(text) {
    const lines = text.split('\n').filter(l => l.trim() !== '');
    return lines.map(line => line.split(','));
}

function clearElement(el) {
    if (!el) return;
    el.innerHTML = '';
}

function createSvgEl(tag) {
    return document.createElementNS('http://www.w3.org/2000/svg', tag);
}

function addAxes(svg, pad, width, height) {
    const axis = createSvgEl('path');
    axis.setAttribute('d', `M ${pad} ${pad} L ${pad} ${height - pad} L ${width - pad} ${height - pad}`);
    axis.setAttribute('class', 'elo-axis');
    svg.appendChild(axis);
}

function addMinMaxLabels(svg, pad, height, minY, maxY) {
    const labelMin = createSvgEl('text');
    labelMin.setAttribute('x', 8);
    labelMin.setAttribute('y', height - pad);
    labelMin.setAttribute('class', 'elo-label');
    labelMin.textContent = Math.round(minY);
    svg.appendChild(labelMin);

    const labelMax = createSvgEl('text');
    labelMax.setAttribute('x', 8);
    labelMax.setAttribute('y', pad + 4);
    labelMax.setAttribute('class', 'elo-label');
    labelMax.textContent = Math.round(maxY);
    svg.appendChild(labelMax);
}

function parseAgeCurve(csvText) {
    const rows = parseCsv(csvText);
    if (!rows.length) return [];

    const header = rows[0];
    const idxAge = header.indexOf('age');
    const idxMean = header.indexOf('meanElo');
    if (idxAge < 0 || idxMean < 0) return [];

    const points = [];
    for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        const age = Number.parseInt(r[idxAge] || '', 10);
        const mean = Number.parseFloat(r[idxMean] || '');
        if (!Number.isFinite(age) || !Number.isFinite(mean)) continue;
        points.push({ age, mean });
    }

    points.sort((a, b) => a.age - b.age);
    return points;
}

function renderAgeChart(container, points) {
    clearElement(container);

    if (!points.length) {
        container.textContent = 'Aucune donnée.';
        return;
    }

    const width = 1000;
    const height = 320;
    const pad = 40;

    const xs = points.map(p => p.age);
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

    addAxes(svg, pad, width, height);

    let d = '';
    for (let i = 0; i < points.length; i++) {
        const p = points[i];
        const x = xScale(p.age);
        const y = yScale(p.mean);
        const first = i === 0;
        const gap = first ? 1 : (p.age - points[i - 1].age);
        d += `${(first || gap > 1) ? 'M' : 'L'} ${x} ${y} `;
    }

    const line = createSvgEl('path');
    line.setAttribute('d', d);
    line.setAttribute('class', 'elo-line');
    svg.appendChild(line);

    addMinMaxLabels(svg, pad, height, minY, maxY);

    const labelMinX = createSvgEl('text');
    labelMinX.setAttribute('x', pad);
    labelMinX.setAttribute('y', height - 10);
    labelMinX.setAttribute('class', 'elo-label');
    labelMinX.textContent = `${minX} ans`;
    svg.appendChild(labelMinX);

    const labelMaxX = createSvgEl('text');
    labelMaxX.setAttribute('x', width - pad);
    labelMaxX.setAttribute('y', height - 10);
    labelMaxX.setAttribute('text-anchor', 'end');
    labelMaxX.setAttribute('class', 'elo-label');
    labelMaxX.textContent = `${maxX} ans`;
    svg.appendChild(labelMaxX);

    container.appendChild(svg);
}

document.addEventListener('DOMContentLoaded', () => {
    const viewSelector = document.getElementById('elo-view');
    const driverSelectorWrap = document.getElementById('elo-driver-selector');
    const driverSelector = document.getElementById('elo-driver');
    const yearSelectorWrap = document.getElementById('elo-year-selector');
    const yearSelector = document.getElementById('elo-year');
    const raceSelectorWrap = document.getElementById('elo-race-selector');
    const raceSelector = document.getElementById('elo-race');

    const ageContainer = document.getElementById('elo-age-container');
    const ageChart = document.getElementById('elo-age-chart');
    const tableContainer = document.getElementById('elo-table-container');

    const headRow = document.getElementById('elo-head-row');
    const body = document.getElementById('elo-body');

    let indexData = null;

    function setView(view) {
        if (view === 'driver') {
            driverSelectorWrap.style.display = '';
            yearSelectorWrap.style.display = 'none';
            raceSelectorWrap.style.display = 'none';
            if (ageContainer) ageContainer.style.display = 'none';
            if (tableContainer) tableContainer.style.display = '';
            return;
        }

        if (view === 'race') {
            driverSelectorWrap.style.display = 'none';
            yearSelectorWrap.style.display = '';
            raceSelectorWrap.style.display = '';
            if (ageContainer) ageContainer.style.display = 'none';
            if (tableContainer) tableContainer.style.display = '';
            return;
        }

        // view === 'age'
        driverSelectorWrap.style.display = 'none';
        yearSelectorWrap.style.display = 'none';
        raceSelectorWrap.style.display = 'none';
        if (ageContainer) ageContainer.style.display = '';
        if (tableContainer) tableContainer.style.display = 'none';
    }

    function clearTable() {
        headRow.innerHTML = '';
        body.innerHTML = '';
    }

    function renderTable(csvText) {
        const rows = parseCsv(csvText);
        if (!rows.length) {
            clearTable();
            return;
        }

        const header = rows[0];
        const idxDriverId = header.indexOf('driverId');
        const idxDriverName = header.indexOf('driverName');
        headRow.innerHTML = '';
        header.forEach(col => {
            const th = document.createElement('th');
            th.textContent = col;
            headRow.appendChild(th);
        });

        body.innerHTML = '';
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            if (!row.length) continue;
            const tr = document.createElement('tr');
            for (let j = 0; j < row.length; j++) {
                const cell = row[j];
                const td = document.createElement('td');
                if (j === idxDriverName && idxDriverId >= 0) {
                    const driverId = row[idxDriverId];
                    const a = document.createElement('a');
                    a.className = 'driver-link';
                    a.href = `driver.html?id=${encodeURIComponent(driverId)}`;
                    a.textContent = cell || '';
                    td.appendChild(a);
                } else {
                    td.textContent = cell || '';
                }
                tr.appendChild(td);
            }
            body.appendChild(tr);
        }
    }

    function loadDriver(driverId) {
        clearTable();
        fetch(`data/elo/drivers/${driverId}.csv`, { cache: 'no-store' })
            .then(r => r.text())
            .then(renderTable)
            .catch(err => console.error('Erreur chargement pilote ELO:', err));
    }

    function loadRace(year, raceFile) {
        clearTable();
        fetch(`data/elo/races/${year}/${raceFile}`, { cache: 'no-store' })
            .then(r => r.text())
            .then(renderTable)
            .catch(err => console.error('Erreur chargement course ELO:', err));
    }

    function loadAgeCurve() {
        clearTable();
        if (!ageChart) return;
        clearElement(ageChart);
        fetch('data/elo/elo_by_age.csv', { cache: 'no-store' })
            .then(r => r.text())
            .then((t) => {
                const points = parseAgeCurve(t);
                renderAgeChart(ageChart, points);
            })
            .catch(err => {
                console.error('Erreur chargement ELO par âge:', err);
                ageChart.textContent = 'Erreur de chargement.';
            });
    }

    function populateDrivers() {
        driverSelector.innerHTML = '';
        const drivers = indexData?.drivers ? indexData.drivers.slice() : [];
        drivers.sort((a, b) => (a.name || '').localeCompare((b.name || ''), 'fr'));

        for (const d of drivers) {
            const opt = document.createElement('option');
            opt.value = d.id;
            opt.textContent = d.name;
            driverSelector.appendChild(opt);
        }

        if (drivers.length) {
            loadDriver(drivers[0].id);
        }
    }

    function populateYearsAndRaces() {
        yearSelector.innerHTML = '';
        raceSelector.innerHTML = '';

        const racesByYear = indexData?.racesByYear || {};
        const years = Object.keys(racesByYear).sort((a, b) => a.localeCompare(b, 'fr'));

        for (const y of years) {
            const opt = document.createElement('option');
            opt.value = y;
            opt.textContent = y;
            yearSelector.appendChild(opt);
        }

        if (years.length) {
            populateRacesForYear(years[0]);
        }
    }

    function populateRacesForYear(year) {
        raceSelector.innerHTML = '';
        const races = indexData?.racesByYear?.[year] || [];

        races.sort((a, b) => (a.round || 0) - (b.round || 0));

        for (const r of races) {
            const opt = document.createElement('option');
            opt.value = r.file;
            const label = r.officialName
                ? `${String(r.round).padStart(2, '0')} - ${r.officialName}`
                : `${String(r.round).padStart(2, '0')} - ${r.grandPrixId || r.file}`;
            opt.textContent = label;
            raceSelector.appendChild(opt);
        }

        if (races.length) {
            loadRace(year, races[0].file);
        } else {
            clearTable();
        }
    }

    viewSelector.addEventListener('change', () => {
        setView(viewSelector.value);
        if (viewSelector.value === 'driver') {
            if (driverSelector.value) loadDriver(driverSelector.value);
            return;
        }

        if (viewSelector.value === 'age') {
            loadAgeCurve();
            return;
        }

        if (yearSelector.value && raceSelector.value) {
            loadRace(yearSelector.value, raceSelector.value);
        }
    });

    driverSelector.addEventListener('change', () => {
        loadDriver(driverSelector.value);
    });

    yearSelector.addEventListener('change', () => {
        populateRacesForYear(yearSelector.value);
    });

    raceSelector.addEventListener('change', () => {
        loadRace(yearSelector.value, raceSelector.value);
    });

    setView(viewSelector.value);

    fetch('data/elo/index.json', { cache: 'no-store' })
        .then(r => r.json())
        .then(data => {
            indexData = data;
            populateDrivers();
            populateYearsAndRaces();

            if (viewSelector.value === 'age') {
                loadAgeCurve();
            }
        })
        .catch(err => {
            console.error('Erreur chargement index ELO:', err);
        });
});
