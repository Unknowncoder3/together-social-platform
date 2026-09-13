"""Train Together's activity recommendation model.

The model predicts which activity is most suitable for a new session context.
It is intentionally offline and uses only scikit-learn; no external AI/API is required.

Usage:
    python3 ml/training/train_activity_model.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import joblib
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, classification_report, f1_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder

ROOT = Path(__file__).resolve().parents[2]
DATASET = ROOT / "ml" / "dataset" / "experience_scenarios.csv"
ACTIVITIES = ROOT / "ml" / "dataset" / "activities.csv"
MODEL_DIR = ROOT / "ml" / "models"
MODEL_PATH = MODEL_DIR / "activity_recommender.joblib"
METRICS_PATH = MODEL_DIR / "activity_recommender_metrics.json"

FEATURES = [
    "mood",
    "energy_level",
    "time_available",
    "time_of_day",
    "occasion",
    "relationship_stage",
    "bonding_level",
    "intimacy_level",
    "couple_only",
    "consent_required",
]
CATEGORICAL = [
    "mood",
    "energy_level",
    "time_of_day",
    "occasion",
    "relationship_stage",
    "intimacy_level",
    "couple_only",
    "consent_required",
]
NUMERIC = ["time_available", "bonding_level"]


def top_k_accuracy(y_true: pd.Series, probabilities, classes, k: int) -> float:
    hits = 0
    for truth, row in zip(y_true.tolist(), probabilities):
        ranked = [classes[i] for i in row.argsort()[::-1][:k]]
        if truth in ranked:
            hits += 1
    return hits / len(y_true)


def main() -> None:
    if not DATASET.exists():
        print(f"Dataset not found: {DATASET}")
        print("Run: python3 ml/dataset/generate_dataset.py")
        sys.exit(1)

    if not ACTIVITIES.exists():
        print(f"Activity catalog not found: {ACTIVITIES}")
        sys.exit(1)

    df = pd.read_csv(DATASET)
    missing = [c for c in FEATURES + ["recommended_activity_id"] if c not in df.columns]
    if missing:
        raise ValueError(f"Dataset is missing columns: {missing}")

    # Keep the target as an integer activity ID. The activity catalog remains the
    # source of truth for names/descriptions and can be expanded later.
    df["recommended_activity_id"] = df["recommended_activity_id"].astype(int)
    X = df[FEATURES]
    y = df["recommended_activity_id"]

    X_train, X_test, y_train, y_test = train_test_split(
        X,
        y,
        test_size=0.20,
        random_state=42,
        stratify=y,
    )

    preprocess = ColumnTransformer(
        transformers=[
            ("categorical", OneHotEncoder(handle_unknown="ignore"), CATEGORICAL),
            ("numeric", "passthrough", NUMERIC),
        ]
    )

    model = Pipeline(
        steps=[
            ("preprocess", preprocess),
            (
                "recommender",
                RandomForestClassifier(
                    n_estimators=400,
                    max_depth=18,
                    min_samples_leaf=2,
                    random_state=42,
                    n_jobs=-1,
                    class_weight="balanced",
                ),
            ),
        ]
    )

    print("Training Together Activity Recommendation Model...")
    print(f"Dataset: {DATASET}")
    print(f"Rows: {len(df):,}")
    print(f"Activities represented: {y.nunique()}")

    model.fit(X_train, y_train)
    predictions = model.predict(X_test)
    probabilities = model.predict_proba(X_test)
    classes = model.named_steps["recommender"].classes_

    accuracy = accuracy_score(y_test, predictions)
    macro_f1 = f1_score(y_test, predictions, average="macro")
    weighted_f1 = f1_score(y_test, predictions, average="weighted")
    top3 = top_k_accuracy(y_test, probabilities, classes, 3)
    top5 = top_k_accuracy(y_test, probabilities, classes, 5)

    print("\nEvaluation")
    print(f"Top-1 Accuracy : {accuracy:.4f}")
    print(f"Top-3 Accuracy : {top3:.4f}")
    print(f"Top-5 Accuracy : {top5:.4f}")
    print(f"Macro F1       : {macro_f1:.4f}")
    print(f"Weighted F1    : {weighted_f1:.4f}")
    print("\nClassification report:\n")
    print(classification_report(y_test, predictions, zero_division=0))

    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, MODEL_PATH)

    catalog = pd.read_csv(ACTIVITIES)
    names = dict(zip(catalog["activity_id"], catalog["activity_name"]))
    metrics = {
        "model": "RandomForestClassifier",
        "purpose": "activity_recommendation",
        "dataset_rows": int(len(df)),
        "test_rows": int(len(X_test)),
        "features": FEATURES,
        "activities": [
            {"id": int(activity_id), "name": names.get(int(activity_id), "Unknown")}
            for activity_id in sorted(y.unique())
        ],
        "top1_accuracy": round(float(accuracy), 6),
        "top3_accuracy": round(float(top3), 6),
        "top5_accuracy": round(float(top5), 6),
        "macro_f1": round(float(macro_f1), 6),
        "weighted_f1": round(float(weighted_f1), 6),
        "random_state": 42,
    }
    METRICS_PATH.write_text(json.dumps(metrics, indent=2), encoding="utf-8")

    print(f"\nSaved model: {MODEL_PATH}")
    print(f"Saved metrics: {METRICS_PATH}")


if __name__ == "__main__":
    main()
