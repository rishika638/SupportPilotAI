# Database Query Analysis

## Scope

This report combines schema/index review with measured `EXPLAIN (ANALYZE, BUFFERS)` output from the dedicated local `supportpilot_performance` database. The measured dataset contained 10,000 tickets for the performance organization. Results are local single-run measurements, not production guarantees.

## Measured plans — 2026-10-25

| Query | Execution time | Main plan | Notes |
|---|---:|---|---|
| Tenant-scoped listing, status `OPEN`, not deleted, newest first, limit 20 | 0.112 ms | Index Scan using `tickets_organization_id_created_at_idx` | 20 rows returned; 19 rows removed by filter; 18 shared buffers hit |
| Tenant-scoped priority filter (`HIGH`, `URGENT`), not deleted, newest first, limit 20 | 0.245 ms | Index Scan using `tickets_organization_id_created_at_idx` | 20 rows returned; 658 rows removed by filter; 236 shared buffers hit |
| Substring search (`subject ILIKE '%performance%' OR description ILIKE '%synthetic%'`) | 0.047 ms | Index Scan using `tickets_organization_id_created_at_idx` | Fast in this dataset/cache; ILIKE itself is a filter, not an index condition |
| Deep pagination (`OFFSET 5000 LIMIT 20`) | 1.776 ms | Index Scan using `tickets_organization_id_created_at_idx` | Scanned 5,020 rows to return 20; 637 shared buffers hit |

### Interpretation

1. The existing organization/created-at index supports the tenant-scoped ordering used by these queries.
2. The priority query filters many rows after the index scan. It is still fast in this test, so this run alone does not justify adding a new composite index.
3. The substring search is not proven to be a bottleneck at 10,000 rows. The plan uses the tenant/created-at index and applies `ILIKE` as a filter. Consider `pg_trgm` only if representative production-like measurements show search cost becoming material.
4. `OFFSET 5000` requires scanning past 5,000 rows. Cursor pagination is a candidate if real workloads show deep-page latency or consistency problems; it is not automatically required.
5. `pg_stat_user_indexes` counters are cumulative and can survive individual benchmark runs. A zero scan count in one snapshot is not proof that an index is unnecessary.
6. All reported timings are individual local measurements with a warm cache. They are not p95/p99 values and should not be compared directly with HTTP latency.

## Table and index size

- Table: 3,728 kB
- Indexes: 2,768 kB
- Total table + indexes: 6,536 kB

## Reproduction

Run `performance/sql/analyze-queries.sql` through the PostgreSQL client inside the existing Docker container. Pass the performance organization UUID using `-v org_id=...`, and connect only to `supportpilot_performance`.

The full terminal output should be saved as `performance/results/explain-analyze-2026-10-25.txt`. Never run seed or cleanup commands against the primary development or production database.

## Decision

**No index or pagination code change is justified by these measurements alone.** Keep the current implementation unless repeatable measurements on representative query patterns show a material problem. If optimizing, capture a before-plan, apply one justified change, rerun the same query on comparable data, and compare execution time, buffer activity, plan shape, write overhead, and storage cost.
