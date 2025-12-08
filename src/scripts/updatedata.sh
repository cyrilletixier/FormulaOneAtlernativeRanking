#!/bin/bash

# Mettre à jour les données F1DB
git submodule update --remote

# Générer les classements
cd src/scripts
echo "Génération des classements..."
echo "+-------------------------------+"
echo "|   Génération Historique       |"
echo "+-------------------------------+"
python3 generate_historique.py
echo "+-------------------------------+"
echo "|   Génération Qualifications   |"
echo "+-------------------------------+"
python3 generate_qualifications.py
echo "+-----------------------------------------+"
echo "| Génération Deuxième Pilote Par Course   |"
echo "+-----------------------------------------+"
python3 generate_deuxieme_pilote_par_course.py
echo "+-------------------------------+"
echo "|   Génération Deuxième Pilote  |"
echo "+-------------------------------+"
python3 generate_deuxieme_pilote.py

echo "Tous les classements ont été mis à jour."
