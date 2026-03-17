from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Iterable, List, Optional, Tuple


BOTTOM_TIER_STATUSES = {"DSQ", "DNS", "DNQ"}


@dataclass(frozen=True)
class RaceEntry:
    driver_id: str
    constructor_id: Optional[str]
    position_raw: str
    laps: Optional[int]
    grid_position: Optional[str]


@dataclass(frozen=True)
class RankedEntry:
    entry: RaceEntry
    sort_key: Tuple
    tie_key: Tuple


def _parse_int(value: Any) -> Optional[int]:
    if value is None:
        return None
    try:
        return int(str(value))
    except (ValueError, TypeError):
        return None


def _position_int(position_raw: str) -> Optional[int]:
    return _parse_int(position_raw)


def _normalize_status(position_raw: Any) -> str:
    if position_raw is None:
        return ""
    return str(position_raw).strip().upper()


def compute_rank_keys(entry: RaceEntry) -> RankedEntry:
    """Compute a total ordering key and a tie key.

    Ordering rules (best first):
    1) Numeric position asc
    2) Other non-numeric statuses by laps desc
    3) {DSQ,DNS,DNQ} last, by laps desc

    Ties: only when the tie_key is identical.
    """

    status = _normalize_status(entry.position_raw)
    pos_int = _position_int(status)
    laps = entry.laps if entry.laps is not None else 0

    if pos_int is not None:
        # Best: (0, pos)
        tie_key = (0, pos_int)
        sort_key = (0, pos_int, entry.driver_id)
        return RankedEntry(entry=entry, sort_key=sort_key, tie_key=tie_key)

    tier = 2 if status in BOTTOM_TIER_STATUSES else 1
    # Higher laps is better => sort on -laps
    tie_key = (tier, laps, status)
    sort_key = (tier, -laps, status, entry.driver_id)
    return RankedEntry(entry=entry, sort_key=sort_key, tie_key=tie_key)


def dedupe_best_by_driver(entries: Iterable[RaceEntry]) -> List[RaceEntry]:
    best: Dict[str, RankedEntry] = {}
    for entry in entries:
        ranked = compute_rank_keys(entry)
        current = best.get(entry.driver_id)
        if current is None or ranked.sort_key < current.sort_key:
            best[entry.driver_id] = ranked
    return [ranked.entry for ranked in best.values()]


def rank_entries(entries: Iterable[RaceEntry]) -> List[RankedEntry]:
    ranked = [compute_rank_keys(e) for e in entries]
    ranked.sort(key=lambda r: r.sort_key)
    return ranked


def outcome(a: RankedEntry, b: RankedEntry) -> float:
    if a.tie_key == b.tie_key:
        return 0.5
    # better = lower sort_key
    return 1.0 if a.sort_key < b.sort_key else 0.0
