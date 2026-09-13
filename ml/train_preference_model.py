"""Train an optional contextual preference model from real feedback.

This is intentionally conservative: the dataset must contain enough feedback
before a learned model is trusted. Until then, PreferenceEngine remains the
primary transparent ranking layer.
"""

from __future__ import annotations

from pathlib import Path

import joblib
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.feature_extraction import DictVectorizer
from sklearn.linear_model import Ridge
from sklearn.pipeline import Pipeline

ROOT = Path(__file__).resolve().parent
DATA_PATH = ROOT / "dataset" / "feedback.csv"
MODEL_PATH = ROOT / "models" / "preference_model.joblib"

ACTION_REWARD = {"favorite": 2.0, "like": 1.0, "complete": 0.6,
                 "skip": -1.0, "too_easy": -0.6, "too_deep": -0.7, "dislike": -1.2}

FEATURES = ["item_type", "item_id", "category", "mood", "intimacy_level",
            "energy_level", "occasion", "relationship_stage", "bonding_level"]


def main() -> None:
    if not DATA_PATH.exists():
        raise FileNotFoundError(f"Feedback dataset not found: {DATA_PATH}")
    df = pd.read_csv(DATA_PATH).fillna("")
    if len(df) < 30:
        print(f"Feedback rows: {len(df)}")
        print("Need at least 30 feedback events before training a contextual model.")
        print("The online PreferenceEngine can still learn immediately from each event.")
        return

    for column in FEATURES:
        if column not in df.columns:
            df[column] = ""
    df["reward"] = df["action"].map(ACTION_REWARD).fillna(0.0)

    records = df[FEATURES].astype(str).to_dict(orient="records")
    vectorizer = DictVectorizer(sparse=True)
    X = vectorizer.fit_transform(records)
    model = Ridge(alpha=2.0)
    model.fit(X, df["reward"].to_numpy())

    artifact = {
        "vectorizer": vectorizer,
        "model": model,
        "features": FEATURES,
        "rows": int(len(df)),
        "reward_map": ACTION_REWARD,
    }
    MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(artifact, MODEL_PATH)
    print("Together Contextual Preference Model")
    print("------------------------------------")
    print(f"Feedback rows: {len(df)}")
    print(f"Learned coefficients: {len(model.coef_)}")
    print(f"Saved model: {MODEL_PATH}")


if __name__ == "__main__":
    main()
