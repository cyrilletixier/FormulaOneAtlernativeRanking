import json
import csv
import os
from collections import defaultdict

def load_config(config_path):
    with open(config_path, 'r') as f:
        return json.load(f)

def load_f1db_data(json_path):
    with open(json_path, 'r', encoding='utf-8') as f:
        return json.load(f)

def generate_deuxieme_pilote_csv(f1db_path, config_path, output_dir):
    config = load_config(config_path)
    data = load_f1db_data(f1db_path)
    drivers = {d['id']: d for d in data['drivers']}
    constructors = {c['id']: c for c in data['constructors']}

    for season in data['seasons']:
        year = str(season['year'])
        races = [r for r in data['races'] if r['year'] == season['year']]

        # Dictionnaire pour stocker les points des équipes
        team_points = defaultdict(float)
        team_second_drivers = defaultdict(list)  # Liste des 2èmes pilotes par équipe

        for race in races:
            if not race.get('raceResults'):
                continue

            # Regrouper les résultats par équipe
            race_results_by_team = defaultdict(list)
            for result in race['raceResults']:
                driver_id = result['driverId']
                constructor_id = result['constructorId']
                position = result['positionNumber']
                race_results_by_team[constructor_id].append((driver_id, position))

            # Pour chaque équipe, identifier le 2ème pilote (ou le 1er si seul pilote)
            for constructor_id, results in race_results_by_team.items():
                # Trier les pilotes de l'équipe par position
                results.sort(key=lambda x: x[1])  # (driver_id, position)

                # Prendre le 2ème pilote (index 1) s'il existe, sinon le 1er (index 0)
                if len(results) >= 2:
                    second_driver_id, second_position = results[1]
                    team_second_drivers[constructor_id].append(second_driver_id)
                    points = config['points_per_position'].get(str(second_position), 0)
                    team_points[constructor_id] += points
                elif len(results) == 1:
                    first_driver_id, first_position = results[0]
                    points = config['points_per_position'].get(str(first_position), 0)
                    team_points[constructor_id] += points

        # Trier les équipes par points
        sorted_teams = sorted(
            team_points.items(),
            key=lambda x: x[1],
            reverse=True
        )

        # Écrire le CSV
        os.makedirs(f"{output_dir}/{year}", exist_ok=True)
        with open(f"{output_dir}/{year}/deuxieme_pilote.csv", 'w', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)
            writer.writerow(['Équipe', 'Rang', 'Points', '2ème Pilote Principal'])

            for rank, (constructor_id, points) in enumerate(sorted_teams, 1):
                # Trouver le 2ème pilote principal (le plus fréquent)
                second_driver_id = max(set(team_second_drivers[constructor_id]), key=team_second_drivers[constructor_id].count) if team_second_drivers[constructor_id] else "N/A"
                second_driver_name = drivers.get(second_driver_id, {}).get('fullName', 'N/A')

                writer.writerow([
                    constructors[constructor_id]['name'],
                    rank,
                    round(points, 2),
                    second_driver_name
                ])

if __name__ == "__main__":
    f1db_path = "../../f1db/data/f1db.json"
    config_path = "./config/deuxieme_pilote_points.json"
    output_dir = "../../docs/data"
    generate_deuxieme_pilote_csv(f1db_path, config_path, output_dir)
    print(f"Classements 2ème pilote (par équipe) générés dans {output_dir}")
