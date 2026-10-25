<div align="center">
# SupportPilot AI

### A multi-tenant customer-support platform engineered for correctness.

Tenant-scoped ticket workflows, role-based authorization, idempotent
requests, asynchronous workers, AI-assisted analysis, and measured
API/database experiments.

**TypeScript · Node.js · Express · PostgreSQL · Prisma · Redis · BullMQ
· React · Vite · k6**
</div>

---
## Overview

SupportPilot AI is a full-stack customer-support platform built to
explore the engineering problems that appear beyond basic CRUD:
enforcing organization boundaries, handling retried requests, protecting
concurrent state changes, processing background work, and measuring
database/API behaviour.

The repository includes a TypeScript/Express API, a React frontend,
PostgreSQL persistence through Prisma, Redis/BullMQ infrastructure,
automated tests, and performance-analysis scripts.

## At a glance

  -----------------------------------------------------------------------
  Area                                Implemented capabilities / recorded
                                      evidence
  ----------------------------------- -----------------------------------
  Support workflows                   Tickets, assignment, teams,
                                      comments, search, filters,
                                      pagination, analytics,
                                      notifications, audit history, SLA
                                      workflows, and AI-assisted analysis

  Authorization                       JWT authentication, refresh-token
                                      rotation, role-based access
                                      control, and
                                      organization/team-scoped
                                      authorization

  Request correctness                 Redis-backed idempotency,
                                      payload-mismatch rejection, replay
                                      behaviour, and ticket-number
                                      uniqueness safeguards

  Background processing               BullMQ workers for AI analysis,
                                      notifications, SLA processing, and
                                      cleanup

  Testing                             102/102 backend unit tests and two
                                      integration suites recorded as
                                      passing 8/8 each in the latest
                                      project-session notes

  Performance engineering             k6 listing, creation, and
                                      mixed-workload scripts; PostgreSQL
                                      `EXPLAIN (ANALYZE, BUFFERS)`
                                      analysis

  Operations                          Health/readiness endpoints,
                                      structured Pino logs, request IDs,
                                      metrics endpoint, Docker Compose,
                                      and deployment configuration
  -----------------------------------------------------------------------

> **Evidence note:** Test counts and performance figures below are local
> project-session results, not production guarantees. The supplied
> README source identifies stale or missing raw artifacts for some runs.
> Where evidence is not reproducible from the saved artifact, that
> limitation is stated explicitly.

## Why this project is technically interesting

SupportPilot AI focuses on failure-prone boundaries in a multi-tenant
application:

-   **Tenant isolation:** access to tickets, comments, teams,
    notifications, AI analysis, and analytics must remain within the
    authorized organization.
-   **Concurrency correctness:** ticket numbering, idempotency replay,
    assignment updates, and state transitions need persisted-state
    checks---not just successful HTTP responses.
-   **Reliable request handling:** duplicate requests can replay their
    original response, while reusing an idempotency key with a different
    payload is rejected.
-   **Asynchronous workflows:** API requests can enqueue AI analysis,
    notifications, SLA processing, and cleanup work for background
    workers.
-   **Measured performance:** k6 scripts exercise API endpoints, and
    PostgreSQL query plans are inspected against a dedicated seeded
    performance database.
-   **Operational visibility:** health/readiness checks, structured
    logs, request correlation, and explicit evidence boundaries make
    failures easier to investigate.

## Product capabilities

### Customer-support workflows

-   Ticket lifecycle with validated state transitions.
-   Team routing, assignment/reassignment, and assignment history.
-   Public and internal comments.
-   Search, status/priority filters, and paginated tenant-scoped ticket
    listing.
-   Audit trail, analytics, notifications, and SLA breach/escalation
    workflows.
-   AI-assisted ticket analysis through a provider abstraction for
    Gemini, OpenAI, or Ollama.

### Identity and security

-   JWT-based authentication and refresh-token rotation.
-   Role-based access control for admin, manager, and agent roles.
-   Organization- and team-scoped authorization.
-   Input validation, security headers, CORS configuration, and
    request-level rate limiting.
-   Idempotency keys scoped by organization.

## Architecture

``` mermaid
flowchart LR
    U["Browser / React + Vite"] -->|"HTTPS · REST"| API["Express API"]
    API --> DB[("PostgreSQL · Prisma")]
    API --> R[("Redis")]
    R --> Q["BullMQ queues"]
    Q --> W["Background workers"]
    W --> DB
    W --> AI["AI provider adapter"]
    AI --> G["Gemini"]
    AI --> O["OpenAI"]
    AI --> L["Ollama"]
```

