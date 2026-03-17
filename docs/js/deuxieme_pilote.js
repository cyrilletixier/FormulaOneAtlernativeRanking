document.addEventListener('DOMContentLoaded', () => {
    // Sélecteurs pour le classement des deuxièmes pilotes
    const yearSelector = document.getElementById('deuxieme-year');
    const prevBtn = document.getElementById('deuxieme-prev');
    const nextBtn = document.getElementById('deuxieme-next');
    const tableBody = document.getElementById('deuxieme-pilote-body');
    const tableHead = document.querySelector('#deuxieme-pilote-table thead tr');
    let years = [];

    // Charger les années disponibles
    async function loadYears() {
        try {
            const response = await fetch('data/historique.csv');
            const data = await response.text();
            const rows = data.split('\n');
            if (rows.length > 0) {
                const header = rows[0].split(',');
                years = header.slice(3); // Les années commencent à partir de la 4ème colonne

                // Mettre à jour le sélecteur d'année
                yearSelector.innerHTML = '';
                for (const year of years) {
                    const option = document.createElement('option');
                    option.value = year;
                    option.textContent = year;
                    yearSelector.appendChild(option);
                }

                // Charger les données pour la première année
                if (years.length > 0) {
                    loadDeuxiemePiloteData(years[0]);
                }

                updateNavButtons();
            }
        } catch (error) {
            console.error('Erreur lors du chargement des années:', error);
        }
    }

    // Charger les données pour une année spécifique
                                    years = header.slice(3); // Les années commencent à partir de la 4ème colonne
        try {
            const response = await fetch(`data/${year}/deuxieme_pilote.csv`);
            const data = await response.text();
            const rows = data.split('\n').map(row => row.split(','));
            const header = rows[0];

            // Mettre à jour les en-têtes de colonne
            tableHead.innerHTML = '';
            for (const column of header) {
                const th = document.createElement('th');
                th.textContent = column;
                tableHead.appendChild(th);
            }

            // Mettre à jour les lignes du tableau
            tableBody.innerHTML = '';
            for (let i = 1; i < rows.length; i++) {
                const row = rows[i];
                if (row.length < 3) continue;

                const tr = document.createElement('tr');
                for (const cell of row) {
                    const td = document.createElement('td');
                    td.textContent = cell || '';
                    tr.appendChild(td);
                }
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
});
