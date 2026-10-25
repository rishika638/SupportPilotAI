# Performance result provenance

This directory contains benchmark evidence. Keep raw output and summarized findings distinct.

## Current summary

`benchmark-summary-2026-10-25.json` contains the successful k6 measurements reported in the terminal session. The matching raw successful-run output for listing, creation, and mixed workload was **not present in the supplied ZIP**, so the summary explicitly labels its provenance rather than pretending to be raw k6 output.

`explain-analyze-2026-10-25-summary.md` summarizes the actual 10,000-ticket query-plan output shared during the working session. The full raw query-plan output was captured separately in the local working folder as `explain-analyze-2026-10-25.txt`; ensure that file is included in the repository before the final release.

## Legacy file warning

The `ticket-creation.json` file in the supplied archive is not a clean JSON summary. It contains k6 JSON-lines events mixed with console output, and its final summary shows an **earlier failed run against `http://localhost:3000/api/v1`** with 44 failed HTTP requests out of 233 (18.88%). It is not evidence for the later successful port-3001 run.

Before publishing:
1. Preserve the old file outside the portfolio evidence directory if it is useful for debugging.
2. Rename it to something explicit such as `ticket-creation-initial-failed-port3000.log`, or remove it from the public repository after preserving the diagnostic record.
3. Re-run the successful scenarios with raw output saved to files, then regenerate a summary from those outputs.
4. Never include access tokens, passwords, cookies, database connection strings, or secret environment variables in results.

## Future run naming

Prefer names such as:
- `ticket-listing-2026-10-25-summary.json`
- `ticket-creation-2026-10-25-summary.json`
- `mixed-workload-2026-10-25-summary.json`
- `explain-analyze-2026-10-25.txt`

Record dataset size, VUs, stage durations, local API port, Git SHA, status-code distribution, and configured thresholds.
