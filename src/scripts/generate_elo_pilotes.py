from __future__ import annotations

import argparse
import json
import os
import sys
from collections import defaultdict
from typing import Any

import yaml

from elo.csv_out import write_driver_csv, write_race_csv
from elo.elo_math import compute_course_update
from elo.f1db_io import (
    RaceMeta,
    compute_source_hash,
    get_available_years,
    get_file_hash,
    iter_races,
    load_constructor_names,
    load_driver_names,
    load_race_data,
)
from elo.ranking import (
    classify_dnf,
    dedupe_best_by_driver,
    rank_entries,
)


def load_config(config_path: str) -> dict[str, Any]:
    with open(config_path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


def parse_years_arg(years_arg: str | None, yaml_dir: str) -> list[int]:
    available = [int(y) for y in get_available_years(yaml_dir)]
    if not years_arg:
        return available

    years_arg = years_arg.strip()
    if "," in years_arg:
        out = []
        for part in years_arg.split(","):
            part = part.strip()
            if not part:
                continue
            out.append(int(part))
        return sorted(out)

    if "-" in years_arg:
        a, b = years_arg.split("-", 1)
        start = int(a.strip())
        end = int(b.strip())
        return [y for y in available if start <= y <= end]

    return [int(years_arg)]


def should_use_cache(hash_file: str, expected: dict[str, Any], output_root: str) -> bool:
    if not os.path.exists(hash_file):
        return False
    if not os.path.exists(output_root):
        return False

    try:
        with open(hash_file, "r", encoding="utf-8") as f:
            prev = yaml.safe_load(f) or {}
    except Exception:
        return False

    return prev == expected


def save_cache(hash_file: str, value: dict[str, Any]) -> None:
    os.makedirs(os.path.dirname(hash_file), exist_ok=True)
    with open(hash_file, "w", encoding="utf-8") as f:
        yaml.safe_dump(value, f)


def resolve_from_script_dir(path: str) -> str:
    if os.path.isabs(path):
        return path
    script_dir = os.path.dirname(os.path.abspath(__file__))
    return os.path.normpath(os.path.join(script_dir, path))


def build_cache_value(
    *,
    source_hash: str,
    script_hash: str,
    k: float,
    initial_elo: float,
    scale: float,
    exclude_mechanical_dnf: bool,
    years: list[int],
) -> dict[str, Any]:
    return {
        "source_hash": source_hash,
        "script_hash": script_hash,
        "k": k,
        "initial_elo": initial_elo,
        "scale": scale,
        "exclude_mechanical_dnf": exclude_mechanical_dnf,
        "years": years,
    }


def process_one_race(
    *,
    yaml_dir: str,
    meta: RaceMeta,
    career_race_number: int,
    ratings: dict[str, float],
    driver_rows: dict[str, list[dict[str, Any]]],
    races_by_year: dict[int, list[dict[str, Any]]],
    driver_id_to_name: dict[str, str],
    constructor_id_to_name: dict[str, str],
    output_root: str,
    k: float,
    initial_elo: float,
    scale: float,
    exclude_mechanical_dnf: bool,
) -> None:
    race_data = load_race_data(yaml_dir, meta)
    entries = dedupe_best_by_driver(race_data.entries)

    if exclude_mechanical_dnf:
        entries = [
            e
            for e in entries
            if classify_dnf(e.position_raw, e.reason_retired) != "mechanical_dnf"
        ]

    ranked = rank_entries(entries)

    for re_entry in ranked:
        ratings.setdefault(re_entry.entry.driver_id, initial_elo)

    elo_rows, _ = compute_course_update(
        ranked,
        ratings,
        k=k,
        scale=scale,
        initial_elo=initial_elo,
    )

    race_filename = f"{meta.round:02d}-{meta.grand_prix_id or meta.race_dir_name}.csv"
    race_out = (
        f"{output_root}/races/{meta.year}/{meta.round:02d}-"
        f"{meta.grand_prix_id or meta.race_dir_name}.csv"
    )
    write_race_csv(
        race_out,
        meta={
            "year": meta.year,
            "round": meta.round,
            "date": meta.date,
            "grandPrixId": meta.grand_prix_id,
            "officialName": meta.official_name,
            "careerRaceNumber": career_race_number,
        },
        ranked_entries=ranked,
        driver_id_to_name=driver_id_to_name,
        elo_rows=elo_rows,
        k_used=k,
    )

    races_by_year[meta.year].append(
        {
            "year": meta.year,
            "round": meta.round,
            "date": meta.date,
            "grandPrixId": meta.grand_prix_id,
            "officialName": meta.official_name,
            "file": race_filename,
            "careerRaceNumber": career_race_number,
        }
    )

    n = len(ranked)
    for re_entry in ranked:
        d = re_entry.entry.driver_id
        er = elo_rows.get(d)
        if er is None:
            continue
        constructor_id = re_entry.entry.constructor_id or ""
        driver_rows[d].append(
            {
                "date": meta.date,
                "year": meta.year,
                "round": meta.round,
                "grandPrixId": meta.grand_prix_id,
                "careerRaceNumber": career_race_number,
                "constructorId": constructor_id,
                "constructorName": constructor_id_to_name.get(
                    constructor_id, constructor_id
                )
                if constructor_id
                else "",
                "positionRaw": re_entry.entry.position_raw,
                "laps": "" if re_entry.entry.laps is None else re_entry.entry.laps,
                "nParticipants": n,
                "eloBefore": round(er.elo_before, 6),
                "eloAfter": round(er.elo_after, 6),
                "eloDelta": round(er.elo_delta, 6),
                "actualScore": round(er.actual_score, 6),
                "expectedScore": round(er.expected_score, 6),
                "kUsed": k,
            }
        )


def generate_all(
    *,
    yaml_dir: str,
    races: list[RaceMeta],
    driver_id_to_name: dict[str, str],
    constructor_id_to_name: dict[str, str],
    output_root: str,
    k: float,
    initial_elo: float,
    scale: float,
    exclude_mechanical_dnf: bool,
) -> None:
    ratings: dict[str, float] = {}
    driver_rows: dict[str, list[dict[str, Any]]] = defaultdict(list)
    races_by_year: dict[int, list[dict[str, Any]]] = defaultdict(list)

    career_race_number = 0
    for meta in races:
        career_race_number += 1
        process_one_race(
            yaml_dir=yaml_dir,
            meta=meta,
            career_race_number=career_race_number,
            ratings=ratings,
            driver_rows=driver_rows,
            races_by_year=races_by_year,
            driver_id_to_name=driver_id_to_name,
            constructor_id_to_name=constructor_id_to_name,
            output_root=output_root,
            k=k,
            initial_elo=initial_elo,
            scale=scale,
            exclude_mechanical_dnf=exclude_mechanical_dnf,
        )

    drivers_out_dir = f"{output_root}/drivers"
    os.makedirs(drivers_out_dir, exist_ok=True)
    for driver_id, rows in driver_rows.items():
        out_file = f"{drivers_out_dir}/{driver_id}.csv"
        write_driver_csv(out_file, rows)

    index_payload = {
        "k": k,
        "initialElo": initial_elo,
        "scale": scale,
        "excludeMechanicalDnf": exclude_mechanical_dnf,
        "totalRaces": career_race_number,
        "drivers": [
            {
                "id": driver_id,
                "name": driver_id_to_name.get(driver_id, driver_id),
            }
            for driver_id in sorted(driver_rows.keys())
        ],
        "racesByYear": {
            str(year): races_by_year[year] for year in sorted(races_by_year.keys())
        },
    }

    os.makedirs(output_root, exist_ok=True)
    with open(f"{output_root}/index.json", "w", encoding="utf-8") as f:
        json.dump(index_payload, f, ensure_ascii=False, indent=2)


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(
        description="Calcule un ELO par pilote (tous-vs-tous par course) à partir de f1db YAML."
    )
    parser.add_argument(
        "--years",
        help="Années à traiter: ex '2023' ou '1950-2026' ou '2023,2024'. Par défaut: toutes.",
        default=None,
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Ignore le cache et régénère tous les fichiers.",
    )
    parser.add_argument(
        "--yaml-dir",
        default="../../data/f1db/src/data",
        help="Chemin vers f1db YAML (défaut: ../../data/f1db/src/data).",
    )
    parser.add_argument(
        "--config",
        default="./config/elo_pilotes.json",
        help="Chemin vers la config (défaut: ./config/elo_pilotes.json).",
    )
    parser.add_argument(
        "--output",
        default="../../docs/data/elo",
        help="Dossier de sortie (défaut: ../../docs/data/elo).",
    )

    args = parser.parse_args(argv)

    try:
        yaml_dir = resolve_from_script_dir(args.yaml_dir)
        config = load_config(resolve_from_script_dir(args.config))
        output_root = resolve_from_script_dir(args.output)

        k = float(config.get("k", 50))
        initial_elo = float(config.get("initial_elo", 1000))
        scale = float(config.get("scale", 600))
        exclude_mechanical_dnf = bool(config.get("exclude_mechanical_dnf", True))

        years = parse_years_arg(args.years, yaml_dir)
        races = iter_races(yaml_dir, years)
        if not races:
            print(
                "Aucune course trouvée (vérifie --yaml-dir/--years).", file=sys.stderr
            )
            return 2

        script_hash = get_file_hash(__file__) or ""
        source_hash = compute_source_hash(yaml_dir, races)
        cache_value = build_cache_value(
            source_hash=source_hash,
            script_hash=script_hash,
            k=k,
            initial_elo=initial_elo,
            scale=scale,
            exclude_mechanical_dnf=exclude_mechanical_dnf,
            years=years,
        )

        hash_file = f"{output_root}/elo_pilotes.hash"
        if not args.force and should_use_cache(hash_file, cache_value, output_root):
            print("Aucun changement détecté, ELO non régénéré (cache).")
            return 0

        driver_id_to_name = load_driver_names(yaml_dir)
        constructor_id_to_name = load_constructor_names(yaml_dir)
        generate_all(
            yaml_dir=yaml_dir,
            races=races,
            driver_id_to_name=driver_id_to_name,
            constructor_id_to_name=constructor_id_to_name,
            output_root=output_root,
            k=k,
            initial_elo=initial_elo,
            scale=scale,
            exclude_mechanical_dnf=exclude_mechanical_dnf,
        )

        save_cache(hash_file, cache_value)
        print(f"ELO généré: {output_root}")
        return 0
    except KeyboardInterrupt:
        print("Interrompu.", file=sys.stderr)
        return 130
    except Exception as e:
        print(f"Erreur: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))