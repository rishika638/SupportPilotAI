# Performance Baseline

## Scope and environment

These are local measurements from the SupportPilotAI development environment using a local Express API, Docker-based PostgreSQL/Redis, and k6. They are useful for regression comparison, not a production capacity guarantee.

- API used for the successful runs: local port `3001`
- Dedicated benchmark database: `supportpilot_performance`
- Dataset was initially seeded with 100 tickets; ticket-creation and mixed-workload runs added records.
- A separate later seed brought the performance organization's ticket count to 10,000 for query-plan analysis.
- Exact per-run ticket counts, Git SHA, CPU/RAM utilization, and raw successful k6 summaries were not preserved alongside the terminal summaries. Record these in future runs.

## Measured k6 runs (2026-10-25)

| Scenario | Profile | Requests | HTTP failures | p95 | p99 | Throughput | Status |
|---|---|---:|---:|---:|---:|---:|---|
| Ticket listing | 10 VUs, 30-second hold | 281 | 0% | 91.11 ms | 98.02 ms | Not captured | Configured thresholds passed; one individual response exceeded the separate 500 ms check |
| Ticket creation | Up to 5 VUs, ~2-minute workload | 229 including login; 228 ticket creations | 0% in the successful run reported in terminal output | 86.96 ms | 154.14 ms | 1.81 req/s | Configured thresholds passed |
| Mixed workload | Up to 20 VUs, ~5.5 minutes | 4,311 | 3.80% (164 requests) | 75.52 ms | 113.1 ms | 12.6 req/s | Configured thresholds passed, but failure codes still need investigation |

### Interpretation

- Listing and creation latencies were low in this local run.
- The mixed workload stayed below the configured 5% failure threshold, but a 3.80% failure rate is not zero and should not be hidden. Capture the response-code distribution and identify whether failures were rate limits, validation errors, server errors, or connection/pool issues.
- The benchmark results were produced before the later 10,000-ticket seed. Do not claim the k6 results measure performance at 10,000 tickets.
- The successful creation/listing/mixed terminal summaries are not currently backed by matching raw successful-run output files in the supplied archive. The `performance/results/ticket-creation.json` file in that archive is an earlier failed run against `localhost:3000` with an 18.88% HTTP failure rate. It must not be represented as the successful port-3001 result.

## Database query-plan measurements

The later `EXPLAIN (ANALYZE, BUFFERS)` run used 10,000 tickets in the dedicated performance database.

| Query | Execution time | Plan observation |
|---|---:|---|
| Tenant + status listing | 0.112 ms | `tickets_organization_id_created_at_idx` |
| Tenant + priority filter | 0.245 ms | Same tenant/created-at index; 658 rows removed by filter |
| Substring search | 0.047 ms | Tenant/created-at index with ILIKE filter |
| `OFFSET 5000` | 1.776 ms | 5,020 rows scanned to return 20 |

These timings are single executions on a local database and warm cache. Do not compare them directly with API request latency or treat them as percentiles. The observed plan does not by itself justify adding indexes or implementing cursor pagination.

## Reproduction

Use only `supportpilot_performance` and the local API. Verify the active database name before any seed or write workload. Use a short smoke test before the full test.

```powershell
$env:API_BASE_URL = "http://localhost:3001/api/v1"
# Set TEST_USERNAME and TEST_PASSWORD in the local shell.
docker run --rm --network host -i grafana/k6 run `
  -e API_BASE_URL=$env:API_BASE_URL `
  -e TEST_USERNAME=$env:TEST_USERNAME `
  -e TEST_PASSWORD=$env:TEST_PASSWORD `
  - < performance/k6/ticket-listing.js
```

For each future run, save raw k6 output and a summary separately, including:
- timestamp and commit SHA;
- database name and ticket count;
- VUs and stage durations;
- requests, status-code breakdown, p50/p95/p99, throughput, and thresholds;
- local API port and any local-only environment overrides.

## Initial targets (not measured guarantees)

The original exploratory thresholds are:
- Listing: p95 < 500 ms, p99 < 1,000 ms
- Creation: p95 < 1,000 ms, p99 < 2,000 ms
- Mixed workload: p95 < 800 ms, p99 < 1,500 ms, HTTP failure rate < 5%

A threshold pass means only that the run met its configured threshold in that environment. It does not establish production scalability.
