"""Generate a deterministic synthetic training set for Together's Experience Engine.

The generator deliberately uses a transparent teacher/scoring system. The ML model we
train later learns these relationships from the generated examples instead of calling
an external AI API. A fixed random seed makes the dataset reproducible.
"""

from __future__ import annotations

import csv
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUTPUT = ROOT / "experience_scenarios.csv"
SEED = 42
ROWS = 5000

MOODS = [
    "happy", "playful", "romantic", "affectionate", "deep", "calm", "relaxed",
    "energetic", "nostalgic", "celebratory", "low_energy", "sensual", "erotic"
]
ENERGY = ["very_low", "low", "medium", "high", "very_high"]
TIMES = [5, 10, 15, 20, 30, 45, 60]
TIME_OF_DAY = ["morning", "afternoon", "evening", "late_night"]
OCCASIONS = [
    "normal_day", "first_date", "date_night", "anniversary", "birthday",
    "valentines", "long_distance", "reunion", "weekend", "late_night",
    "celebration", "rough_day", "special_memory", "holiday", "just_because"
]
RELATIONSHIPS = ["just_met", "new", "dating", "serious", "long_term"]
BONDING = [1, 2, 3, 4, 5]

ACTIVITIES = [
    (1, "Rapid Fire", "question_game", "high", 5, 15, "light", False),
    (2, "This or That", "question_game", "medium", 5, 15, "light", False),
    (3, "Trivia Battle", "competitive_game", "high", 10, 30, "light", False),
    (4, "Tic Tac Toe", "competitive_game", "medium", 5, 15, "light", False),
    (5, "Connect Four", "competitive_game", "medium", 10, 30, "light", False),
    (6, "Scribble", "creative_game", "high", 10, 30, "light", False),
    (7, "Find the Spy", "social_game", "high", 10, 20, "light", False),
    (8, "Two Truths and a Lie", "question_game", "medium", 10, 20, "light", False),
    (9, "How Well Do You Know Me", "question_game", "medium", 10, 25, "moderate", True),
    (10, "Memory Lane", "memory", "low", 10, 25, "moderate", True),
    (11, "Relationship Timeline", "memory", "low", 15, 30, "moderate", True),
    (12, "Deep Questions", "conversation", "low", 10, 30, "light", False),
    (13, "Future Plans", "conversation", "medium", 10, 25, "moderate", True),
    (14, "Date Planner", "date_activity", "medium", 10, 30, "moderate", True),
    (15, "Music Mood", "watch_together", "low", 10, 30, "light", False),
    (16, "Watch Together", "watch_together", "low", 15, 60, "light", False),
    (17, "Couple Challenge", "challenge", "high", 10, 25, "moderate", True),
    (18, "Truth or Dare", "romantic_activity", "medium", 10, 30, "moderate", True),
    (19, "Flirty This or That", "intimate_activity", "medium", 5, 20, "high", True),
    (20, "Romantic Q&A", "intimate_activity", "low", 10, 25, "high", True),
    (21, "Compliment Challenge", "romantic_activity", "low", 5, 15, "moderate", True),
    (22, "Little Moments", "memory", "low", 5, 20, "moderate", True),
    (23, "Cozy Conversation", "conversation", "low", 5, 20, "moderate", True),
    (24, "Date Night Roulette", "date_activity", "medium", 10, 30, "moderate", True),
    (25, "Playful Teasing Cards", "intimate_activity", "medium", 5, 20, "high", True),
]

ACTIVITY_BY_ID = {a[0]: a for a in ACTIVITIES}

SCENE_MAP = {
    "happy": "positive_social",
    "playful": "playful_social",
    "romantic": "romantic_connection",
    "affectionate": "warm_connection",
    "deep": "deep_connection",
    "calm": "calm_connection",
    "relaxed": "easy_connection",
    "energetic": "high_energy_fun",
    "nostalgic": "memory_connection",
    "celebratory": "celebration",
    "low_energy": "gentle_connection",
    "sensual": "sensual_connection",
    "erotic": "intimate_connection",
}

