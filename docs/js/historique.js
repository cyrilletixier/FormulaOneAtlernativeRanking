document.addEventListener('DOMContentLoaded', () => {
    let currentStart = 0;
    const yearsPerPage = 10;
    let allYears = [];
    let allData = [];

    // Charger le fichier CSV
    fetch('data/historique.csv')
        .then(response => response.text())
        .then(data => {
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
        for (let i = 0; i < data.length; i++) {
            const row = data[i];
            if (row.length < 3) continue;

            // Commence à partir de la colonne 3 (index 3) pour les années
            const rowHtml = `
                <tr>
                    <td>${row[0]}</td>
                    <td>${row[1]}</td>
                    <td>${parseInt(row[2])}</td>
                    ${row.slice(3 + start, 3 + end).map(cell => {
                        const value = parseInt(cell);
                        return `<td>${value ? value : ''}</td>`;
                    }).join('')}
                </tr>
            `;
            tableBody.innerHTML += rowHtml;
        }
    }
});
