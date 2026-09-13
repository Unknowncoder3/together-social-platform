# Together Experience Intelligence Engine

Phase 5 replaces dependency on external generative AI with a proprietary ML/recommendation pipeline.

## Phase 5.1 — Dataset foundation

The current dataset layer contains:

- `dataset/moods.csv` — mood taxonomy, including couple-only `sensual` and `erotic` states.
- `dataset/occasions.csv` — dates, celebrations, ordinary nights, long-distance sessions, etc.
- `dataset/activities.csv` — activities the engine can recommend.
- `dataset/questions.csv` — starter question library. Add your own questions using the same columns.
- `dataset/generate_dataset.py` — deterministic teacher/scenario generator.

Running the generator creates `dataset/experience_scenarios.csv` with 5,000 reproducible training scenarios using seed 42.

## Generate the training data

From the project root:

```bash
python3 ml/dataset/generate_dataset.py
```

or, after the package script is available:

```bash
npm run ml:generate
```

No external API or internet connection is required.

## What the scenario dataset represents

Each scenario contains context such as:

- mood
- energy level
- available time
- time of day
- occasion
- relationship stage
- bonding level
- intimacy level
- couple-only state
- consent-required state
- scene label
- recommended activity
- expected engagement

The generator is intentionally transparent. It acts as a teacher/ranking system for the first ML model. Later phases will train models from these examples and evaluate them on held-out data.

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
