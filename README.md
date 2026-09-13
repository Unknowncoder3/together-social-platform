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

### Phase 5 — AI Experience Engine
- AI Date Director
- Quick Spark / Mini Date / Full Date / Deep Night
- First Date, Love Letter, Memory Lane, Dream Trip, Chaos Night, Midnight Mode, Anniversary Night and Surprise Me
- AI-generated structured activities
- Adaptive next-step decisions using remaining time, mood, intensity, bonding level and completed activities
- Semantic similarity memory using OpenAI embeddings to reduce repeated questions/activities
- Active session resume for both partners
- Server-side API key handling
- No raw camera, microphone or live-call content is sent to the AI engine

## Stack

- React + Vite
- Node.js + Express
- Socket.IO
- WebRTC
- OpenAI Responses API + structured JSON output
- OpenAI embeddings (`text-embedding-3-small`)
- JSON file persistence for local development
- bcryptjs + JWT authentication

PostgreSQL/pgvector and Redis can be introduced later when the local architecture is stable.

## Run locally

Requirements: Node.js 20.19+.

```bash
npm install
npm run dev
```

Open `http://localhost:5173`.

The local services are:
- Main server: `5001`
- Couple service: `5002`
- AI Experience service: `5003`
- Vite client: `5173`

## Enable the real AI Director

Copy `.env.example` to `.env` and set your server-side OpenAI API key:

```bash
cp .env.example .env
```

Then set:

```env
OPENAI_API_KEY=your_api_key_here
OPENAI_MODEL=gpt-5.6-luna
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
```

Keep the API key only in `.env` or your deployment provider's secret/environment settings. Never put it in React code or commit it to GitHub.

If `OPENAI_API_KEY` is missing, the AI service still starts, but AI generation endpoints return a configuration error instead of exposing or inventing a key.

## Test the AI Director

1. Start the project with `npm run dev`.
2. Log in using two accounts and connect them as partners.
3. Complete the five-question bonding check-in for both partners.
4. Enter the same private couple room.
5. Open `🪄 AI Director`.
6. Choose a duration and special night.
7. Click `Create with AI ✨`.
8. Complete the first moment. The next moment is requested from the AI using the remaining time, current mood/intensity and the activities already completed.
9. Change the mood/intensity while the experience is running and continue. The next AI decision will adapt to the new state.

## Privacy design

The AI service receives saved relationship context needed to personalize the experience. It does not receive the live WebRTC camera/microphone stream or raw couple chat. Responses are requested with `store:false`; local AI activity history is stored only as generated activity text/embeddings so future sessions can avoid semantic repeats.

## Project structure

```text
client/      React frontend
server/      Express + Socket.IO + AI services
data/        Local development persistence
```

## Milestone rule

Every major phase is tested locally before the next phase is added. The goal is a clean, understandable portfolio project rather than an oversized first commit.
