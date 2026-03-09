import unittest
from unittest.mock import patch

import server


class HeatCompletionTests(unittest.TestCase):
    def test_is_heat_completed_status_completed_with_results(self) -> None:
        heat = {"status": "completed", "results": [{"participantId": "p1", "position": 1}]}
        self.assertTrue(server.is_heat_completed(heat))

    def test_is_heat_completed_status_completed_without_results(self) -> None:
        heat = {"status": "completed", "results": []}
        self.assertFalse(server.is_heat_completed(heat))

    def test_is_heat_completed_legacy_isComplete_true(self) -> None:
        heat = {"isComplete": True}
        self.assertTrue(server.is_heat_completed(heat))

    def test_is_heat_completed_incomplete_heat(self) -> None:
        heat = {"status": "active", "results": [{"participantId": "p1", "position": 1}]}
        self.assertFalse(server.is_heat_completed(heat))


class DriverStatsEndpointTests(unittest.TestCase):
    def test_driver_stats_counts_completed_heats_and_ignores_non_numeric_positions(self) -> None:
        driver_id = "driver-1"

        class StubDB:
            def get_participant(self, participant_id):
                if participant_id != driver_id:
                    return None
                return {"id": driver_id, "name": "Test Driver"}

            def get_race_brackets(self):
                return [
                    {
                        "eventId": "event-1",
                        "classes": {
                            "Class A": {
                                "rounds": [
                                    {
                                        "roundNumber": 1,
                                        "heats": [
                                            {
                                                "id": "heat-1",
                                                "status": "completed",
                                                "completedAt": "2026-01-01T00:00:01",
                                                "lanes": [
                                                    {"lane": 1, "participant": {"id": driver_id, "name": "Test Driver"}},
                                                    {"lane": 2, "participant": {"id": "other-1", "name": "Other"}},
                                                ],
                                                "results": [
                                                    {"participantId": driver_id, "position": 1},
                                                    {"participantId": "other-1", "position": 2},
                                                ],
                                            },
                                            {
                                                "id": "heat-2",
                                                "status": "completed",
                                                "completedAt": "2026-01-01T00:00:02",
                                                "lanes": [
                                                    {"lane": 2, "participantId": driver_id},
                                                    {"lane": 1, "participantId": "other-2"},
                                                ],
                                                "results": [
                                                    {"participantId": driver_id, "position": "FS"},
                                                    {"participantId": "other-2", "position": 1},
                                                ],
                                            },
                                        ],
                                    }
                                ]
                            }
                        },
                    }
                ]

        with patch.object(server, "get_db_manager", return_value=StubDB()):
            client = server.app.test_client()
            res = client.get(f"/api/stats/driver/{driver_id}")
            self.assertEqual(200, res.status_code)

            data = res.get_json()
            self.assertEqual(driver_id, data["driverId"])
            self.assertEqual("Test Driver", data["driverName"])

            # Two completed heats found for the driver.
            self.assertEqual(2, data["totalRaces"])
            # One numeric win (position == 1); FS should not count.
            self.assertEqual(1, data["totalWins"])
            # Average position should only consider numeric positions (>0).
            self.assertEqual(1.0, data["avgPosition"])

            lane_perf = data["lanePerformance"]
            self.assertIn("1", lane_perf)  # JSON keys become strings
            self.assertIn("2", lane_perf)

            achievements = data.get("achievements")
            self.assertIsInstance(achievements, dict)
            self.assertEqual(10, achievements.get("total"))
            earned_ids = {a.get("id") for a in achievements.get("earned", [])}
            self.assertIn("first_win", earned_ids)


if __name__ == "__main__":
    unittest.main()

