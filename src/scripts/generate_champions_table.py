from __future__ import annotations

import argparse
import csv
import glob
import os
from dataclasses import dataclass
from typing import Dict, Iterable, List, Optional, Tuple

import yaml


def parse_year_dirs(docs_data_dir: str) -> List[int]:
    years: List[int] = []
    for path in glob.glob(os.path.join(docs_data_dir, "[0-9][0-9][0-9][0-9]")):
        base = os.path.basename(path)
        try:
            years.append(int(base))
        except Exception:
            continue
    return sorted(set(years))


def load_yaml(path: str):
    with open(path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def load_id_name_map(dir_path: str) -> Dict[str, str]:
    out: Dict[str, str] = {}
    for path in glob.glob(os.path.join(dir_path, "*.yml")):
        try:
            data = load_yaml(path) or {}
        except Exception:
            continue
        item_id = (data.get("id") or "").strip()
        name = (data.get("name") or "").strip()
        if item_id and name:
            out[item_id] = name
    return out


def find_position_one_id(rows, key: str) -> Optional[str]:
    if not isinstance(rows, list):
        return None
    for r in rows:
        if not isinstance(r, dict):
            continue
        if r.get("position") == 1:
            v = r.get(key)
            if isinstance(v, str) and v.strip():
                return v.strip()
    # fallback: some files might omit position typing or be sorted
    if rows and isinstance(rows[0], dict):
        v = rows[0].get(key)
        if isinstance(v, str) and v.strip():
            return v.strip()
    return None


def read_first_value(csv_path: str, column_name: str) -> str:
    try:
        with open(csv_path, "r", encoding="utf-8", newline="") as f:
            reader = csv.DictReader(f)
            for row in reader:
                v = (row.get(column_name) or "").strip()
                if v:
                    return v
                return ""
    except Exception:
        return ""


def main(argv: List[str]) -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Génère un tableau des champions par année: "
            "champion pilote/constructeur officiels (f1db) + champions calculés (qualifs, 2e pilote)."
        )
    )
    parser.add_argument(
        "--yaml-dir",
        default="data/f1db/src/data",
        help="Chemin vers f1db YAML (défaut: data/f1db/src/data).",
    )
    parser.add_argument(
        "--docs-data-dir",
        default="docs/data",
        help="Chemin vers docs/data (défaut: docs/data).",
    )
    parser.add_argument(
        "--out",
        default="docs/data/champions.csv",
        help="Fichier de sortie CSV (défaut: docs/data/champions.csv).",
    )

    args = parser.parse_args(argv)

    base_dir = os.getcwd()
    yaml_dir = args.yaml_dir
    docs_data_dir = args.docs_data_dir
    out_file = args.out

    if not os.path.isabs(yaml_dir):
        yaml_dir = os.path.normpath(os.path.join(base_dir, yaml_dir))
    if not os.path.isabs(docs_data_dir):
        docs_data_dir = os.path.normpath(os.path.join(base_dir, docs_data_dir))
    if not os.path.isabs(out_file):
        out_file = os.path.normpath(os.path.join(base_dir, out_file))

    years = parse_year_dirs(docs_data_dir)
    if not years:
        raise SystemExit(f"Aucune année trouvée dans {docs_data_dir}")

    driver_names = load_id_name_map(os.path.join(yaml_dir, "drivers"))
    constructor_names = load_id_name_map(os.path.join(yaml_dir, "constructors"))

    rows_out: List[List[str]] = []

    for year in years:
        season_dir = os.path.join(yaml_dir, "seasons", str(year))
        driver_standings_path = os.path.join(season_dir, "driver-standings.yml")
        constructor_standings_path = os.path.join(season_dir, "constructor-standings.yml")

        champion_driver = ""
        if os.path.exists(driver_standings_path):
            data = load_yaml(driver_standings_path)
            driver_id = find_position_one_id(data, "driverId")
            if driver_id:
                champion_driver = driver_names.get(driver_id, driver_id)

        champion_constructor = ""
        if os.path.exists(constructor_standings_path):
            data = load_yaml(constructor_standings_path)
            constructor_id = find_position_one_id(data, "constructorId")
            if constructor_id:
                champion_constructor = constructor_names.get(constructor_id, constructor_id)

        qualif_path = os.path.join(docs_data_dir, str(year), "qualifications.csv")
        champion_qualif = read_first_value(qualif_path, "Pilote") if os.path.exists(qualif_path) else ""

        deuxieme_path = os.path.join(docs_data_dir, str(year), "deuxieme_pilote.csv")
        champion_deuxieme_constructor = (
            read_first_value(deuxieme_path, "Équipe") if os.path.exists(deuxieme_path) else ""
        )

        rows_out.append(
            [
                str(year),
                champion_driver,
                champion_constructor,
                champion_qualif,
                champion_deuxieme_constructor,
            ]
        )

    os.makedirs(os.path.dirname(out_file), exist_ok=True)
    with open(out_file, "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(
            [
                "année",
                "champion pilote",
                "champion constructeur",
                "champion qualif",
                "champion constructeur 2eme pilote",
            ]
        )
        w.writerows(rows_out)

    print(f"Champions générés: {out_file} ({len(rows_out)} années)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(os.sys.argv[1:]))
