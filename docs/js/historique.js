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

        tableHead.innerHTML = `
            <th>Pilote</th>
            <th>Rang</th>
            <th>Points</th>
            ${years.slice(start, end).map(year => `<th>${year}</th>`).join('')}
        `;

        tableBody.innerHTML = '';
        for (let i = 0; i < data.length; i++) {
            const row = data[i];
            if (row.length < 3) continue;

            const rowHtml = `
                <tr>
                    <td>${row[0]}</td>
                    <td>${row[1]}</td>
                    <td>${row[2]}</td>
                    ${row.slice(3, 3 + count).map(cell => `<td>${cell}</td>`).join('')}
                </tr>
            `;
            tableBody.innerHTML += rowHtml;
        }
    }
});
