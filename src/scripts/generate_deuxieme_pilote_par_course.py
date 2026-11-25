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


def load_previous_hashes(output_hash_file: str) -> dict[str, Any]:
    if os.path.exists(output_hash_file):
        with open(output_hash_file, "r", encoding="utf-8") as f:
            return yaml.safe_load(f) or {}
    return {}


def collect_source_hashes(races_dir: str, circuits: list[str]) -> str | None:
    source_hashes = []
    for circuit in circuits:
        circuit_dir = f"{races_dir}/{circuit}"
        race_file = f"{circuit_dir}/race-results.yml"
        if os.path.exists(race_file):
            file_hash = get_file_hash(race_file)
            if file_hash:
                source_hashes.append(file_hash)
    return (
        hashlib.sha256("".join(source_hashes).encode()).hexdigest() if source_hashes else None
    )


def load_names(yaml_dir: str, entity: str) -> dict[str, str]:
    dir_path = f"{yaml_dir}/{entity}"
    id_to_name = {}
    for file in glob.glob(f"{dir_path}/*.yml"):
        entity_id = os.path.basename(file).replace(".yml", "")
        data = load_yaml(file)
        if data:
            id_to_name[entity_id] = data.get("name", entity_id)
    return id_to_name


def process_race_results(
    race_data: list[dict[str, Any]],
) -> dict[str, list[tuple[str, int]]]:
    team_drivers: dict[str, list[tuple[str, int]]] = defaultdict(list)
    for result in race_data:
        driver_id = result["driverId"]
        constructor_id = result["constructorId"]
        position = str(result["position"])
        if is_numeric_position(position):
            team_drivers[constructor_id].append((driver_id, int(position)))
    return team_drivers


def classify_teams(
    team_drivers: dict[str, list[tuple[str, int]]],
) -> tuple[dict[str, tuple[int, int]], dict[str, int]]:
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
    return teams_with_second_driver, teams_with_single_driver


def sort_teams(
    teams_with_second_driver: dict[str, tuple[int, int]],
    teams_with_single_driver: dict[str, int],
) -> list[tuple[str, tuple[int, int] | int]]:
    sorted_teams_with_second_driver = sorted(
        teams_with_second_driver.items(), key=lambda x: x[1][0]
    )
    sorted_teams_with_single_driver = sorted(
        teams_with_single_driver.items(), key=lambda x: x[1]
    )
    return sorted_teams_with_second_driver + sorted_teams_with_single_driver


def assign_points(
    sorted_teams: list[tuple[str, tuple[int, int] | int]],
    config: dict[str, Any],
) -> dict[str, int]:
    team_points = {}
    for rank, (constructor_id, _) in enumerate(sorted_teams, start=1):
        points = config["points_per_position"].get(str(rank), 0)
        team_points[constructor_id] = points
    return team_points


