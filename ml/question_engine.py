"""Together question retrieval, personalization, and repetition detection.

The engine is deliberately offline. It combines TF-IDF text similarity with
structured metadata rules to rank questions for the current experience.
"""

from __future__ import annotations

from pathlib import Path
from typing import Iterable

import joblib
import numpy as np
import pandas as pd
from sklearn.metrics.pairwise import cosine_similarity

ROOT = Path(__file__).resolve().parent
MODEL_PATH = ROOT / "models" / "question_engine.joblib"

INTIMACY_RANK = {"none": 0, "light": 1, "moderate": 2, "high": 3, "very_high": 4}
ENERGY_RANK = {"very_low": 0, "low": 1, "medium": 2, "high": 3, "very_high": 4}


class QuestionEngine:
    """Load the trained retrieval artifact and rank safe, relevant questions."""

    def __init__(self, model_path: Path | str = MODEL_PATH):
        model_path = Path(model_path)
        if not model_path.exists():
            raise FileNotFoundError(
                f"Question engine not found at {model_path}. "
                "Run: python3 ml/training/build_question_engine.py"
            )
        artifact = joblib.load(model_path)
        self.vectorizer = artifact["vectorizer"]
        self.matrix = artifact["matrix"]
        self.questions: pd.DataFrame = artifact["questions"].copy()

    @staticmethod
    def _text_profile(context: dict) -> str:
        values = [
            context.get("mood", "any"),
            context.get("occasion", "normal_day"),
            context.get("relationship_stage", "any"),
            context.get("energy_level", "medium"),
            context.get("intimacy_level", "light"),
        ]
        return " ".join(str(value).replace("_", " ") for value in values)

    @staticmethod
    def _is_true(value) -> bool:
        return str(value).strip().lower() == "true"

    def _metadata_score(self, row: pd.Series, context: dict) -> float:
        score = 0.0

        mood = str(context.get("mood", "any")).lower()
        occasion = str(context.get("occasion", "normal_day")).lower()
        relationship = str(context.get("relationship_stage", "any")).lower()
        energy = str(context.get("energy_level", "medium")).lower()
        intimacy = str(context.get("intimacy_level", "light")).lower()
        bonding = int(context.get("bonding_level", 1))
        couple_only = bool(context.get("couple_only", False))
        consent = bool(context.get("consent", False))
        depth = int(context.get("depth", min(5, max(1, bonding))))

        row_mood = str(row["mood"]).lower()
        row_occasion = str(row["occasion"]).lower()
        row_relationship = str(row["relationship_stage"]).lower()
        row_energy = str(row["energy_level"]).lower()
        row_intimacy = str(row["intimacy_level"]).lower()

        if row_mood in {mood, "any"}:
            score += 0.20
        if row_occasion in {occasion, "any", "normal_day" if occasion == "normal_day" else "__none__"}:
            score += 0.14
        if row_relationship in {relationship, "any"}:
            score += 0.10

        energy_gap = abs(ENERGY_RANK.get(row_energy, 2) - ENERGY_RANK.get(energy, 2))
        score += max(0.0, 0.08 - 0.025 * energy_gap)

        intimacy_gap = abs(INTIMACY_RANK.get(row_intimacy, 1) - INTIMACY_RANK.get(intimacy, 1))
        score += max(0.0, 0.12 - 0.03 * intimacy_gap)

        row_depth = int(row.get("depth", 1))
        score += max(0.0, 0.08 - 0.02 * abs(row_depth - depth))

        # Strong preference for couple-only questions inside Couple Mode.
        row_couple = self._is_true(row["couple_only"])
        row_consent = self._is_true(row["consent_required"])
        if row_couple and couple_only:
            score += 0.12
        elif row_couple and not couple_only:
            return -1.0

        if row_consent and not consent:
            return -1.0
        if row_consent and consent:
            score += 0.04

        # Higher bonding allows deeper questions, but never overrides consent.
        if row_depth <= bonding:
            score += 0.04

        return min(score, 1.0)

    def _repetition_penalty(self, question: str, previous_questions: Iterable[str]) -> tuple[float, float]:
        previous = [str(item).strip() for item in previous_questions if str(item).strip()]
        if not previous:
            return 0.0, 0.0

        query_vector = self.vectorizer.transform([question])
        previous_vectors = self.vectorizer.transform(previous)
        similarities = cosine_similarity(query_vector, previous_vectors)[0]
        maximum = float(np.max(similarities)) if len(similarities) else 0.0

        # Exact/near duplicate -> hard skip. Similar questions receive a softer penalty.
        if maximum >= 0.86:
            return maximum, 1.0
        if maximum >= 0.72:
            return maximum, 0.45
        if maximum >= 0.58:
            return maximum, 0.20
        return maximum, 0.0

    def rank(self, context: dict, previous_questions: Iterable[str] = (), top_n: int = 5) -> list[dict]:
        profile = self.vectorizer.transform([self._text_profile(context)])
        text_scores = cosine_similarity(profile, self.matrix)[0]
        previous = list(previous_questions)
        results = []

        for index, row in self.questions.iterrows():
            metadata = self._metadata_score(row, context)
            if metadata < 0:
                continue

            repetition, penalty = self._repetition_penalty(row["question"], previous)
            if penalty >= 1.0:
                continue

            # Text similarity is the retrieval signal; metadata makes the ranking
            # understand Together's structured scene without requiring a large model.
            score = (0.60 * float(text_scores[index])) + (0.40 * metadata)
            score *= (1.0 - penalty)
            results.append({
                "question_id": int(row["question_id"]),
                "question": str(row["question"]),
                "category": str(row["category"]),
                "mood": str(row["mood"]),
                "occasion": str(row["occasion"]),
                "depth": int(row["depth"]),
                "romantic_intensity": int(row["romantic_intensity"]),
                "relevance": round(float(score), 4),
                "similarity_to_previous": round(float(repetition), 4),
            })

        results.sort(key=lambda item: item["relevance"], reverse=True)
        return results[: max(1, top_n)]

    def compare(self, question: str, candidates: Iterable[str], threshold: float = 0.72) -> list[dict]:
        """Compare a new question against candidates and flag likely repeats."""
        candidates = [str(item) for item in candidates if str(item).strip()]
        if not candidates:
            return []
        query = self.vectorizer.transform([question])
        vectors = self.vectorizer.transform(candidates)
        similarities = cosine_similarity(query, vectors)[0]
        output = []
        for candidate, similarity in sorted(zip(candidates, similarities), key=lambda item: item[1], reverse=True):
            value = float(similarity)
            output.append({
                "candidate": candidate,
                "similarity": round(value, 4),
                "likely_repeat": value >= threshold,
            })
        return output
