function getQueryParam(name) {
    const params = new URLSearchParams(globalThis.location.search);
    return params.get(name);
}

function createSvgEl(tag) {
    return document.createElementNS('http://www.w3.org/2000/svg', tag);
}

function hashToHue(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
        h = (h * 31 + (str.codePointAt(i) || 0)) >>> 0;
    }
    return h % 360;
}

function teamFill(teamKey) {
    if (!teamKey) return 'color-mix(in srgb, var(--ink) 3%, transparent)';
    const hue = hashToHue(teamKey);
    return `hsl(${hue} var(--band-s) var(--band-l))`;
}

function addGapRects(svg, points, xScale, pad, height, gapShadeRaces) {
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
        const bandWidth = Math.max(0, x2 - x1);
        const rect = createSvgEl('rect');
        rect.setAttribute('x', x1);
        rect.setAttribute('y', pad);
        rect.setAttribute('width', bandWidth);
        rect.setAttribute('height', height - 2 * pad);
        rect.setAttribute('class', 'elo-band');
        rect.style.fill = teamFill(s.teamKey);
        bandsGroup.appendChild(rect);

        // N'affiche le label que si la bande est suffisamment large pour éviter les chevauchements
        if (s.team && bandWidth >= 52) {
            const tx = createSvgEl('text');
            tx.setAttribute('x', (x1 + x2) / 2);
            tx.setAttribute('y', pad + 15);
            tx.setAttribute('text-anchor', 'middle');
            tx.setAttribute('class', 'elo-band-label');
            tx.textContent = s.team;
            bandsGroup.appendChild(tx);
        }
    });
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

    if (!offD) return;
    const offLine = createSvgEl('path');
    offLine.setAttribute('d', offD);
    offLine.setAttribute('class', 'elo-off-line');
    svg.appendChild(offLine);
}

function renderEloChart(container, tooltip, points) {
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
    const GAP_SHADE_RACES = 2;

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

    addGapRects(svg, points, xScale, pad, height, GAP_SHADE_RACES);
    addTeamBands(svg, points, xScale, pad, width, height);
    addGridAndAxes(svg, pad, width, height, minY, maxY, yScale);
    addMainLine(svg, points, xScale, yScale);
    addOffLines(svg, points, xScale, yScale);

    // Libellés début / fin en bas de l'axe X
    const firstDate = points[0]?.date?.slice(0, 4) || '';
    const lastDate = points[points.length - 1]?.date?.slice(0, 4) || '';
    if (firstDate) {
        const l1 = createSvgEl('text');
        l1.setAttribute('x', pad);
        l1.setAttribute('y', height - 14);
        l1.setAttribute('class', 'elo-label');
        l1.textContent = firstDate;
        svg.appendChild(l1);
    }
    if (lastDate && lastDate !== firstDate) {
        const l2 = createSvgEl('text');
        l2.setAttribute('x', width - pad);
        l2.setAttribute('y', height - 14);
        l2.setAttribute('text-anchor', 'end');
        l2.setAttribute('class', 'elo-label');
        l2.textContent = lastDate;
        svg.appendChild(l2);
    }

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
        const targetRace = minR + ((svgX - pad) / (width - 2 * pad)) * spanR;

        // Recherche binaire du point le plus proche
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
            const teamPart = closest.team ? ` · ${closest.team}` : '';
            tooltip.innerHTML = `${closest.date} (${closest.gp})${teamPart} · ELO <strong>${closest.elo.toFixed(2)}</strong>`;
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

function findDriverName(indexData, driverId) {
    const driverMeta = (indexData?.drivers || []).find(d => d.id === driverId);
    return driverMeta ? driverMeta.name : driverId;
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
        date,
        round,
        gp,
        team,
        raceNo,
        teamKey: team,
    };
}

function buildPointsFromDriverCsv(rows) {
    const header = rows[0] || [];
    const indices = {
        idxDate: header.indexOf('date'),
        idxRound: header.indexOf('round'),
        idxGrandPrix: header.indexOf('grandPrixId'),
        idxEloAfter: header.indexOf('eloAfter'),
        idxConstructorName: header.indexOf('constructorName'),
        idxConstructorId: header.indexOf('constructorId'),
        idxCareerRaceNumber: header.indexOf('careerRaceNumber'),
    };

    const points = [];
    for (let i = 1; i < rows.length; i++) {
        const p = parsePointFromRow(indices, rows[i]);
        if (p) points.push(p);
    }

    points.sort((a, b) => a.raceNo - b.raceNo);
    return points;
}