The diagram describes the logical application flow. It does not, by
itself, prove that every service is deployed or running in this topology
in production.

### Main code areas

```text
src/
├── modules/             # Auth, tickets, teams, analytics, notifications, SLA, AI, audit
├── infrastructure/     # Prisma, Redis, queues, logging, metrics
├── shared/              # Middleware, validation, and shared utilities
├── workers/             # AI, notification, SLA, and cleanup processors
└── worker.ts             # Worker process entry point

frontend/                 # React + TypeScript + Vite application
prisma/                   # Prisma schema and migrations
tests/                    # Unit and integration tests
performance/
├── k6/                   # Listing, creation, and mixed-workload scripts
├── seed/                 # Performance-data generation
├── scripts/              # Benchmark helpers
├── sql/                  # Query-analysis SQL
└── results/              # Benchmark/query result artifacts
docs/
├── testing/              # Test design and evidence
├── performance/          # Baselines and query analysis
└── deployment/           # CI/CD and deployment notes
artifacts/                 # Machine-readable test-result snapshots
```

Architecture notes: [`docs/architecture.md`](docs/architecture.md)

## Engineering evidence

### 1. Multi-tenant isolation

**Recorded result: 8 passed · 0 failed · 0 blocked**

The integration suite uses the Express application, authentication flow,
and a dedicated local PostgreSQL test database. It creates separate
organizations and checks that authorization is enforced through API
behaviour and persisted data.

  -----------------------------------------------------------------------
  Scenario                            What is checked
  ----------------------------------- -----------------------------------
  Authentication                      Protected routes reject
                                      unauthenticated requests

  Ticket and AI reads                 Cross-organization reads are denied
                                      without exposing private sentinel
                                      data

  Mutations and comments              Foreign-ticket mutations, comments,
                                      and assignment attempts are denied;
                                      persisted data is checked after
                                      denied writes

  Team/member scope                   Team and member reads/mutations
                                      remain within the authenticated
                                      organization

  Search and pagination               Search, filters, result rows, and
                                      totals remain tenant-scoped

  Analytics                           Aggregates use only the current
                                      organization's tickets

  Notifications                       Private notifications remain scoped
                                      to the authenticated user and
                                      organization

  RBAC                                Manager team scope is enforced and
                                      agents cannot escalate into
                                      privileged operations
  -----------------------------------------------------------------------

The archived run records approximately 11.4 seconds. Its environment
metadata belongs to an earlier run, so regenerate the artifact before
associating it with a particular commit.

-   Test:
    [`tests/integration/tenant-isolation.test.ts`](tests/integration/tenant-isolation.test.ts)
-   Test design:
    [`docs/testing/tenant-isolation.md`](docs/testing/tenant-isolation.md)
-   Archived result:
    [`artifacts/tenant-isolation-results.json`](artifacts/tenant-isolation-results.json)

### 2. Concurrency and ticket lifecycle

**Latest project-session result: 8/8 integration cases passed**

The later project-session notes record a passing run of
`tests/integration/concurrency-lifecycle.test.ts` after fixes to ticket
DTO extraction and a Prisma query field. The JSON artifact in the
supplied archive is an older snapshot and still records an earlier
Windows worker-thread blocking issue. 

The eight scenarios cover:

1.  Concurrent ticket creation preserves unique ticket numbers.
2.  Concurrent duplicate requests replay the same idempotent response.
3.  Reusing an idempotency key with a different payload returns `422`.
4.  Valid ticket state transitions are accepted.
5.  Invalid ticket state transitions are rejected.
6.  Assignment updates preserve atomicity.
7.  The same idempotency key is independent across organizations.
8.  `PUBLIC` versus `INTERNAL` comment visibility is persisted
    correctly.

These tests exercise HTTP behaviour and database state for the scenarios
listed. They do **not** prove global exactly-once execution across every
possible failure mode.

-   Test:
    [`tests/integration/concurrency-lifecycle.test.ts`](tests/integration/concurrency-lifecycle.test.ts)
-   Related tests:
    [`tests/idempotency.test.ts`](tests/idempotency.test.ts),
    [`tests/regression.test.ts`](tests/regression.test.ts),
    [`tests/ticket-state-machine.test.ts`](tests/ticket-state-machine.test.ts)
-   Historical artifacts to regenerate:
    [`artifacts/ticket-lifecycle-concurrency.json`](artifacts/ticket-lifecycle-concurrency.json),
    [`artifacts/idempotency-concurrency.json`](artifacts/idempotency-concurrency.json)

