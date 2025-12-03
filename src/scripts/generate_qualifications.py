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

def generate_qualifications_csv(f1db_path, config_path, output_dir):
    config = load_config(config_path)
    data = load_f1db_data(f1db_path)
    drivers = {d['id']: d for d in data['drivers']}

    for season in data['seasons']:
        year = str(season['year'])
        races = [r for r in data['races'] if r['year'] == season['year']]

        # Calculer les points de qualification
        driver_points = defaultdict(float)
        for race in races:
            if not race.get('qualifyingResults'):
                continue

            for result in race['qualifyingResults']:
                driver_id = result['driverId']
                position = str(result['positionNumber'])
                points = config['points_per_position'].get(position, 0)
                driver_points[driver_id] += points

        # Trier et écrire le CSV
        sorted_drivers = sorted(
            driver_points.items(),
            key=lambda x: x[1],
            reverse=True
        )

        os.makedirs(f"{output_dir}/{year}", exist_ok=True)
        with open(f"{output_dir}/{year}/qualifications.csv", 'w', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)
            writer.writerow(['Pilote', 'Rang', 'Points'])
            for rank, (driver_id, points) in enumerate(sorted_drivers, 1):
                writer.writerow([
                    drivers[driver_id]['fullName'],
                    rank,
                    round(points, 2)
                ])

if __name__ == "__main__":
    f1db_path = "../../f1db/data/f1db.json"
    config_path = "./config/qualifications_points.json"
    output_dir = "../../docs/data"
    generate_qualifications_csv(f1db_path, config_path, output_dir)
    print(f"Classements qualifications générés dans {output_dir}")
