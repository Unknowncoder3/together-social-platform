# Together Experience Intelligence Engine

Phase 5 replaces dependency on external generative AI with a proprietary ML/recommendation pipeline.

## Phase 5.1 — Dataset foundation

The dataset layer contains:

- `dataset/moods.csv` — mood taxonomy, including couple-only `sensual` and `erotic` states.
- `dataset/occasions.csv` — dates, celebrations, ordinary nights, long-distance sessions, etc.
- `dataset/activities.csv` — activities the engine can recommend.
- `dataset/questions.csv` — starter question library. Add your own questions using the same columns.
- `dataset/generate_dataset.py` — deterministic teacher/scenario generator.

Running the generator creates `dataset/experience_scenarios.csv` with 5,000 reproducible training scenarios using seed 42.

```bash
python3 ml/dataset/generate_dataset.py
```

No external API or internet connection is required.

## Phase 5.2 — Scene classifier

`training/train_scene_model.py` trains the first model from the scenario context and evaluates accuracy and F1. The trained artifact is saved locally under `ml/models/` and is intentionally not committed to Git because it is reproducible from the dataset and training script.

```bash
python3 ml/training/train_scene_model.py
```

The current model uses a scikit-learn Random Forest with categorical one-hot encoding and numeric features.

## Phase 5.3 — Activity recommendation

`training/train_activity_model.py` predicts the best activity for a new couple/session context. Instead of judging only the single top prediction, the evaluation reports Top-1, Top-3 and Top-5 accuracy because Together will use the model as a ranking system.

```bash
python3 ml/training/train_activity_model.py
```

The model is saved locally as `ml/models/activity_recommender.joblib` with evaluation metrics in `ml/models/activity_recommender_metrics.json`.

To test a real context:

```bash
python3 ml/predict_activity.py --mood sensual --energy medium --time 20 \
  --time-of-day evening --occasion date_night --relationship serious \
  --bonding 4 --intimacy high --couple-only true --consent true
```

The predictor ranks candidate activities and applies a defense-in-depth filter so intimate/couple-only activities are not surfaced outside a consenting couple context.

## Intimate moods

`Sensual` and `Erotic` are modeled as couple-only states. The dataset marks them with higher intimacy and `consent_required=true`. The product should only expose these states inside Couple Mode with explicit mutual consent and adjustable intensity. Content remains non-graphic.

## Planned ML pipeline

1. Scene classification
2. Activity recommendation/ranking
3. Question recommendation and repetition detection
4. Couple preference learning from feedback
5. Experience sequencing and next-action prediction
6. Node integration

The long-term goal is for Together to run its experience intelligence locally without depending on OpenAI, Groq, Gemini, or another external AI provider.
