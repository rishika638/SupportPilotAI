-- SupportPilotAI performance query analysis.
-- Run ONLY against the dedicated local supportpilot_performance database:
-- psql "$DATABASE_URL" -v org_id='<performance-organization-uuid>' -f performance/sql/analyze-queries.sql
-- This file contains read-only EXPLAIN ANALYZE/diagnostic statements; it does not mutate business data.

\if :{?org_id}
\else
  \echo 'ERROR: supply -v org_id=<performance organization UUID>'
  \quit 2
\endif

\echo '1) Ticket listing by tenant and status'
EXPLAIN (ANALYZE, BUFFERS, VERBOSE, FORMAT TEXT)
SELECT id, ticket_number, subject, status, priority, channel, created_at
FROM tickets
WHERE organization_id = :'org_id'::uuid
  AND status = 'OPEN'
  AND deleted_at IS NULL
ORDER BY created_at DESC
LIMIT 20 OFFSET 0;

\echo '2) Ticket listing with common tenant-scoped filters'
EXPLAIN (ANALYZE, BUFFERS, VERBOSE, FORMAT TEXT)
SELECT id, ticket_number, subject, status, priority, team_id, assignee_id, created_at
FROM tickets
WHERE organization_id = :'org_id'::uuid
  AND priority IN ('HIGH', 'URGENT')
  AND deleted_at IS NULL
ORDER BY created_at DESC
LIMIT 20;

\echo '3) Substring search (expected to expose ILIKE scan cost)'
EXPLAIN (ANALYZE, BUFFERS, VERBOSE, FORMAT TEXT)
SELECT id, ticket_number, subject, created_at
FROM tickets
WHERE organization_id = :'org_id'::uuid
  AND deleted_at IS NULL
  AND (subject ILIKE '%performance%' OR description ILIKE '%synthetic%')
ORDER BY created_at DESC
LIMIT 20;

\echo '4) Deep OFFSET pagination comparison'
EXPLAIN (ANALYZE, BUFFERS, VERBOSE, FORMAT TEXT)
SELECT id, ticket_number, subject, created_at
FROM tickets
WHERE organization_id = :'org_id'::uuid
  AND deleted_at IS NULL
ORDER BY created_at DESC
LIMIT 20 OFFSET 5000;

\echo '5) Tenant ticket count and data distribution'
SELECT status, priority, count(*) AS ticket_count
FROM tickets
WHERE organization_id = :'org_id'::uuid
GROUP BY status, priority
ORDER BY status, priority;

\echo '6) Index usage (database-wide stats; interpret cautiously after a fresh DB restart)'
SELECT schemaname, relname AS table_name, indexrelname AS index_name,
       idx_scan, idx_tup_read, idx_tup_fetch
FROM pg_stat_user_indexes
WHERE schemaname = 'public' AND relname = 'tickets'
ORDER BY idx_scan DESC, indexrelname;

\echo '7) Ticket table/index sizes'
SELECT
  pg_size_pretty(pg_relation_size('public.tickets')) AS table_size,
  pg_size_pretty(pg_indexes_size('public.tickets')) AS indexes_size,
  pg_size_pretty(pg_total_relation_size('public.tickets')) AS total_size;
