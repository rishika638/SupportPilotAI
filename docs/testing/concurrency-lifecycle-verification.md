# Concurrency and lifecycle verification

## Latest recorded result

The later local project session recorded **8/8 passing** for `tests/integration/concurrency-lifecycle.test.ts`. The archived `artifacts/ticket-lifecycle-concurrency.json` is an older snapshot and still reports earlier Windows worker-thread blocking. It must be regenerated from a fresh run before being treated as the machine-readable result for the later test run.

## What the integration suite exercises

| Test | Invariant |
|---|---|
| Concurrent ticket numbering produces unique numbers | Concurrent inserts do not produce duplicate ticket numbers |
| Duplicate idempotent requests replay cached response | A retry with the same key and payload returns the same ticket identity |
| Idempotency key mismatch rejects with 422 | Reusing a key for a different payload is rejected |
| Status transitions respect state machine | Allowed transitions follow the lifecycle rules |
| Invalid state transition is rejected | Invalid transitions do not silently mutate lifecycle state |
| Assignment updates are atomic | Assignment state and related audit effects remain consistent |
| Cross-tenant idempotency keys are independent | One organization's key does not collide with another organization's operation |
| Comment creation respects visibility | `PUBLIC` and `INTERNAL` visibility are stored as requested |

The suite uses the actual Express application, authenticated HTTP requests, tenant fixtures and Prisma-backed database assertions. The test should be run against the isolated integration-test database and Redis test configuration.

## Reproduce

```powershell
$env:NODE_ENV = "test"
$env:INTEGRATION_TEST_FILE = "tests/integration/concurrency-lifecycle.test.ts"
npm run test:integration
```

Use the repository's existing test command/configuration if it differs; do not run this against a production database.

## Evidence refresh checklist

After a successful run, update the archived JSON from actual test-run output rather than editing the counts by hand. Record:
- timestamp and Git commit SHA;
- Node.js and PostgreSQL versions;
- database/Redis test configuration (without credentials);
- total, passed, failed and blocked cases;
- duration and per-test outcomes;
- any skipped/blocked cases and the reason.

Do not claim global exactly-once processing. The tests demonstrate only the specific request, ticket-number, lifecycle, assignment and comment-visibility invariants listed above.