### 3. Automated tests and build checks

The latest project-session record reports the following:

  ------------------------------------------------------------------------------
  Check                                Recorded result Qualification
  ----------------------- ---------------------------- -------------------------
  Backend unit tests                    102/102 passed Earlier archive
                                                       documentation/artifacts
                                                       show a previous 90-test
                                                       snapshot

  Tenant-isolation                          8/8 passed Archived result JSON is
  integration suite                                    available

  Concurrency/lifecycle                     8/8 passed Later result is recorded
  integration suite                                    in project-session notes;
                                                       archived JSON is stale

  Backend typecheck/build                       Passed Re-run on the final
                                                       commit

  Frontend                                      Passed A bundle-size warning was
  typecheck/build                                      observed; code splitting
                                                       may be worth considering

  GitHub Actions          Remote run not independently A workflow file alone
                              verified in the supplied does not establish a
                                              evidence green remote run

  Render/Vercel                    Live smoke test not Local builds do not prove
  deployment                 independently verified in the deployed system works
                                 the supplied evidence end to end
  ------------------------------------------------------------------------------

Treat these as recorded local results until the commands are rerun on
the commit being shared.

### 4. k6 performance experiments

The repository contains three workload scripts:

-   [`performance/k6/ticket-listing.js`](performance/k6/ticket-listing.js)
    --- authenticated, tenant-scoped listing.
-   [`performance/k6/ticket-creation.js`](performance/k6/ticket-creation.js)
    --- authenticated ticket writes.
-   [`performance/k6/mixed-workload.js`](performance/k6/mixed-workload.js)
    --- listing, detail reads, and ticket creation.

A single-user sanity/baseline run and concurrent-user runs were
performed locally. The supplied archive does not contain a clean
matching raw output for every successful run, so the values below are
recorded summaries rather than a complete, independently reproducible
benchmark bundle.

  --------------------------------------------------------------------------------------
  Workload      Recorded        Requests         HTTP        p95        p99   Throughput
                profile                      failures    latency    latency 
  ------------- ------------ ----------- ------------ ---------- ---------- ------------
  Single-user   1 VU               Exact Not retained        Not        Not Not retained
  baseline                   summary not                retained   retained 
                                retained                                    

  Ticket        10 VUs;              281           0%   91.11 ms   98.02 ms Not captured
  listing       reported                                                        in saved
                30-second                                                        summary
                hold                                                        

  Ticket        Up to 5 VUs;        229,    0% in the   86.96 ms  154.14 ms   1.81 req/s
  creation      roughly 2      including     reported                       
                minutes            login   successful                       
                                                  run                       

  Mixed         Concurrent         4,311  164 (3.80%)   75.52 ms   113.1 ms   12.6 req/s
  workload      read/write                                                  
                profile;                                                    
                script                                                      
                reaches up                                                  
                to 20 VUs                                                   
  --------------------------------------------------------------------------------------

#### Interpreting the results

-   Listing and creation summaries reported no HTTP failures in those
    successful runs.
-   The mixed run recorded a **3.80% failure rate**. It was below the
    script's configured `<5%` error-rate threshold, but it was not a
    zero-error run. The exact status-code breakdown was not retained, so
    those failures still need classification.
-   These latency figures are local observations, not production SLAs or
    capacity guarantees.
-   The runs occurred before the later 10,000-ticket seed; exact row
    counts for each benchmark run were not recorded with the summaries.
-   An older
    [`performance/results/ticket-creation.json`](performance/results/ticket-creation.json)
    contains console text mixed with JSON-lines and describes a failed
    run against port `3000` with 18.88% HTTP failures. It is not the
    successful run represented in the table.
-   Before publishing stronger claims, rerun the benchmarks and save
    clean outputs with the commit SHA, dataset size, machine/runtime,
    duration, VU profile, thresholds, and API base URL.

**Safety:** run load tests only against a dedicated local performance
database, never production or your primary development database. The
scripts use `API_BASE_URL`, `TEST_USERNAME`, and `TEST_PASSWORD`. Keep
credentials out of source control and logs.

Result provenance:
[`performance/results/README.md`](performance/results/README.md)

### 5. PostgreSQL query-plan analysis

