function buildDriverNameToId(indexData) {
    const map = {};
    const drivers = indexData?.drivers || [];
    for (const d of drivers) {
        if (d?.name && d?.id) {
            map[d.name] = d.id;
        }
    }
    return map;
}

document.addEventListener('DOMContentLoaded', () => {
    const yearSelector = document.getElementById('qualif-year');
    const prevBtn = document.getElementById('qualif-prev');
    const nextBtn = document.getElementById('qualif-next');
    let driverNameToId = {};
    let eloIndexData = null;
    let years = [];

    // Charger le mapping pilotes (ELO) + les années disponibles dynamiquement
    Promise.all([
        fetch('data/elo/index.json', { cache: 'no-store' }).then(r => r.json()).catch(() => null),
        fetch('data/historique.csv').then(response => response.text())
    ])
        .then(([indexData, data]) => {
            eloIndexData = indexData;
            driverNameToId = buildDriverNameToId(indexData);

            const rows = data.split('\n');
            if (rows.length > 0) {
                const header = rows[0].split(',');
                years = header.slice(3); // Les années commencent à partir de la 4ème colonne

                // Mettre à jour le sélecteur d'année
                yearSelector.innerHTML = '';
                years.forEach(year => {
                    const option = document.createElement('option');
                    option.value = year;
                    option.textContent = year;
                    yearSelector.appendChild(option);
                });

                // Charger les données pour la première année
                if (years.length > 0) {
                    loadQualificationsData(years[0]);
                }

                updateNavButtons();
            }
        })
        .catch(error => console.error('Erreur lors du chargement des années:', error));

    yearSelector.addEventListener('change', () => {
        const year = yearSelector.value;
        loadQualificationsData(year);
        updateNavButtons();
    });

    if (prevBtn) {
        prevBtn.addEventListener('click', () => {
            if (!years.length) return;
            const idx = years.indexOf(yearSelector.value);
            if (idx > 0) {
                yearSelector.value = years[idx - 1];
                yearSelector.dispatchEvent(new Event('change'));
            }
        });
    }

    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            if (!years.length) return;
            const idx = years.indexOf(yearSelector.value);
            if (idx >= 0 && idx < years.length - 1) {
                yearSelector.value = years[idx + 1];
                yearSelector.dispatchEvent(new Event('change'));
            }
        });
    }

    function updateNavButtons() {
        if (!prevBtn || !nextBtn) return;
        if (!years.length) {
            prevBtn.disabled = true;
            nextBtn.disabled = true;
            return;
        }
        const idx = years.indexOf(yearSelector.value);
        prevBtn.disabled = idx <= 0;
        nextBtn.disabled = idx < 0 || idx >= years.length - 1;
    }

    function loadQualificationsData(year) {
        fetch(`data/${year}/qualifications.csv`, { cache: 'no-store' })
            .then(response => response.text())
            .then(data => {
                let rows = data.split('\n').map(row => row.split(','));
                let header = rows[0];

                const reordered = reorderQualificationColumns(header, rows, eloIndexData, year);
                header = reordered.header;
                rows = reordered.rows;
                const tableBody = document.getElementById('qualifications-body');
                const tableHead = document.querySelector('#qualifications-table thead tr');

                const idxDriverName = header.indexOf('Pilote');

                // Mettre à jour les en-têtes de colonne
                tableHead.innerHTML = '';
                header.forEach(column => {
                    const th = document.createElement('th');
                    th.textContent = column;
                    tableHead.appendChild(th);
                });

                // Mettre à jour les lignes du tableau
                tableBody.innerHTML = '';
                for (let i = 1; i < rows.length; i++) {
                    const row = rows[i];
                    if (row.length < 3) continue;

                    const tr = document.createElement('tr');
                    for (let j = 0; j < row.length; j++) {
                        const cell = row[j];
                        const td = document.createElement('td');
                        if (j === idxDriverName) {
                            const driverId = driverNameToId[cell];
                            if (driverId) {
                                const a = document.createElement('a');
                                a.className = 'driver-link';
                                a.href = `driver.html?id=${encodeURIComponent(driverId)}`;
                                a.textContent = cell || '';
                                td.appendChild(a);
                            } else {
                                td.textContent = cell || '';
                            }
                        } else {
                            td.textContent = cell || '';
                        }
                        tr.appendChild(td);
                    }
                    tableBody.appendChild(tr);
                }
            })
            .catch(error => console.error(`Erreur lors du chargement des données pour ${year}:`, error));
    }
});

function normalizeKey(s) {
    return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function guessGpColumnKey(grandPrixId) {
    // Tentative: premières 3 lettres du grandPrixId (sans séparateurs) + 'R'
    // ex: australia -> AUSR, great-britain -> GRER, united-states -> UNIR
    const norm = normalizeKey(grandPrixId);
    const prefix = norm.slice(0, 3).toUpperCase();
    return `${prefix}R`;
}

function reorderQualificationColumns(header, rows, indexData, year) {
    if (!header?.length || !rows?.length) return { header, rows };
    const races = indexData?.racesByYear?.[String(year)] || [];
    if (!Array.isArray(races) || races.length === 0) return { header, rows };

    const fixed = ['Pilote', 'Rang', 'Points'];
    const fixedSet = new Set(fixed);

    const eventCols = header.filter(h => !fixedSet.has(h));
    const eventNormToActual = new Map();
    for (const col of eventCols) {
        eventNormToActual.set(normalizeKey(col), col);
    }

    const used = new Set();
    const orderedEvents = [];

    const racesSorted = races.slice().sort((a, b) => (a.round || 0) - (b.round || 0));
    for (const r of racesSorted) {
        const gpId = r?.grandPrixId || '';
        if (!gpId) continue;

        const guess = guessGpColumnKey(gpId);
        const guessNorm = normalizeKey(guess);

        // 1) match exact (normalisé)
        let picked = eventNormToActual.get(guessNorm) || '';

        // 2) fallback: colonne qui commence par le même préfixe et finit par R
        if (!picked) {
            const prefix = normalizeKey(guess).slice(0, 3);
            for (const c of eventCols) {
                const cn = normalizeKey(c);
                if (cn.startsWith(prefix) && cn.endsWith('r')) {
                    picked = c;
                    break;
                }
            }
        }

        if (picked && !used.has(picked)) {
            used.add(picked);
            orderedEvents.push(picked);
        }
    }

    const remaining = eventCols.filter(c => !used.has(c));
    const newHeader = [...fixed, ...orderedEvents, ...remaining];

    const idx = newHeader.map(col => header.indexOf(col));
    const newRows = rows.map(r => idx.map(i => (i >= 0 ? (r[i] || '') : '')));

    return { header: newHeader, rows: newRows };
}
