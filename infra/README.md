# Together Production Infrastructure

Together is now wired to PostgreSQL for the core social data path while retaining the JSON files only as a migration/fallback layer during development.

## Local infrastructure

Start PostgreSQL and Redis with Docker:

```bash
npm run infra:up
```

Check containers:

```bash
docker compose ps
```

Stop them:

```bash
npm run infra:down
```

The repository compose file exposes PostgreSQL on `localhost:5432`. If another PostgreSQL service already occupies 5432 on macOS, map the host port to 5433 and use the matching port in `DATABASE_URL` (for example `localhost:5433`). Redis remains on `localhost:6379`.

## Database configuration

Local example:

```env
DATABASE_URL=postgresql://together:together_local_password@localhost:5432/together
DB_POOL_MAX=10
DATABASE_SSL=false
```

If you changed Docker to `5433:5432`, use:

```env
DATABASE_URL=postgresql://together:together_local_password@localhost:5433/together
```

`server/postgres.js` provides the shared PostgreSQL pool and health check.

Verify connectivity with:

```bash
npm run db:check
```

## PostgreSQL migration

The startup runtime loads the PostgreSQL bootstrap before the main Socket.IO server. Existing JSON users, friendships, rooms and messages are migrated using their existing UUIDs. Core HTTP operations now read/write PostgreSQL, while new writes are mirrored to JSON temporarily so the legacy real-time/game code remains compatible.

The live chat bridge also mirrors messages written by the legacy Socket.IO layer into PostgreSQL. This is intentionally transitional: once the remaining real-time handlers are moved to repository-based PostgreSQL access, the JSON mirror can be removed safely.

## Schema

`schema.sql` creates the core relational tables for users, friendships, rooms, members, messages, questions, couples and couple feedback.

For production, use a managed PostgreSQL provider, a strong password, TLS, automated backups and a migration tool. Never use the local credentials from `docker-compose.yml` in production.

## Redis

Redis is provisioned for ephemeral state such as presence, rate-limit counters, distributed Socket.IO state and short-lived session coordination. Persistent business data belongs in PostgreSQL.

## Deployment architecture

```text
Browser
  |
  v
HTTPS / reverse proxy
  |
  +--> Web client
  +--> Main API + Socket.IO
  +--> Couple service
  +--> Local ML experience service
              |
              +--> PostgreSQL
              +--> Redis
```

WebRTC media remains peer-to-peer where possible; the backend handles signaling and application state.

## CI/CD

`.github/workflows/ci.yml` validates the frontend build and trains the offline ML components on every push/PR to `main`.

Before public launch, configure managed PostgreSQL/Redis, production secrets, HTTPS, service URLs and uptime monitoring in the hosting provider.
