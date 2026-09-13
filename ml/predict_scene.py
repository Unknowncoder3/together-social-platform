"""Predict a Together scene from a new couple/session context.

Usage:
    python3 ml/predict_scene.py --mood sensual --energy medium --time 20 \
      --time-of-day evening --occasion date_night --relationship serious \
      --bonding 4 --intimacy high --couple-only true --consent true

The trained model must exist at ml/models/scene_classifier.joblib.
"""

from __future__ import annotations

import argparse
from pathlib import Path

import joblib
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
MODEL_PATH = ROOT / "ml" / "models" / "scene_classifier.joblib"

FEATURES = [
    "mood", "energy_level", "time_available", "time_of_day", "occasion",
    "relationship_stage", "bonding_level", "intimacy_level", "couple_only",
    "consent_required",
]


def boolean(value: str) -> str:
    value = value.strip().lower()
    if value not in {"true", "false"}:
        raise argparse.ArgumentTypeError("use true or false")
    return value


def main() -> None:
    parser = argparse.ArgumentParser(description="Predict a Together experience scene")
    parser.add_argument("--mood", required=True)
    parser.add_argument("--energy", required=True, dest="energy_level")
    parser.add_argument("--time", required=True, type=int, dest="time_available")
    parser.add_argument("--time-of-day", required=True, dest="time_of_day")
    parser.add_argument("--occasion", required=True)
    parser.add_argument("--relationship", required=True, dest="relationship_stage")
    parser.add_argument("--bonding", required=True, type=int, dest="bonding_level")
    parser.add_argument("--intimacy", required=True, dest="intimacy_level")
    parser.add_argument("--couple-only", required=True, type=boolean, dest="couple_only")
    parser.add_argument("--consent", required=True, type=boolean, dest="consent_required")
    args = parser.parse_args()

    if not MODEL_PATH.exists():
        raise SystemExit("Model not found. Train it first with: python3 ml/training/train_scene_model.py")

    row = {name: getattr(args, name) for name in FEATURES}
    sample = pd.DataFrame([row], columns=FEATURES)
    model = joblib.load(MODEL_PATH)
    prediction = model.predict(sample)[0]

    print(f"Predicted scene: {prediction}")

    if hasattr(model, "predict_proba"):
        probabilities = model.predict_proba(sample)[0]
        classes = model.classes_
        ranked = sorted(zip(classes, probabilities), key=lambda item: item[1], reverse=True)[:5]
        print("Top scene probabilities:")
        for scene, probability in ranked:
            print(f"  {scene:<32} {probability:.3f}")


if __name__ == "__main__":
    main()
