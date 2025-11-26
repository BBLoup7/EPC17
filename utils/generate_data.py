#!/usr/bin/env python3
"""
EPC17 Synthetic Data Generator
==============================

This script rebuilds the EPC17 SQLite database with realistic,
relationship-safe seed data for development and demo environments.

Features
--------
* Generates a configurable number of drivers with persistent sled classes.
* Creates multiple series and 60 events (40 completed, 20 upcoming).
* Ensures each event has 2-4 classes, 40-80 drivers, and bidirectional links.
* Simulates race results for all completed events.
* Generates Race Brackets for completed events to enable analytics/results views.

Usage
-----
    python utils/generate_data.py --force-reset
"""

from __future__ import annotations

import argparse
import os
import random
import sys
import uuid
import json
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Dict, List, Sequence, Tuple

from faker import Faker

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(CURRENT_DIR, os.pardir))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from utils.db_manager import DatabaseManager

CLASS_POOL = [
    "Stock 600",
    "Pro 600",
    "Open Mod",
    "Pro Women",
    "Junior 500",
    "Vintage 440",
    "Factory Stock",
    "Trail Sport",
]

SLED_BRANDS = ["Polaris", "Arctic Cat", "Ski-Doo", "Yamaha"]
SLED_MODELS = [
    "Cross Country",
    "MXZ X",
    "ZR 6000R",
    "Sidewinder SRX",
    "Rush Pro-S",
    "Pro X 600",
]

DEFAULT_SEED = 8723
DEFAULT_DRIVER_COUNT = 320
DEFAULT_COMPLETED_EVENTS = 40
DEFAULT_UPCOMING_EVENTS = 20
DEFAULT_SERIES_COUNT = 2
MIN_EVENT_DRIVERS = 40
MAX_EVENT_DRIVERS = 80


@dataclass
class EventPayload:
    """In-memory representation that keeps participant/class map before persistence."""

    data: Dict
    participant_class_map: Dict[str, List[str]]


def reset_database_file(db_path: str) -> None:
    """
    Delete the SQLite database (and auxiliary files) to guarantee a clean state.
    """
    base, ext = os.path.splitext(db_path)
    wal_path = f"{db_path}-wal"
    shm_path = f"{db_path}-shm"

    for path in (db_path, wal_path, shm_path):
        if os.path.exists(path):
            os.remove(path)
            print(f"[INFO] Deleted {path}")


def build_sled_configuration(rng: random.Random, classes: Sequence[str]) -> Dict:
    """Create a deterministic sled inventory for the driver."""
    primary_class = classes[0]
    secondary_class = classes[-1]
    return {
        "primary": {
            "brand": rng.choice(SLED_BRANDS),
            "model": rng.choice(SLED_MODELS),
            "class": primary_class,
            "horsepower": rng.randint(120, 220),
        },
        "backup": {
            "brand": rng.choice(SLED_BRANDS),
            "model": rng.choice(SLED_MODELS),
            "class": secondary_class,
            "horsepower": rng.randint(115, 210),
        },
    }


