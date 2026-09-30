#!/bin/bash
# Met à jour les données F1DB puis régénère tous les classements.
# Utilisé à la main et par le workflow .github/workflows/update-data.yml.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PYTHON="${PYTHON:-python3}"

step() {
  echo "+-------------------------------------------+"
  echo "|  $1"
  echo "+-------------------------------------------+"
}

cd "$ROOT"
echo "Mise à jour des données F1DB..."
git submodule update --init --remote

# Ces scripts utilisent des chemins relatifs à src/scripts
cd "$ROOT/src/scripts"
step "Génération Historique";                 "$PYTHON" generate_historique.py
step "Génération Qualifications";             "$PYTHON" generate_qualifications.py
step "Génération Deuxième Pilote Par Course"; "$PYTHON" generate_deuxieme_pilote_par_course.py
step "Génération Deuxième Pilote";            "$PYTHON" generate_deuxieme_pilote.py
step "Génération ELO des pilotes";            "$PYTHON" generate_elo_pilotes.py
step "Génération ELO par âge";                "$PYTHON" generate_elo_by_age.py

# Le tableau des champions lit les CSV générés ci-dessus (donc en dernier)
# et utilise des chemins relatifs à la racine du dépôt.
cd "$ROOT"
step "Génération Champions"; "$PYTHON" src/scripts/generate_champions_table.py

echo "Tous les classements ont été mis à jour."
