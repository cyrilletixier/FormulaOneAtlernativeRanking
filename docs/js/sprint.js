document.addEventListener('DOMContentLoaded', () => {
    const yearSelector = document.getElementById('sprint-year');
    const prevBtn = document.getElementById('sprint-prev');
    const nextBtn = document.getElementById('sprint-next');
    const info = document.getElementById('sprint-info');
    const tableHead = document.querySelector('#sprint-table thead tr');
    const tableBody = document.getElementById('sprint-body');
    let driverNameToId = {};
    let seasons = [];

    Promise.all([
        fetch('data/elo/index.json', { cache: 'no-store' }).then(r => r.json()).catch(() => null),
        fetch('data/sprint/index.json', { cache: 'no-store' }).then(r => r.json())
    ])
        .then(([eloIndex, sprintIndex]) => {
            driverNameToId = buildDriverNameToId(eloIndex);
            seasons = sprintIndex.years || [];
            yearSelector.innerHTML = '';
            // Années les plus récentes d'abord
            seasons.slice().reverse().forEach(s => {
                const option = document.createElement('option');
                option.value = s.year;
                option.textContent = s.year;
                yearSelector.appendChild(option);
            });
            if (seasons.length) loadYear(yearSelector.value);
            updateNavButtons();
        })
        .catch(error => console.error('Erreur lors du chargement des sprints:', error));

    yearSelector.addEventListener('change', () => {
        loadYear(yearSelector.value);
        updateNavButtons();
    });

    // L'ordre du sélecteur est décroissant : « << » = année précédente (plus ancienne)
    prevBtn.addEventListener('click', () => step(+1));
    nextBtn.addEventListener('click', () => step(-1));

    function step(delta) {
        const idx = yearSelector.selectedIndex + delta;
        if (idx >= 0 && idx < yearSelector.options.length) {
            yearSelector.selectedIndex = idx;
            yearSelector.dispatchEvent(new Event('change'));
        }
    }

    function updateNavButtons() {
        const idx = yearSelector.selectedIndex;
        const n = yearSelector.options.length;
        prevBtn.disabled = idx < 0 || idx >= n - 1;
        nextBtn.disabled = idx <= 0;
    }

    function loadYear(year) {
        const season = seasons.find(s => String(s.year) === String(year));
        info.textContent = season
            ? `Champion du monde sprint ${season.year} : ${season.champion} (${season.points} pts en ${season.sprints} sprints)`
            : '';

        fetch(`data/${year}/sprint.csv`, { cache: 'no-store' })
            .then(r => r.text())
            .then(text => {
                const rows = text.split('\n').filter(l => l.trim() !== '').map(l => l.split(','));
                if (!rows.length) return;
                const header = rows[0];
                tableHead.innerHTML = '';
                header.forEach(col => {
                    const th = document.createElement('th');
                    th.textContent = col;
                    tableHead.appendChild(th);
                });

                tableBody.innerHTML = '';
                for (const row of rows.slice(1)) {
                    const tr = document.createElement('tr');
                    row.forEach((cell, j) => {
                        const td = document.createElement('td');
                        const driverId = j === 0 ? driverNameToId[cell] : null;
                        if (driverId) {
                            const a = document.createElement('a');
                            a.className = 'driver-link';
                            a.href = `driver.html?id=${encodeURIComponent(driverId)}`;
                            a.textContent = cell;
                            td.appendChild(a);
                        } else {
                            td.textContent = cell || '';
                        }
                        tr.appendChild(td);
                    });
                    tableBody.appendChild(tr);
                }
            })
            .catch(error => console.error(`Erreur lors du chargement des sprints ${year}:`, error));
    }
});
