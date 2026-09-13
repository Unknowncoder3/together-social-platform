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
- Context-aware question retrieval and repetition detection

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

### Phase 5 — Experience Intelligence
Together combines offline ML signals with an optional generative AI experience director.

#### 5.1 Dataset foundation
- `ml/dataset/moods.csv` — mood taxonomy
- `ml/dataset/occasions.csv` — session occasions
- `ml/dataset/activities.csv` — activity catalog
- `ml/dataset/questions.csv` — starter question library
- `ml/dataset/generate_dataset.py` — deterministic scenario generator

Generate reproducible scenarios:

```bash
python3 ml/dataset/generate_dataset.py
```

#### 5.2 Scene classification
Offline scikit-learn Random Forest predicts the current experience scene from mood, energy, time, occasion, relationship stage, bonding, intimacy and consent context.

```bash
python3 ml/training/train_scene_model.py
python3 ml/predict_scene.py --mood romantic --energy medium --time 20 --time-of-day evening --occasion date_night --relationship serious --bonding 4 --intimacy moderate --couple-only true --consent true
```

#### 5.3 Activity recommendation
Offline Random Forest ranks activities with safety filtering for couple-only and intimate activities.

```bash
python3 ml/training/train_activity_model.py
python3 ml/predict_activity.py --mood sensual --energy medium --time 20 --time-of-day evening --occasion date_night --relationship serious --bonding 4 --intimacy high --couple-only true --consent true
```

#### 5.4 Question Intelligence
TF-IDF + cosine similarity retrieves relevant questions and detects semantic repetition. It also filters by couple/consent context.

```bash
python3 ml/training/build_question_engine.py
python3 ml/predict_question.py --mood romantic --energy medium --occasion date_night --relationship serious --depth 3 --bonding 4 --intimacy moderate --couple-only true --consent true
```

#### 5.5 Preference Learning
Together learns explicit couple preferences from `like`, `favorite`, `complete`, `skip`, `too_easy`, `too_deep`, and `dislike` feedback. The transparent preference profile is the primary signal until enough real feedback exists for the contextual model.

```bash
python3 ml/record_feedback.py --couple-id demo-couple --item-type activity --item-id flirty_qa --action favorite --category conversation --mood romantic --intimacy-level moderate
python3 ml/train_preference_model.py
```

Local preference data is intentionally ignored by Git so personal feedback is not committed.

#### 5.6 AI Experience Director
The Couple Room includes an `🪄 AI Director` that can create 5, 15, 30 or 60 minute experiences and adapt the next moment using:
- current mood and intensity
- relationship/bonding context
- dates, memories and Little Moments
- previously used AI moments
- learned couple preferences
- remaining session time

The Director now receives the couple's learned positive and negative preference signals. In-app feedback buttons (`Helpful`, `Loved it`, `Skip`, `Too easy`, `Too deep`) update the local preference profile directly, allowing future sessions to become more personalized.

The AI service runs on port `5003` and uses the OpenAI Responses API when an API key is configured. Embeddings are used to detect semantic repetition. The server sends only saved context needed for the experience; live camera, microphone and raw call content are not sent to the AI endpoint.

## Intimate moods

`Sensual` and `Erotic` are modeled as couple-only states. The dataset marks them with higher intimacy and consent requirements. Product behavior should remain opt-in, non-graphic and consensual, with either partner able to lower intensity or skip.

## Stack

- React + Vite
- Node.js + Express
- Socket.IO
- WebRTC
- Python + pandas + scikit-learn + joblib for offline ML
- OpenAI Responses API + embeddings for the optional AI Director
- JSON file persistence for local development
- bcryptjs + JWT authentication

PostgreSQL/pgvector and Redis can be introduced later when the local architecture is stable.

## Run locally

Requirements: Node.js 20.19+ and Python 3.

Install dependencies:

```bash
npm install
python3 -m pip install -r ml/requirements.txt
```

For the AI Director, create `.env` from `.env.example` and set `OPENAI_API_KEY` locally. Never commit the key.

Run the application:

```bash
npm run dev
```

Open `http://localhost:5173`.

Local services:
- Main server: `5001`
- Couple service: `5002`
- AI experience service: `5003`
- Client: `5173`
