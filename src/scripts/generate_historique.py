from __future__ import annotations

import csv
import glob
import hashlib
import os
import sys
from collections import defaultdict
from typing import Any

import yaml


def load_yaml(file_path: str) -> Any:
    if not os.path.exists(file_path):
        return None
    with open(file_path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def get_file_hash(file_path: str) -> str | None:
    if not os.path.exists(file_path):
        return None
    with open(file_path, "rb") as f:
        return hashlib.sha256(f.read()).hexdigest()


def get_available_years(yaml_dir: str) -> list[str]:
    seasons_dir = f"{yaml_dir}/seasons"
    if not os.path.exists(seasons_dir):
        print(f"Erreur : Le dossier {seasons_dir} n'existe pas.")
        return []

    return sorted(
        d
        for d in os.listdir(seasons_dir)
        if os.path.isdir(os.path.join(seasons_dir, d)) and d.isdigit()
    )


def generate_historique_csv(
    yaml_dir: str,
    config_path: str,
    output_path: str,
    script_hash: str,
) -> None:
    output_hash_file = f"{output_path}.hash"

    with open(config_path, "r", encoding="utf-8") as f:
        config = yaml.safe_load(f)

    available_years = get_available_years(yaml_dir)
    config["periods"] = available_years

    source_hashes = []
    for year in available_years:
        yaml_file = f"{yaml_dir}/seasons/{year}/driver-standings.yml"
        if os.path.exists(yaml_file):
            file_hash = get_file_hash(yaml_file)
            if file_hash:
                source_hashes.append(file_hash)

    source_hash = (
        hashlib.sha256("".join(source_hashes).encode()).hexdigest() if source_hashes else None
    )

    previous_hashes = {}
    if os.path.exists(output_hash_file):
        with open(output_hash_file, "r", encoding="utf-8") as f:
            previous_hashes = yaml.safe_load(f) or {}

    if os.path.exists(output_path) and os.path.exists(output_hash_file):
        if (
            previous_hashes.get("source_hash") == source_hash
            and previous_hashes.get("script_hash") == script_hash
        ):
            print("Aucun changement détecté, les données ne seront pas régénérées.")
            return

    driver_id_to_name: dict[str, str] = {}
    drivers_dir = f"{yaml_dir}/drivers"
    if not os.path.exists(drivers_dir):
        print(f"Erreur : Le dossier {drivers_dir} n'existe pas.")
        return

    for driver_file in glob.glob(f"{drivers_dir}/*.yml"):
        driver_id = os.path.basename(driver_file).replace(".yml", "")
        driver_data = load_yaml(driver_file)
        if driver_data:
            driver_id_to_name[driver_id] = driver_data.get("name", driver_id)

    driver_stats: dict[str, dict[str, Any]] = defaultdict(
        lambda: {"total": 0, "periods": {}}
    )

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
                driver_id = standing["driverId"]
                driver_name = driver_id_to_name.get(driver_id, driver_id)
                position = str(standing["position"])
                points = config["points_per_position"].get(position, 0)
                driver_stats[driver_name]["total"] += points
                driver_stats[driver_name]["periods"][year] = points
        except Exception as e:
            print(f"Erreur lors du traitement de {yaml_file}: {e}")

    for year in available_years:
        yaml_file = f"{yaml_dir}/seasons/{year}/driver-standings.yml"
        if not os.path.exists(yaml_file):
            continue
        try:
            data = load_yaml(yaml_file)
            if not data:
                continue
            for standing in data:
                driver_id = standing["driverId"]
                driver_name = driver_id_to_name.get(driver_id, driver_id)
                if year not in driver_stats[driver_name]["periods"]:
                    driver_stats[driver_name]["periods"][year] = 0
        except Exception as e:
            print(f"Erreur lors du traitement de {yaml_file}: {e}")

    sorted_drivers = sorted(
        driver_stats.items(),
        key=lambda x: x[1]["total"],
        reverse=True,
    )

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        header = ["Pilote", "Rang", "Points", *available_years]
        writer.writerow(header)
        for rank, (driver_name, stats) in enumerate(sorted_drivers, 1):
            row = [driver_name, rank, stats["total"]]
            for year in available_years:
                row.append(stats["periods"].get(year, ""))
            writer.writerow(row)

    with open(output_hash_file, "w", encoding="utf-8") as f:
        yaml.safe_dump({"source_hash": source_hash, "script_hash": script_hash}, f)


if __name__ == "__main__":
    yaml_dir = "../../data/f1db/src/data"
    config_path = "./config/historique_points.json"
    output_path = "../../docs/data/historique.csv"

    script_hash = get_file_hash(__file__)
    if not script_hash:
        print("Erreur : Impossible de calculer le hash du script.")
        sys.exit(1)

    generate_historique_csv(yaml_dir, config_path, output_path, script_hash)
    print(f"Classement historique généré : {output_path}")