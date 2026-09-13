"""Together's fully local experience orchestrator.

Combines the trained scene classifier, activity recommender, TF-IDF question
engine, and couple preference engine. No external AI provider is required.
The Node experience service calls this module through stdin/stdout.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import joblib
import pandas as pd

ROOT = Path(__file__).resolve().parent
MODELS = ROOT / "models"
DATASET = ROOT / "dataset"

FEATURES = [
    "mood", "energy_level", "time_available", "time_of_day", "occasion",
    "relationship_stage", "bonding_level", "intimacy_level", "couple_only",
    "consent_required",
]

ENERGY = {"very_low": 0, "low": 1, "medium": 2, "high": 3, "very_high": 4}
INTIMACY = {"none": 0, "light": 1, "moderate": 2, "high": 3, "very_high": 4}


def truth(v):
    return str(v).strip().lower() == "true" or v is True


def norm(ctx):
    c = dict(ctx or {})
    c["mood"] = str(c.get("mood", "romantic")).lower().replace(" ", "_")
    c["energy_level"] = str(c.get("energy_level", "medium")).lower().replace(" ", "_")
    c["time_available"] = max(5, int(c.get("time_available", 30)))
    c["time_of_day"] = str(c.get("time_of_day", "evening")).lower().replace(" ", "_")
    c["occasion"] = str(c.get("occasion", "date_night")).lower().replace(" ", "_")
    c["relationship_stage"] = str(c.get("relationship_stage", "serious")).lower().replace(" ", "_")
    c["bonding_level"] = max(1, min(5, int(c.get("bonding_level", 1))))
    c["intimacy_level"] = str(c.get("intimacy_level", "moderate")).lower().replace(" ", "_")
    c["couple_only"] = truth(c.get("couple_only", True))
    c["consent_required"] = truth(c.get("consent_required", True))
    c["depth"] = max(1, min(5, int(c.get("depth", c["bonding_level"]))))
    return c


def load_models():
    scene = joblib.load(MODELS / "scene_classifier.joblib")
    activity = joblib.load(MODELS / "activity_recommender.joblib")
    from question_engine import QuestionEngine
    from preference_engine import PreferenceEngine
    return scene, activity, QuestionEngine(), PreferenceEngine()


def scene_and_activities(ctx, previous_activity_ids=None):
    scene_model, activity_model, question_engine, preferences = load_models()
    row = {k: ctx[k] for k in FEATURES}
    sample = pd.DataFrame([row], columns=FEATURES)

    scene_probs = scene_model.predict_proba(sample)[0]
    scene_rank = sorted(zip(scene_model.classes_, scene_probs), key=lambda x: x[1], reverse=True)
    scene = str(scene_rank[0][0])

    probs = activity_model.predict_proba(sample)[0]
    classes = activity_model.named_steps["recommender"].classes_
    catalog = pd.read_csv(DATASET / "activities.csv")
    by_id = catalog.set_index("activity_id").to_dict("index")
    previous = {int(x) for x in (previous_activity_ids or []) if str(x).isdigit()}
    candidates = []
    for activity_id, probability in sorted(zip(classes, probs), key=lambda x: x[1], reverse=True):
        aid = int(activity_id)
        info = by_id.get(aid, {})
        if not info:
            continue
        if aid in previous:
            continue
        if int(info.get("min_minutes", 5)) > ctx["time_available"]:
            continue
        if truth(info.get("couple_only")) and not ctx["couple_only"]:
            continue
        intimate = str(info.get("intimacy_level", "light")) in {"high", "very_high"}
        if intimate and not ctx["consent_required"]:
            continue
        # Blend the trained probability with transparent context signals.
        energy_gap = abs(ENERGY.get(str(info.get("base_energy", "medium")), 2) - ENERGY.get(ctx["energy_level"], 2))
        intimacy_gap = abs(INTIMACY.get(str(info.get("intimacy_level", "light")), 1) - INTIMACY.get(ctx["intimacy_level"], 1))
        fit = 0.30 * float(probability)
        fit += max(0.0, 0.16 - 0.04 * energy_gap)
        fit += max(0.0, 0.14 - 0.04 * intimacy_gap)
        fit += 0.08 if ctx["time_available"] <= int(info.get("max_minutes", 60)) else 0.0
        pref = preferences.score("__runtime__", "activity", str(aid), str(info.get("category", "")), ctx["mood"], str(info.get("intimacy_level", "light")))
        candidates.append({
            "activity_id": aid,
            "activity_name": str(info.get("activity_name", "Activity")),
            "category": str(info.get("category", "unknown")),
            "description": str(info.get("description", "")),
            "intimacy_level": str(info.get("intimacy_level", "light")),
            "model_probability": round(float(probability), 4),
            "score": round(fit + 0.04 * pref, 4),
        })
    candidates.sort(key=lambda x: x["score"], reverse=True)
    return scene, [{"scene": s, "probability": round(float(p), 4)} for s, p in scene_rank[:5]], candidates, question_engine


def question_candidates(ctx, previous_questions, question_engine):
    return question_engine.rank(ctx, previous_questions=previous_questions or [], top_n=10)


def step_for(activity, question, ctx, index):
    name = activity["activity_name"] if activity else "A little moment together"
    category = activity.get("category", "conversation") if activity else "conversation"
    mood = ctx["mood"].replace("_", " ")
    if question:
        return {
            "kind": "question",
            "title": question["question"],
            "text": f"{name}: take turns answering honestly. Keep it {mood}, and skip if either of you would rather not answer.",
            "choices": [],
            "activityId": activity.get("activity_id") if activity else None,
            "questionId": question.get("question_id"),
            "category": question.get("category", category),
        }
    templates = {
        "question_game": ("Take turns", ["Me first", "You first", "Both answer"]),
        "competitive_game": ("Pick the winner", ["Play best of 3", "Play one round", "Cooperate instead"]),
        "creative_game": ("Create together", ["Draw", "Act it out", "Make a story"]),
        "social_game": ("Set the scene", ["Play normally", "Make it harder", "Keep it playful"]),
        "memory": ("Choose a memory", ["Funny", "Romantic", "Unexpected"]),
        "date_activity": ("Design the date", ["Cozy", "Adventure", "Fancy"]),
        "watch_together": ("Settle in", ["Music", "Video", "Talk first"]),
        "challenge": ("Choose your challenge", ["Easy", "Playful", "Bold"]),
        "romantic_activity": ("Choose your vibe", ["Sweet", "Playful", "Flirty"]),
        "intimate_activity": ("Choose your comfort", ["Light", "Flirty", "Skip"]),
        "conversation": ("Take your time", ["Answer first", "Answer together", "Pass"]),
    }
    title, choices = templates.get(category, ("Your next moment", ["Together", "Playful", "Pass"]))
    return {
        "kind": "choice" if choices else "challenge",
        "title": f"{name} — {title}",
        "text": activity.get("description", "Enjoy this moment together.") + " Either partner can skip or change the intensity.",
        "choices": choices,
        "activityId": activity.get("activity_id") if activity else None,
        "questionId": None,
        "category": category,
    }


def create(payload):
    ctx = norm(payload.get("context"))
    previous = payload.get("previous_questions", [])
    scene, scene_probs, activities, qengine = scene_and_activities(ctx, payload.get("previous_activity_ids", []))
    qs = question_candidates(ctx, previous, qengine)
    steps = []
    used_questions = []
    for i in range(min(max(3, int(payload.get("steps", 5))), 6)):
        activity = activities[i % len(activities)] if activities else None
        q = qs[i % len(qs)] if qs and (i % 2 == 0 or not activity) else None
        if q and q.get("question") in used_questions:
            q = None
        if q:
            used_questions.append(q["question"])
        steps.append(step_for(activity, q, ctx, i))
    return {"scene": scene, "sceneProbabilities": scene_probs, "candidateActivities": activities[:8], "steps": steps}


def next_step(payload):
    ctx = norm(payload.get("context"))
    previous = payload.get("previous_questions", [])
    used_ids = payload.get("used_activity_ids", [])
    scene, scene_probs, activities, qengine = scene_and_activities(ctx, used_ids)
    qs = question_candidates(ctx, previous, qengine)
    activity = activities[0] if activities else None
    question = qs[0] if qs else None
    step = step_for(activity, question, ctx, 0)
    return {"scene": scene, "sceneProbabilities": scene_probs, "step": step, "directorNote": f"Local models selected this moment for the current {ctx['mood'].replace('_', ' ')} mood, available time and couple context."}


def main():
    payload = json.loads(sys.stdin.read() or "{}")
    action = payload.get("action", "create")
    result = create(payload) if action == "create" else next_step(payload)
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
