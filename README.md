# FormulaOneAtlernativeRanking 🏎️

Classements alternatifs de Formule 1 (1950 – aujourd'hui) calculés à partir des données ouvertes de [f1db](https://github.com/f1db/f1db).

Le site est publié automatiquement sur **GitHub Pages** : <https://cyrilletixier.github.io/FormulaOneAtlernativeRanking/>

## 📊 Classements disponibles

| Onglet / Page | Description | Méthode de calcul |
|---|---|---|
| **Classement Historique** | Points cumulés de tous les championnats du monde (barème 25-18-15…-1) | `src/scripts/generate_historique.py` |
| **Qualifications** | Championnat du monde des qualifications (Q3 puis Q2/Q1 avant 2006) | `src/scripts/generate_qualifications.py` |
| **Moments de course** | Points cumulés à chaque instant clé : Qualif → Grille → Tour 1 → 10% → 50% → 90% → Arrivée | `src/scripts/generate_checkpoints.py` (données tour par tour depuis 1996 via Jolpica-F1) |
| **Sprint** | Championnat du monde Sprint (2021 – aujourd'hui) avec décompte des positions | `src/scripts/generate_sprint.py` |
| **2ème Pilote** | Championnat des écuries classées à la position de leur 2e pilote | `src/scripts/generate_deuxieme_pilote.py` |
| **ELO Pilotes** | Force ELO de chaque pilote (tous-vs-tous, échelle 600, hors DNF mécaniques) + courbes par âge et par nombre de courses | `src/scripts/generate_elo_pilotes.py`, `generate_elo_by_age.py`, `generate_elo_by_races.py` |
| **ELO Constructeurs** | Force ELO des écuries comparées aux n−2 concurrents extérieurs (hors DNF pilote) | `src/scripts/generate_elo_constructeurs.py` |
| **Champions** | Tableau récapitulatif de tous les champions par année | `src/scripts/generate_champions_table.py` |

## 🚀 Installation & Mise à jour des données

### Prérequis
- Python ≥ 3.10
- Git

### Installation
```bash
git clone --recurse-submodules https://github.com/cyrilletixier/FormulaOneAtlernativeRanking.git
cd FormulaOneAtlernativeRanking
pip install -r requirements.txt
```

### Régénérer l'ensemble des classements
```bash
bash src/scripts/updatedata.sh
```

### Qualité du code & Tests
```bash
# Lint
ruff check src/scripts

# Tests unitaires
pytest tests/
```

## Mise à jour automatique

Le workflow `.github/workflows/update-data.yml` tourne chaque lundi soir, met à jour le sous-module `f1db`, régénère les CSV qui ont changé (via empreintes SHA-256 `.hash`) et ouvre automatiquement une Pull Request.
