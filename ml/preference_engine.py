"""Together offline preference learning for couple experiences.

Learns from explicit feedback without an external AI provider. The engine keeps
small, interpretable preference statistics per couple and can later be replaced
or augmented by a trained contextual model once enough real feedback exists.
"""

from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path
from typing import Iterable

import pandas as pd

ROOT = Path(__file__).resolve().parent
DATA_PATH = ROOT / "dataset" / "feedback.csv"
PROFILE_PATH = ROOT / "models" / "preference_profiles.json"

POSITIVE = {"like": 1.0, "favorite": 1.5, "complete": 0.8}
NEGATIVE = {"skip": -1.0, "too_easy": -0.6, "too_deep": -0.7, "dislike": -1.2}

class PreferenceEngine:
    """Update and query transparent couple preference profiles."""

    def __init__(self, profile_path: Path | str = PROFILE_PATH):
        self.profile_path = Path(profile_path)
        self.profiles = self._load()

    def _load(self) -> dict:
        if self.profile_path.exists():
            try:
                return json.loads(self.profile_path.read_text(encoding="utf-8"))
            except (json.JSONDecodeError, OSError):
                pass
        return {}

    def save(self) -> None:
        self.profile_path.parent.mkdir(parents=True, exist_ok=True)
        self.profile_path.write_text(json.dumps(self.profiles, indent=2), encoding="utf-8")

    def _profile(self, couple_id: str) -> dict:
        return self.profiles.setdefault(couple_id, {
            "total_feedback": 0,
            "actions": {},
            "activity_scores": {},
            "question_scores": {},
            "category_scores": {},
            "mood_scores": {},
            "intimacy_scores": {},
        })

    @staticmethod
    def _add(bucket: dict, key: str, value: float) -> None:
        if not key:
            return
        bucket[key] = round(float(bucket.get(key, 0.0)) + value, 4)

    def update(self, couple_id: str, item_type: str, item_id: str, action: str,
               category: str = "", mood: str = "", intimacy: str = "") -> dict:
        """Record one explicit interaction and return the updated profile."""
        if not couple_id:
            raise ValueError("couple_id is required")
        action = str(action).strip().lower()
        item_type = str(item_type).strip().lower()
        weight = POSITIVE.get(action, NEGATIVE.get(action, 0.0))
        profile = self._profile(str(couple_id))
        profile["total_feedback"] += 1
        self._add(profile["actions"], action, 1.0)

        target = profile["activity_scores"] if item_type == "activity" else profile["question_scores"]
        self._add(target, str(item_id), weight)
        self._add(profile["category_scores"], str(category), weight * 0.6)
        self._add(profile["mood_scores"], str(mood), weight * 0.5)
        self._add(profile["intimacy_scores"], str(intimacy), weight * 0.35)
        self.save()
        return profile

    def score(self, couple_id: str, item_type: str, item_id: str,
              category: str = "", mood: str = "", intimacy: str = "") -> float:
        profile = self._profile(str(couple_id))
        target = profile["activity_scores"] if item_type == "activity" else profile["question_scores"]
        score = float(target.get(str(item_id), 0.0))
        score += 0.5 * float(profile["category_scores"].get(str(category), 0.0))
        score += 0.35 * float(profile["mood_scores"].get(str(mood), 0.0))
        score += 0.20 * float(profile["intimacy_scores"].get(str(intimacy), 0.0))
        return round(score, 4)

    def rank(self, couple_id: str, candidates: Iterable[dict], item_type: str,
             top_n: int = 5) -> list[dict]:
        ranked = []
        for candidate in candidates:
            result = dict(candidate)
            result["preference_score"] = self.score(
                couple_id,
                item_type,
                str(candidate.get("item_id", candidate.get("question_id", candidate.get("activity_id", "")))),
                str(candidate.get("category", "")),
                str(candidate.get("mood", "")),
                str(candidate.get("intimacy_level", candidate.get("intimacy", ""))),
            )
            result["combined_score"] = round(
                float(candidate.get("relevance", candidate.get("score", 0.0))) +
                0.20 * result["preference_score"], 4
            )
            ranked.append(result)
        ranked.sort(key=lambda item: item["combined_score"], reverse=True)
        return ranked[: max(1, top_n)]


def bootstrap_profiles_from_csv(path: Path | str = DATA_PATH, profile_path: Path | str = PROFILE_PATH) -> PreferenceEngine:
    """Build profiles from feedback.csv when feedback exists."""
    engine = PreferenceEngine(profile_path)
    path = Path(path)
    if not path.exists():
        return engine
    df = pd.read_csv(path)
    for _, row in df.iterrows():
        engine.update(
            str(row.get("couple_id", "")),
            str(row.get("item_type", "")),
            str(row.get("item_id", "")),
            str(row.get("action", "")),
            str(row.get("category", "")),
            str(row.get("mood", "")),
            str(row.get("intimacy_level", "")),
        )
    return engine
