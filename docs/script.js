// Liste des années disponibles
const availableYears = ["2023", "2022"];

// Fonction pour charger un fichier CSV et afficher son contenu dans un tableau
async function loadCSV(filePath, tableId) {
    try {
        const response = await fetch(filePath);
        if (!response.ok) throw new Error(`Fichier ${filePath} introuvable.`);
        const data = await response.text();
        const rows = data.split('\n')
            .map(row => row.split(',')
                .map(cell => cell.trim()));

        // Supprimer les lignes vides ou mal formatées
        const validRows = rows.filter(row => row.length > 1 && row[0]);

        // Trier les pilotes par rang (colonne 1)
        validRows.sort((a, b) => {
            const rankA = parseInt(a[1]); // Colonnes : 0=Pilote, 1=Rang, 2=Points, 3+=R1,R2,...
            const rankB = parseInt(b[1]);
            return rankA - rankB;
        });

        const table = document.getElementById(tableId);
        table.innerHTML = '';

        // Ajouter l'en-tête du tableau
        const header = validRows[0];
        const headerRow = document.createElement('tr');
        header.forEach(text => {
            const th = document.createElement('th');
            th.textContent = text;
            headerRow.appendChild(th);
        });
        table.appendChild(headerRow);

        // Ajouter les lignes de données (en commençant par la 2ème ligne)
        for (let i = 1; i < validRows.length; i++) {
            const row = validRows[i];
            const tr = document.createElement('tr');

            row.forEach((text, index) => {
                const td = document.createElement('td');
                td.textContent = text;

                // Mettre en évidence le rang
                if (index === 1) {
                    td.style.fontWeight = 'bold';
                    td.style.textAlign = 'center';
                }

                tr.appendChild(td);
            });
            table.appendChild(tr);
        }
    } catch (error) {
        console.error(error);
        const table = document.getElementById(tableId);
        table.innerHTML = `<tr><td colspan="100%" style="text-align: center; color: red;">${error.message}</td></tr>`;
    }
}

// Fonction pour mettre à jour le titre de l'année
function updateYearTitle(year, tabId) {
    const titleElement = document.getElementById(tabId === "qualifications" ? "year-title" : "year-title-deuxieme-pilote");
    titleElement.textContent = `(${year})`;
}

// Charger les données au démarrage
document.addEventListener('DOMContentLoaded', () => {
    // Charger le classement historique par défaut
    loadCSV('data/historique.csv', 'table-historique');

    // Gestion des onglets
    const tabButtons = document.querySelectorAll('.tab-button');
    const yearSelector = document.getElementById('year-selector');
    const yearDropdown = document.getElementById('year');

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tabId = button.getAttribute('data-tab');

            // Masquer ou afficher le sélecteur d'année
            if (tabId === "historique") {
                yearSelector.style.display = 'none';
            } else {
                yearSelector.style.display = 'block';
                updateYearTitle(yearDropdown.value, tabId);
            }

            // Basculer les onglets
            document.querySelectorAll('.tab-content').forEach(content => {
                content.classList.remove('active');
            });
            document.querySelectorAll('.tab-button').forEach(btn => {
                btn.classList.remove('active');
            });
            document.getElementById(tabId).classList.add('active');
            button.classList.add('active');

            // Charger les données en fonction de l'onglet
            if (tabId === 'historique') {
                loadCSV('data/historique.csv', 'table-historique');
            } else {
                const year = yearDropdown.value;
                if (tabId === 'qualifications') {
                    updateYearTitle(year, tabId);
                    loadCSV(`data/${year}/qualifications.csv`, 'table-qualifications');
                } else if (tabId === 'deuxieme-pilote') {
                    updateYearTitle(year, tabId);
                    loadCSV(`data/${year}/deuxieme_pilote.csv`, 'table-deuxieme-pilote');
                }
            }
        });
    });

    // Gestion du changement d'année
    yearDropdown.addEventListener('change', () => {
        const activeTab = document.querySelector('.tab-button.active').getAttribute('data-tab');
        const year = yearDropdown.value;

        if (activeTab === 'qualifications') {
            updateYearTitle(year, activeTab);
            loadCSV(`data/${year}/qualifications.csv`, 'table-qualifications');
        } else if (activeTab === 'deuxieme-pilote') {
            updateYearTitle(year, activeTab);
            loadCSV(`data/${year}/deuxieme_pilote.csv`, 'table-deuxieme-pilote');
        }
    });
});
