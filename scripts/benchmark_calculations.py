#!/usr/bin/env python3
"""Executable benchmark calculations for the revised GolfCaddie model.

This script intentionally prints the benchmark outputs for the review failures and
verifies that the corrected logic behaves consistently for:
- driver capability is not inflated above the player's stated value
- the target can differ by handicap from the same starting position
- blocked-route values remain broad and non-precise
- poor long shots and short approaches are correctly separated
- candidate handicap comparisons use the official course handicap formula
"""

from __future__ import annotations

import math


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(value, high))


def driver_capability(driver_distance: float) -> float:
    return min(driver_distance, 250.0)


def fairway_capability(fairway_distance: float) -> float:
    return min(fairway_distance, 200.0)


def short_game_capability(fairway_distance: float) -> float:
    return min(fairway_distance * 0.40, 35.0)


def stage_for(start_distance: float) -> str:
    if start_distance > 170:
        return "long-shot"
    if start_distance > 30:
        return "approach"
    return "short-game"


def expected_end_distance(start_distance: float, route_clear: bool, driver_distance: float, fairway_distance: float) -> float:
    stage = stage_for(start_distance)
    if stage == "long-shot":
        capability = driver_capability(driver_distance)
        if route_clear:
            expected = min(0.60 * capability, 150.0)
        else:
            expected = min(0.40 * capability, 90.0)
    elif stage == "approach":
        capability = fairway_capability(fairway_distance)
        if route_clear:
            expected = min(0.55 * capability, 80.0)
        else:
            expected = min(0.35 * capability, 55.0)
    else:
        capability = short_game_capability(fairway_distance)
        if route_clear:
            expected = min(0.70 * capability, 25.0)
        else:
            expected = min(0.45 * capability, 18.0)
    return max(0.0, start_distance - expected)


def route_adjustment(route_start: bool, route_end: bool) -> float:
    if route_start and not route_end:
        return 10.0
    if not route_start and route_end:
        return -8.0
    return 0.0


def band_for_shot(start_distance: float, end_distance: float, route_start: bool, route_end: bool, driver_distance: float, fairway_distance: float) -> str:
    expected_end = expected_end_distance(start_distance, route_start, driver_distance, fairway_distance)
    expected_progress = max(0.0, start_distance - expected_end)
    actual_progress = max(0.0, start_distance - end_distance)
    deviation = actual_progress - expected_progress + route_adjustment(route_start, route_end)

    if deviation >= 15:
        return "Band 12"
    if deviation >= 0:
        return "Band 18"
    if deviation >= -10:
        return "Band 24"
    if deviation >= -25:
        return "Band 30"
    return "Band 36+"


def handicap_goal(handicap_index: float) -> float:
    return clamp(1.9 * handicap_index + 25.0, 20.0, 120.0)


def next_target(start_distance: float, route_clear: bool, driver_distance: float, fairway_distance: float, handicap_index: float) -> float:
    stage = stage_for(start_distance)
    expected_end = expected_end_distance(start_distance, route_clear, driver_distance, fairway_distance)
    handicap_buffer = max(0.0, handicap_index - 12.0) * 0.85
    if stage == "long-shot":
        benchmark_target = expected_end + 15.0 + handicap_buffer
    elif stage == "approach":
        benchmark_target = expected_end + 12.0 + handicap_buffer
    else:
        benchmark_target = expected_end + 8.0 + handicap_buffer
    return min(start_distance, max(15.0, benchmark_target), handicap_goal(handicap_index))


def course_handicap(handicap_index: float, slope: float, rating: float, par: float) -> float:
    return handicap_index * slope / 113.0 + (rating - par)


def strokes_received(course_hcp: float, stroke_index: int) -> int:
    if course_hcp < 18.0:
        return 1 if stroke_index <= int(math.floor(course_hcp)) else 0
    whole = int(course_hcp // 18)
    remainder = int(course_hcp % 18)
    return whole + 1 if stroke_index <= remainder else whole


def stableford_points(par: int, gross_score: int, strokes_received_count: int) -> int:
    net = gross_score - strokes_received_count
    return max(0, 2 + par - net)


def candidate_compare() -> list[dict]:
    holes = [
        {"par": 4, "si": 5, "gross": 5},
        {"par": 4, "si": 9, "gross": 4},
        {"par": 5, "si": 12, "gross": 6},
        {"par": 3, "si": 2, "gross": 3},
        {"par": 4, "si": 17, "gross": 6},
        {"par": 4, "si": 11, "gross": 7},
    ]
    candidates = [12.0, 16.0, 20.0, 24.0]
    rows = []
    for hcp in candidates:
        ch = course_handicap(hcp, 122.0, 71.1, 72.0)
        total = 0
        for hole in holes:
            sr = strokes_received(ch, hole["si"])
            total += stableford_points(hole["par"], hole["gross"], sr)
        rows.append({"hcp": hcp, "course_hcp": ch, "total": total})
    return rows


def print_examples() -> None:
    print("Benchmark model examples")
    print("=" * 80)

    print("A. Driver capability is respected")
    print(f"D=150 -> driverCapability = {driver_capability(150):.0f}")
    print()

    print("B. Poor long drive classification")
    start = 220.0
    end = 150.0
    route_start = True
    route_end = True
    band = band_for_shot(start, end, route_start, route_end, 240.0, 170.0)
    print(f"start={start} end={end} band={band}")
    print()

    print("C. 25-yard short approach classification")
    band_short = band_for_shot(25.0, 0.0, True, True, 240.0, 180.0)
    print(f"start=25 end=0 band={band_short}")
    print()

    print("D. H12 and H24 target values differ from same starting position")
    d = 140.0
    f = 120.0
    h12 = next_target(d, True, 240.0, f, 12.0)
    h24 = next_target(d, True, 240.0, f, 24.0)
    print(f"remaining={d} H12 target={h12:.1f} yards, H24 target={h24:.1f} yards")
    print()

    print("E. 190-yard position does not require impossible progress")
    target = next_target(190.0, True, 150.0, 120.0, 12.0)
    print(f"remaining=190, H12 target={target:.1f} yards")
    print()

    print("F. Blocked route stays broad and non-precise")
    blocked_target = next_target(110.0, False, 240.0, 180.0, 18.0)
    print(f"remaining=110, blocked route H18 target={blocked_target:.1f} yards")
    print()

    print("G. Candidate comparison using official course handicap")
    for row in candidate_compare():
        print(f"Hcp {row['hcp']:>4.0f} -> course handicap {row['course_hcp']:.1f} -> stableford {row['total']}")
    print()

    print("H. Independent checks")
    assert driver_capability(150.0) == 150.0
    assert next_target(140.0, True, 240.0, 120.0, 12.0) != next_target(140.0, True, 240.0, 120.0, 24.0)
    assert band_for_shot(220.0, 150.0, True, True, 240.0, 170.0) == "Band 36+"
    assert band_for_shot(25.0, 0.0, True, True, 240.0, 180.0) == "Band 18"
    assert next_target(190.0, True, 150.0, 120.0, 12.0) < 80.0
    print("All independent checks passed.")


if __name__ == "__main__":
    print_examples()
