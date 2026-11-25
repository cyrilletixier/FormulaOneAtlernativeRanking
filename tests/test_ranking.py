import os
import sys
import unittest
from unittest.mock import patch

# Ajoute src/scripts au chemin
SCRIPT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "src", "scripts")
if SCRIPT_DIR not in sys.path:
    sys.path.insert(0, SCRIPT_DIR)

from elo.ranking import RaceEntry, classify_dnf, compute_rank_keys, dedupe_best_by_driver, outcome
from elo.elo_math import expected_score, compute_course_update
from generate_sprint import rank_drivers
from generate_deuxieme_pilote import is_numeric_position, sort_teams
from generate_checkpoints import compute_checkpoint_laps


class TestEloRanking(unittest.TestCase):
    def test_expected_score_symmetry(self):
        self.assertAlmostEqual(expected_score(1000, 1000, 600), 0.5)
        self.assertAlmostEqual(expected_score(1200, 1000, 600) + expected_score(1000, 1200, 600), 1.0)

    def test_classify_dnf(self):
        self.assertEqual(classify_dnf("12", None), "finished")
        self.assertEqual(classify_dnf("DNF", "Collision damage"), "driver_dnf")
        self.assertEqual(classify_dnf("DNF", "Engine failure"), "mechanical_dnf")
        self.assertEqual(classify_dnf("DSQ", "Underweight car"), "other")

    def test_compute_course_update_conservation(self):
        entries = [
            RaceEntry("driver_a", "team1", "1", 58, "1", None),
            RaceEntry("driver_b", "team2", "2", 58, "2", None),
            RaceEntry("driver_c", "team1", "DNF", 10, "5", "Gearbox failure"),
        ]
        ranked = [compute_rank_keys(e) for e in entries]
        ratings = {"driver_a": 1000.0, "driver_b": 1000.0, "driver_c": 1000.0}
        rows, new_ratings = compute_course_update(ranked, ratings, k=50, scale=600)
        self.assertIn("driver_a", rows)
        self.assertNotIn("driver_c", new_ratings)  # mechanical_dnf exclu en amont
        self.assertGreater(new_ratings["driver_a"], 1000.0)
        self.assertLess(new_ratings["driver_b"], 1000.0)


class TestSprintRanking(unittest.TestCase):
    def test_rank_drivers_tiebreak(self):
        stats = {
            "driver1": {"name": "Driver One", "total": 10, "finishes": {1: 1, 2: 0}, "first_seen": {1: 0}},
            "driver2": {"name": "Driver Two", "total": 10, "finishes": {1: 0, 2: 1}, "first_seen": {2: 0}},
        }
        ranked = rank_drivers(stats)
        self.assertEqual(ranked[0][0], "driver1")


class TestDeuxiemePilote(unittest.TestCase):
    def test_sort_teams_single_vs_double(self):
        with_double = {"teamA": (4, 1), "teamB": (2, 3)}
        with_single = {"teamC": 1}
        sorted_teams = sort_teams(with_double, with_single)
        # teamB a un 2e pilote en P2, devant teamA (P4) et teamC (mono-pilote P1)
        self.assertEqual([t[0] for t in sorted_teams], ["teamB", "teamA", "teamC"])


class TestCheckpoints(unittest.TestCase):
    def test_compute_checkpoint_laps(self):
        cp = compute_checkpoint_laps(50)
        self.assertEqual(cp["lap1"], 1)
        self.assertEqual(cp["p10"], 5)
        self.assertEqual(cp["p50"], 25)
        self.assertEqual(cp["p90"], 45)


if __name__ == "__main__":
    unittest.main()
