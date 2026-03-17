function parseCsv(text) {
    const lines = text.split('\n').filter(l => l.trim() !== '');
    return lines.map(line => line.split(','));
}

function getQueryParam(name) {
    const params = new URLSearchParams(globalThis.location.search);
    return params.get(name);
}

function clearChart(container) {
    container.innerHTML = '';
}

function createSvgEl(tag) {
    return document.createElementNS('http://www.w3.org/2000/svg', tag);
}

function hashToHue(str) {
    // Deterministic hash -> hue [0..359]
    let h = 0;
    for (let i = 0; i < str.length; i++) {
        h = (h * 31 + (str.codePointAt(i) || 0)) >>> 0;
    }
    return h % 360;
}

function teamFill(teamKey) {
    if (!teamKey) return 'rgba(0,0,0,0.03)';
    const hue = hashToHue(teamKey);
    return `hsl(${hue} 45% 92%)`;
}

function addGapRects(svg, points, xScale, pad, width, height, gapShadeRaces) {
    const gapsGroup = createSvgEl('g');
    svg.appendChild(gapsGroup);

    for (let i = 1; i < points.length; i++) {
        const prev = points[i - 1];
        const curr = points[i];
        const gapRaces = curr.raceNo - prev.raceNo;
        if (gapRaces >= gapShadeRaces) {
            const left = xScale(prev.raceNo);
            const right = xScale(curr.raceNo);

            const rect = createSvgEl('rect');
            rect.setAttribute('x', left);
            rect.setAttribute('y', pad);
            rect.setAttribute('width', Math.max(0, right - left));
            rect.setAttribute('height', height - 2 * pad);
            rect.setAttribute('class', 'elo-gap');
            gapsGroup.appendChild(rect);
        }
    }
}

function buildTeamSegments(points) {
    const segments = [];
    let segStart = 0;
    for (let i = 1; i <= points.length; i++) {
        const prev = points[i - 1];
        const curr = points[i];
        const prevKey = prev?.teamKey || '';
        const currKey = curr?.teamKey || '';
        if (i === points.length || (curr && currKey !== prevKey)) {
            segments.push({
                start: segStart,
                end: i - 1,
                team: prev?.team || '',
                teamKey: prevKey,
            });
            segStart = i;
        }
    }
    return segments;
}

