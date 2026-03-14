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
- **Simulation Engine** (`src/lib/simulation-engine.ts`): Day-by-day loop orchestrating all agents. No timers — runs at LLM speed. Streams individual results as each conversation completes (not batched).
- **Agents** (`src/lib/agents/`): Optimizer, Scheduler, Promoter (Sonnet 4.6), Manager (Haiku 4.5), Customer spawner (DB-integrated)
- **Customer Spawner** (`src/lib/agents/customer-spawner.ts`): Pulls from DB `customers` table — buyers → active waves, persuadable → passive waves. Falls back to hard-coded pool if DB empty.
- **Customer Spawner API** (`/api/agents/customer-spawner`): LLM-powered (Haiku) customer generator — creates new customers in DB with diverse personalities.
- **Customer Decide API** (`/api/agents/customer-decide`): LLM-powered (Haiku) buying decision — processes N customers from pool, each decides to buy or leave.
- **Curator Agent** (`/api/agents/curator`): Film curator — add/retire movies, getGenreDistribution, getMoviePerformance, trendAnalysis.
- **SSE streaming** (`/api/simulation/stream`): Real-time events including `conversation_update` for step-by-step progress.
- **Cross-component events**: `window` custom events (`sim:customer-status`, `sim:conversation-update`, `sim:state`, `sim:control`) bridge components across tabs.
- **Shared SQLite DB** is the source of truth for all agents
- **Write queue** (`src/lib/write-queue.ts`): Async mutex prevents SQLITE_BUSY
- **Frontend**: Dashboard, Simulation, Customers tabs — all stay mounted (CSS display toggle) so SSE persists across tab switches.
- **Customer Pool** (`/api/customers`): Lists unbooked customers. Bubble physics pool with agent connection visualization.
- DB connection: `src/lib/db.ts` — singleton `better-sqlite3` with WAL mode + foreign keys
- See `ARCHITECTURE.md` for full diagrams and details

## Database (`movies.db`)
Schema files live at project root (`*_schema.sql`), seed scripts are Python.
Migration scripts live in `migrations/` — run with `node scripts/run-migration.js <name>`.
`db.ts` also auto-creates missing tables on init as a safety net, but always create a migration for new tables.

**Important**: After cloning or resetting the DB, run migrations to ensure all tables exist:
```bash
npm run migrate
# Or individually:
node scripts/run-migration.js 001_curator_movies
node scripts/run-migration.js 002_bookings_promotions
node scripts/run-migration.js 003_customers
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

**customers** — pool of potential customers (stub data, agent will manage later)
- id, name, customer_type (buyer | persuadable), age, preferences, loyalty_tier, visit_frequency, budget_preference, preferred_showtime, interested_in_concessions, group_size_preference, notes
- Excluded from pool when they have a booking (matched by customer_name)

## Simulation Model
- Day-based: each day = complete cycle (strategic agents → 3 customer waves → end-of-day)
- Customer waves: Morning (3 active + 1 passive), Afternoon (5+2), Evening (7+3)
- Active customers pulled from DB `customers` table (buyer type), talk to Manager agent (Haiku)
- Passive customers pulled from DB (persuadable type), deterministic promo acceptance
- Conversations stream step-by-step: greeting → browsing → checking showtimes → booking → result
- Each conversation result emits individually as it completes (parallel but streamed)
- No artificial delays — speed determined by API call completion

## Current State
- Full multi-agent simulation system implemented and integrated end-to-end
- **Simulation tab** (default): Controls, Activity feed, Conversations sub-tabs + embedded customer pool
- **Customers tab**: Physics-based bubble pool (left) + Live Agent Conversations feed (right)
- **Dashboard tab**: Analytics, TV guide, movies, schedule, alerts
- **Global simulation button** in header — start/stop from any tab
- All tabs stay mounted — SSE connection persists across tab switches
- SSE streams individual conversation results + step-by-step progress updates
- All agent types functional: Optimizer, Scheduler, Promoter, Manager, Active/Passive Customers
- **Curator Agent**: Full implementation with chat UI.
- **Customer Pool**: Physics bubble pool with agent connection visualization. Individual Manager/Promoter agent nodes appear during active conversations. SVG connection lines + "Chatting"/"Promo" badges on active customers.
- **Live Conversation Feed**: Right panel shows real-time step-by-step conversation progress (greeting → browsing → checking → booking → result) with LIVE/BOOKED/LEFT status badges.
- **Customer Spawner API**: LLM generates diverse customer profiles on demand (auto-spawns when pool drops below threshold).
- **Customer Decide API**: LLM processes customers through buying decisions independently of simulation.

## Conventions
- .env is gitignored but committed as .env (hackathon context)
- Schema files: `*_schema.sql` at project root
- Migrations: `migrations/*.sql`, run via `npm run migrate` or `node scripts/run-migration.js <name>`
- Seed scripts: Python at project root; `npm run seed:customers` for customer pool
- Add single customer: `node scripts/add-customer.js` (edit script to change name/details)
- Agent files: `src/lib/agents/*.ts`
- Luxury cinema gold theme (CSS vars in globals.css)
- Tests: Vitest with in-memory SQLite (`vitest run`). Tests don't touch `movies.db`.
- Cross-component communication: `window` custom events (`sim:customer-status`, `sim:conversation-update`, `sim:state`, `sim:control`)
- All tabs mounted via CSS `display` toggle (not conditional rendering) — preserves SSE connections and component state

## Gotchas
- `better-sqlite3` requires `serverExternalPackages` in `next.config.ts` for production builds (Turbopack). Dev mode works fine without it.
- Vercel AI SDK v6 uses `stopWhen: stepCountIs(n)` — not `maxSteps` (which doesn't exist in v6).
- All DB writes during simulation must go through `withWriteLock()` from `write-queue.ts` to avoid SQLITE_BUSY errors from concurrent agent writes.
- The simulation clock is a singleton — `getSimulationClock()`. Never create a second instance.
- SSE stream route (`/api/simulation/stream`) starts the engine on connect and stops on disconnect. Only one stream connection at a time.
- Manager Agent `onProgress` callback emits `conversation_update` SSE events for real-time step streaming. Don't remove the callback parameter.
- Customer spawner reads from DB first, falls back to hard-coded pool. The DB query uses `ORDER BY RANDOM()` for variety.
- Tabs are always mounted (CSS display toggle). Don't switch to conditional rendering or SSE will break on tab switch.
