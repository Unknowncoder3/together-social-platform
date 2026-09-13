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

### Phase 3 — Games + Questions
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
Together uses provider-free offline ML/NLP components for the core experience intelligence.

#### 5.1 Dataset foundation
- Mood, occasion, activity and question taxonomies
- Deterministic 5,000-scenario generator

#### 5.2 Scene classification
- scikit-learn Random Forest
- Predicts the current experience scene from session context

#### 5.3 Activity recommendation
- Offline Random Forest ranking
- Top-1 / Top-3 / Top-5 evaluation
- Couple-only and consent-aware filtering

#### 5.4 Question Intelligence
- TF-IDF + cosine similarity
- Context-aware retrieval
- Semantic repetition detection

#### 5.5 Preference Learning
- Explicit feedback: helpful, loved, complete, skip, too easy, too deep, dislike
- Transparent couple preference profile
- Contextual model after sufficient feedback

#### 5.6 Experience Director
- Combines scene, activity, question and preference signals
- Adapts to time, mood, bonding, intimacy and previous experiences
- Runs locally without a generative AI API

## Intimate moods

`Sensual` and `Erotic` are couple-only states. The dataset models higher intimacy and consent requirements. Product behavior remains opt-in, non-graphic and consensual, with either partner able to lower intensity or skip.

## Phase 6 — Production Engineering

### 6.1 Production architecture foundation
- Environment-aware database configuration
- Graceful infrastructure abstraction
- Service-oriented deployment layout

### 6.2 PostgreSQL
- Production-ready relational schema in `infra/schema.sql`
- Optional `pg` connection/health layer in `server/postgres.js`
- JSON persistence remains the local fallback until migration is validated

### 6.3 Redis
- Local Redis provisioned through Docker Compose
- Reserved for ephemeral state, rate limiting, distributed realtime state and session coordination

### 6.4 Security foundation
- Production configuration is separated from local credentials
- Secrets remain environment variables and are never committed
- Production database credentials must use managed secrets/TLS

### 6.5 Testing / CI
- GitHub Actions validates the Vite build
- GitHub Actions regenerates and trains the offline ML components

### 6.6 Docker
- Production Node container definition
- `.dockerignore`
- PostgreSQL and Redis development infrastructure

### 6.7 CI/CD foundation
- Workflow triggers on pushes and pull requests to `main`
- JavaScript build and Python ML validation run automatically

### 6.8 Deployment readiness
The repository is structured for deployment to a Node-capable host plus managed PostgreSQL/Redis. Actual cloud deployment requires the user's hosting accounts, domains and secrets, so credentials are intentionally not committed.

### 6.9 Monitoring readiness
Health checks are available at the application services; production hosting should attach uptime checks and centralized logs before public launch.

## Production infrastructure

Start local PostgreSQL and Redis:

```bash
npm install
npm run infra:up
```

Check them:

```bash
docker compose ps
```

Stop them:

```bash
npm run infra:down
```

See `infra/README.md` for the database schema, environment variables and production architecture.

## Stack

- React + Vite
- Node.js + Express
- Socket.IO
- WebRTC
- Python + pandas + scikit-learn + joblib for offline ML
- PostgreSQL for production persistence
- Redis for ephemeral/scalable realtime state
- Docker + GitHub Actions for deployment infrastructure
- JSON persistence for local development
- bcryptjs + JWT authentication

## Run locally

Requirements: Node.js 20.19+ and Python 3.

Install dependencies:

```bash
npm install
python3 -m pip install -r ml/requirements.txt
```

Run the application:

```bash
npm run dev
```

Open `http://localhost:5173`.

Local services:
- Main server: `5001`
- Couple service: `5002`
- Local ML experience service: `5003`
- Client: `5173`
