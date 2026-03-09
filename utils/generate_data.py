#!/usr/bin/env python3
"""
Issue #123 API-driven EPC17 load simulator.

Generates realistic large-scale data by using EPC17 API routes instead of direct DB inserts:
- 1 series
- 40 events (default: 25 completed, 15 upcoming)
- 50-100 unique drivers per event
- 70-250 registrations per event (rare high-load events can reach ~300)
- Mostly 3 lanes, mostly double elimination
- Stable driver class profiles across all events
"""

from __future__ import annotations

import argparse
import json
import os
import random
import string
import sys
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Dict, Iterable, List, Optional, Sequence, Set, Tuple

import requests
from faker import Faker

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(CURRENT_DIR, os.pardir))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from utils.db_manager import DatabaseManager

DEFAULT_SEED = 12317
DEFAULT_BASE_URL = "http://localhost:5000"
DEFAULT_TOTAL_EVENTS = 40
DEFAULT_COMPLETED_EVENTS = 25
DEFAULT_UPCOMING_EVENTS = 15
DEFAULT_DRIVER_POOL = 520
MIN_UNIQUE_DRIVERS = 50
MAX_UNIQUE_DRIVERS = 100
MIN_REGISTRATIONS = 70
MAX_REGISTRATIONS = 250
RARE_PEAK_REGISTRATIONS = 300

ARCHETYPE_BALANCED = "balanced-default"
ARCHETYPE_HIGH = "high-class"
ARCHETYPE_LOW = "low-key"

CLASS_CATALOG = [
    "600 stock",
    "600 improve",
    "600 pro-stock",
    "800 stock",
    "800 improve",
    "800 pro-stock",
    "1000 stock",
    "1000 improve",
    "1000 pro-stock",
    "4 temps",
    "pro-stock",
    "pro mod",
    "outlaw",
]

STOCK_CLASSES = {"600 stock", "800 stock", "1000 stock"}
BIG_CLASSES = {"1000 stock", "1000 improve", "1000 pro-stock", "pro mod", "outlaw"}
OPEN_CLASSES = {"4 temps", "pro-stock", "pro mod", "outlaw"}
DISPLACEMENT_CLASSES = {
    "600": {"600 stock", "600 improve", "600 pro-stock"},
    "800": {"800 stock", "800 improve", "800 pro-stock"},
    "1000": {"1000 stock", "1000 improve", "1000 pro-stock"},
}

SLED_BRANDS = ["Polaris", "Arctic Cat", "Ski-Doo", "Yamaha", "Lynx"]
SLED_MODELS = [
    "Cross Country",
    "MXZ X",
    "ZR 6000R",
    "Sidewinder SRX",
    "Rush Pro-S",
    "Pro X 600",
    "Renegade Adrenaline",
]


@dataclass
class DriverProfile:
    participant: Dict
    profile_classes: List[str]


@dataclass
class EventSpec:
    index: int
    name: str
    status: str
    archetype: str
    event_date: datetime
    lane_count: int
    elimination_type: str
    class_names: List[str]
    unique_driver_target: int
    registration_target: int
    is_peak_load: bool
    event_id: Optional[str] = None


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def class_slug(name: str) -> str:
    cleaned = "".join(ch if ch.isalnum() else "-" for ch in name.lower())
    while "--" in cleaned:
        cleaned = cleaned.replace("--", "-")
    return cleaned.strip("-")


def reset_database_file(db_path: str) -> None:
    wal_path = f"{db_path}-wal"
    shm_path = f"{db_path}-shm"
    for path in (db_path, wal_path, shm_path):
        if os.path.exists(path):
            os.remove(path)
            print(f"[INFO] Deleted {path}")


def weighted_choice(rng: random.Random, weighted_values: Sequence[Tuple[str, float]]) -> str:
    values = [v for v, _ in weighted_values]
    weights = [w for _, w in weighted_values]
    return rng.choices(values, weights=weights, k=1)[0]


def choose_event_archetype(rng: random.Random) -> str:
    return weighted_choice(
        rng,
        [
            (ARCHETYPE_BALANCED, 0.68),
            (ARCHETYPE_HIGH, 0.17),
            (ARCHETYPE_LOW, 0.15),
        ],
    )


