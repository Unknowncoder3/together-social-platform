# Together — Social & Virtual Experience Platform

> **Don't just call. Hang out.**

Together is a portfolio-grade real-time social platform for friends and couples. It combines live communication, shared activities, multiplayer games, a private couple experience and a fully local experience-intelligence layer.

## Current status

The **local MVP is feature-complete**. Core social persistence is now PostgreSQL-backed, with the legacy JSON store retained temporarily as a safe migration/fallback layer. Phase 6 production hardening remains before a public cloud launch.

## Product phases

### Phase 1 — Foundation ✅
- Register / login
- Profile
- Friend requests
- Create / join rooms
- Room chat

### Phase 2 — Real-Time Experience ✅
- Socket.IO real-time chat and presence
- WebRTC video/audio
- Camera and microphone controls
- Screen sharing
- Join/leave notifications
- Emoji reactions

### Phase 3 — Games + Questions ✅
- Tic-Tac-Toe
- Connect Four
- Trivia Battle
- Scribble
- Find the Spy
- Question Lab
- Context-aware retrieval and repetition detection

### Phase 4 — Couple Experience ✅
- One-to-one couple connection
- Private couple room
- Couple video/audio/chat
- Bonding check-in and relationship level
- Important dates
- Memories
- Little Moments
- Mood and intensity
- Couple games
- Consent-aware higher-intensity modes

### Phase 5 — Experience Intelligence ✅
Together uses provider-free offline ML/NLP components for core experience intelligence.

- Deterministic 5,000-scenario dataset
- Random Forest scene classifier
- Offline activity recommendation/ranking
- TF-IDF + cosine question retrieval
- Repetition/similarity detection
- Transparent local preference learning
- Local Experience Director/orchestrator
- No external generative AI API dependency

> The synthetic dataset and validation metrics are development benchmarks, not evidence of real-world model performance.

## Phase 6 — Production Engineering 🚧

### Completed
- Docker PostgreSQL
- Docker Redis
- Production relational schema
- PostgreSQL connection pool and health check
- Existing-user migration preserving UUIDs
- PostgreSQL-backed authentication
- PostgreSQL-backed profile/search
- PostgreSQL-backed friends
- PostgreSQL-backed rooms and membership
- PostgreSQL-backed message history
- Live Socket.IO chat → PostgreSQL synchronization bridge
- Dockerfiles and `.dockerignore`
- GitHub Actions CI
- Render deployment definitions
- Environment/secrets separation

### Remaining before public launch
- Remove the legacy JSON dependency after full regression testing
- Move couple persistence to PostgreSQL
- Move persistent experience/session state to PostgreSQL where appropriate
- Redis-backed distributed presence/rate limiting
- Structured production logging and centralized error handling
- Automated end-to-end/integration tests
- Production HTTPS and service URL configuration
- Managed PostgreSQL/Redis backups and monitoring

## PostgreSQL + Redis

Start local infrastructure:

```bash
npm run infra:up
```

Check it:

```bash
docker compose ps
npm run db:check
```

Stop it:

```bash
npm run infra:down
```

The repository compose file maps PostgreSQL to host port `5432`. If your Mac already uses 5432, change the host mapping to `5433:5432` and use `localhost:5433` in `DATABASE_URL`.

## Stack

- React + Vite
- Node.js + Express
- Socket.IO
- WebRTC
- Python + pandas + scikit-learn + joblib
- PostgreSQL
- Redis
- Docker
- GitHub Actions
- bcryptjs + JWT
- Bootstrap-based UI components

## Run locally

Requirements: Node.js 20.19+ and Python 3.

Install dependencies:

```bash
npm install
python3 -m pip install -r ml/requirements.txt
```

Start infrastructure first:

```bash
npm run infra:up
```

Then start Together:

```bash
npm run dev
```

Open `http://localhost:5173`.

### Services

| Service | Port |
|---|---:|
| Main API + Socket.IO | 5001 |
| Couple service | 5002 |
| Local ML service | 5003 |
| Vite client | 5173 |
| PostgreSQL | 5432* |
| Redis | 6379 |

`*` Use 5433 on the host if 5432 is already occupied.

## Environment

Copy `.env.example` to `.env` and adjust the database port if required. Never commit production secrets.

The Experience Director runs locally; no OpenAI, Gemini, Groq or other external generative AI API key is required.

## Repository structure

```text
client/             React/Vite application
server/             Main API, couple service and local AI orchestrator
ml/                 Dataset, training and inference code
infra/               PostgreSQL schema and infrastructure documentation
data/                Local migration/fallback data
docker-compose.yml   PostgreSQL + Redis development stack
Dockerfile           Main Node service image
Dockerfile.ml        Local ML service image
render.yaml          Deployment service definitions
.github/workflows/   CI pipeline
```

## Important migration rule

Do **not** delete `data/db.json` yet. It is still used by legacy real-time/game code as a compatibility layer. Remove it only after Phase 6.2E is completed and the complete application has been regression-tested against PostgreSQL alone.
