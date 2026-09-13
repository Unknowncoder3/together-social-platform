# Together — Project Status

## Phase 1 — Foundation ✅
- Register / login
- Profile
- Friend requests
- Create / join rooms
- Persistent local data
- Room chat

## Phase 2 — Real-Time Experience ✅
- Socket.IO real-time chat and presence
- WebRTC video/audio
- Camera and microphone controls
- Screen sharing
- Join/leave notifications
- Emoji reactions

## Phase 3 — Games + Questions ✅
- Tic-Tac-Toe multiplayer
- Connect Four multiplayer
- Trivia Battle
- Scribble
- Find the Spy
- Question Lab
- Question persistence
- Automatic category/type detection
- Lexical similarity and repetition detection

## Phase 4 — Couple Experience ✅
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

## Phase 5 — Experience Intelligence ✅
- Deterministic 5,000-scenario dataset
- Local Random Forest scene classifier
- Local activity recommendation/ranking
- TF-IDF question retrieval and similarity detection
- Transparent local preference learning
- Local Experience Director/orchestrator
- No external generative AI API dependency

## Phase 6 — Production Engineering 🚧

### 6.1 Infrastructure foundation ✅
- Docker PostgreSQL
- Docker Redis
- Environment configuration
- Render service definitions
- Dockerfiles
- GitHub Actions CI

### 6.2 PostgreSQL migration
- 6.2A Database connectivity and schema ✅
- 6.2B Users/authentication migration ✅
- 6.2C Friends/rooms migration ✅
- 6.2D Message history + live chat sync ✅
- 6.2E Remove remaining legacy JSON dependencies ⏳

### 6.3 Final production hardening ⏳
- Move remaining couple persistence to PostgreSQL
- Move persistent experience/session state to PostgreSQL where appropriate
- Redis-backed distributed presence/rate limiting
- Centralized error handling and structured logging
- Automated integration/smoke tests
- Production HTTPS/service URL configuration

## Current state

The application is feature-complete for its local MVP and has a working PostgreSQL-backed core social data path. The remaining Phase 6 work is production hardening rather than adding the core product features.

Do not delete `data/db.json` until 6.2E is completed and the full application has been verified without the JSON fallback.