def choose_event_classes(archetype: str, rng: random.Random) -> List[str]:
    if archetype == ARCHETYPE_HIGH:
        pool = [c for c in CLASS_CATALOG if c not in STOCK_CLASSES]
        target_count = rng.randint(max(6, len(pool) - 3), len(pool))
        selected = rng.sample(pool, target_count)
        return sorted(selected)

    if archetype == ARCHETYPE_LOW:
        pool = [c for c in CLASS_CATALOG if c not in BIG_CLASSES]
        target_count = rng.randint(max(5, len(pool) - 2), len(pool))
        selected = rng.sample(pool, target_count)
        # Low-key still keeps some stock classes frequently.
        if not any(c in STOCK_CLASSES for c in selected):
            selected.append(rng.choice(list(STOCK_CLASSES)))
        return sorted(set(selected))

    non_stock = [c for c in CLASS_CATALOG if c not in STOCK_CLASSES]
    selected = set(non_stock)
    # Stock classes are optional in balanced events.
    for stock in STOCK_CLASSES:
        if rng.random() < 0.45:
            selected.add(stock)
    # Keep class counts realistic.
    if len(selected) > 11:
        selected = set(rng.sample(sorted(selected), 11))
    if len(selected) < 7:
        selected.update(rng.sample(CLASS_CATALOG, 7 - len(selected)))
    return sorted(selected)


def choose_lane_count(rng: random.Random) -> int:
    return rng.choices([3, 2, 4], weights=[0.75, 0.22, 0.03], k=1)[0]


def choose_elimination_type(
    lane_count: int,
    is_peak_load: bool,
    force_single: bool,
    rng: random.Random,
) -> str:
    if force_single and lane_count == 2:
        return "single"
    # Custom elimination is intentionally near-zero here.
    if lane_count == 2 and is_peak_load and rng.random() < 0.15:
        return "single"
    return "double"


def build_sled_configuration(rng: random.Random, classes: Sequence[str]) -> Dict:
    primary_class = classes[0] if classes else rng.choice(CLASS_CATALOG)
    secondary_class = classes[-1] if classes else primary_class
    return {
        "primary": {
            "brand": rng.choice(SLED_BRANDS),
            "model": rng.choice(SLED_MODELS),
            "class": primary_class,
            "horsepower": rng.randint(120, 240),
        },
        "backup": {
            "brand": rng.choice(SLED_BRANDS),
            "model": rng.choice(SLED_MODELS),
            "class": secondary_class,
            "horsepower": rng.randint(110, 230),
        },
    }


def build_driver_class_profile(rng: random.Random) -> List[str]:
    # Keep displacement consistency: drivers stay in one displacement family,
    # with optional open classes for advanced profiles.
    if rng.random() < 0.12:
        open_count = rng.randint(1, 3)
        pool = ["4 temps", "pro-stock", "pro mod", "outlaw"]
        return sorted(rng.sample(pool, open_count))

    displacement = weighted_choice(
        rng,
        [("600", 0.38), ("800", 0.40), ("1000", 0.22)],
    )
    family = list(DISPLACEMENT_CLASSES[displacement])
    profile_type = weighted_choice(
        rng,
        [("novice", 0.34), ("intermediate", 0.42), ("pro", 0.24)],
    )

    if profile_type == "novice":
        classes = [c for c in family if "stock" in c]
        if rng.random() < 0.45:
            classes.append([c for c in family if "improve" in c][0])
    elif profile_type == "intermediate":
        classes = [c for c in family if ("improve" in c or "pro-stock" in c)]
        if rng.random() < 0.20:
            classes.append([c for c in family if "stock" in c][0])
    else:
        classes = [c for c in family if "pro-stock" in c]
        if rng.random() < 0.65:
            classes.append([c for c in family if "improve" in c][0])
        if rng.random() < 0.22:
            classes.append("pro-stock")
        if rng.random() < 0.10:
            classes.append("4 temps")

    return sorted(set(classes))


