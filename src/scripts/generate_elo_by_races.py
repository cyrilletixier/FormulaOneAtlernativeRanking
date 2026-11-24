from __future__ import annotations

import argparse
import csv
import glob
import os
import sys
from collections import defaultdict
from dataclasses import dataclass
from typing import Dict, Iterable, List, Tuple


@dataclass(frozen=True)
class RaceCountAgg:
    total: float
    count: int


def iter_driver_csv_files(drivers_csv_dir: str) -> Iterable[Tuple[str, str]]:
    pattern = os.path.join(drivers_csv_dir, "*.csv")
    for path in glob.glob(pattern):
        driver_id = os.path.splitext(os.path.basename(path))[0]
        yield driver_id, path


def aggregate_elo_by_race_count(
    *,
    drivers_csv_dir: str,
    min_entries: int = 1,
) -> Dict[int, RaceCountAgg]:
    """Calcule l'ELO moyen en fonction du nombre de courses disputées par le pilote
    (1ère course, 2ème course, ..., Nème course de sa carrière).
    """
    totals: Dict[int, float] = defaultdict(float)
    counts: Dict[int, int] = defaultdict(int)

    for _, path in iter_driver_csv_files(drivers_csv_dir):
        try:
            with open(path, "r", encoding="utf-8", newline="") as f:
                reader = csv.DictReader(f)
                rows = []
                for row in reader:
                    try:
                        elo_after = float(row.get("eloAfter") or "")
                    except Exception:
                        continue
                    try:
                        sort_key = int(row.get("careerRaceNumber") or 0)
                    except Exception:
                        sort_key = 0
                    rows.append((sort_key, elo_after))

            rows.sort(key=lambda item: item[0])
            for race_index, (_, elo_after) in enumerate(rows, start=1):
                totals[race_index] += elo_after
                counts[race_index] += 1
        except Exception:
            continue

    out: Dict[int, RaceCountAgg] = {}
    for race_index, total in totals.items():
        c = counts.get(race_index, 0)
        if c >= min_entries:
            out[race_index] = RaceCountAgg(total=total, count=c)

    return out


def write_csv(out_file: str, agg: Dict[int, RaceCountAgg]) -> None:
    os.makedirs(os.path.dirname(out_file), exist_ok=True)
    with open(out_file, "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["raceCount", "meanElo", "nEntries"])
        for race_count in sorted(agg.keys()):
            a = agg[race_count]
            mean = a.total / a.count if a.count else 0.0
            w.writerow([race_count, f"{mean:.6f}", a.count])


def main(argv: List[str]) -> int:
    parser = argparse.ArgumentParser(
        description="Calcule l'ELO moyen par nombre de courses disputées à partir des CSV pilotes (docs/data/elo/drivers)."
    )
    parser.add_argument(
        "--drivers-csv-dir",
        default="../../docs/data/elo/drivers",
        help="Dossier contenant les CSV pilotes (défaut: ../../docs/data/elo/drivers).",
    )
    parser.add_argument(
        "--out",
        default="../../docs/data/elo/elo_by_races.csv",
        help="Fichier de sortie CSV (défaut: ../../docs/data/elo/elo_by_races.csv).",
    )
    parser.add_argument(
        "--min-entries",
        type=int,
        default=1,
        help="Nombre minimum de pilotes ayant atteint ce nombre de courses (défaut: 1).",
    )

    args = parser.parse_args(argv)

    script_dir = os.path.dirname(os.path.abspath(__file__))
    drivers_csv_dir = args.drivers_csv_dir
    out_file = args.out

    if not os.path.isabs(drivers_csv_dir):
        drivers_csv_dir = os.path.normpath(os.path.join(script_dir, drivers_csv_dir))
    if not os.path.isabs(out_file):
        out_file = os.path.normpath(os.path.join(script_dir, out_file))

    if not os.path.isdir(drivers_csv_dir):
        raise SystemExit(f"Dossier introuvable: {drivers_csv_dir}")

    agg = aggregate_elo_by_race_count(
        drivers_csv_dir=drivers_csv_dir,
        min_entries=args.min_entries,
    )
    write_csv(out_file, agg)
    print(f"ELO moyen par nombre de courses généré: {out_file} ({len(agg)} paliers)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