MOOD_FAVORITES = {
    "happy": {1: 2, 2: 2, 3: 2, 6: 2, 8: 3, 17: 2},
    "playful": {1: 4, 2: 4, 3: 3, 6: 4, 8: 4, 17: 3, 18: 2, 25: 2},
    "romantic": {9: 3, 10: 3, 13: 3, 14: 3, 18: 3, 20: 4, 21: 3, 23: 3, 24: 3},
    "affectionate": {9: 3, 10: 3, 20: 3, 21: 4, 22: 4, 23: 4},
    "deep": {9: 3, 10: 4, 11: 4, 12: 4, 13: 4, 23: 3},
    "calm": {10: 3, 12: 3, 15: 3, 16: 3, 20: 3, 22: 3, 23: 4},
    "relaxed": {2: 2, 10: 3, 15: 3, 16: 3, 22: 3, 23: 4},
    "energetic": {1: 4, 3: 4, 4: 3, 6: 4, 7: 4, 17: 4},
    "nostalgic": {10: 5, 11: 5, 22: 5, 23: 3, 20: 2},
    "celebratory": {1: 3, 3: 3, 6: 3, 8: 3, 17: 4, 18: 3, 24: 3},
    "low_energy": {10: 4, 15: 4, 16: 4, 20: 3, 22: 4, 23: 5},
    "sensual": {18: 3, 19: 5, 20: 5, 21: 3, 23: 3, 25: 5, 22: 2},
    "erotic": {18: 3, 19: 5, 20: 5, 21: 2, 23: 3, 25: 5},
}

OCCASION_BOOSTS = {
    "first_date": {2: 3, 8: 3, 9: 3, 12: 2, 14: 2},
    "date_night": {9: 3, 13: 3, 14: 4, 18: 4, 19: 4, 20: 4, 24: 4, 25: 3},
    "anniversary": {10: 5, 11: 5, 13: 4, 20: 3, 21: 3, 22: 4},
    "birthday": {1: 3, 3: 3, 6: 3, 17: 3, 24: 3},
    "valentines": {14: 4, 18: 5, 19: 5, 20: 5, 21: 4, 25: 4},
    "long_distance": {9: 3, 10: 3, 12: 3, 15: 3, 16: 3, 20: 3, 22: 3},
    "reunion": {10: 4, 11: 3, 17: 3, 18: 3, 22: 4, 24: 3},
    "weekend": {3: 3, 6: 3, 7: 3, 14: 4, 17: 4, 24: 4},
    "late_night": {15: 2, 16: 3, 19: 4, 20: 4, 23: 3, 25: 4},
    "celebration": {1: 3, 3: 3, 6: 3, 17: 4, 18: 3},
    "rough_day": {10: 3, 15: 4, 16: 4, 20: 3, 22: 4, 23: 5},
    "special_memory": {10: 5, 11: 5, 22: 5, 13: 3},
    "holiday": {3: 3, 6: 3, 14: 4, 17: 3, 24: 4},
    "just_because": {1: 2, 2: 2, 9: 2, 14: 2, 18: 2, 24: 3},
}


def energy_value(level: str) -> int:
    return ENERGY.index(level) + 1


def compatibility(mood: str, activity_id: int, energy: str, minutes: int,
                   occasion: str, relationship: str, bonding: int) -> float:
    a = ACTIVITY_BY_ID[activity_id]
    _, _, category, base_energy, min_m, max_m, intimacy, couple_only = a
    score = 1.0

    score += MOOD_FAVORITES.get(mood, {}).get(activity_id, 0)
    score += OCCASION_BOOSTS.get(occasion, {}).get(activity_id, 0)

    if a[7] and relationship == "just_met":
        score -= 5
    if a[7] and bonding <= 1:
        score -= 2
    if not a[7] and bonding >= 4 and category in {"conversation", "memory", "romantic_activity"}:
        score += 0.5

    diff = abs(energy_value(energy) - energy_value(base_energy))
    score += max(0, 2 - diff * 0.6)

    if min_m <= minutes <= max_m:
        score += 3
    elif minutes < min_m:
        score -= min(3, (min_m - minutes) / 5)
    else:
        score -= min(2, (minutes - max_m) / 15)

    if mood in {"sensual", "erotic"}:
        if not a[7]:
            score -= 4
        if intimacy in {"high", "moderate"}:
            score += 2

    if mood not in {"sensual", "erotic"} and intimacy == "high":
        score -= 1

    if occasion == "first_date" and a[7]:
        score -= 2

    return max(0.05, score)


