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
    let currentStart = 0;
    const yearsPerPage = 10;
    let allYears = [];
    let allData = [];
    let driverNameToId = {};

    function linkifyDriverName(driverName) {
        const driverId = driverNameToId[driverName];
        if (!driverId) return driverName;
        return `<a class="driver-link" href="driver.html?id=${encodeURIComponent(driverId)}">${driverName}</a>`;
    }

    // Charger le mapping des pilotes (ELO) + le fichier CSV historique
    Promise.all([
        fetch('data/elo/index.json').then(r => r.json()).catch(() => null),
        fetch('data/historique.csv').then(response => response.text())
    ])
        .then(([indexData, data]) => {
            driverNameToId = buildDriverNameToId(indexData);

            const rows = data.split('\n').map(row => row.split(','));
            const header = rows[0];
            allYears = header.slice(3); // Colonnes des années
            allData = rows.slice(1); // Données des pilotes

            displayHistoriqueTable(allData, allYears, currentStart, yearsPerPage);

            // Gestion des boutons de navigation
            document.getElementById('historique-prev').addEventListener('click', () => {
                if (currentStart > 0) {
                    currentStart -= yearsPerPage;
                    displayHistoriqueTable(allData, allYears, currentStart, yearsPerPage);
                }
            });

            document.getElementById('historique-next').addEventListener('click', () => {
                if (currentStart + yearsPerPage < allYears.length) {
                    currentStart += yearsPerPage;
                    displayHistoriqueTable(allData, allYears, currentStart, yearsPerPage);
                }
            });
        });

    function displayHistoriqueTable(data, years, start, count) {
        const tableBody = document.getElementById('historique-body');
        const tableHead = document.querySelector('#historique-table thead tr');
        const rangeSpan = document.getElementById('historique-range');

        const end = Math.min(start + count, years.length);
        rangeSpan.textContent = `${years[start]}-${years[end - 1]}`;

        // Mettre à jour les en-têtes de colonne
        tableHead.innerHTML = `
            <th>Pilote</th>
            <th>Rang</th>
            <th>Points</th>
            ${years.slice(start, end).map(year => `<th>${year}</th>`).join('')}
        `;

        // Mettre à jour les lignes du tableau
        tableBody.innerHTML = '';
        for (const row of data) {
            if (row.length < 3) continue;

            // Commence à partir de la colonne 3 (index 3) pour les années
            const rowHtml = `
                <tr>
                    <td>${linkifyDriverName(row[0])}</td>
                    <td>${row[1]}</td>
                    <td>${Number.parseInt(row[2], 10)}</td>
                    ${row.slice(3 + start, 3 + end).map(cell => {
                        const value = Number.parseInt(cell, 10);
                        return `<td>${value > 0 ? value : ''}</td>`;
                    }).join('')}
                </tr>
            `;
            tableBody.innerHTML += rowHtml;
        }
    }
});
