function parseCsv(text) {
    const lines = text.split('\n').filter(l => l.trim() !== '');
    return lines.map(line => line.split(','));
}

function clearTable(headRow, body) {
    headRow.innerHTML = '';
    body.innerHTML = '';
}

function renderTable(csvText, headRow, body) {
    const rows = parseCsv(csvText);
    if (!rows.length) {
        clearTable(headRow, body);
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
        for (let j = 0; j < header.length; j++) {
            const td = document.createElement('td');
            td.textContent = row[j] || '';
            tr.appendChild(td);
        }
        body.appendChild(tr);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const headRow = document.getElementById('champions-head-row');
    const body = document.getElementById('champions-body');

    fetch('data/champions.csv', { cache: 'no-store' })
        .then(r => r.text())
        .then(text => renderTable(text, headRow, body))
        .catch(err => {
            console.error('Erreur chargement champions:', err);
            clearTable(headRow, body);
            headRow.innerHTML = '<th>Erreur de chargement</th>';
        });
});
