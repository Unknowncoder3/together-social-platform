# Together — Social & Virtual Experience Platform

> Don't just call. Hang out.

Together is a portfolio-grade real-time social platform for friends and couples. The project is built phase-by-phase so every major feature can be tested locally before the next layer is added.

## Current milestones

### Phase 1 — Foundation
- Register / login
- Profile
- Friend requests
- Create / join rooms
- Persistent local data
- Room chat

### Phase 2 — Real-Time Experience
- Socket.IO real-time chat and presence
- WebRTC video/audio
- Camera and microphone controls
- Screen sharing
- Join/leave notifications

### Phase 3 — Games + AI Questions
- Tic-Tac-Toe
- Connect Four
- Trivia Battle
- Scribble
- Find the Spy
- Question Lab

### Phase 4 — Couple Experience
- One-to-one couple connection
- Private couple room
- Couple video/audio/chat
- Bonding check-in and relationship level
- Important dates
- Memories
- Little Moments
- Mood and intensity
- Couple games

### Phase 5 — Proprietary Experience Intelligence
Together's long-term AI goal is an offline ML/recommendation pipeline rather than dependence on a hosted generative AI provider.

#### 5.1 Dataset foundation
- `ml/dataset/moods.csv` — mood taxonomy, including couple-only `sensual` and `erotic` states
- `ml/dataset/occasions.csv` — session occasions
- `ml/dataset/activities.csv` — activity catalog
- `ml/dataset/questions.csv` — starter question library
- `ml/dataset/generate_dataset.py` — deterministic scenario generator

Generate 5,000 reproducible scenarios:

```bash
python3 ml/dataset/generate_dataset.py
```

#### 5.2 Scene classification
- Offline scikit-learn Random Forest
- Predicts the current experience scene from mood, energy, time, occasion, relationship stage, bonding, intimacy and consent context

```bash
python3 ml/training/train_scene_model.py
python3 ml/predict_scene.py --mood romantic --energy medium --time 20 --time-of-day evening --occasion date_night --relationship serious --bonding 4 --intimacy moderate --couple-only true --consent true
```

#### 5.3 Activity recommendation
- Offline Random Forest recommendation model
- Ranks activities using Top-1 / Top-3 / Top-5 evaluation
- Defense-in-depth safety filtering for couple-only and intimate activities

```bash
python3 ml/training/train_activity_model.py
python3 ml/predict_activity.py --mood sensual --energy medium --time 20 --time-of-day evening --occasion date_night --relationship serious --bonding 4 --intimacy high --couple-only true --consent true
```

#### 5.4 Question Intelligence
- TF-IDF + cosine similarity retrieval engine
- Context-aware question ranking using mood, occasion, relationship stage, energy, intimacy and bonding
- Repetition detection against previously asked questions
- Couple/consent filtering
- No external API required

Build the question index:

```bash
python3 ml/training/build_question_engine.py
```

Test recommendations:

```bash
python3 ml/predict_question.py --mood romantic --energy medium --occasion date_night --relationship serious --depth 3 --bonding 4 --intimacy moderate --couple-only true --consent true
```

#### 5.5 Preference Learning
Together now has an offline preference-learning layer that learns from explicit couple feedback instead of assuming every couple has the same tastes.

Supported feedback signals:
- `like`
- `favorite`
- `complete`
- `skip`
- `too_easy`
- `too_deep`
- `dislike`

The online `PreferenceEngine` keeps transparent per-couple scores for activities, questions, categories, moods and intimacy levels. This can immediately personalize rankings without an external AI service.

Record a feedback event:

```bash
python3 ml/record_feedback.py \
  --couple-id demo-couple \
  --item-type activity \
  --item-id flirty_qa \
  --action favorite \
  --category conversation \
  --mood romantic \
  --intimacy-level moderate
```

Once at least 30 feedback events exist, the optional contextual Ridge model can be trained:

```bash
python3 ml/train_preference_model.py
```

This threshold is intentional: the first version learns online with an interpretable scoring system, while the supervised model waits for real interaction data instead of pretending synthetic examples represent genuine user preferences.

## Intimate moods

`Sensual` and `Erotic` are modeled as couple-only states. The dataset marks them with higher intimacy and consent requirements. The product should expose these states only inside Couple Mode with explicit mutual consent and adjustable intensity. Content remains non-graphic, and either partner must be able to lower intensity or skip.

## Stack

- React + Vite
- Node.js + Express
- Socket.IO
- WebRTC
- Python + pandas + scikit-learn + joblib for the offline ML pipeline
- JSON file persistence for local development
- bcryptjs + JWT authentication

PostgreSQL/pgvector and Redis can be introduced later when the local architecture is stable.

## Run locally

Requirements: Node.js 20.19+ and Python 3.

Install JavaScript dependencies:

```bash
npm install
```

Install ML dependencies:

```bash
python3 -m pip install -r ml/requirements.txt
```

Run the application:

```bash
npm run dev
```

Open `http://localhost:5173`.

The local services are:
- Main server: `5001`
- Couple service: `5002`
- Client: `5173`

The ML models are intentionally reproducible and are generated locally from the tracked datasets/scripts. No external AI/API connection is required for the ML pipeline.