def generate_driver_profiles(
    faker: Faker,
    rng: random.Random,
    driver_count: int,
) -> List[DriverProfile]:
    profiles: List[DriverProfile] = []
    used_numbers: Set[str] = set()

    for _ in range(driver_count):
        profile_classes = build_driver_class_profile(rng)
        number = str(rng.randint(10, 9999))
        while number in used_numbers:
            number = str(rng.randint(10, 9999))
        used_numbers.add(number)

        participant = {
            "name": faker.name(),
            "nickname": faker.first_name(),
            "dob": faker.date_of_birth(minimum_age=18, maximum_age=58).isoformat(),
            "racingNumber": number,
            "registrationType": "event-pass",
            "registrationDate": utc_now().isoformat(),
            "paymentStatus": "paid",
            "status": "active",
            "totalFee": 0.0,
            "contact": {
                "email": faker.email(),
                "phone": faker.phone_number(),
                "emergency": {
                    "name": faker.name(),
                    "phone": faker.phone_number(),
                },
            },
            "sponsors": [faker.company() for _ in range(rng.randint(0, 2))],
            "sledConfigurations": build_sled_configuration(rng, profile_classes),
            "statistics": {
                "careerStarts": rng.randint(10, 240),
                "careerWins": rng.randint(0, 45),
                "careerPodiums": rng.randint(0, 80),
                "dqs": rng.randint(0, 4),
                "bestReaction": round(rng.uniform(0.04, 0.18), 3),
            },
            "selectedClasses": profile_classes[:],
            "eventClasses": {},
            "_searchText": "",
            "_migrated": 1,
            "_migrationDate": utc_now().isoformat(),
        }
        profiles.append(DriverProfile(participant=participant, profile_classes=profile_classes))

    return profiles


def registration_price_for_class(class_name: str) -> int:
    if class_name in {"pro mod", "outlaw"}:
        return 210
    if class_name in {"1000 improve", "1000 pro-stock"}:
        return 160
    if class_name in {"600 stock", "800 stock", "1000 stock"}:
        return 90
    return 130


def assign_event_entries(
    rng: random.Random,
    event_classes: Sequence[str],
    driver_profiles: Sequence[DriverProfile],
    unique_driver_target: int,
    registration_target: int,
) -> Tuple[List[DriverProfile], Dict[str, List[str]]]:
    eligible = [
        dp for dp in driver_profiles if set(dp.profile_classes).intersection(event_classes)
    ]
    if len(eligible) < unique_driver_target:
        raise RuntimeError(
            f"Not enough eligible drivers ({len(eligible)}) for event classes {event_classes}"
        )

    selected_drivers = rng.sample(eligible, unique_driver_target)
    assignments: Dict[str, List[str]] = {}
    total_regs = 0

    for dp in selected_drivers:
        overlap = sorted(set(dp.profile_classes).intersection(event_classes))
        if not overlap:
            continue
        chosen_count = 1
        if len(overlap) >= 2 and rng.random() < 0.56:
            chosen_count = 2
        if len(overlap) >= 3 and rng.random() < 0.18:
            chosen_count = 3
        chosen_classes = rng.sample(overlap, chosen_count)
        assignments[dp.participant["id"]] = sorted(chosen_classes)
        total_regs += len(chosen_classes)

    # Grow registrations toward target by adding extra classes for selected drivers.
    expansion_pool = [dp for dp in selected_drivers if len(set(dp.profile_classes).intersection(event_classes)) >= 2]
    guard = 0
    while total_regs < registration_target and expansion_pool and guard < 15000:
        guard += 1
        dp = rng.choice(expansion_pool)
        pid = dp.participant["id"]
        overlap = sorted(set(dp.profile_classes).intersection(event_classes))
        current = set(assignments.get(pid, []))
        available = [c for c in overlap if c not in current]
        if not available:
            continue
        extra = rng.choice(available)
        assignments.setdefault(pid, []).append(extra)
        assignments[pid] = sorted(set(assignments[pid]))
        total_regs += 1

    # Safety reduction if over target ceiling.
    guard = 0
    while total_regs > registration_target and guard < 15000:
        guard += 1
        pid = rng.choice(list(assignments.keys()))
        if len(assignments[pid]) <= 1:
            continue
        removed = assignments[pid].pop()
        if not assignments[pid]:
            assignments[pid] = [removed]
            continue
        total_regs -= 1

    return selected_drivers, assignments


