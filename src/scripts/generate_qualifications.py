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

def generate_qualifications_csv(yaml_dir, year, config_path, output_path, script_hash):
    # Vérifier si le fichier de sortie existe déjà
    output_hash_file = f"{output_path}.hash"

    # Charger la configuration
    with open(config_path, 'r') as f:
        config = yaml.safe_load(f)

    # Vérifier si les données sources ont changé
    races_dir = f"{yaml_dir}/seasons/{year}/races"
    if not os.path.exists(races_dir):
        print(f"Erreur : Le dossier {races_dir} n'existe pas.")
        return

    circuits = sorted(os.listdir(races_dir))
    source_hashes = []
    for circuit in circuits:
        circuit_dir = f"{races_dir}/{circuit}"
        qualifying_file = f"{circuit_dir}/qualifying-results.yml"
        sprint_qualifying_file = f"{circuit_dir}/sprint-qualifying-results.yml"

        if os.path.exists(qualifying_file):
            file_hash = get_file_hash(qualifying_file)
            if file_hash:
                source_hashes.append(file_hash)

        if os.path.exists(sprint_qualifying_file):
            file_hash = get_file_hash(sprint_qualifying_file)
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
            print(f"Aucun changement détecté pour {year}, les données ne seront pas régénérées.")
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
    driver_points = defaultdict(lambda: {'total': 0, 'events': defaultdict(int)})
    event_columns = set()

    # Parcourir les circuits de l'année
    for circuit in circuits:
        circuit_dir = f"{races_dir}/{circuit}"
        circuit_name = circuit.split('-', 1)[1]  # Extraire le nom du circuit
        circuit_prefix = circuit_name[:3].upper()

        # Charger les résultats de qualification
        qualifying_file = f"{circuit_dir}/qualifying-results.yml"
        sprint_qualifying_file = f"{circuit_dir}/sprint-qualifying-results.yml"

        # Traiter les qualifications normales
        if os.path.exists(qualifying_file):
            qualifying_data = load_yaml(qualifying_file)
            event_id = f"{circuit_prefix}R"
            event_columns.add(event_id)
            if qualifying_data:
                # Filtrer uniquement les résultats de Q3
                q3_results = [result for result in qualifying_data if result.get('q3', '')]
                if not q3_results:
                    q3_results = qualifying_data  # Si pas de Q3, prendre tous les résultats

                # Réinitialiser les points pour cette session
                session_points = defaultdict(int)
                for result in q3_results:
                    driver_id = result['driverId']
                    position = str(result['position'])
                    points = config['points_per_position'].get(position, 0)
                    session_points[driver_id] = points  # Remplacer les points, ne pas additionner

                for driver_id, points in session_points.items():
                    driver_points[driver_id]['total'] += points
                    driver_points[driver_id]['events'][event_id] = points  # Remplacer les points pour cet événement

        # Traiter les sprint qualifications
        if os.path.exists(sprint_qualifying_file):
            sprint_qualifying_data = load_yaml(sprint_qualifying_file)
            event_id = f"{circuit_prefix}S"
            event_columns.add(event_id)
            if sprint_qualifying_data:
                # Réinitialiser les points pour cette session
                session_points = defaultdict(int)
                for result in sprint_qualifying_data:
                    driver_id = result['driverId']
                    position = str(result['position'])
                    points = config['points_per_position'].get(position, 0)
                    session_points[driver_id] = points  # Remplacer les points, ne pas additionner

                for driver_id, points in session_points.items():
                    driver_points[driver_id]['total'] += points
                    driver_points[driver_id]['events'][event_id] = points  # Remplacer les points pour cet événement

    # Trier les pilotes par points
    sorted_drivers = sorted(
        driver_points.items(),
        key=lambda x: x[1]['total'],
        reverse=True
    )

    # Trier les colonnes des événements
    sorted_event_columns = sorted(event_columns)

    # Écrire le CSV
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        header = ['Pilote', 'Rang', 'Points'] + sorted_event_columns
        writer.writerow(header)
        for rank, (driver_id, stats) in enumerate(sorted_drivers, 1):
            driver_name = driver_id_to_name.get(driver_id, driver_id)
            row = [driver_name, rank, stats['total']]
            for event in sorted_event_columns:
                row.append(stats['events'].get(event, ''))
            writer.writerow(row)

    # Sauvegarder les hashes
    with open(output_hash_file, 'w') as f:
        yaml.safe_dump({'source_hash': source_hash, 'script_hash': script_hash}, f)

if __name__ == "__main__":
    yaml_dir = "../../data/f1db/src/data"  # Chemin mis à jour
    config_path = "./config/qualifications_points.json"

    # Obtenir toutes les années disponibles
    available_years = get_available_years(yaml_dir)
    print(f"Années disponibles : {available_years}")

    # Vérifier si le script a changé
    script_hash = get_file_hash(__file__)
    if not script_hash:
        print(f"Erreur : Impossible de calculer le hash du script.")
        exit(1)

    for year in available_years:
        output_path = f"../../docs/data/{year}/qualifications.csv"
        generate_qualifications_csv(yaml_dir, year, config_path, output_path, script_hash)
        print(f"Classement des qualifications généré pour {year} : {output_path}")