def generate_participants(
    faker: Faker,
    rng: random.Random,
    total_count: int,
    class_pool: Sequence[str],
) -> List[Dict]:
    """
    Build participant records with persistent sled classes.
    """
    participants: List[Dict] = []
    for _ in range(total_count):
        participant_id = str(uuid.uuid4())
        class_count = rng.randint(2, min(3, len(class_pool)))
        driver_classes = rng.sample(class_pool, class_count)
        wins = rng.randint(0, 20)
        podiums = rng.randint(wins, wins + 15)

        participant = {
            "id": participant_id,
            "name": faker.name(),
            "nickname": faker.first_name(),
            "dob": faker.date_of_birth(minimum_age=18, maximum_age=55).isoformat(),
            "racingNumber": str(rng.randint(10, 999)),
            "registrationType": rng.choice(["season-pass", "event-pass"]),
            "registrationDate": faker.date_this_year(before_today=True, after_today=False).isoformat(),
            "paymentStatus": rng.choice(["paid", "pending", "sponsored"]),
            "status": "active",
            "totalFee": float(rng.randint(600, 1600)),
            "contact": {
                "email": faker.email(),
                "phone": faker.phone_number(),
                "emergency": {
                    "name": faker.name(),
                    "phone": faker.phone_number(),
                },
            },
            "sponsors": [faker.company() for _ in range(rng.randint(0, 2))],
            "sledConfigurations": build_sled_configuration(rng, driver_classes),
            "statistics": {
                "careerStarts": rng.randint(20, 180),
                "careerWins": wins,
                "careerPodiums": podiums,
                "dqs": rng.randint(0, 3),
                "bestReaction": round(rng.uniform(0.04, 0.18), 3),
            },
            "selectedClasses": driver_classes,
            "eventClasses": {},
            "_searchText": "",
            "_migrated": 0,
            "_migrationDate": "",
        }
        participants.append(participant)
    return participants


def generate_series(
    faker: Faker,
    rng: random.Random,
    class_pool: Sequence[str],
    count: int,
) -> List[Dict]:
    """
    Create high-level racing series that events can belong to.
    """
    series_list: List[Dict] = []
    current_year = datetime.now().year
    for _ in range(count):
        series_id = str(uuid.uuid4())
        series = {
            "id": series_id,
            "name": f"{faker.city()} Championship Series",
            "description": faker.sentence(nb_words=12),
            "sledClasses": list(class_pool),
            "events": [],
            "standings": [],
            "seasons": [
                {
                    "id": str(uuid.uuid4()),
                    "year": current_year,
                    "status": "active",
                }
            ],
            "status": "active",
            "registrationFee": rng.randint(250, 750),
            "createdAt": datetime.now().isoformat(),
            "updatedAt": datetime.now().isoformat(),
        }
        series_list.append(series)
    return series_list


def _pick_event_classes(
    rng: random.Random,
    class_pool: Sequence[str],
    attempts: int = 8,
) -> List[str]:
    for _ in range(attempts):
        class_count = rng.randint(2, min(4, len(class_pool)))
        yield rng.sample(class_pool, class_count)


def _assign_event_participants(
    rng: random.Random,
    participants: Sequence[Dict],
    class_options: Sequence[str],
    min_drivers: int,
    max_drivers: int,
) -> Tuple[List[str], Dict[str, List[str]]]:
    eligible = [
        participant
        for participant in participants
        if set(participant["selectedClasses"]).intersection(class_options)
    ]

    if len(eligible) < min_drivers:
        raise ValueError(
            f"Not enough eligible drivers ({len(eligible)}) for classes {class_options}"
        )

    target = rng.randint(min_drivers, min(max_drivers, len(eligible)))
    selected = rng.sample(eligible, target)

    assignments: Dict[str, List[str]] = {}
    participant_ids: List[str] = []
    for participant in selected:
        intersected = sorted(set(participant["selectedClasses"]).intersection(class_options))
        assignments[participant["id"]] = intersected
        participant_ids.append(participant["id"])
    return participant_ids, assignments


