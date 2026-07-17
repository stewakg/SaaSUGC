# AdGen — AI reklame za COD prodavnice

AI video/image ad-generator SaaS for Balkan COD e-commerce (Serbian-first). See
[`INFRASTRUCTURE.md`](./INFRASTRUCTURE.md) for the full build plan and architecture;
[`ACCOUNTS.md`](./ACCOUNTS.md) for the provider signup checklist (only needed from Phase F5).

## Quickstart

> Requires: **Node ≥ 20**, **pnpm**, **Docker** (for Redis; Supabase CLI is optional for local DB).
> The whole app runs **mock-first** with **zero API keys**.

```bash
pnpm install

# Start everything (web on :3000, worker) — all in mock mode:
pnpm dev

# (optional) local services: Redis for the worker queue (+ redis-commander on :8081)
pnpm services:up

# (optional) local Supabase (DB + Auth + Studio) — needs `supabase` CLI + Docker
pnpm supabase start
pnpm db:seed   # creates dev user dev@adgen.local / dev-password-123 with 100 credits
```

Open <http://localhost:3000>.

## Monorepo layout

```
apps/web       Next.js 15 (App Router) + Tailwind — UI, auth, API, enqueues jobs
apps/worker    Node + BullMQ + Redis — queue consumer, generation orchestration
packages/core  Shared TS: provider interfaces + MOCK impls + env loader + pricing
packages/db    Supabase schema/migrations, typed client, seed script
supabase/      Local Supabase config + SQL migrations
infra/         docker-compose (Redis) + future deploy scripts
```

## Mock-first (the core idea)

Every external dependency (AI, TTS, script, render, storage, billing, scraper) is behind
an interface in `packages/core`. A factory reads `.env` and returns the **real** impl when
its key is present, otherwise the **mock**. So F0–F4 run end-to-end with **no accounts**.
Missing a key never crashes the app — it just uses the mock. Real providers are wired in F5.

No secrets are committed; only `.env.example` (empty placeholders). Copy it to `.env`.

## Commands

| Command | Description |
|---|---|
| `pnpm dev` | Run web + worker in parallel (mock mode) |
| `pnpm build` | Build all packages |
| `pnpm typecheck` | Typecheck all packages |
| `pnpm lint` | Lint all packages |
| `pnpm format` | Prettier write |
| `pnpm services:up` | Start Redis (+ commander) via docker compose |
| `pnpm supabase start` | Start local Supabase stack |
| `pnpm db:seed` | Seed a dev user with credits |