class ApiClient:
    def __init__(self, base_url: str, username: str, password: str, timeout: int = 20):
        self.base_url = base_url.rstrip("/")
        self.username = username
        self.password = password
        self.timeout = timeout
        self.session = requests.Session()
        self.token: Optional[str] = None

    def _url(self, path: str) -> str:
        return f"{self.base_url}{path}"

    def login(self) -> None:
        try:
            resp = self.session.post(
                self._url("/api/auth/login"),
                json={"username": self.username, "password": self.password},
                timeout=self.timeout,
            )
        except requests.exceptions.ConnectionError as exc:
            raise RuntimeError(
                "Could not reach EPC17 API at {url}. "
                "Start the server first (e.g. `python server.py`) and verify --base-url.".format(
                    url=self.base_url
                )
            ) from exc
        except requests.exceptions.Timeout as exc:
            raise RuntimeError(
                "API request timed out while connecting to {url}.".format(url=self.base_url)
            ) from exc

        if resp.status_code != 200:
            if resp.status_code == 401:
                raise RuntimeError(
                    "Authentication failed (401). Check --username/--password. "
                    "Default admin is Admin/Admin321."
                )
            raise RuntimeError(f"Authentication failed: {resp.status_code} {resp.text}")
        payload = resp.json()
        token = payload.get("token")
        if not token:
            raise RuntimeError("Authentication succeeded but token was missing.")
        self.token = token
        self.session.headers.update({"Authorization": f"Bearer {token}"})

    def get_json(self, path: str) -> Dict:
        resp = self.session.get(self._url(path), timeout=self.timeout)
        if resp.status_code >= 400:
            raise RuntimeError(f"GET {path} failed: {resp.status_code} {resp.text}")
        return resp.json()

    def post_json(self, path: str, payload: Dict) -> Dict:
        resp = self.session.post(self._url(path), json=payload, timeout=self.timeout)
        if resp.status_code >= 400:
            raise RuntimeError(f"POST {path} failed: {resp.status_code} {resp.text}")
        return resp.json()

    def put_json(self, path: str, payload: Dict) -> Dict:
        resp = self.session.put(self._url(path), json=payload, timeout=self.timeout)
        if resp.status_code >= 400:
            raise RuntimeError(f"PUT {path} failed: {resp.status_code} {resp.text}")
        return resp.json()


def build_series_payload(rng: random.Random, faker: Faker) -> Dict:
    now = utc_now().isoformat()
    season_id = str(uuid.uuid4())
    series_classes = [
        {
            "id": class_slug(name),
            "name": name,
            "defaultFee": registration_price_for_class(name),
            "description": f"{name.title()} class",
        }
        for name in CLASS_CATALOG
    ]
    return {
        "name": f"{faker.city()} Winter Drag Series",
        "description": "Issue #123 large-scale realism dataset.",
        "sledClasses": series_classes,
        "events": [],
        "standings": [],
        "seasons": [
            {
                "id": season_id,
                "name": f"{utc_now().year} Championship",
                "startDate": datetime(utc_now().year, 1, 1, tzinfo=timezone.utc).isoformat(),
                "endDate": datetime(utc_now().year, 12, 31, tzinfo=timezone.utc).isoformat(),
                "status": "active",
                "createdAt": now,
            }
        ],
        "status": "active",
        "createdAt": now,
        "updatedAt": now,
    }


def build_event_specs(
    rng: random.Random,
    faker: Faker,
    completed_events: int,
    upcoming_events: int,
) -> List[EventSpec]:
    specs: List[EventSpec] = []
    total = completed_events + upcoming_events
    today = utc_now()

    # Keep rare single-elim events near 5% and tied to high-load + 2-lane.
    single_count = max(1, round(total * 0.05))
    single_indices = set(rng.sample(range(total), single_count))
    peak_indices = set(rng.sample(range(total), max(1, single_count)))

    for idx in range(total):
        status = "completed" if idx < completed_events else "upcoming"
        event_date = (
            today - timedelta(days=rng.randint(14, 360))
            if status == "completed"
            else today + timedelta(days=rng.randint(6, 220))
        )
        archetype = choose_event_archetype(rng)
        class_names = choose_event_classes(archetype, rng)
        is_peak = idx in peak_indices
        lane_count = choose_lane_count(rng)
        # Force peak/single candidates to 2 lanes.
        if idx in single_indices or is_peak:
            lane_count = 2
        unique_drivers = rng.randint(MIN_UNIQUE_DRIVERS, MAX_UNIQUE_DRIVERS)
        reg_cap = RARE_PEAK_REGISTRATIONS if is_peak else MAX_REGISTRATIONS
        reg_target = rng.randint(MIN_REGISTRATIONS, reg_cap)
        elimination = choose_elimination_type(
            lane_count=lane_count,
            is_peak_load=is_peak,
            force_single=idx in single_indices,
            rng=rng,
        )
        city = faker.city()
        name = f"{city} Snow Drags {idx + 1:02d}"

        specs.append(
            EventSpec(
                index=idx,
                name=name,
                status=status,
                archetype=archetype,
                event_date=event_date,
                lane_count=lane_count,
                elimination_type=elimination,
                class_names=class_names,
                unique_driver_target=unique_drivers,
                registration_target=reg_target,
                is_peak_load=is_peak,
            )
        )
    return specs


