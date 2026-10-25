# EXPLAIN ANALYZE summary — 2026-10-25

**Target:** local `supportpilot_performance` database  
**Dataset:** 10,000 tickets for the performance organization  
**Method:** `EXPLAIN (ANALYZE, BUFFERS, VERBOSE, FORMAT TEXT)` for read-only representative queries.

| Query | Execution time | Rows returned | Buffers / observations |
|---|---:|---:|---|
| Tenant listing + `OPEN` status + newest-first | 0.112 ms | 20 | 18 shared buffer hits; `tickets_organization_id_created_at_idx`; 19 rows removed by filter |
| Tenant listing + `HIGH`/`URGENT` priority | 0.245 ms | 20 | 236 shared buffer hits; same tenant/created-at index; 658 rows removed by filter |
| Substring search on subject/description | 0.047 ms | 20 | 4 shared buffer hits; ILIKE conditions remain filters |
| Deep pagination, `OFFSET 5000 LIMIT 20` | 1.776 ms | 20 | 637 shared buffer hits; 5,020 rows scanned |

## Additional diagnostics

- Ticket table: 3,728 kB
- Ticket indexes: 2,768 kB
- Table + indexes: 6,536 kB
- Index stats are cumulative; interpret scan counts cautiously.
- The local timings are individual executions with a warm cache, not p95/p99.

## Conclusion

The existing tenant/created-at index served all four measured query patterns. The priority filter discarded many rows, and deep OFFSET scanned 5,020 rows, but the observed execution times were still low in this environment. This run does not justify an index migration or cursor-pagination rewrite by itself.

The full raw output was captured in the user's local working folder as `performance/results/explain-analyze-2026-10-25.txt`. Keep that raw output alongside this summary in the final repository.