def generate_events(
    faker: Faker,
    rng: random.Random,
    participants: Sequence[Dict],
    series_list: List[Dict],
    completed_count: int,
    upcoming_count: int,
    class_pool: Sequence[str],
) -> List[EventPayload]:
    """
    Build completed and upcoming events with linked drivers.
    """
    events: List[EventPayload] = []
    total_events = completed_count + upcoming_count
    today = datetime.now()

    for index in range(total_events):
        is_completed = index < completed_count

        if is_completed:
            event_date = today - timedelta(days=rng.randint(10, 320))
            status = "completed"
            registration_open = False
        else:
            event_date = today + timedelta(days=rng.randint(7, 200))
            status = "upcoming"
            registration_open = True

        chosen_classes: List[str] | None = None
        assignments: Tuple[List[str], Dict[str, List[str]]] | None = None

        for class_choice in _pick_event_classes(rng, class_pool):
            try:
                assignments = _assign_event_participants(
                    rng,
                    participants,
                    class_choice,
                    MIN_EVENT_DRIVERS,
                    MAX_EVENT_DRIVERS,
                )
                chosen_classes = list(class_choice)
                break
            except ValueError:
                continue

        if not chosen_classes or assignments is None:
            raise RuntimeError("Unable to build an event with enough eligible participants.")

        participant_ids, participant_class_map = assignments
        classes_payload = [
            {
                "id": f"{cls.lower().replace(' ', '-')}",
                "name": cls,
                "maxParticipants": MAX_EVENT_DRIVERS,
                "purse": rng.randint(2500, 14000),
                "qualifyingRuns": rng.randint(1, 3),
            }
            for cls in chosen_classes
        ]

        city = faker.city()
        name = f"{city} Snow Shootout"

        series = rng.choice(series_list)
        event_id = str(uuid.uuid4())
        series["events"].append(event_id)

        event_data = {
            "id": event_id,
            "name": name,
            "eventName": name,
            "date": event_date.isoformat(),
            "location": f"{city}, {faker.state()}",
            "seriesId": series["id"],
            "seasonId": series["seasons"][0]["id"],
            "numberOfTracks": rng.randint(2, 4),
            "eliminationType": rng.choice(["double", "single"]),
            "trackSurface": rng.choice(["ice", "snow"]),
            "weatherContingency": rng.choice(["proceed", "delay", "reschedule"]),
            "driverMeetingTime": "07:30",
            "maxParticipants": MAX_EVENT_DRIVERS,
            "currentParticipants": len(participant_ids),
            "participants": participant_ids,
            "classes": classes_payload,
            "status": status,
            "registrationOpen": registration_open,
            "requiresClassSeparation": True,
            "freeRunEnabled": rng.choice([True, False]),
            "createdAt": datetime.now().isoformat(),
            "updatedAt": datetime.now().isoformat(),
        }

        events.append(EventPayload(event_data, participant_class_map))

    return events


def link_participants_to_events(
    participants_by_id: Dict[str, Dict],
    events: Sequence[EventPayload],
) -> None:
    """
    Populate participant.eventClasses with per-event assignments.
    """
    for event_payload in events:
        event_id = event_payload.data["id"]
        for participant_id, event_classes in event_payload.participant_class_map.items():
            participant = participants_by_id.get(participant_id)
            if not participant:
                continue
            participant.setdefault("eventClasses", {})
            participant["eventClasses"][event_id] = event_classes


def generate_races(
    rng: random.Random,
    events: Sequence[EventPayload],
) -> List[Dict]:
    """
    Create a single final-round race per class for completed events.
    """
    races: List[Dict] = []
    for event_payload in events:
        event = event_payload.data
        if event["status"] != "completed":
            continue

        event_date = datetime.fromisoformat(event["date"])
        start_time = (event_date + timedelta(hours=9)).isoformat()
        end_time = (event_date + timedelta(hours=17)).isoformat()

        for cls in event["classes"]:
            class_name = cls["name"]
            class_participants = [
                pid
                for pid, classes in event_payload.participant_class_map.items()
                if class_name in classes
            ]
            if len(class_participants) < 2:
                continue

            rng.shuffle(class_participants)
            base_elapsed = rng.uniform(7.4, 8.9)
            results = []
            fastest_time = None

            for position, participant_id in enumerate(class_participants, start=1):
                elapsed_time = round(base_elapsed + (position - 1) * 0.03 + rng.uniform(-0.02, 0.02), 3)
                fastest_time = elapsed_time if fastest_time is None else min(fastest_time, elapsed_time)
                results.append(
                    {
                        "participantId": participant_id,
                        "position": position,
                        "reaction": round(rng.uniform(0.04, 0.25), 3),
                        "elapsed": elapsed_time,
                        "speedMph": round(rng.uniform(92.0, 121.0), 1),
                        "status": "finished",
                    }
                )

            race = {
                "id": str(uuid.uuid4()),
                "eventId": event["id"],
                "bracketId": None,
                "className": class_name,
                "roundNumber": 1,
                "matchNumber": 1,
                "bracketType": event["eliminationType"],
                "roundName": "Final",
                "status": "completed",
                "startTime": start_time,
                "endTime": end_time,
                "results": results,
                "statistics": {
                    "fastestTime": fastest_time,
                    "averageTime": round(sum(r["elapsed"] for r in results) / len(results), 3),
                    "entries": len(results),
                },
                "createdAt": datetime.now().isoformat(),
                "updatedAt": datetime.now().isoformat(),
            }
            races.append(race)
    return races


