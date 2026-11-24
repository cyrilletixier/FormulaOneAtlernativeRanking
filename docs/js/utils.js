/**
 * Utilitaires partagés et cache réseau en mémoire pour éviter
 * de re-télécharger les mêmes CSV / JSON entre onglets et interactions.
 */
(function initF1Utils(global) {
    const textCache = new Map();
    const jsonCache = new Map();

    const HIDDEN_DRIVER_RESULT_COLUMNS = new Set([
        'careerRaceNumber',
        'constructorId',
        'date',
        'laps',
        'actualScore',
        'expectedScore',
        'kUsed',
        'nParticipants',
    ]);

    const ELO_VALUE_COLUMNS = new Set([
        'eloBefore',
        'eloAfter',
        'eloDelta',
        'meanElo',
    ]);

    function fetchTextCached(url) {
        if (!textCache.has(url)) {
            const p = fetch(url)
                .then(resp => {
                    if (!resp.ok) throw new Error(`HTTP ${resp.status} (${url})`);
                    return resp.text();
                })
                .catch(err => {
                    textCache.delete(url);
                    throw err;
                });
            textCache.set(url, p);
        }
        return textCache.get(url);
    }

    function fetchJsonCached(url) {
        if (!jsonCache.has(url)) {
            const p = fetch(url)
                .then(resp => {
                    if (!resp.ok) throw new Error(`HTTP ${resp.status} (${url})`);
                    return resp.json();
                })
                .catch(err => {
                    jsonCache.delete(url);
                    throw err;
                });
            jsonCache.set(url, p);
        }
        return jsonCache.get(url);
    }

    function getEloIndex() {
        return fetchJsonCached('data/elo/index.json').catch(() => null);
    }

    function getHistoriqueCsv() {
        return fetchTextCached('data/historique.csv');
    }

    function buildDriverNameToId(indexData) {
        const map = new Map();
        const drivers = indexData?.drivers || [];
        for (const d of drivers) {
            if (d?.name && d?.id) {
                map.set(d.name, d.id);
            }
        }
        return map;
    }

    function parseCsv(text) {
        const lines = text.split(/\r?\n/);
        const rows = [];
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (line.trim() !== '') {
                rows.push(line.split(','));
            }
        }
        return rows;
    }

    function formatEloCell(columnName, value) {
        if (!ELO_VALUE_COLUMNS.has(columnName)) return value;
        const num = Number.parseFloat(value);
        return Number.isFinite(num) ? num.toFixed(2) : value;
    }

    function createDriverCell(driverName, driverNameToId) {
        const td = document.createElement('td');
        const driverId = driverNameToId instanceof Map
            ? driverNameToId.get(driverName)
            : driverNameToId?.[driverName];
        if (driverId) {
            const a = document.createElement('a');
            a.className = 'driver-link';
            a.href = `driver.html?id=${encodeURIComponent(driverId)}`;
            a.textContent = driverName || '';
            td.appendChild(a);
        } else {
            td.textContent = driverName || '';
        }
        return td;
    }

    function createRankCell(rankValue) {
        const td = document.createElement('td');
        const num = Number.parseInt(rankValue, 10);
        if (num >= 1 && num <= 3) {
            const badge = document.createElement('span');
            badge.className = `rank-badge rank-${num}`;
            badge.textContent = String(num);
            td.appendChild(badge);
        } else {
            td.textContent = rankValue || '';
        }
        return td;
    }

    function renderStatusRow(tbody, colspan, message) {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = Math.max(1, colspan || 1);
        td.className = 'table-state';
        td.textContent = message;
        tr.appendChild(td);
        tbody.replaceChildren(tr);
    }

    function normalizeSearch(value) {
        return String(value || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .trim();
    }

    function debounce(fn, delayMs = 120) {
        let timer = null;
        return function debounced(...args) {
            if (timer !== null) clearTimeout(timer);
            timer = setTimeout(() => {
                timer = null;
                fn.apply(this, args);
            }, delayMs);
        };
    }

    global.F1Utils = {
        HIDDEN_DRIVER_RESULT_COLUMNS,
        ELO_VALUE_COLUMNS,
        fetchTextCached,
        fetchJsonCached,
        getEloIndex,
        getHistoriqueCsv,
        buildDriverNameToId,
        parseCsv,
        formatEloCell,
        createDriverCell,
        createRankCell,
        renderStatusRow,
        normalizeSearch,
        debounce,
    };
})(globalThis);
