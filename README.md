# FormulaOneAtlernativeRanking
Alternative ranking with formula one results

## Mise à jour des données

Les classements sont calculés par les scripts de `src/scripts/` à partir des
données du sous-module `data/f1db` (https://github.com/f1db/f1db).

- **Automatique** : le workflow « Mise à jour des données »
  (`.github/workflows/update-data.yml`) tourne chaque lundi soir, régénère les
  classements et ouvre une pull request `auto/data-update` s'il y a du nouveau.
  Il peut aussi être lancé à la main depuis l'onglet Actions.
  Réglage requis (une fois) : Settings → Actions → General →
  « Allow GitHub Actions to create and approve pull requests ».
- **À la main** : `pip install -r requirements.txt` puis
  `bash src/scripts/updatedata.sh`.

Chaque générateur compare l'empreinte (`.hash`) de ses sources et ne recalcule
que ce qui a changé.

## Classement Sprint

Onglet « Sprint » : championnat du monde calculé uniquement sur les courses
sprint (`sprint-race-results.yml` de f1db, 2021 → aujourd'hui).

**Méthode de calcul** (`src/scripts/generate_sprint.py`) :

1. On ne garde que les courses sprint de la saison (pas les qualifications sprint).
2. Chaque pilote cumule les points réellement distribués en sprint
   (3-2-1 en 2021, 8-7-6-5-4-3-2-1 depuis 2022).
3. Départage des égalités comme au classement officiel : le plus grand nombre de
   victoires en sprint, puis de 2es places, de 3es places, etc.
4. Si l'égalité subsiste après tout le décompte (cas tranché par la FIA, ce que
   les données ne permettent pas de reproduire), on retient le pilote qui a
   obtenu en premier son meilleur résultat, puis l'ordre alphabétique.

Sorties : `docs/data/<année>/sprint.csv` (une ligne par pilote, une colonne par
sprint), `docs/data/sprint/index.json` (champion par année) et la colonne
« champion sprint » de `docs/data/champions.csv`. Le script est lancé par
`updatedata.sh`, donc par le workflow GitHub Actions hebdomadaire.
