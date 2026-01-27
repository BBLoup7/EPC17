import unittest
from unittest.mock import patch

import server


class LaneStatsContextualEndpointTests(unittest.TestCase):
    def _make_stub_db(self):
        # Event 1: two effective heats (2-lane + 3-lane) + two solo heats (lane 1 + lane 4)
        heat_solo_lane_1 = {
            "id": "heat-solo-1",
            "status": "completed",
            "lanes": [{"lane": 1, "participant": {"id": "p1", "name": "Solo 1"}}],
            "results": [{"participantId": "p1", "position": 1}],
        }

        heat_two_lane = {
            "id": "heat-2-lane",
            "status": "completed",
            "lanes": [
                {"lane": 1, "participant": {"id": "p2", "name": "A"}},
                {"lane": 2, "participant": {"id": "p3", "name": "B"}},
            ],
            "results": [
                {"participantId": "p2", "position": 2},
                {"participantId": "p3", "position": 1},
            ],
        }

        heat_three_lane = {
            "id": "heat-3-lane",
            "status": "completed",
            "lanes": [
                {"lane": 1, "participant": {"id": "p4", "name": "C"}},
                {"lane": 2, "participant": {"id": "p5", "name": "D"}},
                {"lane": 3, "participant": {"id": "p6", "name": "E"}},
            ],
            "results": [
                {"participantId": "p4", "position": 2},
                {"participantId": "p5", "position": 3},
                {"participantId": "p6", "position": 1},
            ],
        }

        heat_solo_lane_4 = {
            "id": "heat-solo-4",
            "status": "completed",
            "lanes": [{"lane": 4, "participant": {"id": "p7", "name": "Solo 4"}}],
            "results": [{"participantId": "p7", "position": "1"}],  # string to cover parser
        }

        bracket_event_1 = {
            "eventId": "event-1",
            "classes": {
                "Class A": {
                    "rounds": [
                        {
                            "roundNumber": 1,
                            "heats": [
                                heat_solo_lane_1,
                                heat_two_lane,
                                heat_three_lane,
                                heat_solo_lane_4,
                            ],
                        }
                    ]
                }
            },
        }

        # Event 2: one effective 2-lane heat
        heat_event_2 = {
            "id": "heat-event-2",
            "status": "completed",
            "lanes": [
                {"lane": 1, "participant": {"id": "p8", "name": "F"}},
                {"lane": 2, "participant": {"id": "p9", "name": "G"}},
            ],
            "results": [
                {"participantId": "p8", "position": 1},
                {"participantId": "p9", "position": 2},
            ],
        }

        bracket_event_2 = {
            "eventId": "event-2",
            "classes": {"Class B": {"rounds": [{"roundNumber": 1, "heats": [heat_event_2]}]}},
        }

        class StubDB:
            def get_race_brackets(self):
                return [bracket_event_1, bracket_event_2]

        return StubDB()

    def test_lane_stats_contextual_all_events(self) -> None:
        with patch.object(server, "get_db_manager", return_value=self._make_stub_db()):
            client = server.app.test_client()
            res = client.get("/api/stats/lane")
            self.assertEqual(200, res.status_code)

            data = res.get_json()
            self.assertIn("laneStats", data)
            self.assertIn("laneContextualStats", data)
            self.assertIn("meta", data)

            raw_by_lane = {str(row["lane"]): row for row in (data["laneStats"] or [])}
            ctx_by_lane = {str(row["lane"]): row for row in (data["laneContextualStats"] or [])}

            # --- Meta ---
            self.assertEqual(2, data["meta"]["totalSoloHeats"])
            self.assertEqual(3, data["meta"]["totalEffectiveHeats"])
            self.assertEqual(7, data["meta"]["totalEffectiveLaneAppearances"])
            self.assertEqual(10, data["meta"]["minEffectiveRacesForRanking"])

            # --- Raw Stats (Unadjusted) ---
            self.assertEqual({"1", "2", "3", "4"}, set(raw_by_lane.keys()))
            self.assertEqual(4, raw_by_lane["1"]["totalRaces"])
            self.assertEqual(2, raw_by_lane["1"]["wins"])
            self.assertEqual(50.0, raw_by_lane["1"]["winRate"])

            self.assertEqual(3, raw_by_lane["2"]["totalRaces"])
            self.assertEqual(1, raw_by_lane["2"]["wins"])
            self.assertEqual(33.3, raw_by_lane["2"]["winRate"])

            # --- Contextual Stats (Effective) ---
            self.assertEqual({"1", "2", "3", "4"}, set(ctx_by_lane.keys()))

            # Lane 1: 1 solo + 3 effective; expected wins = 1/2 + 1/3 + 1/2 = 1.3333
            lane1 = ctx_by_lane["1"]
            self.assertEqual(1, lane1["soloRaces"])
            self.assertEqual(3, lane1["effectiveRaces"])
            self.assertEqual(1, lane1["effectiveWins"])
            self.assertAlmostEqual(1.3333, lane1["expectedWins"], places=4)
            self.assertAlmostEqual(0.75, lane1["performanceIndex"], places=3)
            self.assertAlmostEqual(0.4286, lane1["usageShare"], places=4)
            self.assertEqual("LOW", lane1["confidence"])
            self.assertTrue(lane1["excludedFromRanking"])

            # Lane 2: same expected as lane 1; 1 win over expectation -> 0.75 PI
            lane2 = ctx_by_lane["2"]
            self.assertEqual(0, lane2["soloRaces"])
            self.assertEqual(3, lane2["effectiveRaces"])
            self.assertEqual(1, lane2["effectiveWins"])
            self.assertAlmostEqual(1.3333, lane2["expectedWins"], places=4)
            self.assertAlmostEqual(0.75, lane2["performanceIndex"], places=3)
            self.assertAlmostEqual(0.4286, lane2["usageShare"], places=4)
            self.assertEqual("LOW", lane2["confidence"])
            self.assertTrue(lane2["excludedFromRanking"])

            # Lane 3: only in the 3-lane heat -> expected 0.3333, 1 win -> PI 3.0
            lane3 = ctx_by_lane["3"]
            self.assertEqual(0, lane3["soloRaces"])
            self.assertEqual(1, lane3["effectiveRaces"])
            self.assertEqual(1, lane3["effectiveWins"])
            self.assertAlmostEqual(0.3333, lane3["expectedWins"], places=4)
            self.assertAlmostEqual(3.0, lane3["performanceIndex"], places=3)
            self.assertAlmostEqual(0.1429, lane3["usageShare"], places=4)
            self.assertEqual("LOW", lane3["confidence"])
            self.assertTrue(lane3["excludedFromRanking"])

            # Lane 4: solo only -> excluded from performance calcs (no expected wins)
            lane4 = ctx_by_lane["4"]
            self.assertEqual(1, lane4["soloRaces"])
            self.assertEqual(0, lane4["effectiveRaces"])
            self.assertEqual(0, lane4["effectiveWins"])
            self.assertAlmostEqual(0.0, lane4["expectedWins"], places=4)
            self.assertIsNone(lane4["performanceIndex"])
            self.assertAlmostEqual(0.0, lane4["usageShare"], places=4)
            self.assertEqual("LOW", lane4["confidence"])
            self.assertTrue(lane4["excludedFromRanking"])

    def test_lane_stats_contextual_event_filter(self) -> None:
        with patch.object(server, "get_db_manager", return_value=self._make_stub_db()):
            client = server.app.test_client()
            res = client.get("/api/stats/lane/event-1")
            self.assertEqual(200, res.status_code)

            data = res.get_json()
            raw_by_lane = {str(row["lane"]): row for row in (data["laneStats"] or [])}
            ctx_by_lane = {str(row["lane"]): row for row in (data["laneContextualStats"] or [])}

            # Event 1 only -> effective lane appearances = 2 + 3 = 5
            self.assertEqual(2, data["meta"]["totalSoloHeats"])
            self.assertEqual(2, data["meta"]["totalEffectiveHeats"])
            self.assertEqual(5, data["meta"]["totalEffectiveLaneAppearances"])

            # Raw lane 1 should be 3 races, 1 win (solo counts in raw)
            self.assertEqual(3, raw_by_lane["1"]["totalRaces"])
            self.assertEqual(1, raw_by_lane["1"]["wins"])

            # Contextual lane 4 remains solo-only for event 1
            self.assertEqual(1, ctx_by_lane["4"]["soloRaces"])
            self.assertEqual(0, ctx_by_lane["4"]["effectiveRaces"])
            self.assertIsNone(ctx_by_lane["4"]["performanceIndex"])


if __name__ == "__main__":
    unittest.main()

