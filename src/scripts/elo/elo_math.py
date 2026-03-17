from __future__ import annotations

import math
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


def expected_score(ra: float, rb: float, scale: float = 400.0) -> float:
    return 1.0 / (1.0 + math.pow(10.0, (rb - ra) / scale))


def compute_course_update(
    ranked_entries: List[RankedEntry],
    ratings: Dict[str, float],
    k: float,
) -> Tuple[Dict[str, EloResultRow], Dict[str, float]]:
    """Compute order-independent ELO update for a multi-participant race.

    For each driver i:
      S_i = avg_j outcome(i,j)
      E_i = avg_j expected(ri,rj)
      r_i' = r_i + K*(S_i - E_i)

    Returns:
      - per-driver result rows
      - updated ratings dict (same object as input mutated)
    """

    n = len(ranked_entries)
    if n < 2:
        return {}, ratings

    driver_ids = [re.entry.driver_id for re in ranked_entries]
    before = {d: float(ratings.get(d, 1500.0)) for d in driver_ids}

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

            exp_i = expected_score(ri, rj)
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