def build_event_payload(
    spec: EventSpec,
    series_id: str,
    season_id: Optional[str],
    rng: random.Random,
) -> Dict:
    now = utc_now().isoformat()
    class_settings = [
        {
            "classId": class_slug(name),
            "className": name,
            "enabled": True,
            "price": registration_price_for_class(name),
        }
        for name in spec.class_names
    ]
    classes_payload = [
        {
            "id": class_slug(name),
            "name": name,
            "maxParticipants": MAX_REGISTRATIONS,
            "purse": rng.randint(2500, 18000),
            "qualifyingRuns": rng.randint(1, 3),
        }
        for name in spec.class_names
    ]

    return {
        "name": spec.name,
        "eventName": spec.name,
        "date": spec.event_date.isoformat(),
        "location": "TBD",
        "seriesId": series_id,
        "seasonId": season_id,
        "numberOfTracks": spec.lane_count,
        "eliminationType": spec.elimination_type,
        "trackSurface": random.choice(["ice", "snow"]),
        "weatherContingency": random.choice(["proceed", "delay", "reschedule"]),
        "driverMeetingTime": "07:30",
        "maxParticipants": MAX_REGISTRATIONS,
        "currentParticipants": 0,
        "participants": [],
        "classSettings": class_settings,
        "classOrder": [class_slug(name) for name in spec.class_names],
        "classes": classes_payload,
        "status": "upcoming",
        "registrationOpen": True,
        "requiresClassSeparation": True,
        "freeRunEnabled": False,
        "createdAt": now,
        "updatedAt": now,
    }


def random_time_for_round(
    base: datetime,
    round_number: int,
    heat_offset: int,
    rng: random.Random,
) -> Tuple[str, str, str]:
    start = base + timedelta(minutes=20 * round_number + 4 * heat_offset + rng.randint(0, 2))
    end = start + timedelta(minutes=3 + rng.randint(0, 2))
    return start.isoformat(), end.isoformat(), end.isoformat()


def simulate_class_rounds(
    participants: List[Dict],
    class_name: str,
    lane_count: int,
    elimination_type: str,
    event_date: datetime,
    rng: random.Random,
    race_number_start: int,
) -> Tuple[Dict, int]:
    rounds: List[Dict] = []
    active = participants[:]
    loss_count = {p["id"]: 0 for p in participants}
    race_number = race_number_start
    round_number = 1

    while len(active) > 1 and round_number <= 12:
        rng.shuffle(active)
        heats: List[Dict] = []
        heat_number = 1
        survivors: Set[str] = set()

        for i in range(0, len(active), lane_count):
            heat_participants = active[i : i + lane_count]
            lanes = []
            for lane in range(1, lane_count + 1):
                participant = heat_participants[lane - 1] if lane - 1 < len(heat_participants) else None
                lanes.append({"lane": lane, "participant": participant})

            base_elapsed = rng.uniform(7.1, 9.4)
            results = []
            for position, participant in enumerate(
                sorted(
                    heat_participants,
                    key=lambda _: base_elapsed + rng.uniform(-0.02, 0.22),
                ),
                start=1,
            ):
                results.append(
                    {
                        "participantId": participant["id"],
                        "position": position,
                        "reaction": round(rng.uniform(0.04, 0.21), 3),
                        "elapsed": round(base_elapsed + (position - 1) * 0.04 + rng.uniform(-0.02, 0.03), 3),
                        "speedMph": round(rng.uniform(84.0, 130.0), 1),
                        "status": "finished",
                    }
                )

            winner_id = results[0]["participantId"] if results else None
            for result in results:
                pid = result["participantId"]
                if pid == winner_id:
                    survivors.add(pid)
                    continue
                loss_count[pid] += 1
                limit = 1 if elimination_type == "single" else 2
                if loss_count[pid] < limit:
                    survivors.add(pid)

            start_time, end_time, completed_at = random_time_for_round(
                base=event_date.replace(hour=8, minute=0, second=0, microsecond=0),
                round_number=round_number,
                heat_offset=heat_number,
                rng=rng,
            )
            heats.append(
                {
                    "id": f"heat-{uuid.uuid4()}",
                    "round": round_number,
                    "heatNumber": heat_number,
                    "raceNumber": race_number,
                    "numberOfLanes": lane_count,
                    "className": class_name,
                    "lanes": lanes,
                    "status": "completed",
                    "results": results,
                    "startTime": start_time,
                    "endTime": end_time,
                    "completedAt": completed_at,
                    "isComplete": True,
                }
            )
            race_number += 1
            heat_number += 1

        rounds.append(
            {
                "id": f"round-{uuid.uuid4()}",
                "roundNumber": round_number,
                "name": f"Round {round_number}",
                "isComplete": True,
                "heats": heats,
            }
        )
        active = [p for p in participants if p["id"] in survivors]
        round_number += 1

        if len(active) == 0 and participants:
            active = [rng.choice(participants)]

    winner = active[0] if active else (participants[0] if participants else None)
    class_bracket = {
        "participants": participants,
        "rounds": rounds,
        "currentRound": round_number,
        "isComplete": True,
        "winner": winner,
        "eliminationType": elimination_type,
        "numberOfLanes": lane_count,
        "upperBracket": [],
        "lowerBracket": [] if elimination_type == "double" else None,
    }
    return class_bracket, race_number


