from __future__ import annotations

"""Génère, pour chaque saison, le tableau des points cumulés par pilote à
différents moments clés de chaque Grand Prix :
  - Qualification          (qualifying-results.yml de f1db)
  - Grille de départ       (starting-grid-positions.yml de f1db, avec pénalités)
  - Tour 1                 (classement à la fin du tour 1 via API Jolpica-F1, depuis 1996)
  - 10%                    (classement au tour ~10% de la distance courue)
  - 50%                    (classement à mi-course)
  - 90%                    (classement à 90% de la distance courue)
  - Fin                    (race-results.yml de f1db)

Barème utilisé : 25-18-15-12-10-8-6-4-2-1 (src/scripts/config/qualifications_points.json).
Les tours par tour (Lap 1, 10%, 50%, 90%) n'existent pas dans f1db et sont
récupérés (avec cache JSON local) via l'API publique Jolpica-F1 (compatible Ergast)
pour les saisons disponibles (>= 1996).
"""

import argparse
import csv
import glob
import hashlib
import json
import os
import sys
import time
import unicodedata
import urllib.error
import urllib.request
from collections import defaultdict
from typing import Dict, List, Optional, Tuple

import yaml

JOLPICA_BASE_URL = "https://api.jolpi.ca/ergast/f1"
LAP_DATA_MIN_YEAR = 1996

DEFAULT_POINTS = {
    1: 25,
    2: 18,
    3: 15,
    4: 12,
    5: 10,
    6: 8,
    7: 6,
    8: 4,
    9: 2,
    10: 1,
}


