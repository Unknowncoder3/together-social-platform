"""Train Together's first ML model: a scene classifier.

The model learns a scene label from the couple/session context. This is intentionally
an offline scikit-learn pipeline: no external AI/API is required.

Usage:
    python3 ml/training/train_scene_model.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import joblib
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import classification_report, accuracy_score, f1_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder

ROOT = Path(__file__).resolve().parents[2]
DATASET = ROOT / "ml" / "dataset" / "experience_scenarios.csv"
MODEL_DIR = ROOT / "ml" / "models"
MODEL_PATH = MODEL_DIR / "scene_classifier.joblib"
METRICS_PATH = MODEL_DIR / "scene_classifier_metrics.json"

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


def derive_scene(row: pd.Series) -> str:
    """Create a meaningful scene label from several context dimensions."""
    mood = row["mood"]
    energy = row["energy_level"]
    occasion = row["occasion"]
    relationship = row["relationship_stage"]
    bonding = int(row["bonding_level"])

    if mood == "erotic":
        return "intimate_high_intensity"
    if mood == "sensual":
        return "sensual_connection"
    if occasion in {"anniversary", "valentines"} and bonding >= 3:
        return "romantic_celebration"
    if occasion == "first_date" or relationship in {"just_met", "new"}:
        return "getting_to_know_each_other"
    if occasion in {"birthday", "celebration", "holiday"}:
        return "celebration_fun"
    if occasion in {"anniversary", "special_memory"} or mood == "nostalgic":
        return "memory_connection"
    if occasion == "rough_day" or mood == "low_energy" or energy == "very_low":
        return "gentle_connection"
    if mood == "deep":
        return "deep_connection"
    if mood in {"romantic", "affectionate"}:
        return "romantic_connection"
    if mood == "energetic" or energy == "very_high":
        return "high_energy_fun"
    if mood == "playful":
        return "playful_social"
    if mood in {"calm", "relaxed"}:
        return "calm_connection"
    return "positive_social"


def main() -> None:
    if not DATASET.exists():
        print(f"Dataset not found: {DATASET}")
        print("Run: python3 ml/dataset/generate_dataset.py")
        sys.exit(1)

    df = pd.read_csv(DATASET)
    missing = [c for c in FEATURES if c not in df.columns]
    if missing:
        raise ValueError(f"Dataset is missing columns: {missing}")

    df["scene_target"] = df.apply(derive_scene, axis=1)
    X = df[FEATURES]
    y = df["scene_target"]

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
                "classifier",
                RandomForestClassifier(
                    n_estimators=300,
                    max_depth=14,
                    min_samples_leaf=2,
                    random_state=42,
                    n_jobs=-1,
                    class_weight="balanced",
                ),
            ),
        ]
    )

    print("Training Together Scene Classifier...")
    print(f"Dataset: {DATASET}")
    print(f"Rows: {len(df):,}")
    print(f"Scenes: {y.nunique()}")

    model.fit(X_train, y_train)
    predictions = model.predict(X_test)

    accuracy = accuracy_score(y_test, predictions)
    macro_f1 = f1_score(y_test, predictions, average="macro")
    weighted_f1 = f1_score(y_test, predictions, average="weighted")

    print("\nEvaluation")
    print(f"Accuracy : {accuracy:.4f}")
    print(f"Macro F1 : {macro_f1:.4f}")
    print(f"Weighted F1: {weighted_f1:.4f}")
    print("\nClassification report:\n")
    print(classification_report(y_test, predictions, zero_division=0))

    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, MODEL_PATH)

    metrics = {
        "model": "RandomForestClassifier",
        "dataset_rows": int(len(df)),
        "test_rows": int(len(X_test)),
        "features": FEATURES,
        "scenes": sorted(y.unique().tolist()),
        "accuracy": round(float(accuracy), 6),
        "macro_f1": round(float(macro_f1), 6),
        "weighted_f1": round(float(weighted_f1), 6),
        "random_state": 42,
    }
    METRICS_PATH.write_text(json.dumps(metrics, indent=2), encoding="utf-8")

    print(f"\nSaved model: {MODEL_PATH}")
    print(f"Saved metrics: {METRICS_PATH}")


if __name__ == "__main__":
    main()