def build_completed_event_bracket(
    event_id: str,
    event_date: datetime,
    lane_count: int,
    elimination_type: str,
    class_to_participants: Dict[str, List[Dict]],
    participant_ids: List[str],
    rng: random.Random,
) -> Dict:
    classes: Dict[str, Dict] = {}
    race_number = 1
    ordered_class_names = sorted(class_to_participants.keys())
    for class_name in ordered_class_names:
        class_participants = class_to_participants[class_name]
        class_bracket, race_number = simulate_class_rounds(
            participants=class_participants,
            class_name=class_name,
            lane_count=lane_count,
            elimination_type=elimination_type,
            event_date=event_date,
            rng=rng,
            race_number_start=race_number,
        )
        classes[class_name] = class_bracket

    now = utc_now().isoformat()
    return {
        "id": str(uuid.uuid4()),
        "eventId": event_id,
        "numberOfLanes": lane_count,
        "eliminationType": elimination_type,
        "classes": classes,
        "participants": participant_ids,
        "isComplete": True,
        "createdAt": now,
        "updatedAt": now,
    }


def validate_generation(
    event_specs: Sequence[EventSpec],
    event_assignments: Dict[str, Dict[str, List[str]]],
    generated_events: Sequence[Dict],
    api: ApiClient,
) -> None:
    completed = [e for e in event_specs if e.status == "completed"]
    upcoming = [e for e in event_specs if e.status == "upcoming"]
    print(f"[CHECK] Events created: {len(event_specs)} ({len(completed)} completed / {len(upcoming)} upcoming)")

    if len(event_specs) != DEFAULT_TOTAL_EVENTS:
        raise RuntimeError("Event count mismatch.")
    if len(completed) != DEFAULT_COMPLETED_EVENTS or len(upcoming) != DEFAULT_UPCOMING_EVENTS:
        raise RuntimeError("Completed/upcoming split mismatch.")

    lane_counts = {2: 0, 3: 0, 4: 0}
    elim_counts = {"double": 0, "single": 0}
    reg_violations = 0
    for spec in event_specs:
        lane_counts[spec.lane_count] = lane_counts.get(spec.lane_count, 0) + 1
        elim_counts[spec.elimination_type] = elim_counts.get(spec.elimination_type, 0) + 1
        if not (MIN_UNIQUE_DRIVERS <= spec.unique_driver_target <= MAX_UNIQUE_DRIVERS):
            reg_violations += 1
        event_registrations = sum(len(v) for v in event_assignments.get(spec.event_id or "", {}).values())
        max_expected = RARE_PEAK_REGISTRATIONS if spec.is_peak_load else MAX_REGISTRATIONS
        if not (MIN_REGISTRATIONS <= event_registrations <= max_expected):
            reg_violations += 1

    print(f"[CHECK] Lane distribution: {lane_counts}")
    print(f"[CHECK] Elimination distribution: {elim_counts}")
    if reg_violations:
        raise RuntimeError(f"Registration/driver constraint violations: {reg_violations}")

    overall = api.get_json("/api/stats/overall")
    print(
        "[CHECK] Stats overall -> events={events} races={races} entries={entries}".format(
            events=overall.get("totalEvents"),
            races=overall.get("totalRaces"),
            entries=overall.get("totalEntries"),
        )
    )

    completed_event_ids = [e["id"] for e in generated_events if e.get("status") == "completed"]
    for event_id in completed_event_ids[:3]:
        event_stats = api.get_json(f"/api/stats/event/{event_id}")
        print(
            f"[CHECK] Event stats {event_id}: participants={event_stats.get('totalParticipants')} "
            f"completedRaces={event_stats.get('completedRaces')}"
        )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Issue #123 API-driven EPC17 data simulator.")
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL, help="EPC17 server base URL.")
    parser.add_argument("--username", default="Admin", help="Auth username.")
    parser.add_argument("--password", default="Admin321", help="Auth password.")
    parser.add_argument("--seed", type=int, default=DEFAULT_SEED, help="Deterministic random seed.")
    parser.add_argument("--driver-pool", type=int, default=DEFAULT_DRIVER_POOL, help="Total drivers to create.")
    parser.add_argument(
        "--completed-events",
        type=int,
        default=DEFAULT_COMPLETED_EVENTS,
        help="Completed events target.",
    )
    parser.add_argument(
        "--upcoming-events",
        type=int,
        default=DEFAULT_UPCOMING_EVENTS,
        help="Upcoming events target.",
    )
    parser.add_argument(
        "--force-reset",
        action="store_true",
        help="Delete sqlite DB files before simulation (server must be stopped).",
    )
    parser.add_argument("--db-path", default="data/epc17.db", help="SQLite DB path used by --force-reset.")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Build and validate event specs without API writes.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    rng = random.Random(args.seed)
    faker = Faker()
    faker.seed_instance(args.seed)

    if args.completed_events + args.upcoming_events != DEFAULT_TOTAL_EVENTS:
        raise ValueError("Issue #123 target requires exactly 40 events total.")

    if args.force_reset:
        reset_database_file(args.db_path)
        # Ensure schema exists after reset if server is not running yet.
        DatabaseManager(db_path=args.db_path)

    event_specs = build_event_specs(
        rng=rng,
        faker=faker,
        completed_events=args.completed_events,
        upcoming_events=args.upcoming_events,
    )

    print(
        f"[PLAN] Built {len(event_specs)} event specs "
        f"({sum(1 for e in event_specs if e.status == 'completed')} completed / "
        f"{sum(1 for e in event_specs if e.status == 'upcoming')} upcoming)"
    )
    if args.dry_run:
        for sample in event_specs[:5]:
            print(
                f" - {sample.name}: {sample.archetype}, lanes={sample.lane_count}, "
                f"elim={sample.elimination_type}, classes={len(sample.class_names)}, "
                f"drivers={sample.unique_driver_target}, regs~{sample.registration_target}"
            )
        return

    api = ApiClient(args.base_url, args.username, args.password)
    api.login()
    print("[INFO] Authenticated to EPC17 API.")

    series_payload = build_series_payload(rng=rng, faker=faker)
    created_series = api.post_json("/api/series", series_payload)
    series_id = created_series.get("id")
    if not series_id:
        raise RuntimeError("Failed to create series ID.")
    seasons = created_series.get("seasons") or []
    season_id = seasons[0].get("id") if seasons and isinstance(seasons[0], dict) else None
    print(f"[INFO] Created series {series_id}")

    driver_profiles = generate_driver_profiles(
        faker=faker,
        rng=rng,
        driver_count=args.driver_pool,
    )

    created_participants: List[DriverProfile] = []
    for i, profile in enumerate(driver_profiles, start=1):
        saved = api.post_json("/api/participants", profile.participant)
        saved["selectedClasses"] = profile.profile_classes[:]
        saved.setdefault("eventClasses", {})
        created_participants.append(
            DriverProfile(participant=saved, profile_classes=profile.profile_classes)
        )
        if i % 50 == 0 or i == len(driver_profiles):
            print(f"[INFO] Participants created: {i}/{len(driver_profiles)}")

    events_created: List[Dict] = []
    event_assignments: Dict[str, Dict[str, List[str]]] = {}
    participant_by_id = {dp.participant["id"]: dp for dp in created_participants}

    for idx, spec in enumerate(event_specs, start=1):
        payload = build_event_payload(spec=spec, series_id=series_id, season_id=season_id, rng=rng)
        event = api.post_json("/api/events", payload)
        event_id = event.get("id")
        if not event_id:
            raise RuntimeError("Event creation did not return ID.")
        spec.event_id = event_id

        selected, assignments = assign_event_entries(
            rng=rng,
            event_classes=spec.class_names,
            driver_profiles=created_participants,
            unique_driver_target=spec.unique_driver_target,
            registration_target=spec.registration_target,
        )
        event_assignments[event_id] = assignments

        for dp in selected:
            pid = dp.participant["id"]
            event_classes = sorted(assignments.get(pid, []))
            if not event_classes:
                continue
            updated_participant = dict(dp.participant)
            event_map = dict(updated_participant.get("eventClasses") or {})
            event_map[event_id] = event_classes
            updated_participant["eventClasses"] = event_map
            updated_participant["selectedClasses"] = sorted(
                set(updated_participant.get("selectedClasses") or []).union(event_classes)
            )
            updated_participant["totalFee"] = float(updated_participant.get("totalFee") or 0.0) + sum(
                registration_price_for_class(c) for c in event_classes
            )
            updated_participant["name"] = updated_participant.get("name") or "Unknown Driver"
            api.put_json(f"/api/participants/{pid}", updated_participant)
            dp.participant = updated_participant
            participant_by_id[pid] = dp
            api.post_json(f"/api/events/{event_id}/participants", {"participantId": pid})

        registered_ids = sorted(assignments.keys())
        reg_count = sum(len(v) for v in assignments.values())

        event["participants"] = registered_ids
        event["currentParticipants"] = len(registered_ids)
        if spec.status == "upcoming":
            event["status"] = "upcoming"
            event["registrationOpen"] = True
            api.put_json(f"/api/events/{event_id}", event)
            events_created.append(event)
            print(
                f"[EVENT {idx:02d}/40] Upcoming -> {event_id} "
                f"drivers={len(registered_ids)} registrations={reg_count} "
                f"lanes={spec.lane_count} elim={spec.elimination_type}"
            )
            continue

        # Completed event workflow: upcoming -> active -> completed with bracket progression payload.
        event["status"] = "active"
        event["registrationOpen"] = False
        api.put_json(f"/api/events/{event_id}", event)

        class_to_participants: Dict[str, List[Dict]] = {}
        for class_name in spec.class_names:
            class_drivers = []
            for pid, classes in assignments.items():
                if class_name in classes:
                    class_drivers.append(participant_by_id[pid].participant)
            if class_drivers:
                class_to_participants[class_name] = class_drivers

        bracket = build_completed_event_bracket(
            event_id=event_id,
            event_date=spec.event_date,
            lane_count=spec.lane_count,
            elimination_type=spec.elimination_type,
            class_to_participants=class_to_participants,
            participant_ids=registered_ids,
            rng=rng,
        )
        api.post_json("/api/race-brackets", bracket)

        event["status"] = "completed"
        event["registrationOpen"] = False
        updated_completed = api.put_json(f"/api/events/{event_id}", event)
        events_created.append(updated_completed)
        print(
            f"[EVENT {idx:02d}/40] Completed -> {event_id} "
            f"drivers={len(registered_ids)} registrations={reg_count} "
            f"lanes={spec.lane_count} elim={spec.elimination_type}"
        )

    validate_generation(
        event_specs=event_specs,
        event_assignments=event_assignments,
        generated_events=events_created,
        api=api,
    )

    print(
        "[SUCCESS] Generated issue #123 dataset: "
        f"drivers={len(created_participants)}, events={len(events_created)}, "
        f"completed={sum(1 for e in events_created if e.get('status') == 'completed')}, "
        f"upcoming={sum(1 for e in events_created if e.get('status') == 'upcoming')}"
    )


if __name__ == "__main__":
    main()
