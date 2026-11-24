from __future__ import annotations

import math
from collections import defaultdict
from dataclasses import dataclass
from typing import Dict, List, Tuple

from .ranking import RankedEntry, outcome


@dataclass(frozen=True)
class EloResultRow:
    driver_id: str
    elo_before: float
    elo_after: float
    elo_delta: float
    actual_score: float
    expected_score: float


@dataclass(frozen=True)
class ConstructorEloResultRow:
    constructor_id: str
    elo_before: float
    elo_after: float
    elo_delta: float
    actual_score: float
    expected_score: float
    cars_counted: int
    opponents_count: int
    best_position: str
    positions: str


def expected_score(ra: float, rb: float, scale: float = 400.0) -> float:
    return 1.0 / (1.0 + math.pow(10.0, (rb - ra) / scale))


def compute_course_update(
    ranked_entries: List[RankedEntry],
    ratings: Dict[str, float],
    k: float,
    scale: float = 400.0,
    initial_elo: float = 1000.0,
) -> Tuple[Dict[str, EloResultRow], Dict[str, float]]:
    """Compute order-independent ELO update for a multi-participant race.

    For each driver i:
      S_i = avg_j outcome(i,j)
      E_i = avg_j expected(ri,rj, scale)
      r_i' = r_i + K*(S_i - E_i)

    Returns:
      - per-driver result rows
      - updated ratings dict (same object as input mutated)
    """

    n = len(ranked_entries)
    if n < 2:
        return {}, ratings

    driver_ids = [re.entry.driver_id for re in ranked_entries]
    before = {d: float(ratings.get(d, initial_elo)) for d in driver_ids}

    actual_sum = dict.fromkeys(driver_ids, 0.0)
    expected_sum = dict.fromkeys(driver_ids, 0.0)

    for i in range(n):
        di = driver_ids[i]
        ri = before[di]
        ei = ranked_entries[i]
        for j in range(i + 1, n):
            dj = driver_ids[j]
            rj = before[dj]
            ej = ranked_entries[j]

            exp_i = expected_score(ri, rj, scale=scale)
            exp_j = 1.0 - exp_i
            expected_sum[di] += exp_i
            expected_sum[dj] += exp_j

            out_i = outcome(ei, ej)
            out_j = 1.0 - out_i
            actual_sum[di] += out_i
            actual_sum[dj] += out_j

    denom = float(n - 1)
    results: Dict[str, EloResultRow] = {}
    for d in driver_ids:
        s = actual_sum[d] / denom
        e = expected_sum[d] / denom
        delta = float(k) * (s - e)
        after = before[d] + delta
        ratings[d] = after
        results[d] = EloResultRow(
            driver_id=d,
            elo_before=before[d],
            elo_after=after,
            elo_delta=delta,
            actual_score=s,
            expected_score=e,
        )

    return results, ratings


def compute_constructor_course_update(
    ranked_entries: List[RankedEntry],
    ratings: Dict[str, float],
    k: float,
    scale: float = 600.0,
    initial_elo: float = 1000.0,
) -> Tuple[Dict[str, ConstructorEloResultRow], Dict[str, float]]:
    """Compute order-independent ELO update for constructors in a race.

    Each constructor's cars (typically 2 vehicles) are compared against all
    vehicles from *other* constructors (n - m_c opponents, i.e. n - 2 for a
    standard 2-car team). Cars of the same constructor are never compared
    against each other.

    For each constructor c with cars C_c and external opponents O_c:
      S_c = avg_{(a in C_c, b in O_c)} outcome(a, b)
      E_c = avg_{(a in C_c, b in O_c)} expected(r_c, r_{team(b)}, scale)
      r_c' = r_c + K * (S_c - E_c)
    """
    valid_entries = [re for re in ranked_entries if re.entry.constructor_id]
    by_constructor: Dict[str, List[RankedEntry]] = defaultdict(list)
    for re in valid_entries:
        by_constructor[re.entry.constructor_id].append(re)

    constructors = list(by_constructor.keys())
    if len(constructors) < 2:
        return {}, ratings

    before = {c: float(ratings.get(c, initial_elo)) for c in constructors}
    actual_sum = dict.fromkeys(constructors, 0.0)
    expected_sum = dict.fromkeys(constructors, 0.0)
    pair_count = dict.fromkeys(constructors, 0)

    total_entries = len(valid_entries)
    for i in range(total_entries):
        ei = valid_entries[i]
        ci = ei.entry.constructor_id
        ri = before[ci]
        for j in range(i + 1, total_entries):
            ej = valid_entries[j]
            cj = ej.entry.constructor_id
            if ci == cj:
                continue

            rj = before[cj]
            exp_i = expected_score(ri, rj, scale=scale)
            exp_j = 1.0 - exp_i
            out_i = outcome(ei, ej)
            out_j = 1.0 - out_i

            actual_sum[ci] += out_i
            expected_sum[ci] += exp_i
            pair_count[ci] += 1

            actual_sum[cj] += out_j
            expected_sum[cj] += exp_j
            pair_count[cj] += 1

    results: Dict[str, ConstructorEloResultRow] = {}
    for c in constructors:
        pairs = pair_count[c]
        if pairs <= 0:
            continue
        cars = by_constructor[c]
        s = actual_sum[c] / float(pairs)
        e = expected_sum[c] / float(pairs)
        delta = float(k) * (s - e)
        after = before[c] + delta
        ratings[c] = after

        pos_list = [re.entry.position_raw or "-" for re in cars]
        results[c] = ConstructorEloResultRow(
            constructor_id=c,
            elo_before=before[c],
            elo_after=after,
            elo_delta=delta,
            actual_score=s,
            expected_score=e,
            cars_counted=len(cars),
            opponents_count=total_entries - len(cars),
            best_position=pos_list[0] if pos_list else "",
            positions=" / ".join(pos_list),
        )

    return results, ratings
