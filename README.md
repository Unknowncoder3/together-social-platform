# Together — Social & Virtual Experience Platform

> Don't just call. Hang out.

Together is a portfolio-grade real-time social platform for friends and couples. This repository is being built phase-by-phase.

## Current milestone

### Phase 1 — Foundation
- Register / login
- Profile
- Friend requests
- Create / join rooms
- Persistent local data
- Room chat

### Phase 2 — Real-Time Experience
- Socket.IO real-time chat
- Online presence
- WebRTC video/audio
- Camera and microphone controls
- Screen sharing
- Join/leave notifications

## Stack

- React + Vite
- Node.js + Express
- Socket.IO
- WebRTC
- JSON file persistence for the first milestone (keeps local setup fast)
- bcryptjs + JWT authentication

PostgreSQL will be introduced after the first milestone is stable so database setup does not slow down initial development.

## Run locally

Requirements: Node.js 20.19+.

```bash
npm install
npm run dev
```

Open `http://localhost:5173`.

For video testing, open the app in two browser tabs/windows and join the same room. Browser camera/microphone permissions are required.

## Environment

Copy `.env.example` to `.env` if you want to change the JWT secret or server port.

## Project structure

```text
client/      React frontend
server/      Express + Socket.IO backend
data/        Local development persistence
```

## Milestone rule

Every major phase is tested locally before the next phase is added. The goal is a clean, understandable portfolio project rather than an oversized first commit.
