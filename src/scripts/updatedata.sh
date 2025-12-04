#!/bin/bash

# Mettre à jour les données F1DB
git submodule update --remote

# Générer les classements
cd src/scripts
python3 generate_historique.py
#python3 generate_qualifications.py
python3 generate_deuxieme_pilote_par_course.py
python3 generate_deuxieme_pilote.py

echo "Tous les classements ont été mis à jour."
