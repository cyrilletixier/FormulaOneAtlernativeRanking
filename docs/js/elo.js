function parseCsv(text) {
    const lines = text.split('\n').filter(l => l.trim() !== '');
    return lines.map(line => line.split(','));
}

document.addEventListener('DOMContentLoaded', () => {
    const viewSelector = document.getElementById('elo-view');
    const driverSelectorWrap = document.getElementById('elo-driver-selector');
    const driverSelector = document.getElementById('elo-driver');
    const yearSelectorWrap = document.getElementById('elo-year-selector');
    const yearSelector = document.getElementById('elo-year');
    const raceSelectorWrap = document.getElementById('elo-race-selector');
    const raceSelector = document.getElementById('elo-race');

    const headRow = document.getElementById('elo-head-row');
    const body = document.getElementById('elo-body');

    let indexData = null;

    function setView(view) {
        if (view === 'driver') {
            driverSelectorWrap.style.display = '';
            yearSelectorWrap.style.display = 'none';
            raceSelectorWrap.style.display = 'none';
        } else {
            driverSelectorWrap.style.display = 'none';
            yearSelectorWrap.style.display = '';
            raceSelectorWrap.style.display = '';
        }
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
            for (const cell of row) {
                const td = document.createElement('td');
                td.textContent = cell || '';
                tr.appendChild(td);
            }
            body.appendChild(tr);
        }
    }

    function loadDriver(driverId) {
        clearTable();
        fetch(`data/elo/drivers/${driverId}.csv`)
            .then(r => r.text())
            .then(renderTable)
            .catch(err => console.error('Erreur chargement pilote ELO:', err));
    }

    function loadRace(year, raceFile) {
        clearTable();
        fetch(`data/elo/races/${year}/${raceFile}`)
            .then(r => r.text())
            .then(renderTable)
            .catch(err => console.error('Erreur chargement course ELO:', err));
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

    fetch('data/elo/index.json')
        .then(r => r.json())
        .then(data => {
            indexData = data;
            populateDrivers();
            populateYearsAndRaces();
        })
        .catch(err => {
            console.error('Erreur chargement index ELO:', err);
        });
});