def choose_activity(mood: str, energy: str, minutes: int, occasion: str,
                    relationship: str, bonding: int, rng: random.Random) -> tuple[int, float]:
    scores = [(a[0], compatibility(mood, a[0], energy, minutes, occasion, relationship, bonding)) for a in ACTIVITIES]
    scores.sort(key=lambda x: x[1], reverse=True)
    # Small stochasticity prevents identical top rows while preserving teacher logic.
    top = scores[: min(5, len(scores))]
    weights = [max(0.1, s) for _, s in top]
    chosen_id = rng.choices([i for i, _ in top], weights=weights, k=1)[0]
    raw = dict(scores)[chosen_id]
    total = sum(max(0.1, s) for _, s in scores)
    probability = raw / total
    return chosen_id, round(probability, 5)


def expected_engagement(mood: str, energy: str, minutes: int, activity_id: int,
                        occasion: str, bonding: int) -> float:
    score = 0.50
    a = ACTIVITY_BY_ID[activity_id]
    base = energy_value(a[3])
    current = energy_value(energy)
    score += max(-0.12, 0.08 - abs(base - current) * 0.025)
    if activity_id in MOOD_FAVORITES.get(mood, {}):
        score += 0.08
    if activity_id in OCCASION_BOOSTS.get(occasion, {}):
        score += 0.06
    if a[7]:
        score += min(0.08, bonding * 0.012)
    if a[4] <= minutes <= a[5]:
        score += 0.08
    return round(max(0.10, min(0.98, score)), 3)


def make_row(i: int, rng: random.Random) -> dict[str, object]:
    mood = rng.choice(MOODS)
    energy = rng.choice(ENERGY)
    minutes = rng.choice(TIMES)
    time_of_day = rng.choice(TIME_OF_DAY)
    occasion = rng.choice(OCCASIONS)
    relationship = rng.choice(RELATIONSHIPS)
    bonding = rng.choice(BONDING)

    # Intimate moods are always represented as couple-only and consent-gated states.
    couple_only = mood in {"romantic", "affectionate", "nostalgic", "sensual", "erotic"}
    consent_required = mood in {"sensual", "erotic"}
    intimacy = {"sensual": "high", "erotic": "very_high"}.get(
        mood, "moderate" if couple_only else "light"
    )

    activity_id, recommendation_probability = choose_activity(
        mood, energy, minutes, occasion, relationship, bonding, rng
    )
    activity = ACTIVITY_BY_ID[activity_id]

    if activity[7] and relationship == "just_met":
        # Teacher never recommends couple-only activities for people who have just met.
        safe_candidates = [a for a in ACTIVITIES if not a[7]]
        activity_id = max(
            safe_candidates,
            key=lambda a: compatibility(mood, a[0], energy, minutes, occasion, relationship, bonding),
        )[0]
        activity = ACTIVITY_BY_ID[activity_id]

    scene = SCENE_MAP[mood]
    engagement = expected_engagement(mood, energy, minutes, activity_id, occasion, bonding)

    return {
        "scenario_id": i,
        "mood": mood,
        "energy_level": energy,
        "time_available": minutes,
        "time_of_day": time_of_day,
        "occasion": occasion,
        "relationship_stage": relationship,
        "bonding_level": bonding,
        "intimacy_level": intimacy,
        "couple_only": str(couple_only).lower(),
        "consent_required": str(consent_required).lower(),
        "scene_label": scene,
        "recommended_activity_id": activity_id,
        "recommended_activity": activity[1],
        "recommended_category": activity[2],
        "recommendation_probability": recommendation_probability,
        "expected_engagement": engagement,
    }


def main() -> None:
    rng = random.Random(SEED)
    rows = [make_row(i + 1, rng) for i in range(ROWS)]

    fieldnames = list(rows[0].keys())
    with OUTPUT.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    print(f"Generated {len(rows):,} scenarios")
    print(f"Output: {OUTPUT}")
    print("Seed: 42")
    print("Moods:", ", ".join(MOODS))


if __name__ == "__main__":
    main()
