document.addEventListener('DOMContentLoaded', () => {
    const yearSelector = document.getElementById('deuxieme-year');

    yearSelector.addEventListener('change', () => {
        const year = yearSelector.value;
        loadDeuxiemePiloteData(year);
    });

    // Charger les données pour l'année par défaut
    loadDeuxiemePiloteData(yearSelector.value);

    function loadDeuxiemePiloteData(year) {
        fetch(`data/${year}/deuxieme_pilote.csv`)
            .then(response => response.text())
            .then(data => {
                const rows = data.split('\n').map(row => row.split(','));
                const header = rows[0];
                const tableBody = document.getElementById('deuxieme-pilote-body');

                tableBody.innerHTML = '';
                for (let i = 1; i < rows.length; i++) {
                    const row = rows[i];
                    if (row.length < 4) continue;

                    const rowHtml = `
                        <tr>
                            <td>${row[0]}</td>
                            <td>${row[1]}</td>
                            <td>${row[2]}</td>
                            <td>${row[3]}</td>
                        </tr>
                    `;
                    tableBody.innerHTML += rowHtml;
                }
            });
    }
});