def generate_race_brackets(
    rng: random.Random,
    participants_by_id: Dict[str, Dict],
    events: Sequence[EventPayload],
    races: Sequence[Dict],
) -> List[Dict]:
    """
    Generate race brackets for completed events using the generated races.
    """
    brackets: List[Dict] = []
    
    # Group races by eventId and className
    races_by_event_class: Dict[str, Dict[str, List[Dict]]] = {}
    for race in races:
        event_id = race["eventId"]
        class_name = race["className"]
        if event_id not in races_by_event_class:
            races_by_event_class[event_id] = {}
        if class_name not in races_by_event_class[event_id]:
            races_by_event_class[event_id][class_name] = []
        races_by_event_class[event_id][class_name].append(race)

    for event_payload in events:
        event = event_payload.data
        if event["status"] != "completed":
            continue
            
        event_id = event["id"]
        bracket_id = str(uuid.uuid4())
        
        classes_data = {}
        
        # Create bracket data for each class in the event
        for cls in event["classes"]:
            class_name = cls["name"]
            class_id = cls["id"]
            
            # Get participants for this class
            class_participant_ids = [
                pid
                for pid, classes in event_payload.participant_class_map.items()
                if class_name in classes
            ]
            
            # Map to full participant objects (required for results display)
            class_participants = []
            for pid in class_participant_ids:
                p = participants_by_id.get(pid)
                if p:
                    class_participants.append(p)
            
            # Get races for this class
            class_races = races_by_event_class.get(event_id, {}).get(class_name, [])
            
            # Create a single round (Final) containing these races as heats
            rounds = []
            if class_races:
                rounds.append({
                    "id": str(uuid.uuid4()),
                    "roundNumber": 1, 
                    "name": "Final",
                    "isComplete": True,
                    "heats": class_races
                })
            
            classes_data[class_id] = {
                "id": class_id,
                "name": class_name,
                "participants": class_participants,
                "rounds": rounds,
                "isComplete": True
            }

        bracket = {
            "id": bracket_id,
            "eventId": event_id,
            "classes": classes_data,
            "participants": event["participants"],
            "isComplete": True,
            "createdAt": event["createdAt"],
            "updatedAt": event["updatedAt"]
        }
        brackets.append(bracket)
        
    return brackets


