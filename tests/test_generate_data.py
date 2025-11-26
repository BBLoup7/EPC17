import random
import unittest

from faker import Faker

from utils import generate_data


class GenerateDataTests(unittest.TestCase):
    def setUp(self) -> None:
        self.faker = Faker()
        self.faker.seed_instance(101)
        self.rng = random.Random(101)

    def test_participants_have_consistent_classes(self) -> None:
        participants = generate_data.generate_participants(
            self.faker,
            self.rng,
            total_count=50,
            class_pool=generate_data.CLASS_POOL,
        )
        self.assertEqual(50, len(participants))
        for participant in participants:
            classes = participant["selectedClasses"]
            self.assertGreaterEqual(len(classes), 2)
            self.assertTrue(set(classes).issubset(set(generate_data.CLASS_POOL)))
            self.assertEqual({}, participant["eventClasses"])
            self.assertIn("sledConfigurations", participant)

    def test_event_participant_links_are_bidirectional(self) -> None:
        participants = generate_data.generate_participants(
            self.faker,
            self.rng,
            total_count=80,
            class_pool=generate_data.CLASS_POOL,
        )
        series = generate_data.generate_series(
            self.faker,
            self.rng,
            class_pool=generate_data.CLASS_POOL,
            count=1,
        )
        events = generate_data.generate_events(
            self.faker,
            self.rng,
            participants,
            series,
            completed_count=1,
            upcoming_count=1,
            class_pool=generate_data.CLASS_POOL,
        )
        participants_by_id = {participant["id"]: participant for participant in participants}
        generate_data.link_participants_to_events(participants_by_id, events)

        for event_payload in events:
            event_classes = {cls["name"] for cls in event_payload.data["classes"]}
            assignments = event_payload.participant_class_map
            for participant_id, classes in assignments.items():
                participant = participants_by_id[participant_id]
                self.assertTrue(set(classes).issubset(set(participant["selectedClasses"])))
                self.assertTrue(set(classes).issubset(event_classes))
                self.assertIn(event_payload.data["id"], participant["eventClasses"])


if __name__ == "__main__":
    unittest.main()

