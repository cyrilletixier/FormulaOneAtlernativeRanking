document.addEventListener('DOMContentLoaded', () => {
    // Sélecteurs pour le classement des deuxièmes pilotes
    const yearSelector = document.getElementById('deuxieme-year');
    const tableBody = document.getElementById('deuxieme-pilote-body');
    const tableHead = document.querySelector('#deuxieme-pilote-table thead tr');

    // Charger les années disponibles
    async function loadYears() {
        try {
            const response = await fetch('data/historique.csv');
            const data = await response.text();
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
                    loadDeuxiemePiloteData(years[0]);
                }
            }
        } catch (error) {
            console.error('Erreur lors du chargement des années:', error);
        }
    }

    // Charger les données pour une année spécifique
    async function loadDeuxiemePiloteData(year) {
        try {
            const response = await fetch(`data/${year}/deuxieme_pilote.csv`);
            const data = await response.text();
            const rows = data.split('\n').map(row => row.split(','));
            const header = rows[0];

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
                row.forEach(cell => {
                    const td = document.createElement('td');
                    td.textContent = cell || '';
                    tr.appendChild(td);
                });
                tableBody.appendChild(tr);
            }
        } catch (error) {
            console.error(`Erreur lors du chargement des données pour ${year}:`, error);
        }
    }

    // Charger les années disponibles
    loadYears();

    // Gestion du changement d'année
    yearSelector.addEventListener('change', (event) => {
        const year = event.target.value;
        loadDeuxiemePiloteData(year);
    });
});