function addTeamBands(svg, points, xScale, pad, width, height) {
    const bandsGroup = createSvgEl('g');
    svg.appendChild(bandsGroup);

    function bandBounds(startIndex, endIndex) {
        const xStart = xScale(points[startIndex].raceNo);
        const xEnd = xScale(points[endIndex].raceNo);

        const leftMid = startIndex === 0
            ? pad
            : (xScale(points[startIndex - 1].raceNo) + xStart) / 2;
        const rightMid = endIndex === points.length - 1
            ? (width - pad)
            : (xEnd + xScale(points[endIndex + 1].raceNo)) / 2;
        return { x1: Math.max(pad, leftMid), x2: Math.min(width - pad, rightMid) };
    }

    const segments = buildTeamSegments(points);
    segments.forEach((s) => {
        const { x1, x2 } = bandBounds(s.start, s.end);
        const rect = createSvgEl('rect');
        rect.setAttribute('x', x1);
        rect.setAttribute('y', pad);
        rect.setAttribute('width', Math.max(0, x2 - x1));
        rect.setAttribute('height', height - 2 * pad);
        rect.setAttribute('class', 'elo-band');
        rect.style.fill = teamFill(s.teamKey);
        bandsGroup.appendChild(rect);

        if (s.team) {
            const tx = createSvgEl('text');
            tx.setAttribute('x', (x1 + x2) / 2);
            tx.setAttribute('y', pad + 14);
            tx.setAttribute('text-anchor', 'middle');
            tx.setAttribute('class', 'elo-band-label');
            tx.textContent = s.team;
            bandsGroup.appendChild(tx);
        }
    });
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

function addMainLine(svg, points, xScale, yScale) {
    let mainD = '';
    for (let i = 0; i < points.length; i++) {
        const p = points[i];
        const x = xScale(p.raceNo);
        const y = yScale(p.elo);
        const isFirst = i === 0;
        const gapRaces = isFirst ? 1 : (p.raceNo - points[i - 1].raceNo);
        const cmd = (isFirst || gapRaces > 1) ? 'M' : 'L';
        mainD += `${cmd} ${x} ${y} `;
    }

    const line = createSvgEl('path');
    line.setAttribute('d', mainD);
    line.setAttribute('class', 'elo-line');
    svg.appendChild(line);
}

function addOffLines(svg, points, xScale, yScale) {
    let offD = '';
    for (let i = 1; i < points.length; i++) {
        const prev = points[i - 1];
        const curr = points[i];
        const gap = curr.raceNo - prev.raceNo;
        if (gap > 1) {
            const xPrev = xScale(prev.raceNo);
            const xCurr = xScale(curr.raceNo);
            const yPrev = yScale(prev.elo);
            const yCurr = yScale(curr.elo);
            offD += `M ${xPrev} ${yPrev} L ${xCurr} ${yPrev} L ${xCurr} ${yCurr} `;
        }
    }

    const offLine = createSvgEl('path');
    offLine.setAttribute('d', offD);
    offLine.setAttribute('class', 'elo-off-line');
    svg.appendChild(offLine);
}

function renderEloChart(container, points) {
    clearChart(container);

    if (!points.length) {
        container.textContent = 'Aucune donnée.';
        return;
    }

    const width = 1000;
    const height = 320;
    const pad = 40;

    const GAP_SHADE_RACES = 2; // griser si le pilote manque >= 2 courses d'affilée

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
    addGapRects(svg, points, xScale, pad, width, height, GAP_SHADE_RACES);
    addTeamBands(svg, points, xScale, pad, width, height);
    addAxes(svg, pad, width, height);
    addMainLine(svg, points, xScale, yScale);
    addOffLines(svg, points, xScale, yScale);
    addMinMaxLabels(svg, pad, height, minY, maxY);

    container.appendChild(svg);

    // Simple tooltip via title on hover (SVG doesn't support native tooltip well across browsers)
    // Tooltip removed (no dots) - details are available in the table
}

async function loadIndexData() {
    const resp = await fetch('data/elo/index.json');
    return resp.json();
}

function findDriverName(indexData, driverId) {
    const driverMeta = (indexData.drivers || []).find(d => d.id === driverId);
    return driverMeta ? driverMeta.name : driverId;
}

function getColumnIndex(header, name) {
    return header.indexOf(name);
}

function parsePointFromRow(indices, r) {
    const date = indices.idxDate >= 0 ? (r[indices.idxDate] || '') : '';
    const round = indices.idxRound >= 0 ? (r[indices.idxRound] || '') : '';
    const gp = indices.idxGrandPrix >= 0 ? (r[indices.idxGrandPrix] || '') : '';

    const eloAfter = indices.idxEloAfter >= 0 ? Number.parseFloat(r[indices.idxEloAfter]) : Number.NaN;
    if (!Number.isFinite(eloAfter)) return null;

    const raceNo = indices.idxCareerRaceNumber >= 0 ? Number.parseInt(r[indices.idxCareerRaceNumber], 10) : Number.NaN;
    if (!Number.isFinite(raceNo)) return null;

    let team = '';
    if (indices.idxConstructorName >= 0) team = r[indices.idxConstructorName] || '';
    else if (indices.idxConstructorId >= 0) team = r[indices.idxConstructorId] || '';

    return {
        elo: eloAfter,
        team,
        raceNo,
        teamKey: team,
        label: `${date} (R${round} ${gp}) : ${eloAfter.toFixed(2)}`,
    };
}

function buildPointsFromDriverCsv(rows) {
    const header = rows[0] || [];
    const indices = {
        idxDate: getColumnIndex(header, 'date'),
        idxRound: getColumnIndex(header, 'round'),
        idxGrandPrix: getColumnIndex(header, 'grandPrixId'),
        idxEloAfter: getColumnIndex(header, 'eloAfter'),
        idxConstructorName: getColumnIndex(header, 'constructorName'),
        idxConstructorId: getColumnIndex(header, 'constructorId'),
        idxCareerRaceNumber: getColumnIndex(header, 'careerRaceNumber'),
    };

    const points = [];
    for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        const p = parsePointFromRow(indices, r);
        if (p) points.push(p);
    }

    points.sort((a, b) => a.raceNo - b.raceNo);
    return points;
}

