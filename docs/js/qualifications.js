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
    let driverNameToId = {};

    // Charger le mapping pilotes (ELO) + les années disponibles dynamiquement
    Promise.all([
        fetch('data/elo/index.json').then(r => r.json()).catch(() => null),
        fetch('data/historique.csv').then(response => response.text())
    ])
        .then(([indexData, data]) => {
            driverNameToId = buildDriverNameToId(indexData);

            const rows = data.split('\n');
            if (rows.length > 0) {
                const header = rows[0].split(',');
                const years = header.slice(3); // Les années commencent à partir de la 4ème colonne

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
            }
        })
        .catch(error => console.error('Erreur lors du chargement des années:', error));

    yearSelector.addEventListener('change', () => {
        const year = yearSelector.value;
        loadQualificationsData(year);
    });

    function loadQualificationsData(year) {
        fetch(`data/${year}/qualifications.csv`)
            .then(response => response.text())
            .then(data => {
                const rows = data.split('\n').map(row => row.split(','));
                const header = rows[0];
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
