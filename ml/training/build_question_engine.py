"""Build Together's offline question intelligence engine.

This component uses TF-IDF + cosine similarity for question retrieval and
repetition detection. It does not call an external AI/API.

Usage:
    python3 ml/training/build_question_engine.py
"""

from __future__ import annotations

import json
from pathlib import Path

import joblib
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

ROOT = Path(__file__).resolve().parents[2]
QUESTIONS = ROOT / "ml" / "dataset" / "questions.csv"
MODEL_DIR = ROOT / "ml" / "models"
MODEL_PATH = MODEL_DIR / "question_engine.joblib"
METRICS_PATH = MODEL_DIR / "question_engine_metrics.json"

TEXT_COLUMNS = ["question", "category", "mood", "occasion", "relationship_stage"]


def main() -> None:
    if not QUESTIONS.exists():
        raise SystemExit(f"Question dataset not found: {QUESTIONS}")

    df = pd.read_csv(QUESTIONS)
    required = {
        "question_id", "question", "category", "mood", "energy_level",
        "intimacy_level", "occasion", "relationship_stage", "depth",
        "romantic_intensity", "couple_only", "consent_required",
    }
    missing = sorted(required - set(df.columns))
    if missing:
        raise ValueError(f"Question dataset is missing columns: {missing}")

    df = df.dropna(subset=["question"]).copy()
    for column in TEXT_COLUMNS:
        df[column] = df[column].fillna("any").astype(str).str.strip().str.lower()

    # Repeat important context words so metadata has influence without needing
    # a supervised classifier. The original question remains the main signal.
    documents = (
        df["question"] + " " +
        df["question"] + " " +
        df["category"] + " " +
        df["mood"] + " " +
        df["occasion"] + " " +
        df["relationship_stage"]
    )

    vectorizer = TfidfVectorizer(
        lowercase=True,
        stop_words="english",
        ngram_range=(1, 2),
        min_df=1,
        sublinear_tf=True,
    )
    matrix = vectorizer.fit_transform(documents)

    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    artifact = {
        "vectorizer": vectorizer,
        "matrix": matrix,
        "questions": df,
        "version": 1,
        "similarity_method": "tfidf_cosine",
    }
    joblib.dump(artifact, MODEL_PATH)

    # A useful unsupervised diagnostic: how many questions have a close neighbor?
    # The diagonal is ignored because every question is identical to itself.
    similarities = cosine_similarity(matrix)
    similarities[range(len(df)), range(len(df))] = 0.0
    nearest = similarities.max(axis=1) if len(df) else []
    metrics = {
        "model": "TF-IDF + cosine similarity",
        "purpose": "question_retrieval_and_repetition_detection",
        "question_count": int(len(df)),
        "feature_count": int(len(vectorizer.get_feature_names_out())),
        "ngram_range": [1, 2],
        "average_nearest_similarity": round(float(nearest.mean()), 6) if len(df) else 0.0,
        "high_similarity_count_at_0_80": int((nearest >= 0.80).sum()) if len(df) else 0,
        "version": 1,
    }
    METRICS_PATH.write_text(json.dumps(metrics, indent=2), encoding="utf-8")

    print("Together Question Intelligence Engine")
    print("--------------------------------------")
    print(f"Questions indexed : {len(df):,}")
    print(f"TF-IDF features   : {len(vectorizer.get_feature_names_out()):,}")
    print(f"Nearest similarity: {metrics['average_nearest_similarity']:.4f}")
    print(f"Saved engine      : {MODEL_PATH}")
    print(f"Saved metrics     : {METRICS_PATH}")


if __name__ == "__main__":
    main()
