from __future__ import annotations

import csv
import os
from collections.abc import Iterable
from typing import Any

from .elo_math import EloResultRow
from .ranking import RankedEntry


def ensure_dir(path: str) -> None:
    os.makedirs(path, exist_ok=True)


def write_race_csv(
    output_file: str,
    *,
    meta: dict[str, Any],
    ranked_entries: list[RankedEntry],
    driver_id_to_name: dict[str, str],
    elo_rows: dict[str, EloResultRow],
    k_used: float,
) -> None:
    ensure_dir(os.path.dirname(output_file))

    fieldnames = [
        "year",
        "round",
        "date",
        "grandPrixId",
        "officialName",
        "careerRaceNumber",
        "driverId",
        "driverName",
        "constructorId",
        "positionRaw",
        "laps",
        "gridPosition",
        "rankKeyTier",
        "rankInRace",
        "eloBefore",
        "eloAfter",
        "eloDelta",
        "actualScore",
                "expectedScore",
        "kUsed",
        "nParticipants",
    ]

    n = len(ranked_entries)

    with open(output_file, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for idx, re_entry in enumerate(ranked_entries, start=1):
            d = re_entry.entry.driver_id
            row = {
                **meta,
                "driverId": d,
                "driverName": driver_id_to_name.get(d, d),
                "constructorId": re_entry.entry.constructor_id or "",
                "positionRaw": re_entry.entry.position_raw,
                "laps": "" if re_entry.entry.laps is None else re_entry.entry.laps,
                "gridPosition": re_entry.entry.grid_position or "",
                "rankKeyTier": re_entry.tie_key[0],
                "rankInRace": idx,
                "kUsed": k_used,
                "nParticipants": n,
            }
            er = elo_rows.get(d)
            if er:
                row.update(
                    {
                        "eloBefore": round(er.elo_before, 6),
                        "eloAfter": round(er.elo_after, 6),
                        "eloDelta": round(er.elo_delta, 6),
                        "actualScore": round(er.actual_score, 6),
                        "expectedScore": round(er.expected_score, 6),
                    }
                )
            writer.writerow(row)


def write_driver_csv(
    output_file: str,
    rows: Iterable[dict[str, Any]],
) -> None:
    ensure_dir(os.path.dirname(output_file))
    rows_list = list(rows)
    if not rows_list:
        return

    fieldnames = list(rows_list[0].keys())
    with open(output_file, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows_list)
