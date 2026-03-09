"""
Unit tests for issue #123 generation rules.
"""

import random

from utils.generate_data import (
    ARCHETYPE_BALANCED,
    ARCHETYPE_HIGH,
    ARCHETYPE_LOW,
    DISPLACEMENT_CLASSES,
    STOCK_CLASSES,
    build_driver_class_profile,
    choose_elimination_type,
    choose_event_classes,
)


def _displacement_of_class(class_name: str) -> str:
    for displacement, classes in DISPLACEMENT_CLASSES.items():
        if class_name in classes:
            return displacement
    return "open"


def test_high_class_events_exclude_stock_classes():
    rng = random.Random(10)
    for _ in range(50):
        classes = choose_event_classes(ARCHETYPE_HIGH, rng)
        assert classes
        assert STOCK_CLASSES.isdisjoint(classes)


def test_low_key_events_exclude_biggest_classes():
    rng = random.Random(99)
    for _ in range(50):
        classes = choose_event_classes(ARCHETYPE_LOW, rng)
        assert classes
        assert "pro mod" not in classes
        assert "outlaw" not in classes


def test_balanced_events_keep_non_stock_majority():
    rng = random.Random(17)
    for _ in range(30):
        classes = choose_event_classes(ARCHETYPE_BALANCED, rng)
        non_stock_count = sum(1 for c in classes if c not in STOCK_CLASSES)
        assert non_stock_count >= 5


def test_single_elim_only_when_forced_two_lanes():
    rng = random.Random(5)
    assert choose_elimination_type(2, True, True, rng) == "single"
    assert choose_elimination_type(3, True, True, rng) == "double"
    assert choose_elimination_type(4, False, False, rng) == "double"


def test_driver_profile_keeps_displacement_consistency():
    rng = random.Random(123)
    for _ in range(200):
        profile = build_driver_class_profile(rng)
        displacements = {
            _displacement_of_class(class_name)
            for class_name in profile
            if _displacement_of_class(class_name) in {"600", "800", "1000"}
        }
        # Allow one displacement family + optional open classes.
        assert len(displacements) <= 1
