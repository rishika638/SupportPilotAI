# SupportPilot AI

Production-grade multi-tenant customer support platform built with Node.js, TypeScript, PostgreSQL, Redis, Prisma and BullMQ.

## Features

### Authentication & Security

- JWT Authentication
- Refresh Token Rotation
- RBAC (Admin, Manager, Agent)
- Organization Isolation
- Rate Limiting
- Idempotency Protection

### Ticket Management

- Ticket Lifecycle State Machine
- Assignment & Reassignment
- Team Routing
- Internal/Public Comments
- Audit Trail
- Advanced Filtering

### Reliability

- BullMQ Background Jobs
- Redis Queue Processing
- Retry Policies
- Dead Letter Handling
- Request Correlation IDs

### Operations

- SLA Tracking
- Automatic Escalation
- Analytics Dashboard APIs
- Notification System
- Cleanup Workers

## Architecture

src/

modules/
auth/
tickets/
teams/
analytics/
notifications/
audit/

infrastructure/
database/
redis/
queue/

workers/

shared/

## Tech Stack

- Node.js
- TypeScript
- Express
- PostgreSQL
- Prisma
- Redis
- BullMQ
- JWT
- Docker

## API Examples

### Register

POST /api/v1/auth/register

### Login

POST /api/v1/auth/login

### Create Ticket

POST /api/v1/tickets

### Assign Ticket

POST /api/v1/tickets/:id/assign

## Local Development

npm install

cp .env.example .env

npm run prisma:migrate

npm run dev

## Production deployment

Deploy the frontend as a static Vite site (Vercel/Netlify-compatible) and deploy
the API and worker as separate Node/container services. Do not place backend
credentials in frontend `VITE_` variables.
Use a currently supported Node.js LTS release (Node 24 for the included
container image); select the same supported major for provider-managed Node
runtimes.

### Frontend

- Build from `frontend/` with `npm ci` and `npm run build`.
- Set `VITE_API_BASE_URL` to the deployed API origin plus `/api/v1`, for example
  `https://api.example.com/api/v1`.
- Set the API's `FRONTEND_URL` to the frontend's exact HTTPS origin.

### API and worker

- Set `NODE_ENV=production`, `DATABASE_URL`, `REDIS_HOST`, `REDIS_PORT`,
  `REDIS_TLS`, and optional `REDIS_PASSWORD` using the managed service connection
  details. `DATABASE_URL` must include `sslmode=require` (or a certificate
  verification mode supported by the provider). The API rejects production
  database URLs that do not require TLS. Set `REDIS_TLS=true` for `rediss://`
  endpoints and `false` for `redis://` endpoints; use the provider's internal
  endpoint where available and confirm its scheme in the provider dashboard.
- Set distinct, randomly generated `JWT_ACCESS_SECRET` and
  `JWT_REFRESH_SECRET` values. Set `METRICS_TOKEN` if metrics scraping is used.
- Set `FRONTEND_URL` to the exact HTTPS origin only (scheme + host + optional
  port; no path, query, or trailing application route). Set
  `TRUST_PROXY_HOPS` to the verified number of trusted proxy hops; production
  startup requires this value explicitly.
- Set `AI_PROVIDER` and only the corresponding provider configuration:
  `GEMINI_API_KEY`, `OPENAI_API_KEY`, or the Ollama `OLLAMA_BASE_URL`,
  `OLLAMA_MODEL`, and optional `OLLAMA_API_KEY`. Configure `AI_PROVIDER` and
  provider credentials on the worker only; the Render template deliberately
  leaves `GEMINI_API_KEY` off the API. Keep provider keys out of the frontend
  and source control.
- Run `npm run prisma:deploy` once as a release/pre-deploy step against the
  production database. Run the API with `npm start`, and a separate worker with
  `npm run start:worker`; set `DISABLE_WORKERS=true` on the API when using the
  separate worker.
- Configure `TRUST_PROXY_HOPS` to the verified number of trusted reverse-proxy
  hops; do not set it based on an assumed hosting topology. The readiness check
  is `GET /ready` and depends on PostgreSQL and Redis.
- For local Compose, use `DATABASE_URL` for host-run development and
  `DATABASE_URL_DOCKER` for container services (host `postgres`). Keep its
  credentials synchronized with `POSTGRES_USER`, `POSTGRES_PASSWORD`, and
  `POSTGRES_DB`. The Compose PostgreSQL/Redis ports are loopback-only.

The current rate limiters use per-process memory. They provide a basic
single-instance limit but are not a shared quota across API replicas; use a
shared rate-limit store before relying on them as a multi-replica abuse control.
The initial deployment target is exactly **one API replica**: keep manual
scaling at 1, do not enable autoscaling, and do not run a second API instance
until a shared rate-limit store is implemented and verified. The separate
background worker may run independently; this restriction applies to API
replicas.

### Render worker operation

Render background workers do not accept inbound HTTP traffic, so the `/ready`
API endpoint is not a worker health check. Use Render's worker instance status
and logs; the AI and notification workers log a `ready and consuming jobs`
message only after BullMQ connects. To confirm processing, create a disposable
test ticket in staging and verify the AI analysis changes from `PENDING` to
`COMPLETED`, then query the authenticated `/metrics` endpoint with its Bearer
token and confirm queue depth/failed-job gauges. Job errors and exhausted
retries are logged by the worker; failed jobs are retained in BullMQ up to the
configured retention limit of 200. Inspect Render worker logs and those queue
metrics before retrying a failed job.

The Render Blueprint is a deployment template, not a verified live deployment.
It requires `FRONTEND_URL`, `TRUST_PROXY_HOPS`, and `DATABASE_URL` to be set in
the Render dashboard. Set the same PostgreSQL internal URL (including
`sslmode=require`) for the API and worker; Render documents that internal
PostgreSQL TLS is optional unless this mode is requested. Keep the API, worker,
database, and Key Value service in the same region. The Blueprint disables
external access to Key Value; its default internal connection does not require
a password. If internal authentication is enabled in Render, manually set
`REDIS_PASSWORD` for both API and worker. Set `REDIS_TLS` for both services
after checking the Key Value internal URL scheme: use `true` for `rediss://`
and `false` for `redis://`. The Blueprint disables external access to the
managed database and Key Value service. `TRUST_PROXY_HOPS` and `REDIS_TLS` must
be explicitly set in Render. Validate the Render Blueprint
with the current Render CLI/API before syncing it; do not rely on a successful
Docker Compose check to validate Render configuration.

The Render API's `preDeployCommand` runs `prisma migrate deploy` once per API
service deployment. Before a production release, review migrations, back up
the database, verify the provider environment and release command, then deploy
the migration step before accepting traffic. Never use `prisma migrate dev` in
production.

## Production Concepts Demonstrated

- Multi-Tenancy
- RBAC
- State Machines
- Background Processing
- Distributed Systems Fundamentals
- Audit Logging
- Idempotency
- SLA Automation