function renderTable(rows, headRow, body) {
    if (!rows.length) return;
    const header = rows[0];

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
        row.forEach(cell => {
            const td = document.createElement('td');
            td.textContent = cell || '';
            tr.appendChild(td);
        });
        body.appendChild(tr);
    }
}

async function initDriverPage() {
    const driverId = getQueryParam('id');
    const title = document.getElementById('driver-title');
    const subtitle = document.getElementById('driver-subtitle');
    const chartContainer = document.getElementById('elo-chart');
    const headRow = document.getElementById('driver-head-row');
    const body = document.getElementById('driver-body');
    const resultsToggle = document.getElementById('driver-results-toggle');
    const resultsPanel = document.getElementById('driver-results-panel');
    const resultsStatus = document.getElementById('driver-results-status');

    if (!driverId) {
        title.textContent = 'Pilote';
        subtitle.textContent = 'Paramètre manquant: ?id=...';
        return;
    }

    const indexData = await loadIndexData();
    const driverName = findDriverName(indexData, driverId);
    title.textContent = driverName;
    subtitle.textContent = `ELO (K=${indexData.k})`;

    // Charge uniquement ce qui est nécessaire pour le graph au démarrage.
    // Le tableau des résultats est chargé/affiché à la demande.
    const resp = await fetch(`data/elo/drivers/${driverId}.csv`);
    const csvText = await resp.text();
    const points = buildPointsFromDriverCsv(parseCsv(csvText));
    renderEloChart(chartContainer, points);

    let tableLoaded = false;

    async function loadAndShowResults() {
        if (!resultsToggle || !resultsPanel || !resultsStatus) return;

        resultsStatus.textContent = 'Chargement…';
        resultsToggle.disabled = true;

        try {
            const r = await fetch(`data/elo/drivers/${driverId}.csv`);
            const t = await r.text();
            const rows = parseCsv(t);
            renderTable(rows, headRow, body);
            tableLoaded = true;
            resultsPanel.hidden = false;
            resultsToggle.textContent = 'Masquer les résultats';
            resultsStatus.textContent = '';
        } catch (e) {
            resultsStatus.textContent = 'Erreur de chargement.';
            console.error(e);
        } finally {
            resultsToggle.disabled = false;
        }
    }

    function hideResults() {
        if (!resultsToggle || !resultsPanel || !resultsStatus) return;
        resultsPanel.hidden = true;
        resultsToggle.textContent = tableLoaded ? 'Afficher les résultats' : 'Charger les résultats';
        resultsStatus.textContent = '';
    }

    if (resultsToggle && resultsPanel && resultsStatus) {
        resultsToggle.addEventListener('click', () => {
            if (!resultsPanel.hidden) {
                hideResults();
                return;
            }

            if (tableLoaded) {
                resultsPanel.hidden = false;
                resultsToggle.textContent = 'Masquer les résultats';
                return;
            }

            loadAndShowResults();
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    initDriverPage().catch((e) => {
        const driverId = getQueryParam('id') || '';
        const title = document.getElementById('driver-title');
        const subtitle = document.getElementById('driver-subtitle');
        title.textContent = driverId || 'Pilote';
        subtitle.textContent = 'Erreur lors du chargement des données.';
        console.error(e);
    });
});
