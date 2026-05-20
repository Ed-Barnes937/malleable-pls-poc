# Security TODO

Findings from the security audit (2026-05-20) that were deferred to follow-up PRs.
Items are ordered by priority.

---

## Critical — Before Real Users

### 1. Add Real Authentication (C1)
**Impact:** Currently the entire auth model is a client-supplied `x-user-id` header. Any caller can impersonate any user.

**Work:**
- Add a real auth provider (Clerk, Auth.js, or custom JWT flow)
- Replace `x-user-id` header with validated token claims server-side
- Remove `VITE_USER_ID` / `dev-user-1` fallback from client code
- Reject unauthenticated requests instead of falling back to `'anonymous'`

**Files:** `apps/server/src/context.ts`, `packages/substrate-client/src/trpc.ts`, `apps/web/src/main.tsx`, `apps/server/src/upload.ts`

---

### 2. Fix RLS — Force Row Level Security (C2)
**Impact:** RLS is enabled on all tables, but the connection role is the table owner, which bypasses all policies. Tenant isolation exists only in application code.

**Work:**
- Add `ALTER TABLE <table> FORCE ROW LEVEL SECURITY` for all tables
- Create a separate non-owner role for the application connection
- Verify RLS policies work end-to-end with the new role

**Files:** New migration in `packages/db/src/migrations/`

---

### 3. Lock Down Workflow Dispatch (C4)
**Impact:** `workflows.dispatch` is a `publicProcedure` accepting arbitrary event types and payloads. Combined with no auth, anyone can trigger expensive operations (e.g. AssemblyAI transcription).

**Work:**
- Gate behind `protectedProcedure` once auth exists
- Validate `eventType` against an allowlist
- Validate `payload` shape per event type (replace `z.record(z.unknown())`)

**Files:** `apps/server/src/routers/workflows.ts`

---

## High — Before Production Traffic

### 4. Add Rate Limiting (H7)
**Impact:** No rate limiting on any endpoint. Upload, workflow dispatch, and tRPC are all unthrottled.

**Work:**
- Add rate limiting middleware (e.g. express-rate-limit or a simple token bucket)
- Different limits for upload (stricter) vs read queries (looser)

**Files:** `apps/server/src/index.ts`

---

### 5. Add HTTP Security Headers (H6)
**Impact:** No CSP, HSTS, X-Frame-Options, etc. on the raw `http.createServer`.

**Work:**
- Add `helmet` or equivalent middleware
- Set `Strict-Transport-Security`, `Content-Security-Policy`, `X-Content-Type-Options`, `X-Frame-Options`

**Files:** `apps/server/src/index.ts`, `apps/server/package.json`

---

### 6. Auth on Upload File Serving (H8)
**Impact:** Uploaded audio files at `/uploads/<uuid>.webm` are accessible to anyone who knows the UUID.

**Work:**
- Check `x-user-id` (or real auth) matches the recording owner before serving
- Or use signed URLs with expiry

**Files:** `apps/server/src/index.ts`

---

### 7. Scope Job Queries by User (H9)
**Impact:** `updateJobRunStatus` and executor queries don't filter by `user_id`.

**Work:**
- Add user_id filter to job runner queries
- Ensure executors (e.g. transcription) scope recording lookups to the triggering user

**Files:** `apps/server/src/workflows/job-runner.ts`, `apps/server/src/workflows/executors.ts`

---

### 8. Centralise Upload Auth Through tRPC (H3)
**Impact:** `AudioCaptureLens` uses raw `fetch()` with duplicated config. Future auth on tRPC won't protect uploads.

**Work:**
- Route upload through a tRPC mutation (or share auth logic)
- Remove duplicated `VITE_API_URL` / `VITE_USER_ID` from `AudioCaptureLens.tsx`

**Files:** `packages/lens-audio-capture/src/AudioCaptureLens.tsx`

---

## Medium — Good Practice

### 9. Add `.max()` to All Zod String Schemas (M4)
Prevents unbounded string inputs across all routers. Quick sweep — add reasonable max lengths.

### 10. Upload Content-Type Validation (M7)
Validate `Content-Type` header and inspect file magic bytes before writing to disk.

### 11. Wrap Migrations in Transactions (M3)
`sql.unsafe()` in the migration runner executes raw SQL without transaction wrapping. A partial failure leaves the DB inconsistent.

### 12. Bind docker-compose Postgres to localhost (M1)
Change `5433:5432` to `127.0.0.1:5433:5432` in `docker-compose.yml`.

### 13. Remove `window.tqdevtools` in Production (M8)
Gate the devtools toggle behind `import.meta.env.DEV`.

### 14. Add DB Enum CHECK Constraints (M6)
Add CHECK constraints on status/type columns (`recordings.status`, `job_runs.status`, etc.).

### 15. Harden Path Traversal Protection (M2)
Validate that the resolved file path starts with `UPLOADS_DIR` after `path.resolve`, rather than relying solely on `path.basename`.