function renderKpis(container, points) {
    if (!container) return;
    container.replaceChildren();
    if (!points.length) return;

    let peak = points[0];
    let sum = 0;
    const teams = new Set();
    for (const p of points) {
        if (p.elo > peak.elo) peak = p;
        sum += p.elo;
        if (p.team) teams.add(p.team);
    }
    const last = points[points.length - 1];
    const firstYear = points[0].date.slice(0, 4);
    const lastYear = last.date.slice(0, 4);

    const items = [
        { label: 'ELO pic', value: peak.elo.toFixed(2), sub: `${peak.date.slice(0, 4)} · ${peak.gp}` },
        { label: 'Dernier ELO', value: last.elo.toFixed(2), sub: last.team || last.date.slice(0, 4) },
        { label: 'ELO moyen', value: (sum / points.length).toFixed(2), sub: `${points.length} départs` },
        { label: 'Période', value: firstYear === lastYear ? firstYear : `${firstYear}–${lastYear}`, sub: `${teams.size} écurie${teams.size > 1 ? 's' : ''}` },
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
    container.appendChild(frag);
}

function renderTable(rows, headRow, body) {
    if (!rows.length) return;
    const { HIDDEN_DRIVER_RESULT_COLUMNS, formatEloCell } = globalThis.F1Utils;
    const header = rows[0];

    const visibleCols = [];
    for (let j = 0; j < header.length; j++) {
        if (!HIDDEN_DRIVER_RESULT_COLUMNS.has(header[j])) {
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
}

async function initDriverPage() {
    const { getEloIndex, fetchTextCached, parseCsv } = globalThis.F1Utils;

    const driverId = getQueryParam('id');
    const title = document.getElementById('driver-title');
    const subtitle = document.getElementById('driver-subtitle');
    const kpiContainer = document.getElementById('driver-kpis');
    const chartContainer = document.getElementById('elo-chart');
    const chartTooltip = document.getElementById('driver-chart-tooltip');
    const headRow = document.getElementById('driver-head-row');
    const body = document.getElementById('driver-body');
    const resultsToggle = document.getElementById('driver-results-toggle');
    const resultsPanel = document.getElementById('driver-results-panel');
    const resultsStatus = document.getElementById('driver-results-status');

    if (!driverId) {
        title.textContent = 'Pilote';
        subtitle.textContent = 'Paramètre manquant : ?id=…';
        return;
    }

    const [indexData, csvText] = await Promise.all([
        getEloIndex(),
        fetchTextCached(`data/elo/drivers/${driverId}.csv`),
    ]);

    const driverName = findDriverName(indexData, driverId);
    document.title = `${driverName} — ELO F1`;
    title.textContent = driverName;
    subtitle.textContent = indexData?.k ? `Historique ELO (K=${indexData.k})` : 'Historique ELO';

    // Réutilise les lignes déjà téléchargées (plus de double fetch au clic !)
    const parsedRows = parseCsv(csvText);
    const points = buildPointsFromDriverCsv(parsedRows);

    renderKpis(kpiContainer, points);
    renderEloChart(chartContainer, chartTooltip, points);

    let tableRendered = false;

    if (resultsToggle && resultsPanel && resultsStatus) {
        resultsToggle.textContent = `Afficher les résultats (${Math.max(0, parsedRows.length - 1)})`;

        resultsToggle.addEventListener('click', () => {
            if (!resultsPanel.hidden) {
                resultsPanel.hidden = true;
                resultsToggle.textContent = `Afficher les résultats (${Math.max(0, parsedRows.length - 1)})`;
                return;
            }

            if (!tableRendered) {
                renderTable(parsedRows, headRow, body);
                tableRendered = true;
            }
            resultsPanel.hidden = false;
            resultsToggle.textContent = 'Masquer les résultats';
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