def persist_records(
    db_path: str,
    participants: Sequence[Dict],
    series_list: Sequence[Dict],
    events: Sequence[EventPayload],
    races: Sequence[Dict],
    brackets: Sequence[Dict],
) -> None:
    """
    Persist generated data via DatabaseManager using batch operations.
    """
    db_manager = DatabaseManager(db_path=db_path)
    
    print(f"[INFO] Persisting {len(participants)} participants...")
    # Process participants in batches of 100 to show progress
    batch_size = 100
    for i in range(0, len(participants), batch_size):
        batch = participants[i:i + batch_size]
        if not db_manager.add_participants_batch(batch):
            raise RuntimeError(f"Failed to insert participant batch {i // batch_size + 1}")
        print(f"  - Saved {min(i + batch_size, len(participants))}/{len(participants)} participants")

    print(f"[INFO] Persisting {len(series_list)} series...")
    if not db_manager.add_series_batch(series_list):
        raise RuntimeError("Failed to insert series batch")

    print(f"[INFO] Persisting {len(events)} events...")
    event_data_list = [dict(e.data) for e in events]
    # Process events in batches
    for i in range(0, len(event_data_list), batch_size):
        batch = event_data_list[i:i + batch_size]
        if not db_manager.add_events_batch(batch):
            raise RuntimeError(f"Failed to insert event batch {i // batch_size + 1}")
        print(f"  - Saved {min(i + batch_size, len(event_data_list))}/{len(event_data_list)} events")

    print(f"[INFO] Persisting {len(races)} races...")
    # Process races in batches
    for i in range(0, len(races), batch_size):
        batch = races[i:i + batch_size]
        if not db_manager.add_races_batch(batch):
            raise RuntimeError(f"Failed to insert race batch {i // batch_size + 1}")
        print(f"  - Saved {min(i + batch_size, len(races))}/{len(races)} races")
        
    print(f"[INFO] Persisting {len(brackets)} race brackets...")
    for bracket in brackets:
        if not db_manager.add_race_bracket(bracket):
             # Don't raise error here, just log, as brackets are complex
            print(f"[WARNING] Failed to insert bracket for event {bracket['eventId']}")

    print(f"[SUCCESS] Persisted {len(participants)} participants, {len(events)} events, {len(races)} races, and {len(brackets)} brackets.")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate realistic EPC17 seed data.")
    parser.add_argument("--db-path", default="data/epc17.db", help="Path to the SQLite database file.")
    parser.add_argument("--drivers", type=int, default=DEFAULT_DRIVER_COUNT, help="Number of drivers to create.")
    parser.add_argument(
        "--completed-events",
        type=int,
        default=DEFAULT_COMPLETED_EVENTS,
        help="Number of completed events to simulate.",
    )
    parser.add_argument(
        "--upcoming-events",
        type=int,
        default=DEFAULT_UPCOMING_EVENTS,
        help="Number of upcoming events to schedule.",
    )
    parser.add_argument("--series-count", type=int, default=DEFAULT_SERIES_COUNT, help="Number of active series.")
    parser.add_argument("--seed", type=int, default=DEFAULT_SEED, help="Seed for deterministic output.")
    parser.add_argument(
        "--force-reset",
        action="store_true",
        help="Delete existing database files before generating data.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    rng = random.Random(args.seed)
    faker = Faker()
    faker.seed_instance(args.seed)

    try:
        if args.force_reset:
            reset_database_file(args.db_path)

        participants = generate_participants(faker, rng, args.drivers, CLASS_POOL)
        series_list = generate_series(faker, rng, CLASS_POOL, args.series_count)
        events = generate_events(
            faker,
            rng,
            participants,
            series_list,
            args.completed_events,
            args.upcoming_events,
            CLASS_POOL,
        )

        participants_by_id = {participant["id"]: participant for participant in participants}
        link_participants_to_events(participants_by_id, events)
        races = generate_races(rng, events)
        
        # Generate brackets
        brackets = generate_race_brackets(rng, participants_by_id, events, races)
        
        persist_records(args.db_path, participants, series_list, events, races, brackets)

        print(
            "[SUMMARY] Drivers: {drivers}, Events: {events}, "
            "Completed: {completed}, Upcoming: {upcoming}, Races: {races}, Brackets: {brackets}".format(
                drivers=len(participants),
                events=len(events),
                completed=args.completed_events,
                upcoming=args.upcoming_events,
                races=len(races),
                brackets=len(brackets)
            )
        )
    except Exception as exc:  # noqa: BLE001
        print(f"[ERROR] Data generation failed: {exc}")
        raise


if __name__ == "__main__":
    main()
