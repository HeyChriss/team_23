# CinemaAI — Hackathon Project

Always use context7 for the most up to date docs on the chosen tech stack.

## Team
- **Dev 1 (Chris)**: Curator Agent + Scheduler Agent
- **Dev 2 (Cameron)**: Promotions Agent + Booking System
- **Dev 3 (Dalton)**: Manager Agent + Frontend Polish + Orchestration

## Tech Stack
- Next.js 16 + TypeScript, React 19, Tailwind CSS v4
- Vercel AI SDK v6 (`ai`, `@ai-sdk/anthropic`, `@ai-sdk/react`) with Claude models
- SQLite via `better-sqlite3` (file: `movies.db`)
- Zod v4 for tool input validation

## Architecture
- **Simulation Engine** (`src/lib/simulation-engine.ts`): Day-by-day loop orchestrating all agents. No timers — runs at LLM speed.
- **Agents** (`src/lib/agents/`): Optimizer, Scheduler, Promoter (Sonnet 4.6), Manager (Haiku 4.5), Customer spawner
- **Customer chat** (`/api/chat`): Manual customer interaction (separate from simulation)
- **SSE streaming** (`/api/simulation/stream`): Real-time events to dashboard
- **Shared SQLite DB** is the source of truth for all agents
- **Write queue** (`src/lib/write-queue.ts`): Async mutex prevents SQLITE_BUSY
- **Frontend**: Chat tab (customer-facing) + Dashboard tab (simulation + analytics)
- DB connection: `src/lib/db.ts` — singleton `better-sqlite3` with WAL mode + foreign keys
- See `ARCHITECTURE.md` for full diagrams and details

## Database (`movies.db`)
Schema files live at project root (`*_schema.sql`), seed scripts are Python.
Migration scripts live in `migrations/` — run with `node scripts/run-migration.js <name>`.
`db.ts` also auto-creates missing tables on init as a safety net, but always create a migration for new tables.

**Important**: After cloning or resetting the DB, run migrations to ensure all tables exist:
```bash
node scripts/run-migration.js 001_curator_movies
node scripts/run-migration.js 002_bookings_promos_events
```

**movies** — 100 seeded movies
- id, name, actors, category, length_minutes, language, director, release_date, synopsis, poster_url, is_active

**theaters** — 15 rooms
- id, name, seat_count (60–300), screen_type (Standard/IMAX/Dolby/3D), is_active

**showtimes** — ~416 seeded (7 days, 3–5 per theater/day)
- id, movie_id, theater_id, show_date, start_time, end_time, ticket_price, seats_available, status

**promotions** — created by Promoter agent
- id, name, description, discount_type, discount_value, applicable filters, start/end dates, is_active

**promo_codes** — tied to promotions
- id, promotion_id, code, max_uses, times_used, is_active

**bookings** — source of truth for revenue
- id, showtime_id, customer_name, num_tickets, unit_price, discount_amount, total_price, promo_code_id, confirmation_code

**simulation_events** — log of all agent actions during simulation
- id, sim_time, event_type, agent, summary, data (JSON)

## Simulation Model
- Day-based: each day = complete cycle (strategic agents → 3 customer waves → end-of-day)
- Customer waves: Morning (3 active + 1 passive), Afternoon (5+2), Evening (7+3)
- Active customers use Haiku to talk to Manager agent
- Passive customers are deterministic (rule-based promo acceptance)
- No artificial delays — speed determined by API call completion

## Current State
- Full multi-agent simulation system implemented
- Chat works end-to-end with 9 tools
- Dashboard has Simulation (live), Activity, Conversations, Analytics, Schedule, Alerts subtabs
- SSE streaming from simulation engine to frontend
- All agent types functional: Optimizer, Scheduler, Promoter, Manager, Active/Passive Customers

## Conventions
- .env is gitignored but committed as .env (hackathon context)
- Schema files: `*_schema.sql` at project root
- Migrations: `migrations/*.sql`, run via `node scripts/run-migration.js <name>`
- Seed scripts: Python at project root
- Agent files: `src/lib/agents/*.ts`
- Luxury cinema gold theme (CSS vars in globals.css)
- Tests: Vitest with in-memory SQLite (`vitest run`). Tests don't touch `movies.db`.

## Gotchas
- `better-sqlite3` requires `serverExternalPackages` in `next.config.ts` for production builds (Turbopack). Dev mode works fine without it.
- Vercel AI SDK v6 uses `stopWhen: stepCountIs(n)` — not `maxSteps` (which doesn't exist in v6).
- All DB writes during simulation must go through `withWriteLock()` from `write-queue.ts` to avoid SQLITE_BUSY errors from concurrent agent writes.
- The simulation clock is a singleton — `getSimulationClock()`. Never create a second instance.
- SSE stream route (`/api/simulation/stream`) starts the engine on connect and stops on disconnect. Only one stream connection at a time.
