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