A local `EXPLAIN (ANALYZE, BUFFERS)` session was run against the
dedicated `supportpilot_performance` database after seeding 10,000
tickets.

  ----------------------------------------------------------------------------------------------
  Query pattern              Observed execution time Plan observation
  --------------------- ---------------------------- -------------------------------------------
  Tenant listing +                          0.112 ms Used
  `OPEN` status                                      `tickets_organization_id_created_at_idx`;
                                                     returned 20 rows

  Tenant-scoped                             0.245 ms Used the tenant/created-at index; filtered
  priority filter                                    658 rows

  Substring search                          0.047 ms `ILIKE` remained a filter for this query

  Deep offset                               1.776 ms Scanned 5,020 rows to return 20
  (`OFFSET 5000`)                                    
  ----------------------------------------------------------------------------------------------

Storage observed in the same local database: ticket table **3,728 kB**,
indexes **2,768 kB**, combined **6,536 kB**.

These are single-run local measurements on a warm cache, not p95/p99
latency. The deep-offset plan illustrates work that grows with the
offset, but the measurements alone do not justify a schema change. Index
and pagination changes should be backed by comparable before/after plans
and workload measurements.

-   Analysis notes:
    [`docs/performance/database-query-analysis.md`](docs/performance/database-query-analysis.md)
-   Saved query-plan summary:
    [`performance/results/explain-analyze-2026-10-25-summary.md`](performance/results/explain-analyze-2026-10-25-summary.md)
-   Performance baseline:
    [`docs/performance/baseline.md`](docs/performance/baseline.md)

### 6. Background jobs and failure handling

BullMQ is used for asynchronous AI analysis, notifications, SLA
processing, and cleanup. The codebase configures retries/backoff and
retains failed jobs for inspection.

**Current evidence boundary:** unit-level retry/failure tests have
passed, but live Redis/BullMQ integration scenarios for retry,
exhaustion, duplicate delivery, Redis interruption, and worker restart
remain to be verified. Retaining a failed job in BullMQ is not the same
as operating a dedicated dead-letter queue; this project does not claim
to have a separate DLQ.

Background-job test notes:
[`docs/testing/background-jobs.md`](docs/testing/background-jobs.md)

Confirm that the API and worker deployment topology matches the intended
design before claiming end-to-end production job processing.

## Technology stack

  -----------------------------------------------------------------------
  Layer                               Technologies
  ----------------------------------- -----------------------------------
  Frontend                            React, TypeScript, Vite, Tailwind
                                      CSS

  API                                 Node.js, TypeScript, Express

  Persistence                         PostgreSQL, Prisma ORM

  Queue/cache                         Redis, BullMQ

  Authentication/security             JWT, refresh-token rotation, RBAC,
                                      Helmet, request validation

  Observability                       Pino structured logging, request
                                      IDs, health/readiness, metrics
                                      endpoint

  Testing/performance                 Node.js test runner, HTTP
                                      integration tests, k6, PostgreSQL
                                      `EXPLAIN ANALYZE`

  Local/deployment tooling            Docker Compose, GitHub Actions
                                      workflow, Render/Vercel
                                      configuration
  -----------------------------------------------------------------------

## Run locally

### Prerequisites

-   Node.js `>=22.12.0 <25`, as specified in the supplied project notes
-   Docker Desktop with Docker Compose
-   Git

### Setup

```bash
npm ci
cd frontend && npm ci && cd ..
cp .env.example .env
# Set local-only values. Never commit .env.
npm run prisma:generate
docker compose up -d
npm run prisma:migrate
```

Start the API in one terminal:

```bash
npm run dev
```

Start the worker in another terminal when testing asynchronous jobs:

```bash
npm run start:worker
```

Start the frontend in a third terminal:

```bash
cd frontend
npm run dev
```

### Verification commands

From the repository root:

```bash
npm run typecheck
npm test
npm run build
```

For the frontend:

```bash
cd frontend
npm run typecheck
npm run build
```

For integration tests, use the dedicated test database and follow the
safety checks in
[`docs/testing/tenant-isolation.md`](docs/testing/tenant-isolation.md).
Never point integration or load tests at production.

## Repository documentation

-   [Architecture](docs/architecture.md)
-   [Tenant-isolation test design](docs/testing/tenant-isolation.md)
-   [Concurrency/lifecycle integration
    tests](tests/integration/concurrency-lifecycle.test.ts)
-   [Concurrency and idempotency
    report](docs/testing/concurrency-and-idempotency.md)
-   [Background-job notes](docs/testing/background-jobs.md)
-   [Performance baseline](docs/performance/baseline.md)
-   [Database query
    analysis](docs/performance/database-query-analysis.md)
-   [Benchmark artifact provenance](performance/results/README.md)
-   [Deployment/CI configuration
    review](docs/deployment/ci-cd-verification.md)
