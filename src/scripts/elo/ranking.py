from __future__ import annotations

from dataclasses import dataclass
from typing import Any

BOTTOM_TIER_STATUSES = {"DSQ", "DNS", "DNQ"}

DRIVER_DNF_KEYWORDS = (
    "accident",
    "collision",
    "spun off",
    "spin",
    "crash",
    "physical",
    "injured",
    "injury",
    "illness",
    "unwell",
    "exhaustion",
    "fatal",
    "driver",
    "stalled",
    "black flag",
    "excluded",
    "disqualified",
)


def classify_dnf(position_raw: str, reason_retired: str | None) -> str:
    status = _normalize_status(position_raw)
    if _position_int(status) is not None:
        return "finished"

    if status != "DNF":
        return "other"

    reason = (reason_retired or "").strip().lower()
    if not reason:
        return "other"

    for kw in DRIVER_DNF_KEYWORDS:
        if kw in reason:
            return "driver_dnf"

    return "mechanical_dnf"


@dataclass(frozen=True)
class RaceEntry:
    driver_id: str
    constructor_id: str | None
    position_raw: str
    laps: int | None
    grid_position: str | None
    reason_retired: str | None = None


@dataclass(frozen=True)
class RankedEntry:
    entry: RaceEntry
    sort_key: tuple[Any, ...]
    tie_key: tuple[Any, ...]


def _parse_int(value: Any) -> int | None:
    if value is None:
        return None
    try:
        return int(str(value))
    except (ValueError, TypeError):
        return None


def _position_int(position_raw: str) -> int | None:
    return _parse_int(position_raw)


def _normalize_status(position_raw: Any) -> str:
    if position_raw is None:
        return ""
    return str(position_raw).strip().upper()


def compute_rank_keys(entry: RaceEntry) -> RankedEntry:
    status = _normalize_status(entry.position_raw)
    pos_int = _position_int(status)
    laps = entry.laps if entry.laps is not None else 0

    if pos_int is not None:
        tie_key = (0, pos_int)
        sort_key = (0, pos_int, entry.driver_id)
        return RankedEntry(entry=entry, sort_key=sort_key, tie_key=tie_key)

    tier = 2 if status in BOTTOM_TIER_STATUSES else 1
    tie_key = (tier, laps, status)
    sort_key = (tier, -laps, status, entry.driver_id)
    return RankedEntry(entry=entry, sort_key=sort_key, tie_key=tie_key)


def dedupe_best_by_driver(entries: list[RaceEntry]) -> list[RaceEntry]:
    best: dict[str, RankedEntry] = {}
    for entry in entries:
        ranked = compute_rank_keys(entry)
        current = best.get(entry.driver_id)
        if current is None or ranked.sort_key < current.sort_key:
            best[entry.driver_id] = ranked
    return [ranked.entry for ranked in best.values()]


def rank_entries(entries: list[RaceEntry]) -> list[RankedEntry]:
    ranked = [compute_rank_keys(e) for e in entries]
    ranked.sort(key=lambda r: r.sort_key)
    return ranked


def outcome(a: RankedEntry, b: RankedEntry) -> float:
    if a.tie_key == b.tie_key:
        return 0.5
    return 1.0 if a.sort_key < b.sort_key else 0.0
