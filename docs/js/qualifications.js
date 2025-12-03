document.addEventListener('DOMContentLoaded', () => {
    const yearSelector = document.getElementById('qualif-year');

    yearSelector.addEventListener('change', () => {
        const year = yearSelector.value;
        loadQualificationsData(year);
    });

    // Charger les données pour l'année par défaut
    loadQualificationsData(yearSelector.value);

    function loadQualificationsData(year) {
        fetch(`data/${year}/qualifications.csv`)
            .then(response => response.text())
            .then(data => {
                const rows = data.split('\n').map(row => row.split(','));
                const header = rows[0];
                const tableBody = document.getElementById('qualifications-body');

                tableBody.innerHTML = '';
                for (let i = 1; i < rows.length; i++) {
                    const row = rows[i];
                    if (row.length < 3) continue;

                    const rowHtml = `
                        <tr>
                            <td>${row[0]}</td>
                            <td>${row[1]}</td>
                            <td>${row[2]}</td>
                        </tr>
                    `;
                    tableBody.innerHTML += rowHtml;
                }
            });
    }
});
