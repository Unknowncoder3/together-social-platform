"""Predict and rank Together activities for a new session context.

Usage:
    python3 ml/predict_activity.py --mood sensual --energy medium --time 20 \
      --time-of-day evening --occasion date_night --relationship serious \
      --bonding 4 --intimacy high --couple-only true --consent true

The trained model must exist at ml/models/activity_recommender.joblib.
"""

from __future__ import annotations

import argparse
from pathlib import Path

import joblib
import pandas as pd

ROOT = Path(__file__).resolve().parent
MODEL_PATH = ROOT / "models" / "activity_recommender.joblib"
CATALOG_PATH = ROOT / "dataset" / "activities.csv"

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
    parser = argparse.ArgumentParser(description="Rank Together activities")
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
    parser.add_argument("--top", type=int, default=5)
    args = parser.parse_args()

    if not MODEL_PATH.exists():
        raise SystemExit("Model not found. Train it first with: python3 ml/training/train_activity_model.py")

    if not CATALOG_PATH.exists():
        raise SystemExit(f"Activity catalog not found: {CATALOG_PATH}")

    row = {name: getattr(args, name) for name in FEATURES}
    sample = pd.DataFrame([row], columns=FEATURES)
    model = joblib.load(MODEL_PATH)
    probabilities = model.predict_proba(sample)[0]
    classes = model.named_steps["recommender"].classes_

    catalog = pd.read_csv(CATALOG_PATH)
    by_id = catalog.set_index("activity_id").to_dict("index")

    ranked = sorted(zip(classes, probabilities), key=lambda item: item[1], reverse=True)

    # Defense-in-depth: an intimate activity is never surfaced when the request
    # does not represent a consenting couple session. This is independent of the
    # model prediction and will also be enforced again by the application layer.
    filtered = []
    for activity_id, probability in ranked:
        info = by_id.get(int(activity_id), {})
        couple_only = str(info.get("couple_only", "false")).lower() == "true"
        intimate = str(info.get("intimacy_level", "light")).lower() in {"high", "very_high"}
        if (couple_only or intimate) and args.couple_only != "true":
            continue
        if intimate and args.consent_required != "true":
            continue
        filtered.append((activity_id, probability))

    print("Together Activity Recommendations")
    print("---------------------------------")
    for rank, (activity_id, probability) in enumerate(filtered[: max(1, args.top)], start=1):
        info = by_id.get(int(activity_id), {})
        name = info.get("activity_name", f"Activity {activity_id}")
        category = info.get("category", "unknown")
        print(f"{rank}. {name:<28} {probability:.3f}  [{category}]")


if __name__ == "__main__":
    main()
