# RAI.md

## What We Are Building
A production-grade appointment booking web app for a 3–5 branch salon/spa chain in Vietnam
(Booksy/Fresha, simplified). Customers book branch → service → stylist → free slot on mobile;
stylists see their own day on a phone; branch admins run one branch (calendar with drag & drop,
services, stylists, revenue); super admins run the chain. A Vietnamese AI booking assistant
(server-side, OpenAI-compatible function calling over internal whitelisted APIs) sits on the
booking page, and an analytics assistant (tier 2) sits in the admin dashboard.
Requirements and the fixed harness contract live in `DOCUMENT.md` (authoritative PRD + run contract).

## Stack
- **Backend**: Node.js 22 + TypeScript + NestJS (controllers/guards/DI), runs on `PORT` (8100).
- **DB**: PostgreSQL 16 via Prisma (`prisma migrate deploy` on boot; UTC storage, Asia/Ho_Chi_Minh at the edges).
- **Cache/queue**: Redis (ioredis) for slot cache + AI session history; BullMQ for reminder jobs and the loyalty cron.
- **Auth**: JWT access token (short TTL) + rotated refresh token hashed in DB; 4 roles via guards.
- **Frontend**: Next.js 14 App Router + TypeScript + TailwindCSS + shadcn/ui-style components + framer-motion.
- **AI**: OpenAI-compatible `/chat/completions` client with a server-side tool registry (no client keys, no SQL from the model).
- **Tests**: Jest + ts-jest; overlap unit tests, a real-Postgres race test, and a scripted mock-LLM suite.

## Project Structure
```
run.sh                 # benchmark entrypoint: infra + migrations + seed + backend + frontend, prints URL line
docker-compose.yml     # benchmark/dev stack: postgres + redis (fixed host ports)
docker-compose.prod.yml# production stack: backend + frontend + postgres + redis + nginx, named volume
backend/               # NestJS API (port 8100)
  prisma/              # schema, migrations, seed
  src/common/          # config, JSON logger, request-id, exception filter, guards, rate limit, VN time utils
  src/{auth,branches,services,stylists,customers,slots,bookings,loyalty,payments,admin,ai,queue,health}/
  test/                # integration specs that need the dockerized test DB / mock LLM
frontend/              # Next.js app (port 8101): booking wizard + AI widget, login, admin dashboard, stylist page
docs/                  # PRD pointer, STACK/DATA_MODEL/API contracts, SCREENS map, design specs
nginx/                 # reverse proxy config used by the production compose file
```

## Commands
```
bash run.sh                    # whole app (docker infra + migrate + seed + backend + frontend)
cd backend && npm run build    # tsc → dist/
cd backend && npm start        # node dist/main.js
cd backend && npm test         # overlap + race + AI(mock LLM) + payments unit/integration tests
cd backend && npm run seed     # idempotent seed (3 branches, services, stylists, accounts)
cd frontend && npm run dev     # next dev -p 8101
cd frontend && npm run build   # production build (docker image)
```

## Non-Negotiable Rules
1. Verify each feature at the boundary that establishes its acceptance criteria (HTTP for APIs,
   real Postgres for locking, mock LLM HTTP server for AI, browser for UI). Gates are commands, not slogans.
2. `DOCUMENT.md` fixed contracts are frozen: route paths, field names, status codes, the VNPay HMAC
   message format, tool names (`get_slots`, `create_booking`), ports 8100/8101, the `URL:` line.
3. Secrets never appear in code, comments, tests, client bundles or logs; config comes from env only.
4. The test suite only grows; bug fixes ship with a regression test.
5. Never break a shipped behaviour to make room for a new one — add a new path beside it.
6. Booking conflict logic changes require both the pure overlap test and the race test to stay green.
7. All user-facing text is Vietnamese; dates are dd/MM/yyyy and 24h; timezone is Asia/Ho_Chi_Minh.

## Coding Conventions
- NestJS module per domain: `*.module.ts`, `*.controller.ts`, `*.service.ts`, `dto/` with
  class-validator (Vietnamese messages), `prisma/schema.prisma` models mapped to snake_case tables.
- Business rules live in services, not controllers; controllers only translate HTTP.
- Errors: `HttpException` subclasses with Vietnamese messages; one global filter normalises
  `{ statusCode, error, message, requestId }`.
- Time: all instants stored UTC; convert with `src/common/time.ts` helpers only (never ad-hoc `+07:00` math in features).
- Logging: inject `AppLogger` (structured JSON, `request_id` from AsyncLocalStorage); never log secrets, tokens or AI content bodies.

## Design Principles
- **Deep modules at real seams**: `BookingsService.create()` hides overlap check, advisory lock,
  row locks, loyalty pricing and reminder scheduling behind one call; tests cross that same seam.
- **Injected boundaries**: Prisma, Redis, BullMQ, LLM HTTP and the payment gateway are injected,
  so tests run without the production stack (Redis/queue degrade to no-ops when absent).
- **Frozen contracts**: `POST /bookings` response shape, `/slots` ISO format and the VNPay webhook
  format are consumed by the harness — extend, never rename.
- **Additive change**: new behaviour lands as a new route/handler/service method; existing status
  codes and field names stay as shipped.

## Definition of Done Checklist
- [ ] Feature works per the acceptance criteria in `DOCUMENT.md` §2 / GRADER API SURFACE
- [ ] `cd backend && npm test` green (overlap, race, AI mock LLM, payments)
- [ ] `bash run.sh` from a cold start prints exactly one `URL:` line and serves `GET /health` 200
- [ ] Browser walkthrough of booking flow, admin calendar, stylist page (no console errors)
- [ ] No secret in code/logs; Vietnamese UI text; dd/MM/yyyy + 24h verified
- [ ] Independent review + verify sub-agent evidence on the final revision

## Known Patterns
- Slot cache: `slots:{branch}:{stylist}:{date}:{service}` TTL ~30s, invalidated on booking create/cancel/reschedule.
- Concurrency: `pg_advisory_xact_lock(hashtext(stylist_id))` + `SELECT ... FOR UPDATE` on the
  stylist's overlapping bookings inside one transaction (belt and braces against double booking).
- Payment: one `payment_transactions` row per `(provider, txn_ref)` — unique constraint makes the
  "credit exactly once" property hold even for concurrent duplicate webhooks.
- AI: tool registry with JSON-schema argument validation; unknown tools are refused, never executed;
  every tool call is audited in `ai_tool_calls`.