def load_yaml(file_path: str):
    if not os.path.exists(file_path):
        return None
    with open(file_path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def get_file_hash(file_path: str) -> Optional[str]:
    if not os.path.exists(file_path):
        return None
    with open(file_path, "rb") as f:
        return hashlib.sha256(f.read()).hexdigest()


def normalize_text(value: str) -> str:
    text = unicodedata.normalize("NFD", str(value or ""))
    text = "".join(ch for ch in text if unicodedata.category(ch) != "Mn")
    return "".join(ch for ch in text.lower() if ch.isalnum())


def parse_pos(value) -> Optional[int]:
    if value is None:
        return None
    try:
        pos = int(str(value).strip())
        return pos if pos > 0 else None
    except (ValueError, TypeError):
        return None


def get_available_years(yaml_dir: str) -> List[int]:
    seasons_dir = f"{yaml_dir}/seasons"
    if not os.path.exists(seasons_dir):
        return []
    return sorted(
        int(d)
        for d in os.listdir(seasons_dir)
        if os.path.isdir(os.path.join(seasons_dir, d)) and d.isdigit()
    )


def load_driver_catalog(yaml_dir: str) -> Tuple[Dict[str, str], Dict[str, str], Dict[str, str]]:
    """Retourne :
    - id_to_name: driverId f1db -> Nom complet
    - code_to_id: code 3 lettres (ex. VER) -> driverId (fallback)
    - norm_name_to_id: nom normalisé (prénom+nom, nom, id) -> driverId
    """
    id_to_name: Dict[str, str] = {}
    code_to_id: Dict[str, str] = {}
    norm_name_to_id: Dict[str, str] = {}

    drivers_dir = f"{yaml_dir}/drivers"
    for driver_file in glob.glob(f"{drivers_dir}/*.yml"):
        driver_id = os.path.basename(driver_file).replace(".yml", "")
        data = load_yaml(driver_file) or {}
        name = data.get("name", driver_id)
        id_to_name[driver_id] = name

        norm_name_to_id[normalize_text(driver_id)] = driver_id
        norm_name_to_id[normalize_text(name)] = driver_id
        first_last = f"{data.get('firstName', '')} {data.get('lastName', '')}".strip()
        if first_last:
            norm_name_to_id[normalize_text(first_last)] = driver_id
        abbr = str(data.get("abbreviation") or "").strip().upper()
        if abbr:
            code_to_id[abbr] = driver_id

    return id_to_name, code_to_id, norm_name_to_id


def load_points_scale(config_path: str) -> Dict[int, int]:
    if not os.path.exists(config_path):
        return dict(DEFAULT_POINTS)
    with open(config_path, "r", encoding="utf-8") as f:
        cfg = yaml.safe_load(f) or {}
    raw = cfg.get("points_per_position") or {}
    out: Dict[int, int] = {}
    for k, v in raw.items():
        try:
            out[int(k)] = int(v)
        except (ValueError, TypeError):
            continue
    return out or dict(DEFAULT_POINTS)


def fetch_json_url(url: str, retries: int = 3) -> Optional[dict]:
    for attempt in range(retries):
        req = urllib.request.Request(
            url,
            headers={"User-Agent": "FormulaOneAlternativeRanking/1.0"},
        )
        try:
            with urllib.request.urlopen(req, timeout=20) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            if e.code == 429 and attempt + 1 < retries:
                time.sleep(2.0 * (attempt + 1))
                continue
            if attempt + 1 < retries:
                time.sleep(1.0 * (attempt + 1))
                continue
            return None
        except Exception:
            if attempt + 1 < retries:
                time.sleep(1.0 * (attempt + 1))
                continue
            return None
    return None


def fetch_lap_standings_cached(
    year: int,
    round_num: int,
    lap_number: int,
    cache_dir: str,
    offline: bool = False,
) -> Optional[List[Tuple[int, str]]]:
    """Retourne la liste triée [(position, ergast_driver_id), ...] pour un tour donné.
    Met en cache sur disque pour éviter de re-requêter l'API pour les courses passées.
    """
    cache_file = os.path.join(cache_dir, str(year), f"r{round_num:02d}_l{lap_number:03d}.json")
    if os.path.exists(cache_file):
        try:
            with open(cache_file, "r", encoding="utf-8") as f:
                cached = json.load(f)
            if isinstance(cached, list):
                return [(int(item[0]), str(item[1])) for item in cached]
            return None
        except Exception:
            pass

    if offline:
        return None

    url = f"{JOLPICA_BASE_URL}/{year}/{round_num}/laps/{lap_number}.json?limit=100"
    payload = fetch_json_url(url)
    # Petite pause pour respecter le rate-limit de Jolpica-F1
    time.sleep(0.25)

    races = payload.get("MRData", {}).get("RaceTable", {}).get("Races", []) if payload else []
    if not races or not races[0].get("Laps"):
        if year < time.gmtime().tm_year:
            os.makedirs(os.path.dirname(cache_file), exist_ok=True)
            with open(cache_file, "w", encoding="utf-8") as f:
                json.dump(None, f)
        return None

    timings = races[0]["Laps"][0].get("Timings", [])
    standings: List[Tuple[int, str]] = []
    for t in timings:
        pos = parse_pos(t.get("position"))
        did = str(t.get("driverId") or "").strip()
        if pos is not None and did:
            standings.append((pos, did))
    standings.sort(key=lambda x: x[0])

    os.makedirs(os.path.dirname(cache_file), exist_ok=True)
    with open(cache_file, "w", encoding="utf-8") as f:
        json.dump(standings, f)

    return standings


def build_race_driver_resolver(
    race_entries: list,
    id_to_name: Dict[str, str],
    norm_name_to_id: Dict[str, str],
) -> Dict[str, str]:
    """Construit un mapping local rapide ergast_driver_id -> f1db driver_id
    pour les pilotes engagés sur ce Grand Prix."""
    mapping: Dict[str, str] = {}
    race_ids = set()
    for row in race_entries or []:
        if isinstance(row, dict) and row.get("driverId"):
            race_ids.add(str(row["driverId"]))

    for did in race_ids:
        mapping[did] = did
        mapping[did.replace("-", "_")] = did
        mapping[normalize_text(did)] = did
        parts = did.split("-")
        if parts:
            last = parts[-1]
            if sum(1 for other in race_ids if other.split("-")[-1] == last) == 1:
                mapping[last] = did
        full_name = id_to_name.get(did, "")
        if full_name:
            mapping[normalize_text(full_name)] = did
            name_parts = full_name.split()
            if name_parts:
                last_norm = normalize_text(name_parts[-1])
                if sum(1 for other in race_ids if normalize_text(id_to_name.get(other, "").split()[-1]) == last_norm) == 1:
                    mapping[last_norm] = did

    mapping.update({k: v for k, v in norm_name_to_id.items() if k not in mapping})
    return mapping


def resolve_ergast_driver_id(ergast_id: str, resolver: Dict[str, str]) -> Optional[str]:
    if not ergast_id:
        return None
    if ergast_id in resolver:
        return resolver[ergast_id]
    hyphened = ergast_id.replace("_", "-")
    if hyphened in resolver:
        return resolver[hyphened]
    norm = normalize_text(ergast_id)
    if norm in resolver:
        return resolver[norm]
    if "_" in ergast_id:
        suffix = normalize_text(ergast_id.split("_")[-1])
        if suffix in resolver:
            return resolver[suffix]
    return None


def compute_checkpoint_laps(total_laps: int) -> Dict[str, int]:
    """Calcule les numéros de tours correspondant à Tour 1, 10%, 50%, 90%."""
    if total_laps <= 0:
        return {}
    return {
        "lap1": 1,
        "p10": max(1, min(total_laps, round(total_laps * 0.10))),
        "p50": max(1, min(total_laps, round(total_laps * 0.50))),
        "p90": max(1, min(total_laps, round(total_laps * 0.90))),
    }


def add_points_from_yaml(
    rows: Optional[list],
    points_scale: Dict[int, int],
    target: Dict[str, int],
    seen_drivers: set,
) -> None:
    if not rows:
        return
    for row in rows:
        if not isinstance(row, dict):
            continue
        did = row.get("driverId")
        if not did:
            continue
        did = str(did)
        seen_drivers.add(did)
        pos = parse_pos(row.get("position"))
        if pos is not None:
            target[did] += points_scale.get(pos, 0)


def compute_season_source_hash(yaml_dir: str, year: int) -> Optional[str]:
    races_dir = f"{yaml_dir}/seasons/{year}/races"
    if not os.path.exists(races_dir):
        return None
    h = hashlib.sha256()
    found = False
    for race_dir in sorted(os.listdir(races_dir)):
        rdir = os.path.join(races_dir, race_dir)
        for fname in ("race.yml", "qualifying-results.yml", "starting-grid-positions.yml", "race-results.yml"):
            fh = get_file_hash(os.path.join(rdir, fname))
            if fh:
                found = True
                h.update(fh.encode("ascii"))
    return h.hexdigest() if found else None


def generate_season(
    *,
    yaml_dir: str,
    year: int,
    points_scale: Dict[int, int],
    id_to_name: Dict[str, str],
    norm_name_to_id: Dict[str, str],
    output_path: str,
    cache_dir: str,
    script_hash: str,
    force: bool = False,
    offline: bool = False,
) -> Tuple[str, dict]:
    """Génère docs/data/<year>/checkpoints.csv. Retourne (status, summary_meta)."""
    hash_file = f"{output_path}.hash"
    source_hash = compute_season_source_hash(yaml_dir, year)
    if source_hash is None:
        return "empty", {}

    expected_cache = {
        "source_hash": source_hash,
        "script_hash": script_hash,
        "year": year,
        "lap_data_min_year": LAP_DATA_MIN_YEAR,
    }

    if not force and os.path.exists(output_path) and os.path.exists(hash_file):
        try:
            with open(hash_file, "r", encoding="utf-8") as f:
                prev = yaml.safe_load(f) or {}
            if prev.get("cache_key") == expected_cache and isinstance(prev.get("meta"), dict):
                return "cache", prev["meta"]
        except Exception:
            pass

    races_dir = f"{yaml_dir}/seasons/{year}/races"
    race_dirs = sorted(os.listdir(races_dir))

    seen_drivers: set = set()
    pts_qualif: Dict[str, int] = defaultdict(int)
    pts_grid: Dict[str, int] = defaultdict(int)
    pts_lap1: Dict[str, int] = defaultdict(int)
    pts_p10: Dict[str, int] = defaultdict(int)
    pts_p50: Dict[str, int] = defaultdict(int)
    pts_p90: Dict[str, int] = defaultdict(int)
    pts_finish: Dict[str, int] = defaultdict(int)

    races_total = 0
    races_with_laps = 0

    for race_dir in race_dirs:
        rdir = os.path.join(races_dir, race_dir)
        race_meta = load_yaml(os.path.join(rdir, "race.yml")) or {}
        race_results = load_yaml(os.path.join(rdir, "race-results.yml")) or []
        if not race_results:
            continue

        races_total += 1
        qualif_results = load_yaml(os.path.join(rdir, "qualifying-results.yml")) or []
        grid_results = load_yaml(os.path.join(rdir, "starting-grid-positions.yml")) or []

        add_points_from_yaml(qualif_results, points_scale, pts_qualif, seen_drivers)
        add_points_from_yaml(grid_results, points_scale, pts_grid, seen_drivers)
        add_points_from_yaml(race_results, points_scale, pts_finish, seen_drivers)

        if year < LAP_DATA_MIN_YEAR:
            continue

        completed_laps = max(
            (int(r["laps"]) for r in race_results if isinstance(r, dict) and r.get("laps") is not None and str(r["laps"]).isdigit()),
            default=0,
        )
        if completed_laps <= 0:
            completed_laps = int(race_meta.get("laps") or 0)

        round_num = parse_pos(race_meta.get("round"))
        if round_num is None:
            try:
                round_num = int(race_dir.split("-", 1)[0])
            except Exception:
                round_num = 0

        if completed_laps <= 0 or round_num <= 0:
            continue

        checkpoints = compute_checkpoint_laps(completed_laps)
        resolver = build_race_driver_resolver(race_results, id_to_name, norm_name_to_id)

        lap_results_by_num: Dict[int, Optional[List[Tuple[int, str]]]] = {}
        for lap_num in sorted(set(checkpoints.values())):
            lap_results_by_num[lap_num] = fetch_lap_standings_cached(
                year=year,
                round_num=round_num,
                lap_number=lap_num,
                cache_dir=cache_dir,
                offline=offline,
            )

        if any(v for v in lap_results_by_num.values()):
            races_with_laps += 1

        for key, target in (
            ("lap1", pts_lap1),
            ("p10", pts_p10),
            ("p50", pts_p50),
            ("p90", pts_p90),
        ):
            standings = lap_results_by_num.get(checkpoints[key])
            if not standings:
                continue
            for pos, ergast_id in standings:
                pts = points_scale.get(pos, 0)
                if pts <= 0:
                    continue
                did = resolve_ergast_driver_id(ergast_id, resolver)
                if did:
                    seen_drivers.add(did)
                    target[did] += pts

    has_laps = races_with_laps > 0

    sorted_drivers = sorted(
        seen_drivers,
        key=lambda d: (
            pts_finish[d],
            pts_p90[d],
            pts_p50[d],
            pts_qualif[d],
            id_to_name.get(d, d),
        ),
        reverse=True,
    )

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow([
            "Pilote",
            "Rang",
            "Qualification",
            "Grille de départ",
            "Tour 1",
            "10%",
            "50%",
            "90%",
            "Fin",
        ])
        for rank, did in enumerate(sorted_drivers, start=1):
            writer.writerow([
                id_to_name.get(did, did),
                rank,
                pts_qualif[did],
                pts_grid[did],
                pts_lap1[did] if has_laps else "",
                pts_p10[did] if has_laps else "",
                pts_p50[did] if has_laps else "",
                pts_p90[did] if has_laps else "",
                pts_finish[did],
            ])

    meta = {
        "year": year,
        "races": races_total,
        "racesWithLaps": races_with_laps,
        "hasLapData": has_laps,
    }
    with open(hash_file, "w", encoding="utf-8") as f:
        yaml.safe_dump({"cache_key": expected_cache, "meta": meta}, f)

    return "generated", meta


def main(argv: List[str]) -> int:
    parser = argparse.ArgumentParser(
        description="Génère le classement par points aux moments clés de course (Qualif, Grille, Tour 1, 10%, 50%, 90%, Fin)."
    )
    parser.add_argument("--years", default=None, help="Ex: '2024' ou '2020-2026'. Par défaut: toutes.")
    parser.add_argument("--force", action="store_true", help="Ignore le cache CSV.")
    parser.add_argument("--offline", action="store_true", help="N'appelle pas l'API Jolpica-F1 (utilise uniquement le cache local).")
    parser.add_argument("--yaml-dir", default="../../data/f1db/src/data")
    parser.add_argument("--config", default="./config/qualifications_points.json")
    parser.add_argument("--output-root", default="../../docs/data")
    parser.add_argument("--lap-cache-dir", default="../../data/lap_cache")
    args = parser.parse_args(argv)

    script_dir = os.path.dirname(os.path.abspath(__file__))
    resolve = lambda p: p if os.path.isabs(p) else os.path.normpath(os.path.join(script_dir, p))

    yaml_dir = resolve(args.yaml_dir)
    config_path = resolve(args.config)
    output_root = resolve(args.output_root)
    lap_cache_dir = resolve(args.lap_cache_dir)

    available_years = get_available_years(yaml_dir)
    if args.years:
        raw = args.years.strip()
        if "-" in raw:
            a, b = raw.split("-", 1)
            years = [y for y in available_years if int(a) <= y <= int(b)]
        elif "," in raw:
            wanted = {int(x.strip()) for x in raw.split(",") if x.strip()}
            years = [y for y in available_years if y in wanted]
        else:
            years = [int(raw)]
    else:
        years = available_years

    script_hash = get_file_hash(__file__) or ""
    points_scale = load_points_scale(config_path)
    id_to_name, _, norm_name_to_id = load_driver_catalog(yaml_dir)

    cache_count = 0
    gen_count = 0
    index_years: List[dict] = []

    for year in years:
        out_csv = os.path.join(output_root, str(year), "checkpoints.csv")
        status, meta = generate_season(
            yaml_dir=yaml_dir,
            year=year,
            points_scale=points_scale,
            id_to_name=id_to_name,
            norm_name_to_id=norm_name_to_id,
            output_path=out_csv,
            cache_dir=lap_cache_dir,
            script_hash=script_hash,
            force=args.force,
            offline=args.offline,
        )
        if status == "cache":
            cache_count += 1
        elif status == "generated":
            gen_count += 1
            print(f"Checkpoints générés pour {year} ({meta.get('racesWithLaps', 0)}/{meta.get('races', 0)} courses avec tours)")
        if meta:
            index_years.append(meta)

    index_path = os.path.join(output_root, "checkpoints", "index.json")
    os.makedirs(os.path.dirname(index_path), exist_ok=True)
    with open(index_path, "w", encoding="utf-8") as f:
        json.dump(
            {
                "lapDataMinYear": LAP_DATA_MIN_YEAR,
                "pointsScale": points_scale,
                "years": index_years,
            },
            f,
            ensure_ascii=False,
            indent=2,
        )

    print(f"Résumé checkpoints : {cache_count} en cache, {gen_count} générées.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
