from __future__ import annotations

import csv
import glob
import hashlib
import os
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
        d for d in os.listdir(seasons_dir)
        if os.path.isdir(os.path.join(seasons_dir, d)) and d.isdigit()
    )


def should_regenerate(
    output_path: str,
    output_hash_file: str,
    source_hash: str | None,
    script_hash: str,
) -> bool:
    if not os.path.exists(output_path) or not os.path.exists(output_hash_file):
        return True

    previous_hashes = {}
    with open(output_hash_file, "r", encoding="utf-8") as f:
        previous_hashes = yaml.safe_load(f) or {}

    return (
        previous_hashes.get("source_hash") != source_hash
        or previous_hashes.get("script_hash") != script_hash
    )


def load_driver_names(yaml_dir: str) -> dict[str, str]:
    driver_id_to_name = {}
    drivers_dir = f"{yaml_dir}/drivers"
    if not os.path.exists(drivers_dir):
        print(f"Erreur : Le dossier {drivers_dir} n'existe pas.")
        return {}

    for driver_file in glob.glob(f"{drivers_dir}/*.yml"):
        driver_id = os.path.basename(driver_file).replace(".yml", "")
        driver_data = load_yaml(driver_file)
        if driver_data:
            driver_id_to_name[driver_id] = driver_data.get("name", driver_id)
    return driver_id_to_name


def calculate_source_hash(yaml_dir: str, year: str) -> str | None:
    races_dir = f"{yaml_dir}/seasons/{year}/races"
    if not os.path.exists(races_dir):
        print(f"Erreur : Le dossier {races_dir} n'existe pas.")
        return None

    circuits = sorted(os.listdir(races_dir))
    source_hashes = []
    for circuit in circuits:
        circuit_dir = f"{races_dir}/{circuit}"
        qualifying_file = f"{circuit_dir}/qualifying-results.yml"
        sprint_qualifying_file = f"{circuit_dir}/sprint-qualifying-results.yml"

        for file_path in [qualifying_file, sprint_qualifying_file]:
            if os.path.exists(file_path):
                file_hash = get_file_hash(file_path)
                if file_hash:
                    source_hashes.append(file_hash)

    return (
        hashlib.sha256("".join(source_hashes).encode()).hexdigest() if source_hashes else None
    )


def is_numeric_position(position: Any) -> bool:
    try:
        int(position)
        return True
    except (ValueError, TypeError):
        return False


def process_qualifying_results(
    qualifying_data: list[dict[str, Any]] | None,
    config: dict[str, Any],
    event_id: str,
    driver_points: dict[str, dict[str, Any]],
) -> None:
    if not qualifying_data:
        return

    q3_results = [
        result
        for result in qualifying_data
        if result.get("q3") is not None and is_numeric_position(str(result["position"]))
    ]
    if not q3_results:
        q3_results = [
            result for result in qualifying_data if is_numeric_position(str(result["position"]))
        ]

    q3_results_sorted = sorted(q3_results, key=lambda x: int(x["position"]))

    for result in q3_results_sorted:
        driver_id = result["driverId"]
        position = str(result["position"])
        points = config["points_per_position"].get(position, 0)
        driver_points[driver_id]["total"] += points
        driver_points[driver_id]["events"][event_id] = points


def generate_qualifications_csv(
    yaml_dir: str,
    year: str,
    config_path: str,
    output_path: str,
    script_hash: str,
) -> str | None:
    output_hash_file = f"{output_path}.hash"

    with open(config_path, "r", encoding="utf-8") as f:
        config = yaml.safe_load(f)

    source_hash = calculate_source_hash(yaml_dir, year)
    if source_hash is None:
        return None

    if not should_regenerate(output_path, output_hash_file, source_hash, script_hash):
        return "cache"

    driver_id_to_name = load_driver_names(yaml_dir)

    driver_points: dict[str, dict[str, Any]] = defaultdict(
        lambda: {"total": 0, "events": defaultdict(int)}
    )
    event_columns: set[str] = set()

    races_dir = f"{yaml_dir}/seasons/{year}/races"
    circuits = sorted(os.listdir(races_dir))

    for circuit in circuits:
        circuit_dir = f"{races_dir}/{circuit}"
        circuit_name = circuit.split("-", 1)[1]
        circuit_prefix = circuit_name[:3].upper()

        qualifying_file = f"{circuit_dir}/qualifying-results.yml"
        if os.path.exists(qualifying_file):
            qualifying_data = load_yaml(qualifying_file)
            event_id = f"{circuit_prefix}R"
            event_columns.add(event_id)
            process_qualifying_results(qualifying_data, config, event_id, driver_points)

        sprint_qualifying_file = f"{circuit_dir}/sprint-qualifying-results.yml"
        if os.path.exists(sprint_qualifying_file):
            sprint_qualifying_data = load_yaml(sprint_qualifying_file)
            event_id = f"{circuit_prefix}S"
            event_columns.add(event_id)
            process_qualifying_results(
                sprint_qualifying_data, config, event_id, driver_points
            )

    sorted_drivers = sorted(
        driver_points.items(),
        key=lambda x: x[1]["total"],
        reverse=True,
    )

    sorted_event_columns = sorted(event_columns)

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        header = ["Pilote", "Rang", "Points", *sorted_event_columns]
        writer.writerow(header)
        for rank, (driver_id, stats) in enumerate(sorted_drivers, 1):
            driver_name = driver_id_to_name.get(driver_id, driver_id)
            row = [driver_name, rank, stats["total"]]
            for event in sorted_event_columns:
                row.append(stats["events"].get(event, ""))
            writer.writerow(row)

    with open(output_hash_file, "w", encoding="utf-8") as f:
        yaml.safe_dump({"source_hash": source_hash, "script_hash": script_hash}, f)

    return "generated"


if __name__ == "__main__":
    yaml_dir = "../../data/f1db/src/data"
    config_path = "./config/qualifications_points.json"

    available_years = get_available_years(yaml_dir)
    print(f"Années disponibles : {available_years}")

    script_hash = get_file_hash(__file__)
    if not script_hash:
        print("Erreur : Impossible de calculer le hash du script.")
        raise SystemExit(1)

    cache_count = 0
    generated_count = 0
    for year in available_years:
        output_path = f"../../docs/data/{year}/qualifications.csv"
        result = generate_qualifications_csv(
            yaml_dir, year, config_path, output_path, script_hash
            )
        if result == "cache":
            cache_count += 1
        else:
            generated_count += 1
            print(f"Classement des qualifications généré pour {year} : {output_path}")
    print(
        f"Résumé : {cache_count} années ont utilisé le cache, {generated_count} années régénérées."
    )
