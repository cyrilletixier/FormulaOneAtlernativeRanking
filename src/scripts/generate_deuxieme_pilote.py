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


def is_numeric_position(position: Any) -> bool:
    try:
        int(position)
        return True
    except (ValueError, TypeError):
        return False


def generate_deuxieme_pilote_annuel(
    yaml_dir: str,
    year: str,
    config_path: str,
    output_dir: str,
    script_hash: str,
) -> str | None:
    with open(config_path, "r", encoding="utf-8") as f:
        config = yaml.safe_load(f)

    output_file = f"{output_dir}/{year}/deuxieme_pilote.csv"
    output_hash_file = f"{output_dir}/{year}/deuxieme_pilote.hash"

    races_dir = f"{yaml_dir}/seasons/{year}/races"
    if not os.path.exists(races_dir):
        print(f"Erreur : Le dossier {races_dir} n'existe pas.")
        return None

    circuits = sorted(os.listdir(races_dir))
    source_hashes = []
    for circuit in circuits:
        circuit_dir = f"{races_dir}/{circuit}"
        race_file = f"{circuit_dir}/race-results.yml"
        if os.path.exists(race_file):
            file_hash = get_file_hash(race_file)
            if file_hash:
                source_hashes.append(file_hash)

    source_hash = (
        hashlib.sha256("".join(source_hashes).encode()).hexdigest() if source_hashes else None
    )

    previous_hashes = {}
    if os.path.exists(output_hash_file):
        with open(output_hash_file, "r", encoding="utf-8") as f:
            previous_hashes = yaml.safe_load(f) or {}

    if os.path.exists(output_file) and os.path.exists(output_hash_file):
        if (
            previous_hashes.get("source_hash") == source_hash
            and previous_hashes.get("script_hash") == script_hash
        ):
            return "cache"

    team_points: dict[str, dict[str, Any]] = defaultdict(
        lambda: {"total": 0, "events": defaultdict(int)}
    )
    event_columns = []

    for circuit in circuits:
        circuit_dir = f"{races_dir}/{circuit}"
        circuit_prefix = circuit.split("-", 1)[1][:3].upper()
        if circuit_prefix not in event_columns:
            event_columns.append(circuit_prefix)

        race_file = f"{circuit_dir}/race-results.yml"
        if not os.path.exists(race_file):
            print(f"Fichier non trouvé : {race_file}")
            continue

        try:
            race_data = load_yaml(race_file)
            if not race_data:
                print(f"Aucune donnée valide dans {race_file}")
                continue

            team_drivers: dict[str, list[tuple[str, int, Any]]] = defaultdict(list)

            for result in race_data:
                driver_id = result["driverId"]
                constructor_id = result["constructorId"]
                position = str(result["position"])
                points = result.get("points", 0)

                if is_numeric_position(position):
                    team_drivers[constructor_id].append((driver_id, int(position), points))

            teams_with_second_driver = {}
            teams_with_single_driver = {}

            for constructor_id, drivers in team_drivers.items():
                if len(drivers) >= 2:
                    drivers_sorted = sorted(drivers, key=lambda x: x[1])
                    second_driver_position = drivers_sorted[1][1]
                    teams_with_second_driver[constructor_id] = (
                        second_driver_position,
                        drivers_sorted[0][1],
                    )
                elif len(drivers) == 1:
                    first_driver_position = drivers[0][1]
                    teams_with_single_driver[constructor_id] = first_driver_position

            sorted_teams_with_second_driver = sorted(
                teams_with_second_driver.items(), key=lambda x: x[1][0]
            )
            sorted_teams_with_single_driver = sorted(
                teams_with_single_driver.items(), key=lambda x: x[1]
            )

            sorted_teams = (
                sorted_teams_with_second_driver + sorted_teams_with_single_driver
            )

            for rank, (constructor_id, _) in enumerate(sorted_teams, start=1):
                points = config["points_per_position"].get(str(rank), 0)
                team_points[constructor_id]["total"] += points
                team_points[constructor_id]["events"][circuit_prefix] = points

            if circuit_prefix not in event_columns:
                event_columns.append(circuit_prefix)

        except Exception as e:
            print(f"Erreur lors du traitement de {race_file}: {e}")

    constructors_dir = f"{yaml_dir}/constructors"
    constructor_id_to_name = {}
    for constructor_file in glob.glob(f"{constructors_dir}/*.yml"):
        constructor_id = os.path.basename(constructor_file).replace(".yml", "")
        constructor_data = load_yaml(constructor_file)
        if constructor_data:
            constructor_id_to_name[constructor_id] = constructor_data.get(
                "name", constructor_id
            )

    sorted_teams = sorted(
        team_points.items(),
        key=lambda x: x[1]["total"],
        reverse=True,
    )

    sorted_event_columns = event_columns

    os.makedirs(os.path.dirname(output_file), exist_ok=True)

    with open(output_file, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        header = ["Équipe", "Rang", "Points", *sorted_event_columns]
        writer.writerow(header)

        for rank, (constructor_id, stats) in enumerate(sorted_teams, 1):
            constructor_name = constructor_id_to_name.get(constructor_id, constructor_id)
            row = [constructor_name, rank, stats["total"]]
            for event in sorted_event_columns:
                row.append(stats["events"].get(event, ""))
            writer.writerow(row)

    with open(output_hash_file, "w", encoding="utf-8") as f:
        yaml.safe_dump({"source_hash": source_hash, "script_hash": script_hash}, f)

    return "generated"


if __name__ == "__main__":
    yaml_dir = "../../data/f1db/src/data"
    config_path = "./config/deuxieme_pilote_points.json"
    output_dir = "../../docs/data"

    available_years = get_available_years(yaml_dir)
    print(f"Années disponibles : {available_years}")

    script_hash = get_file_hash(__file__)
    if not script_hash:
        print("Erreur : Impossible de calculer le hash du script.")
        raise SystemExit(1)

    cache_count = 0
    generated_count = 0
    for year in available_years:
        result = generate_deuxieme_pilote_annuel(
            yaml_dir, year, config_path, output_dir, script_hash
        )
        if result == "cache":
            cache_count += 1
        else:
            generated_count += 1
            print(f"Classement annuel des deuxièmes pilotes généré pour {year}")
    print(
        f"Résumé : {cache_count} années ont utilisé le cache, {generated_count} années régénérées."
    )
