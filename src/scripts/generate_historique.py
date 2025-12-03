import yaml
import csv
import os
import glob
from collections import defaultdict

def load_yaml(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        return yaml.safe_load(f)

def generate_historique_csv(yaml_dir, config_path, output_path):
    # Charger la configuration
    with open(config_path, 'r') as f:
        config = yaml.safe_load(f)

    # Charger les noms des pilotes depuis les fichiers individuels
    driver_id_to_name = {}
    drivers_dir = f"{yaml_dir}/drivers"
    for driver_file in glob.glob(f"{drivers_dir}/*.yml"):
        driver_data = load_yaml(driver_file)
        driver_id = os.path.basename(driver_file).replace('.yml', '')
        driver_id_to_name[driver_id] = driver_data.get('fullName', driver_id)

    # Dictionnaire pour stocker les points des pilotes
    driver_stats = defaultdict(lambda: {'total': 0, 'periods': defaultdict(float)})

    # Parcourir les fichiers YAML de driver-standings pour chaque année
    for year in config['periods']:
        yaml_file = f"{yaml_dir}/seasons/{year}/driver-standings.yml"
        if not os.path.exists(yaml_file):
            print(f"Fichier non trouvé : {yaml_file}")
            continue

        data = load_yaml(yaml_file)
        if not data:
            continue

        for standing in data:
            driver_id = standing['driverId']
            driver_name = driver_id_to_name.get(driver_id, driver_id)
            position = str(standing['position'])
            points = config['points_per_position'].get(position, 0)
            driver_stats[driver_name]['total'] += points
            driver_stats[driver_name]['periods'][year] += points

    # Trier les pilotes par points totaux
    sorted_drivers = sorted(
        driver_stats.items(),
        key=lambda x: x[1]['total'],
        reverse=True
    )

    # Écrire le CSV
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        header = ['Pilote', 'Rang', 'Points'] + config['periods']
        writer.writerow(header)

        for rank, (driver_name, stats) in enumerate(sorted_drivers, 1):
            row = [
                driver_name,
                rank,
                stats['total']
            ] + [stats['periods'].get(year, 0) for year in config['periods']]
            writer.writerow(row)

if __name__ == "__main__":
    yaml_dir = "../../data/f1db/src/data"
    config_path = "./config/historique_points.json"
    output_path = "../../docs/data/historique.csv"
    generate_historique_csv(yaml_dir, config_path, output_path)
    print(f"Classement historique généré : {output_path}")
