from __future__ import annotations

import glob
import hashlib
import os
from dataclasses import dataclass
from typing import Any, Dict, Iterable, List, Optional, Tuple

import yaml

from .ranking import RaceEntry


def load_yaml(file_path: str) -> Any:
    if not os.path.exists(file_path):
        return None
    with open(file_path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def sha256_of_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def get_file_hash(file_path: str) -> Optional[str]:
    if not os.path.exists(file_path):
        return None
    with open(file_path, "rb") as f:
        return hashlib.sha256(f.read()).hexdigest()


def get_available_years(yaml_dir: str) -> List[str]:
    seasons_dir = f"{yaml_dir}/seasons"
    if not os.path.exists(seasons_dir):
        return []
    return sorted(
        [
            d
            for d in os.listdir(seasons_dir)
            if os.path.isdir(os.path.join(seasons_dir, d)) and d.isdigit()
        ]
    )


def load_driver_names(yaml_dir: str) -> Dict[str, str]:
    drivers_dir = f"{yaml_dir}/drivers"
    out: Dict[str, str] = {}
    for driver_file in glob.glob(f"{drivers_dir}/*.yml"):
        driver_id = os.path.basename(driver_file).replace(".yml", "")
        data = load_yaml(driver_file) or {}
        out[driver_id] = data.get("name", driver_id)
    return out


@dataclass(frozen=True)
class RaceMeta:
    year: int
    round: int
    date: str
    grand_prix_id: str
    official_name: str
    race_dir_name: str  # e.g. '01-bahrain'


def iter_races(yaml_dir: str, years: Iterable[int]) -> List[RaceMeta]:
    races: List[RaceMeta] = []
    for year in years:
        races_dir = f"{yaml_dir}/seasons/{year}/races"
        if not os.path.exists(races_dir):
            continue

        for race_dir_name in os.listdir(races_dir):
            race_yml = f"{races_dir}/{race_dir_name}/race.yml"
            meta = load_yaml(race_yml) or {}

            round_num = meta.get("round")
            try:
                round_int = int(round_num)
            except Exception:
                # fallback to prefix '01-'
                try:
                    round_int = int(str(race_dir_name).split("-", 1)[0])
                except Exception:
                    round_int = 0

            date = str(meta.get("date", ""))
            grand_prix_id = str(meta.get("grandPrixId", ""))
            official_name = str(meta.get("officialName", ""))

            races.append(
                RaceMeta(
                    year=int(year),
                    round=round_int,
                    date=date,
                    grand_prix_id=grand_prix_id,
                    official_name=official_name,
                    race_dir_name=race_dir_name,
                )
            )

    races.sort(key=lambda r: (r.year, r.round, r.date, r.race_dir_name))
    return races


@dataclass(frozen=True)
class RaceData:
    meta: RaceMeta
    entries: List[RaceEntry]


def load_race_data(yaml_dir: str, meta: RaceMeta) -> RaceData:
    races_dir = f"{yaml_dir}/seasons/{meta.year}/races"
    race_results_yml = f"{races_dir}/{meta.race_dir_name}/race-results.yml"
    raw = load_yaml(race_results_yml) or []

    entries: List[RaceEntry] = []
    for row in raw:
        if not isinstance(row, dict):
            continue
        position_raw = row.get("position")
        driver_id = row.get("driverId")
        if not driver_id:
            continue
        constructor_id = row.get("constructorId")
        laps = row.get("laps")
        try:
            laps_int = int(laps) if laps is not None and str(laps).strip() != "" else None
        except Exception:
            laps_int = None
        grid_pos = row.get("gridPosition")
        entries.append(
            RaceEntry(
                driver_id=str(driver_id),
                constructor_id=str(constructor_id) if constructor_id is not None else None,
                position_raw=str(position_raw) if position_raw is not None else "",
                laps=laps_int,
                grid_position=str(grid_pos) if grid_pos is not None else None,
            )
        )

    return RaceData(meta=meta, entries=entries)


def compute_source_hash(yaml_dir: str, races: List[RaceMeta]) -> str:
    h = hashlib.sha256()
    for meta in races:
        races_dir = f"{yaml_dir}/seasons/{meta.year}/races"
        for name in ("race.yml", "race-results.yml"):
            fp = f"{races_dir}/{meta.race_dir_name}/{name}"
            file_hash = get_file_hash(fp) or ""
            h.update(file_hash.encode("ascii"))
    # Include drivers mapping too
    drivers_dir = f"{yaml_dir}/drivers"
    for driver_file in sorted(glob.glob(f"{drivers_dir}/*.yml")):
        file_hash = get_file_hash(driver_file) or ""
        h.update(file_hash.encode("ascii"))

    return h.hexdigest()
