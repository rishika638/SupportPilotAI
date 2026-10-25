# Tenant Isolation Integration Tests

## Overview

The tenant isolation integration tests verify that SupportPilotAI's multi-tenant architecture properly isolates data and permissions across organizations. These tests use real HTTP requests, real authentication, and a dedicated disposable PostgreSQL database to validate cross-tenant access denial, RBAC enforcement, and data integrity.

## Test Database

The integration tests run against a dedicated test database that is explicitly validated to prevent accidental access to production or development data:

- **Database Name**: Must contain "test" (e.g., `supportpilot_tenant_test`)
- **Hostname**: Must be localhost only (127.0.0.1, ::1, or localhost)
- **Protocol**: PostgreSQL only
- **Forbidden Patterns**: "prod", "production", "render", "live"

## Running the Tests

### Prerequisites

1. PostgreSQL must be running locally on port 5433 (or configured port)
2. Redis must be running locally on port 6379
3. Create a dedicated test database:
   ```bash
   docker exec supportpilot-postgres psql -U supportpilot -c "CREATE DATABASE supportpilot_tenant_test;"
   ```

### Execute Tests

```bash
NODE_ENV=test TENANT_TEST_DATABASE_URL=postgresql://supportpilot:change-me-postgres-password@localhost:5433/supportpilot_tenant_test?schema=public npm run test:integration
```

The test runner:
1. Validates the database URL (localhost, test-only name, PostgreSQL)
2. Runs `prisma migrate deploy` against the test database
3. Executes the integration test suite
4. Cleans up test data automatically

## Test Coverage

### 1. Authentication Enforcement
- Requires authentication for protected routes (tickets, teams, analytics, notifications)
- Returns 401 for unauthenticated requests

### 2. Cross-Tenant Read Isolation
- Denies cross-tenant ticket reads without revealing the other tenant's data
- Denies cross-tenant AI analysis reads
- Ensures sensitive sentinel values are not leaked in error responses

### 3. Cross-Tenant Write Isolation
- Denies cross-tenant ticket mutations (PATCH, DELETE, status changes)
- Denies cross-tenant comment creation and reads
- Denies assignment using foreign team or user IDs
- Verifies database state remains unchanged after denied mutations

### 4. Team Scoping
- Scopes team and member reads to the authenticated organization
- Denies cross-tenant team mutations (rename, delete, member management)
- Verifies team listing only returns organization's teams
- Prevents cross-tenant team member additions

### 5. Search, Filters, and Pagination
- Scopes ticket search to authenticated organization
- Scopes status and priority filters
- Verifies pagination totals are accurate per organization
- Ensures page contents respect organization boundaries

### 6. Analytics Isolation
- Returns analytics calculated only from the authenticated organization's tickets
- Excludes cross-tenant tickets from totals, SLA compliance, and resolution times

### 7. Notification Isolation
- Scopes notifications to authenticated user and organization
- Denies cross-tenant notification reads and mark-read operations
- Prevents cross-tenant bulk notification operations

### 8. RBAC Enforcement
- **Manager Role**: Can see tickets in their teams or unassigned; cannot access other teams' tickets
- **Agent Role**: Can only see tickets assigned to them; cannot assign tickets, delete tickets, or access analytics
- **Admin Role**: Full access within organization
- **Role Escalation**: Agents cannot escalate to admin/manager operations

## Test Fixtures

The test suite creates two organizations (A and B) with the following structure:

**Organization A:**
- Admin (full access)
- Manager (team-scoped access)
- Agent (assigned tickets only)
- 2 teams (team A, team A-other)
- 4 tickets (assigned across teams and users)
- 1 resolved ticket

**Organization B:**
- Admin (full access)
- 1 team
- 2 tickets (including resolved)
- Private sentinel data for verification

All fixtures use UUID suffixes to prevent collisions and are automatically cleaned up after tests complete.

## Results

Latest test run (2026-10-23):
- **Total Tests**: 8
- **Passed**: 8
- **Failed**: 0
- **Duration**: 11.4 seconds

Detailed results are available in `artifacts/tenant-isolation-results.json`.

## Implementation Details

### Test Application

The tests use a real Express application (via `src/app.ts`) listening on a random localhost port. This ensures the tests exercise the actual middleware stack, authentication, and routing logic—not just unit-tested service layers.

### Database Assertions

Tests verify database state before and after operations to ensure:
- Denied mutations do not change data
- Cross-tenant attempts do not affect the other tenant's records
- Organization-scoped queries return only the expected data

### Sentinel Values

Organization B uses sentinel values (e.g., `B_PRIVATE_SENTINEL_`) in ticket subjects, comments, and analysis summaries. Tests verify these values never appear in Organization A's responses, even on 404 errors.

## Safety Guards

The integration test runner includes multiple safety checks:

1. **Database URL Validation**: Refuses non-localhost databases
2. **Database Name Validation**: Requires "test" in the name; refuses production-like names
3. **Environment Validation**: Requires `NODE_ENV=test`
4. **Automatic Cleanup**: All test organizations and users are deleted after tests complete
5. **Isolated Redis DB**: Uses Redis DB 15 to avoid interfering with development/production

## Continuous Integration

The tenant isolation tests are designed to run in CI environments with:
- Disposable PostgreSQL databases (e.g., GitHub Actions services)
- Isolated Redis instances
- Safe credential management (test-only secrets)

The CI workflow (`.github/workflows/ci.yml`) should include the integration test step with appropriate database provisioning.
