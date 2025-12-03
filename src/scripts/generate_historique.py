import yaml
import csv
import os
import glob
from collections import defaultdict

def load_yaml(file_path):
    if not os.path.exists(file_path):
        return None
    with open(file_path, 'r', encoding='utf-8') as f:
        return yaml.safe_load(f)

def get_available_years(yaml_dir):
    seasons_dir = f"{yaml_dir}/seasons"
    if not os.path.exists(seasons_dir):
        print(f"Erreur : Le dossier {seasons_dir} n'existe pas.")
        return []

    return sorted([d for d in os.listdir(seasons_dir) if os.path.isdir(os.path.join(seasons_dir, d)) and d.isdigit()])

def generate_historique_csv(yaml_dir, config_path, output_path):
    # Charger la configuration
    with open(config_path, 'r') as f:
        config = yaml.safe_load(f)

    # Obtenir les années disponibles
    available_years = get_available_years(yaml_dir)
    config['periods'] = available_years

    # Charger les noms des pilotes depuis les fichiers individuels
    driver_id_to_name = {}
    drivers_dir = f"{yaml_dir}/drivers"
    if not os.path.exists(drivers_dir):
        print(f"Erreur : Le dossier {drivers_dir} n'existe pas.")
        return

    for driver_file in glob.glob(f"{drivers_dir}/*.yml"):
        driver_id = os.path.basename(driver_file).replace('.yml', '')
        driver_data = load_yaml(driver_file)
        if driver_data:
            driver_id_to_name[driver_id] = driver_data.get('name', driver_id)

    # Dictionnaire pour stocker les points des pilotes
    driver_stats = defaultdict(lambda: {'total': 0, 'periods': {}})

    # Parcourir les fichiers YAML de driver-standings pour chaque année
    for year in available_years:
        yaml_file = f"{yaml_dir}/seasons/{year}/driver-standings.yml"
        if not os.path.exists(yaml_file):
            print(f"Fichier non trouvé : {yaml_file}")
            continue

        try:
            data = load_yaml(yaml_file)
            if not data:
                print(f"Aucune donnée valide dans {yaml_file}")
                continue

            for standing in data:
                driver_id = standing['driverId']
                driver_name = driver_id_to_name.get(driver_id, driver_id)
                position = str(standing['position'])
                points = config['points_per_position'].get(position, 0)
                driver_stats[driver_name]['total'] += points
                driver_stats[driver_name]['periods'][year] = standing.get('points', points)
        except Exception as e:
            print(f"Erreur lors du traitement de {yaml_file}: {e}")

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
        header = ['Pilote', 'Rang', 'Points'] + available_years
        writer.writerow(header)

        for rank, (driver_name, stats) in enumerate(sorted_drivers, 1):
            row = [driver_name, rank, stats['total']]
            for year in available_years:
                row.append(stats['periods'].get(year, ''))
            writer.writerow(row)

if __name__ == "__main__":
    yaml_dir = "../../data/f1db/src/data"  # Chemin mis à jour
    config_path = "./config/historique_points.json"
    output_path = "../../docs/data/historique.csv"

    generate_historique_csv(yaml_dir, config_path, output_path)
    print(f"Classement historique généré : {output_path}")
