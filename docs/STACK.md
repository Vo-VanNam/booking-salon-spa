# STACK.md — Booking Salon/Spa (VN chain, 3–5 branches)

Source of truth for requirements: `DOCUMENT.md` (PRD §1–§8 + BENCHMARK RUN CONTRACT + GRADER API SURFACE).
The harness appends fixed contracts; this document records the stack decisions that satisfy them.

## Decisions

| Area | Choice | Why (one sentence) |
|---|---|---|
| Frontend framework | Next.js 14 (App Router) + TypeScript | PRD §6 fixes it, and server components/route groups keep the customer, admin and stylist surfaces in one deployable. |
| Styling | TailwindCSS 3 + shadcn/ui-style component set (tokens in `docs/design/specs/design-tokens.md`) | PRD §6 fixes Tailwind + shadcn primitives; tokens keep the beige/brown minimal direction consistent across three surfaces. |
| Animation | framer-motion | PRD §6 requires smooth step transitions in the booking wizard. |
| Backend | NestJS 10 + TypeScript on Express | PRD §5 fixes NestJS; modules/guards map 1:1 onto the 4 roles and the domain boundaries. |
| Database | PostgreSQL 16 + Prisma | PRD §5 fixes Postgres + Prisma; Postgres gives the row-level locking §4.1 explicitly requires. |
| Cache | Redis (ioredis) | PRD §4.2 requires a short-TTL slot cache with immediate invalidation; Redis also stores AI session history (§2.8). |
| Job queue | BullMQ on Redis | PRD §5 fixes BullMQ for reminder jobs (T-24h/T-1h) and the loyalty reconciliation cron. |
| Auth | JWT access token (15 min) + refresh token hashed in DB (7 days, revocable, rotated) | PRD §5 requires short access tokens and revocable refresh tokens across 4 roles. |
| Payments | VNPay adapter (HMAC-SHA512 webhook verification) + Momo adapter (HMAC-SHA256) | PRD §2.5/§5 require real gateway integration with env-configured keys and verified callbacks. |
| AI | OpenAI-compatible `/chat/completions` client + server-side tool registry | PRD §2.8/§5 requires function calling (never free-text parsing), server-side execution, and env-configured provider. |
| Hosting | Docker Compose + Nginx reverse proxy on a VPS (DigitalOcean/Vultr) | PRD §7 asks for exactly this production shape; `run.sh` uses the infra subset for the benchmark. |
| Unit/integration tests | Jest + ts-jest | PRD §8 mandates overlap + race-condition tests and a deterministic mock-LLM AI suite; Jest covers both against a dockerized test DB. |
| E2E / UI verification | Playwright-driven browser walkthrough (agent QA), plus the HTTP contract probe script | The harness grades HTTP behaviour; the browser walkthrough is how the UI claims get evidence. |

**Stack shape**

```
customer (mobile web)        staff (desktop/tablet)          stylist (mobile web)
        │                            │                              │
        └──────────────► Next.js 8101 (App Router) ◄────────────────┘
                                     │  fetch + Bearer JWT
                                     ▼
                          NestJS API 8100 ──── /ai/chat ──► OpenAI-compatible provider (env)
                            │        │
              Prisma/Postgres│        │ioredis / BullMQ
                            ▼        ▼
                       bookings    slot cache (30s) + reminder jobs + AI sessions
                            ▲
                  VNPay/Momo webhooks (HMAC verified, idempotent per txn_ref)
```

## Critical Files for Implementation
- `backend/prisma/schema.prisma` — entities, enums, the two mandated indexes (§3) and the
  payment idempotency unique constraint.
- `backend/src/bookings/bookings.service.ts` — the overlap + advisory-lock + loyalty + reminder seam that §4.1 governs.
- `backend/src/ai/tools/tool-registry.ts` — the whitelist that makes §2.8's guardrails enforceable.
- `frontend/app/page.tsx` — the customer booking flow the PRD's UI requirements describe.
- `run.sh` — the single entrypoint the benchmark contract calls; it owns ports, migrations, seed and startup.
