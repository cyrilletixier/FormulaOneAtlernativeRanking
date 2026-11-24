from __future__ import annotations

import argparse
import csv
import json
import os
import sys
import yaml
from collections import defaultdict
from typing import Dict, List, Optional

from elo.csv_out import ensure_dir, write_driver_csv
from elo.elo_math import compute_constructor_course_update
from elo.f1db_io import (
    compute_source_hash,
    get_available_years,
    get_file_hash,
    iter_races,
    load_constructor_names,
    load_race_data,
)
from elo.ranking import classify_dnf, dedupe_best_by_driver, rank_entries


def load_config(config_path: str) -> dict:
    with open(config_path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


def parse_years_arg(years_arg: Optional[str], yaml_dir: str) -> List[int]:
    available = [int(y) for y in get_available_years(yaml_dir)]
    if not years_arg:
        return available

    years_arg = years_arg.strip()
    if "," in years_arg:
        return sorted(int(p.strip()) for p in years_arg.split(",") if p.strip())

    if "-" in years_arg:
        a, b = years_arg.split("-", 1)
        start, end = int(a.strip()), int(b.strip())
        return [y for y in available if start <= y <= end]

    return [int(years_arg)]


def should_use_cache(hash_file: str, expected: dict, output_root: str) -> bool:
    if not os.path.exists(hash_file) or not os.path.exists(output_root):
        return False
    try:
        with open(hash_file, "r", encoding="utf-8") as f:
            prev = yaml.safe_load(f) or {}
    except Exception:
        return False
    return prev == expected


def save_cache(hash_file: str, value: dict) -> None:
    os.makedirs(os.path.dirname(hash_file), exist_ok=True)
    with open(hash_file, "w", encoding="utf-8") as f:
        yaml.safe_dump(value, f)


def resolve_from_script_dir(path: str) -> str:
    if os.path.isabs(path):
        return path
    script_dir = os.path.dirname(os.path.abspath(__file__))
    return os.path.normpath(os.path.join(script_dir, path))


def write_constructor_race_csv(
    output_file: str,
    *,
    meta: Dict[str, object],
    elo_rows: Dict[str, object],
    constructor_id_to_name: Dict[str, str],
) -> None:
    ensure_dir(os.path.dirname(output_file))
    fieldnames = [
        "year",
        "round",
        "grandPrixId",
        "constructorId",
        "constructorName",
        "carsCounted",
        "opponentsCount",
        "positions",
        "eloBefore",
        "eloAfter",
        "eloDelta",
    ]
    sorted_rows = sorted(
        elo_rows.values(),
        key=lambda r: (-r.elo_after, r.constructor_id),
    )
    with open(output_file, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for er in sorted_rows:
            cid = er.constructor_id
            writer.writerow(
                {
                    "year": meta["year"],
                    "round": meta["round"],
                    "grandPrixId": meta["grandPrixId"],
                    "constructorId": cid,
                    "constructorName": constructor_id_to_name.get(cid, cid),
                    "carsCounted": er.cars_counted,
                    "opponentsCount": er.opponents_count,
                    "positions": er.positions,
                    "eloBefore": round(er.elo_before, 2),
                    "eloAfter": round(er.elo_after, 2),
                    "eloDelta": round(er.elo_delta, 2),
                }
            )


def generate_all(
    *,
    yaml_dir: str,
    races,
    constructor_id_to_name: Dict[str, str],
    output_root: str,
    k: float,
    initial_elo: float,
    scale: float,
    exclude_driver_dnf: bool,
) -> None:
    ratings: Dict[str, float] = {}
    constructor_rows: Dict[str, List[dict]] = defaultdict(list)
    races_by_year: Dict[int, List[dict]] = defaultdict(list)
    peak_elo: Dict[str, float] = {}
    peak_year: Dict[str, int] = {}

    career_race_number = 0
    for meta in races:
        career_race_number += 1
        race_data = load_race_data(yaml_dir, meta)
        entries = dedupe_best_by_driver(race_data.entries)

        if exclude_driver_dnf:
            entries = [
                e
                for e in entries
                if classify_dnf(e.position_raw, e.reason_retired) != "driver_dnf"
            ]

        ranked = rank_entries(entries)
        for re in ranked:
            if re.entry.constructor_id:
                ratings.setdefault(re.entry.constructor_id, initial_elo)

        elo_rows, _ = compute_constructor_course_update(
            ranked,
            ratings,
            k=k,
            scale=scale,
            initial_elo=initial_elo,
        )

        race_filename = f"{meta.round:02d}-{meta.grand_prix_id or meta.race_dir_name}.csv"
        race_out = f"{output_root}/races/{meta.year}/{race_filename}"
        write_constructor_race_csv(
            race_out,
            meta={
                "year": meta.year,
                "round": meta.round,
                "grandPrixId": meta.grand_prix_id,
            },
            elo_rows=elo_rows,
            constructor_id_to_name=constructor_id_to_name,
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

        for cid, er in elo_rows.items():
            if cid not in peak_elo or er.elo_after > peak_elo[cid]:
                peak_elo[cid] = er.elo_after
                peak_year[cid] = meta.year

            constructor_rows[cid].append(
                {
                    "date": meta.date,
                    "year": meta.year,
                    "round": meta.round,
                    "grandPrixId": meta.grand_prix_id,
                    "careerRaceNumber": career_race_number,
                    "carsCounted": er.cars_counted,
                    "opponentsCount": er.opponents_count,
                    "positions": er.positions,
                    "eloBefore": round(er.elo_before, 2),
                    "eloAfter": round(er.elo_after, 2),
                    "eloDelta": round(er.elo_delta, 2),
                }
            )

    constructors_out_dir = f"{output_root}/constructors"
    os.makedirs(constructors_out_dir, exist_ok=True)
    for cid, rows in constructor_rows.items():
        write_driver_csv(f"{constructors_out_dir}/{cid}.csv", rows)

    constructors_meta = []
    for cid in sorted(constructor_rows.keys()):
        rows = constructor_rows[cid]
        constructors_meta.append(
            {
                "id": cid,
                "name": constructor_id_to_name.get(cid, cid),
                "races": len(rows),
                "peakElo": round(peak_elo.get(cid, initial_elo), 2),
                "peakYear": peak_year.get(cid),
                "lastElo": round(rows[-1]["eloAfter"], 2) if rows else initial_elo,
                "firstYear": rows[0]["year"] if rows else None,
                "lastYear": rows[-1]["year"] if rows else None,
            }
        )

    index_payload = {
        "k": k,
        "initialElo": initial_elo,
        "scale": scale,
        "excludeDriverDnf": exclude_driver_dnf,
        "totalRaces": career_race_number,
        "constructors": constructors_meta,
        "racesByYear": {
            str(year): races_by_year[year]
            for year in sorted(races_by_year.keys())
        },
    }

    os.makedirs(output_root, exist_ok=True)
    with open(f"{output_root}/index.json", "w", encoding="utf-8") as f:
        json.dump(index_payload, f, ensure_ascii=False, indent=2)


def main(argv: List[str]) -> int:
    parser = argparse.ArgumentParser(
        description="Calcule un ELO par constructeur (voitures comparées aux n-2 concurrents) à partir de f1db YAML."
    )
    parser.add_argument("--years", default=None)
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--yaml-dir", default="../../data/f1db/src/data")
    parser.add_argument("--config", default="./config/elo_constructeurs.json")
    parser.add_argument("--output", default="../../docs/data/elo_constructeurs")

    args = parser.parse_args(argv)

    try:
        yaml_dir = resolve_from_script_dir(args.yaml_dir)
        config = load_config(resolve_from_script_dir(args.config))
        output_root = resolve_from_script_dir(args.output)

        k = float(config.get("k", 50))
        initial_elo = float(config.get("initial_elo", 1000))
        scale = float(config.get("scale", 600))
        exclude_driver_dnf = bool(config.get("exclude_driver_dnf", True))

        years = parse_years_arg(args.years, yaml_dir)
        races = iter_races(yaml_dir, years)
        if not races:
            print("Aucune course trouvée.", file=sys.stderr)
            return 2

        script_hash = get_file_hash(__file__) or ""
        source_hash = compute_source_hash(yaml_dir, races)
        cache_value = {
            "source_hash": source_hash,
            "script_hash": script_hash,
            "k": k,
            "initial_elo": initial_elo,
            "scale": scale,
            "exclude_driver_dnf": exclude_driver_dnf,
            "years": years,
        }

        hash_file = f"{output_root}/elo_constructeurs.hash"
        if not args.force and should_use_cache(hash_file, cache_value, output_root):
            print("Aucun changement détecté, ELO constructeurs non régénéré (cache).")
            return 0

        constructor_id_to_name = load_constructor_names(yaml_dir)
        generate_all(
            yaml_dir=yaml_dir,
            races=races,
            constructor_id_to_name=constructor_id_to_name,
            output_root=output_root,
            k=k,
            initial_elo=initial_elo,
            scale=scale,
            exclude_driver_dnf=exclude_driver_dnf,
        )

        save_cache(hash_file, cache_value)
        print(f"ELO constructeurs généré: {output_root}")
        return 0
    except KeyboardInterrupt:
        print("Interrompu.", file=sys.stderr)
        return 130
    except Exception as e:
        print(f"Erreur: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
