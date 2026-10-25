# Concurrency and Idempotency Testing

## Overview

SupportPilotAI implements comprehensive concurrency and idempotency safeguards to ensure data consistency in multi-user, multi-tenant environments. This document describes the testing approach, coverage, and known limitations.

## Idempotency

### Purpose

Idempotency ensures that repeated requests with the same idempotency key produce the same result, preventing duplicate operations, duplicate charges, and race conditions.

### Implementation

- **Middleware**: `src/shared/middleware/idempotency.middleware.ts`
- **Storage**: Redis with configurable TTL
- **Key Format**: `idempotency:{organizationId}:{idempotencyKey}`
- **Lock Mechanism**: Redis NX (set-if-not-exists) for in-flight request claims
- **Claim Renewal**: Automatic renewal every 40 seconds for long-running requests

### Test Coverage

#### Unit Tests (`tests/idempotency.test.ts`)

1. **First Request Execution**
   - Verifies handler is called for first request
   - Confirms response is cached in Redis
   - Validates completed flag is set

2. **Duplicate Replay**
   - Sends identical request with same key
   - Verifies cached response is replayed
   - Confirms `Idempotent-Replayed` header is set
   - Ensures handler is NOT called on replay

3. **Payload Mismatch**
   - Caches response for original payload
   - Sends different payload with same key
   - Verifies 422 status with `IDEMPOTENCY_KEY_MISMATCH` error
   - Ensures handler is NOT called

4. **In-Flight Claim Renewal**
   - Simulates long-running request (>60 seconds)
   - Verifies claim is renewed periodically
   - Confirms response is committed only by lock owner
   - Tests lock ownership transfer prevention

5. **Concurrent Duplicate Rejection**
   - Submits duplicate while original is processing
   - Verifies duplicate receives 409 Conflict
   - Confirms original completes successfully
   - Tests subsequent replay returns cached response

6. **Lock Ownership**
   - Simulates late-arriving original response
   - Verifies replacement owner's lock is not overwritten
   - Tests claim transfer edge cases

### Cross-Tenant Isolation

Idempotency keys are scoped to organizations. The same key used by different organizations results in independent operations:
- Keys are prefixed with `organizationId`
- No collision across tenants
- Each tenant maintains separate idempotency cache

### Redis Failure Handling

When Redis is unavailable:
- Requests with idempotency key return 503 Service Unavailable
- Requests without idempotency key bypass middleware
- GET requests bypass middleware (idempotency not needed for reads)

## Concurrency

### Ticket Number Allocation

**Problem**: Concurrent ticket creation could produce duplicate ticket numbers.

**Solution**: Database-level unique constraint on `(organizationId, ticketNumber)` with retry logic.

**Test Coverage**:
- Sequential allocation produces unique incrementing numbers
- P2002 conflict triggers retry (logic verification)

### State Machine

**Problem**: Concurrent status transitions could put tickets in invalid states.

**Solution**: State machine with valid transition enforcement at database transaction level.

**Valid Transitions**:
- OPEN → ASSIGNED, ESCALATED
- ASSIGNED → IN_PROGRESS, WAITING_CUSTOMER
- IN_PROGRESS → WAITING_CUSTOMER, RESOLVED, ESCALATED
- WAITING_CUSTOMER → IN_PROGRESS
- RESOLVED → CLOSED
- ESCALATED → IN_PROGRESS, RESOLVED
- CLOSED (terminal, no transitions)

**Test Coverage**:
- Full lifecycle transitions (OPEN → ASSIGNED → IN_PROGRESS → RESOLVED → CLOSED)
- Alternative paths (OPEN → ESCALATED → IN_PROGRESS → RESOLVED → CLOSED)
- Terminal state enforcement (CLOSED rejects all transitions)
- Invalid transition rejection (RESOLVED → OPEN forbidden)
- IN_PROGRESS ↔ WAITING_CUSTOMER bidirectional transitions

### Assignment Atomicity

**Problem**: Concurrent assignments could leave inconsistent state.

**Solution**: Assignment updates occur within database transactions with audit logging.

**Test Coverage**:
- Assignment updates are atomic
- Assignment history is recorded
- Team and assignee changes are transactional

### Comment Creation

**Problem**: Concurrent comment creation could mix visibility settings.

**Solution**: Each comment is created independently with explicit visibility.

**Test Coverage**:
- Comment creation respects visibility (PUBLIC vs INTERNAL)
- Multiple comments can be created concurrently
- Visibility is stored correctly per comment

## Integration Test Limitations

On Windows environments, the integration test runner encountered Node.js worker thread initialization errors (`ERR_WORKER_INIT_FAILED`). This prevented full end-to-end HTTP API testing of concurrency scenarios.

### Workaround

The unit test suite provides comprehensive coverage of:
- Idempotency middleware logic
- State machine transitions
- Ticket number allocation logic
- Assignment atomicity
- Comment visibility

These unit tests use mocked Redis and in-memory fixtures to verify the core logic without requiring full HTTP stack initialization.

## Running Tests

### Unit Tests

```bash
npm test
```

This runs all unit tests including:
- Idempotency middleware tests
- State machine tests
- Ticket allocation tests
- RBAC tests
- SLA tests

### Integration Tests (Linux/Mac)

```bash
NODE_ENV=test \
TENANT_TEST_DATABASE_URL=postgresql://supportpilot:password@localhost:5433/supportpilot_tenant_test \
npm run test:integration
```

## Results

Latest test run (2026-10-23):
- **Idempotency Unit Tests**: 6/6 passed (2.6s)
- **Lifecycle Unit Tests**: 4/4 passed (4.5s)
- **Integration Tests**: Blocked on Windows (worker thread issue)

Detailed results:
- `artifacts/idempotency-concurrency.json`
- `artifacts/ticket-lifecycle-concurrency.json`

## Known Issues

1. **Windows Worker Thread Issue**: Node.js test runner worker threads fail to initialize on Windows. This affects integration tests that require the full HTTP stack. The issue is documented in Node.js and affects test frameworks using worker threads.

2. **Memory Pressure**: High concurrency tests may trigger JavaScript heap out of memory errors on resource-constrained systems. This is mitigated by limiting concurrent test scenarios.

## Recommendations

1. **CI Environment**: Run integration tests in Linux-based CI environments (GitHub Actions, GitLab CI) where worker threads function correctly.

2. **Production Monitoring**: Monitor Redis connection health and idempotency cache hit rates in production to detect issues early.

3. **Rate Limiting**: Idempotency should be combined with rate limiting to prevent abuse while allowing legitimate retries.

4. **TTL Configuration**: Configure idempotency key TTL based on your longest expected operation duration (default: 24 hours).
