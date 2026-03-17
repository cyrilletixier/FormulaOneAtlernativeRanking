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

function renderEloChart(container, points) {
    clearChart(container);

    if (!points.length) {
        container.textContent = 'Aucune donnée.';
        return;
    }

    const width = 1000;
    const height = 320;
    const pad = 40;

    const GAP_SHADE_DAYS = 90; // griser si >= 90 jours sans course
    const GAP_BREAK_LINE_DAYS = 90; // couper la courbe si >= 90 jours
    const dayMs = 24 * 60 * 60 * 1000;

    const ys = points.map(p => p.elo);
    const ts = points.map(p => p.t);

    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const spanY = Math.max(1e-9, maxY - minY);

    const minT = Math.min(...ts);
    const maxT = Math.max(...ts);
    const spanT = Math.max(1, maxT - minT);

    const xScale = (t) => pad + (t - minT) * ((width - 2 * pad) / spanT);
    const yScale = (y) => (height - pad) - (y - minY) * ((height - 2 * pad) / spanY);

    const svg = createSvgEl('svg');
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('class', 'elo-svg');

    // Background: gaps (periods without races)
    const gapsGroup = createSvgEl('g');
    svg.appendChild(gapsGroup);

    for (let i = 1; i < points.length; i++) {
        const prev = points[i - 1];
        const curr = points[i];
        const gapDays = (curr.t - prev.t) / dayMs;
        if (gapDays >= GAP_SHADE_DAYS) {
            const x1 = (xScale(prev.t) + xScale(curr.t)) / 2;
            // Shade between the midpoints; use a bit of padding for readability
            const left = x1 - Math.min(80, (xScale(curr.t) - xScale(prev.t)) / 2);
            const right = x1 + Math.min(80, (xScale(curr.t) - xScale(prev.t)) / 2);

            const rect = createSvgEl('rect');
            rect.setAttribute('x', Math.max(pad, left));
            rect.setAttribute('y', pad);
            rect.setAttribute('width', Math.max(0, Math.min(width - pad, right) - Math.max(pad, left)));
            rect.setAttribute('height', height - 2 * pad);
            rect.setAttribute('class', 'elo-gap');
            gapsGroup.appendChild(rect);
        }
    }

    // Background bands by constructor period
    const bandsGroup = createSvgEl('g');
    svg.appendChild(bandsGroup);

    const segments = [];
    let segStart = 0;
    for (let i = 1; i <= points.length; i++) {
        const prev = points[i - 1];
        const curr = points[i];
        if (i === points.length || (curr && curr.team !== prev.team)) {
            segments.push({
                start: segStart,
                end: i - 1,
                team: prev.team || '',
            });
            segStart = i;
        }
    }

    function bandBounds(startIndex, endIndex) {
        const startT = points[startIndex].t;
        const endT = points[endIndex].t;
        const xStart = xScale(startT);
        const xEnd = xScale(endT);

        const leftMid = startIndex === 0
            ? pad
            : (xScale(points[startIndex - 1].t) + xStart) / 2;
        const rightMid = endIndex === points.length - 1
            ? (width - pad)
            : (xEnd + xScale(points[endIndex + 1].t)) / 2;
        return { x1: Math.max(pad, leftMid), x2: Math.min(width - pad, rightMid) };
    }

    segments.forEach((s, idx) => {
        const { x1, x2 } = bandBounds(s.start, s.end);
        const rect = createSvgEl('rect');
        rect.setAttribute('x', x1);
        rect.setAttribute('y', pad);
        rect.setAttribute('width', Math.max(0, x2 - x1));
        rect.setAttribute('height', height - 2 * pad);
        rect.setAttribute('class', idx % 2 === 0 ? 'elo-band-a' : 'elo-band-b');
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

    // Axes
    const axis = createSvgEl('path');
    axis.setAttribute('d', `M ${pad} ${pad} L ${pad} ${height - pad} L ${width - pad} ${height - pad}`);
    axis.setAttribute('class', 'elo-axis');
    svg.appendChild(axis);

    // Line
    let d = '';
    for (let i = 0; i < points.length; i++) {
        const p = points[i];
        const x = xScale(p.t);
        const y = yScale(p.elo);

        const isFirst = i === 0;
        const gapDays = isFirst ? 0 : (p.t - points[i - 1].t) / dayMs;
        const cmd = (isFirst || gapDays >= GAP_BREAK_LINE_DAYS) ? 'M' : 'L';
        d += `${cmd} ${x} ${y} `;
    }

    const line = createSvgEl('path');
    line.setAttribute('d', d);
    line.setAttribute('class', 'elo-line');
    svg.appendChild(line);

    // Dots
    for (const p of points) {
        const c = createSvgEl('circle');
        c.setAttribute('cx', xScale(p.t));
        c.setAttribute('cy', yScale(p.elo));
        c.setAttribute('r', 3);
        c.setAttribute('class', 'elo-dot');
        c.dataset.label = p.label;
        svg.appendChild(c);
    }

    // Min/Max labels
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

    container.appendChild(svg);

    // Simple tooltip via title on hover (SVG doesn't support native tooltip well across browsers)
    svg.addEventListener('mousemove', (e) => {
        const target = e.target;
        if (target?.tagName === 'circle') {
            const label = target.dataset.label;
            container.setAttribute('title', label || '');
        }
    });
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

    const t = Date.parse(date);
    if (!Number.isFinite(t)) return null;

    let team = '';
    if (indices.idxConstructorName >= 0) team = r[indices.idxConstructorName] || '';
    else if (indices.idxConstructorId >= 0) team = r[indices.idxConstructorId] || '';

    return {
        elo: eloAfter,
        team,
        t,
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
    };

    const points = [];
    for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        const p = parsePointFromRow(indices, r);
        if (p) points.push(p);
    }

    points.sort((a, b) => a.t - b.t);
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

    if (!driverId) {
        title.textContent = 'Pilote';
        subtitle.textContent = 'Paramètre manquant: ?id=...';
        return;
    }

    const indexData = await loadIndexData();
    const driverName = findDriverName(indexData, driverId);
    title.textContent = driverName;
    subtitle.textContent = `ELO (K=${indexData.k})`;

    const resp = await fetch(`data/elo/drivers/${driverId}.csv`);
    const csvText = await resp.text();
    const rows = parseCsv(csvText);

    renderTable(rows, headRow, body);
    const points = buildPointsFromDriverCsv(rows);
    renderEloChart(chartContainer, points);
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
