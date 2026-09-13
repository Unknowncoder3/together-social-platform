# Together Production Infrastructure

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

PostgreSQL is available at `localhost:5432` with the local development database `together` and user `together`.
Redis is available at `localhost:6379`.

The application still uses JSON persistence by default. PostgreSQL is an opt-in production persistence layer so the current local workflow remains stable while the migration is tested.

## Database configuration

Set locally when ready to connect the application to PostgreSQL:

```env
DATABASE_URL=postgresql://together:together_local_password@localhost:5432/together
DB_POOL_MAX=10
DATABASE_SSL=false
```

`server/postgres.js` provides a small connection/health abstraction without forcing the rest of the application to switch databases before the migration is validated.

## Schema

`schema.sql` creates the core relational tables for users, friendships, rooms, members, messages, questions, couples and couple feedback.

For production, use a managed PostgreSQL provider, a strong password, TLS, automated backups and a migration tool. Do not use the local credentials from `docker-compose.yml` in production.

## Redis

Redis is provisioned now for the next scalability step. It is intended for ephemeral state such as presence, rate-limit counters, distributed Socket.IO state and short-lived session coordination. Persistent business data should remain in PostgreSQL.

## Deployment architecture

```text
Browser
  |
  v
Reverse proxy / HTTPS
  |
  +--> Web client
  +--> Main API + Socket.IO
  +--> Couple service
  +--> Local ML experience service
              |
              +--> PostgreSQL
              +--> Redis (ephemeral state)
```

WebRTC media remains peer-to-peer where possible; the backend handles signaling and application state.

## CI/CD

`.github/workflows/ci.yml` validates the frontend build and trains the offline ML components on every push/PR to `main`.

Deployment should be added only after CI is green and secrets are configured in the hosting provider.
