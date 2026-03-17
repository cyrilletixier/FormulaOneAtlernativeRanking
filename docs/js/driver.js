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

    const ys = points.map(p => p.elo);

    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const spanY = Math.max(1e-9, maxY - minY);

    const minX = 0;
    const maxX = Math.max(1, points.length - 1);

    const xScale = (x) => pad + (x - minX) * ((width - 2 * pad) / (maxX - minX || 1));
    const yScale = (y) => (height - pad) - (y - minY) * ((height - 2 * pad) / spanY);

    const svg = createSvgEl('svg');
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('class', 'elo-svg');

    // Axes
    const axis = createSvgEl('path');
    axis.setAttribute('d', `M ${pad} ${pad} L ${pad} ${height - pad} L ${width - pad} ${height - pad}`);
    axis.setAttribute('class', 'elo-axis');
    svg.appendChild(axis);

    // Line
    const d = points
        .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xScale(i)} ${yScale(p.elo)}`)
        .join(' ');

    const line = createSvgEl('path');
    line.setAttribute('d', d);
    line.setAttribute('class', 'elo-line');
    svg.appendChild(line);

    // Dots
    for (let i = 0; i < points.length; i++) {
        const c = createSvgEl('circle');
        c.setAttribute('cx', xScale(i));
        c.setAttribute('cy', yScale(points[i].elo));
        c.setAttribute('r', 3);
        c.setAttribute('class', 'elo-dot');
        c.dataset.label = points[i].label;
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

document.addEventListener('DOMContentLoaded', async () => {
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

    try {
        const indexResp = await fetch('data/elo/index.json');
        const indexData = await indexResp.json();
        const driverMeta = (indexData.drivers || []).find(d => d.id === driverId);
        const driverName = driverMeta ? driverMeta.name : driverId;

        title.textContent = driverName;
        subtitle.textContent = `ELO (K=${indexData.k})`;

        const resp = await fetch(`data/elo/drivers/${driverId}.csv`);
        const csvText = await resp.text();
        const rows = parseCsv(csvText);

        renderTable(rows, headRow, body);

        const header = rows[0] || [];
        const idxDate = header.indexOf('date');
        const idxRound = header.indexOf('round');
        const idxGrandPrix = header.indexOf('grandPrixId');
        const idxEloAfter = header.indexOf('eloAfter');

        const points = [];
        for (let i = 1; i < rows.length; i++) {
            const r = rows[i];
            const date = idxDate >= 0 ? (r[idxDate] || '') : '';
            const round = idxRound >= 0 ? (r[idxRound] || '') : '';
            const gp = idxGrandPrix >= 0 ? (r[idxGrandPrix] || '') : '';
            const eloAfter = idxEloAfter >= 0 ? Number.parseFloat(r[idxEloAfter]) : Number.NaN;
            if (!Number.isFinite(eloAfter)) continue;
            points.push({
                elo: eloAfter,
                label: `${date} (R${round} ${gp}) : ${eloAfter.toFixed(2)}`,
            });
        }

        renderEloChart(chartContainer, points);
    } catch (e) {
        title.textContent = driverId;
        subtitle.textContent = 'Erreur lors du chargement des données.';
        console.error(e);
    }
});
