from __future__ import annotations

import argparse
import csv
import glob
import os
import sys
from collections import defaultdict
from dataclasses import dataclass
from datetime import date
from typing import Dict, Iterable, List, Optional, Tuple

import yaml


@dataclass(frozen=True)
class AgeAgg:
    total: float
    count: int


def parse_iso_date(value) -> Optional[date]:
    if isinstance(value, date):
        return value

    value = (value or "").strip()
    if not value:
        return None
    try:
        y, m, d = value.split("-", 2)
        return date(int(y), int(m), int(d))
    except Exception:
        return None


def compute_age_years(dob: date, on: date) -> int:
    years = on.year - dob.year
    if (on.month, on.day) < (dob.month, dob.day):
        years -= 1
    return years


def load_driver_birth_dates(yaml_dir: str) -> Dict[str, date]:
    drivers_dir = os.path.join(yaml_dir, "drivers")
    out: Dict[str, date] = {}
    for path in glob.glob(os.path.join(drivers_dir, "*.yml")):
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = yaml.safe_load(f) or {}
        except Exception:
            continue

        driver_id = (data.get("id") or "").strip()
        dob = parse_iso_date(data.get("dateOfBirth") or "")
        if driver_id and dob:
            out[driver_id] = dob

    return out


def iter_driver_csv_files(drivers_csv_dir: str) -> Iterable[Tuple[str, str]]:
    pattern = os.path.join(drivers_csv_dir, "*.csv")
    for path in glob.glob(pattern):
        driver_id = os.path.splitext(os.path.basename(path))[0]
        yield driver_id, path


def aggregate_elo_by_age(
    *,
    drivers_csv_dir: str,
    driver_id_to_dob: Dict[str, date],
    min_age: int,
    max_age: int,
) -> Dict[int, AgeAgg]:
    totals: Dict[int, float] = defaultdict(float)
    counts: Dict[int, int] = defaultdict(int)

    for driver_id, path in iter_driver_csv_files(drivers_csv_dir):
        dob = driver_id_to_dob.get(driver_id)
        if dob is None:
            continue

        try:
            with open(path, "r", encoding="utf-8", newline="") as f:
                reader = csv.DictReader(f)
                for row in reader:
                    d = parse_iso_date(row.get("date") or "")
                    if d is None:
                        continue

                    try:
                        elo_after = float(row.get("eloAfter") or "")
                    except Exception:
                        continue

                    age = compute_age_years(dob, d)
                    if age < min_age or age > max_age:
                        continue

                    totals[age] += elo_after
                    counts[age] += 1
        except Exception:
            continue

    out: Dict[int, AgeAgg] = {}
    for age, total in totals.items():
        c = counts.get(age, 0)
        if c:
            out[age] = AgeAgg(total=total, count=c)

    return out


def write_csv(out_file: str, agg: Dict[int, AgeAgg]) -> None:
    os.makedirs(os.path.dirname(out_file), exist_ok=True)
    with open(out_file, "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["age", "meanElo", "nEntries"])
        for age in sorted(agg.keys()):
            a = agg[age]
            mean = a.total / a.count if a.count else 0.0
            w.writerow([age, f"{mean:.6f}", a.count])


def main(argv: List[str]) -> int:
    parser = argparse.ArgumentParser(
        description="Calcule l'ELO moyen par âge à partir des CSV pilotes (docs/data/elo/drivers) et des dates de naissance f1db (drivers/*.yml)."
    )
    parser.add_argument(
        "--yaml-dir",
        default="../../data/f1db/src/data",
        help="Chemin vers f1db YAML (défaut: ../../data/f1db/src/data).",
    )
    parser.add_argument(
        "--drivers-csv-dir",
        default="../../docs/data/elo/drivers",
        help="Dossier contenant les CSV pilotes (défaut: ../../docs/data/elo/drivers).",
    )
    parser.add_argument(
        "--out",
        default="../../docs/data/elo/elo_by_age.csv",
        help="Fichier de sortie CSV (défaut: ../../docs/data/elo/elo_by_age.csv).",
    )
    parser.add_argument(
        "--min-age",
        type=int,
        default=15,
        help="Âge minimum (défaut: 15).",
    )
    parser.add_argument(
        "--max-age",
        type=int,
        default=55,
        help="Âge maximum (défaut: 55).",
    )

    args = parser.parse_args(argv)

    base_dir = os.getcwd()
    yaml_dir = args.yaml_dir
    drivers_csv_dir = args.drivers_csv_dir
    out_file = args.out

    if not os.path.isabs(yaml_dir):
        yaml_dir = os.path.normpath(os.path.join(base_dir, yaml_dir))
    if not os.path.isabs(drivers_csv_dir):
        drivers_csv_dir = os.path.normpath(os.path.join(base_dir, drivers_csv_dir))
    if not os.path.isabs(out_file):
        out_file = os.path.normpath(os.path.join(base_dir, out_file))

    if not os.path.isdir(drivers_csv_dir):
        raise SystemExit(f"Dossier introuvable: {drivers_csv_dir}")

    driver_id_to_dob = load_driver_birth_dates(yaml_dir)
    agg = aggregate_elo_by_age(
        drivers_csv_dir=drivers_csv_dir,
        driver_id_to_dob=driver_id_to_dob,
        min_age=args.min_age,
        max_age=args.max_age,
    )
    write_csv(out_file, agg)
    print(f"ELO moyen par âge généré: {out_file} ({len(agg)} âges)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