def write_csv(
    output_file: str,
    sorted_teams: list[tuple[str, tuple[int, int] | int]],
    team_points: dict[str, int],
    teams_with_second_driver: dict[str, tuple[int, int]],
    team_drivers: dict[str, list[tuple[str, int]]],
    constructor_id_to_name: dict[str, str],
    driver_id_to_name: dict[str, str],
) -> None:
    os.makedirs(os.path.dirname(output_file), exist_ok=True)
    with open(output_file, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(
            [
                "Équipe",
                "Rang",
                "Points",
                "Deuxième Pilote",
                "Position du Deuxième Pilote",
                "Premier Pilote",
                "Position du Premier Pilote",
            ]
        )
        for rank, (constructor_id, positions) in enumerate(sorted_teams, start=1):
            constructor_name = constructor_id_to_name.get(constructor_id, constructor_id)
            points = team_points[constructor_id]
            if constructor_id in teams_with_second_driver:
                second_driver_position = positions[0]
                first_driver_position = positions[1]
                drivers_sorted = sorted(team_drivers[constructor_id], key=lambda x: x[1])
                second_driver_id = drivers_sorted[1][0]
                first_driver_id = drivers_sorted[0][0]
                second_driver_name = driver_id_to_name.get(
                    second_driver_id, second_driver_id
                )
                first_driver_name = driver_id_to_name.get(first_driver_id, first_driver_id)
                writer.writerow(
                    [
                        constructor_name,
                        rank,
                        points,
                        second_driver_name,
                        second_driver_position,
                        first_driver_name,
                        first_driver_position,
                    ]
                )
            else:
                first_driver_position = positions
                driver_id = team_drivers[constructor_id][0][0]
                first_driver_name = driver_id_to_name.get(driver_id, driver_id)
                writer.writerow(
                    [
                        constructor_name,
                        rank,
                        points,
                        "",
                        "",
                        first_driver_name,
                        first_driver_position,
                    ]
                )


def save_hash(output_hash_file: str, source_hash: str | None) -> None:
    with open(output_hash_file, "w", encoding="utf-8") as f:
        yaml.safe_dump({"source_hash": source_hash}, f)


def generate_deuxieme_pilote_par_course(
    yaml_dir: str,
    year: str,
    config: dict[str, Any],
    output_dir: str,
) -> None:
    output_file = f"{output_dir}/{year}.csv"
    output_hash_file = f"{output_dir}/{year}.hash"
    races_dir = f"{yaml_dir}/seasons/{year}/races"
    if not os.path.exists(races_dir):
        print(f"Erreur : Le dossier {races_dir} n'existe pas.")
        return

    circuits = sorted(os.listdir(races_dir))
    source_hash = collect_source_hashes(races_dir, circuits)
    previous_hashes = load_previous_hashes(output_hash_file)

    if os.path.exists(output_file) and os.path.exists(output_hash_file):
        if previous_hashes.get("source_hash") == source_hash:
            return

    constructor_id_to_name = load_names(yaml_dir, "constructors")
    driver_id_to_name = load_names(yaml_dir, "drivers")

    for circuit in circuits:
        circuit_dir = f"{races_dir}/{circuit}"
        race_file = f"{circuit_dir}/race-results.yml"
        if not os.path.exists(race_file):
            print(f"Fichier non trouvé : {race_file}")
            continue
        try:
            race_data = load_yaml(race_file)
            if not race_data:
                print(f"Aucune donnée valide dans {race_file}")
                continue
            team_drivers = process_race_results(race_data)
            teams_with_second_driver, teams_with_single_driver = classify_teams(
                team_drivers
            )
            sorted_teams = sort_teams(teams_with_second_driver, teams_with_single_driver)
            team_points = assign_points(sorted_teams, config)
            write_csv(
                output_file,
                sorted_teams,
                team_points,
                teams_with_second_driver,
                team_drivers,
                constructor_id_to_name,
                driver_id_to_name,
            )
            save_hash(output_hash_file, source_hash)
        except Exception as e:
            print(f"Erreur lors du traitement de {race_file}: {e}")


if __name__ == "__main__":
    yaml_dir = "../../data/f1db/src/data"
    config_path = "./config/deuxieme_pilote_points.json"
    output_dir = "../../docs/data/deuxieme_pilote_par_course"

    with open(config_path, "r", encoding="utf-8") as f:
        config = yaml.safe_load(f)

    available_years = get_available_years(yaml_dir)
    print(f"Années disponibles : {available_years}")

    script_hash = get_file_hash(__file__)
    if not script_hash:
        print("Erreur : Impossible de calculer le hash du script.")
        raise SystemExit(1)

    for year in available_years:
        before = os.path.exists(f"{output_dir}/{year}.csv")
        generate_deuxieme_pilote_par_course(yaml_dir, year, config, output_dir)
        after = os.path.exists(f"{output_dir}/{year}.csv")
        if not before or (before and not os.path.exists(f"{output_dir}/{year}.hash")):
            print(f"Classements des deuxièmes pilotes par course générés pour {year}")
