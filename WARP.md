# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

Repository: od-scheduler (TypeScript, ESM, Vercel serverless)

- Node version: ^18.20.2 or >=20.9.0 (see package.json engines)
- ESM only: type: "module"; import paths use .js extensions after transpile
- Output dir: dist/ (tsconfig outDir)

Commands

- Install dependencies
  - npm ci
- Run locally (serverless endpoints)
  - npm run dev  # vercel dev (requires Vercel CLI installed)
- Build
  - npm run build  # tsc -> dist/
- Type-check only
  - npm run type-check
- Lint
  - npm run lint
- Tests (Vitest)
  - npm test  # vitest run
  - Single test file: npx vitest run path/to/test.spec.ts
  - Single test by name: npx vitest run -t "test name"
- Scheduler smoke test script (runs against built code)
  - npm run build && npm run test:scheduler

Deploy

- Production deploy: npm run deploy  # vercel --prod
- Vercel configuration: vercel.json
  - Cron jobs configured:
    - /api/cron/run-jobs at 0 9 * * *
    - /api/cron/cleanup at 0 2 * * *
  - Note: /api/cron/url-shortening exists but is not scheduled in vercel.json. Add a cron entry if you want it to run periodically.

API Endpoints (local via vercel dev or in prod)

- POST /api/jobs/run  # manual execution
  - Body JSON (optional): { "force": true, "dealer_id": "...", "platform": "homenet|dealer.com|..." }
- GET /api/jobs/status  # monitoring
  - Query: ?dealer_id=...&platform=...&limit=50
- POST /api/cron/run-jobs  # scheduled daily at 9 AM (can also be invoked manually)
- POST /api/cron/cleanup  # scheduled daily at 2 AM
- GET /api/cron/url-shortening  # processes queued URL shortening jobs (not auto-scheduled)

Quick cURL examples (local)

- Run all eligible jobs:
  - curl -X POST http://localhost:3000/api/cron/run-jobs
- Force-run, filtered:
  - curl -X POST http://localhost:3000/api/jobs/run -H "Content-Type: application/json" -d '{"force":true,"platform":"homenet"}'
- Check status:
  - curl "http://localhost:3000/api/jobs/status?limit=25"
- Process URL shortening jobs (on-demand):
  - curl http://localhost:3000/api/cron/url-shortening

Environment configuration

Validated with zod at import-time (src/env.ts). Missing/invalid values will throw during startup.
- Required
  - OD_SUPABASE_URL (url)
  - OD_SUPABASE_SERVICE_ROLE (string)
  - OD_DATA_API_URL (url)
  - OD_SOAP_TRANSFORMER_URL (url)
  - OD_API_KEY_SECRET (string)
- Optional/conditional
  - OD_BEARER_TOKEN (string)
  - OD_HOMENET_INTEGRATION_TOKEN (string)
  - OD_HOMENET_ROOFTOP_COLLECTION (string)
  - OD_UPDATED_SINCE (default: 2025-01-01T00:00:00Z)
  - OD_REBRANDLY_API_KEY (string)

High-level architecture

- Serverless API (Vercel)
  - api/cron/run-jobs.ts: entrypoint for scheduled job execution
  - api/cron/cleanup.ts: periodic cleanup of old records
  - api/cron/url-shortening.ts: processes URL shortening queue (on-demand unless scheduled)
  - api/jobs/run.ts: manual execution with filters (force, dealer_id, platform)
  - api/jobs/status.ts: recent executions and 24h aggregated stats
- Core scheduler (src/scheduler.ts)
  - Retrieves active dealers from Supabase (dealers table) and expands one ScheduledJob per platform
  - Decides whether jobs should run (src/utils.ts: shouldRunJob)
  - Executes jobs with concurrency control (batching; limit 5)
  - Persists JobExecution records to Supabase (job_executions table)
  - Exposes helper to process URL shortening jobs via jobs/url-shortening.ts
- Job runners (src/jobs)
  - HomeNet (homenet.ts): Calls OD_SOAP_TRANSFORMER_URL to pull SOAP-transformed vehicles; posts to OD_DATA_API_URL /v1/vehicles/batch with X-API-Key and X-Dealer-ID
  - Dealer.com (dealer-com.ts): Tries configured API endpoint; falls back to light HTML scraping to gather vehicle URLs; posts to Data API
  - URL Shortening (url-shortening.ts): Worker over job_queue (status pending/processing/retry/completed/failed) to create Rebrandly links; verifies dealer URLs, generates deterministic slashtags; updates vehicles table and job_queue row
- Utilities (src/utils.ts)
  - Logging helpers with consistent prefixes (INFO/SUCCESS/WARNING/ERROR)
  - Supabase client factory using env vars
  - Scheduling helpers: shouldRunJob, calculateNextRun
  - Performance timer for duration metrics
  - Error formatting and retryability checks
- Types and validation (src/types.ts, src/env.ts)
  - Strong typing for ScheduledJob, JobExecution, JobResult, and API DTOs
  - zod schemas for runtime validation of job and execution shapes

Data model expectations (Supabase)

- dealers: id, name, platforms[], homenet_config, dealer_com_config, web_scraping_config, status
- job_executions: execution records persisted by SchedulerService
- job_queue: URL shortening jobs (job_type='url_shortening', status transitions, attempts/max_attempts)
- vehicles: stores short_url, rebrandly_id, short_url_status, etc.
- api_key_events, vehicle_links: cleaned up by cleanup cron

Development notes

- Path alias: @/* maps to ./src/* (tsconfig.json). When authoring TS, you can use import x from '@/foo'.
- ESM and .js extensions: compiled files in dist/ use .js; source imports already include .js extensions.
- test-scheduler.mjs imports from dist/src; build before running.
- Cron on Vercel Hobby: README notes daily-only limit; adjust schedules per your plan.

Key info from README

- Local run: npm run dev; manual run endpoint /api/jobs/run; status at /api/jobs/status
- Production URL (as documented): https://od-scheduler.vercel.app
- Cron schedules: daily job run at 9 AM; cleanup at 2 AM

Suggestions

- If you want URL shortening to run on a cadence, add a crons entry in vercel.json for /api/cron/url-shortening (e.g., every 5 minutes), subject to your plan limits.
- Consider adding a test script alias for watch mode (e.g., "test:watch": "vitest").
