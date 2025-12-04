import yaml
import csv
import os
import glob
import hashlib
from collections import defaultdict

def load_yaml(file_path):
    if not os.path.exists(file_path):
        return None
    with open(file_path, 'r', encoding='utf-8') as f:
        return yaml.safe_load(f)

def get_file_hash(file_path):
    if not os.path.exists(file_path):
        return None
    with open(file_path, 'rb') as f:
        file_content = f.read()
        return hashlib.sha256(file_content).hexdigest()

def get_available_years(yaml_dir):
    seasons_dir = f"{yaml_dir}/seasons"
    if not os.path.exists(seasons_dir):
        print(f"Erreur : Le dossier {seasons_dir} n'existe pas.")
        return []

    return sorted([d for d in os.listdir(seasons_dir) if os.path.isdir(os.path.join(seasons_dir, d)) and d.isdigit()])

def generate_historique_csv(yaml_dir, config_path, output_path, script_hash):
    # Vérifier si le fichier de sortie existe déjà
    output_hash_file = f"{output_path}.hash"

    # Charger la configuration
    with open(config_path, 'r') as f:
        config = yaml.safe_load(f)

    # Obtenir les années disponibles
    available_years = get_available_years(yaml_dir)
    config['periods'] = available_years

    # Calculer le hash des fichiers sources
    source_hashes = []
    for year in available_years:
        yaml_file = f"{yaml_dir}/seasons/{year}/driver-standings.yml"
        if os.path.exists(yaml_file):
            file_hash = get_file_hash(yaml_file)
            if file_hash:
                source_hashes.append(file_hash)

    source_hash = hashlib.sha256(''.join(source_hashes).encode()).hexdigest() if source_hashes else None

    # Lire le hash précédent s'il existe
    previous_hashes = {}
    if os.path.exists(output_hash_file):
        with open(output_hash_file, 'r') as f:
            previous_hashes = yaml.safe_load(f) or {}

    # Vérifier si les données ou le script ont changé
    if os.path.exists(output_path) and os.path.exists(output_hash_file):
        if previous_hashes.get('source_hash') == source_hash and previous_hashes.get('script_hash') == script_hash:
            print(f"Aucun changement détecté, les données ne seront pas régénérées.")
            return

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
                driver_stats[driver_name]['periods'][year] = points  # Utiliser les points liés au classement
        except Exception as e:
            print(f"Erreur lors du traitement de {yaml_file}: {e}")

    # Vérifier les pilotes présents dans chaque année
    for year in available_years:
        yaml_file = f"{yaml_dir}/seasons/{year}/driver-standings.yml"
        if not os.path.exists(yaml_file):
            continue
        try:
            data = load_yaml(yaml_file)
            if not data:
                continue
            # Marquer les pilotes présents dans cette année
            for standing in data:
                driver_id = standing['driverId']
                driver_name = driver_id_to_name.get(driver_id, driver_id)
                if year not in driver_stats[driver_name]['periods']:
                    driver_stats[driver_name]['periods'][year] = 0  # 0 si présent mais sans points
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
                # Afficher 0 si le pilote est présent dans le classement de l'année mais n'a pas de points
                row.append(stats['periods'].get(year, ''))
            writer.writerow(row)

    # Sauvegarder les hashes
    with open(output_hash_file, 'w') as f:
        yaml.safe_dump({'source_hash': source_hash, 'script_hash': script_hash}, f)

if __name__ == "__main__":
    yaml_dir = "../../data/f1db/src/data"
    config_path = "./config/historique_points.json"
    output_path = "../../docs/data/historique.csv"
 
    # Vérifier si le script a changé
    script_hash = get_file_hash(__file__)
    if not script_hash:
        print(f"Erreur : Impossible de calculer le hash du script.")
        exit(1)

    generate_historique_csv(yaml_dir, config_path, output_path, script_hash)
    print(f"Classement historique généré : {output_path}")
