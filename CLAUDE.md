# CinemaAI — Hackathon Project

Always use context7 for the most up to date docs on the chosen tech stack.

## Team
- **Dev 1 (Chris)**: Curator Agent + Scheduler Agent
- **Dev 2 (Cameron)**: Promotions Agent + Booking System
- **Dev 3 (Dalton)**: Manager Agent + Frontend Polish + Orchestration

## Tech Stack
- Next.js 16 + TypeScript, React 19, Tailwind CSS v4
- Vercel AI SDK v6 (`ai`, `@ai-sdk/anthropic`, `@ai-sdk/react`) with Claude Sonnet 4.6
- SQLite via `better-sqlite3` (file: `movies.db`)
- Zod v4 for tool input validation

## Architecture
- Each agent gets its own API route: `/api/agents/{name}`
- Customer chat lives at `/api/chat` with 11 tools against real DB
- Shared SQLite DB is the source of truth for all agents
- Frontend: Chat tab (customer-facing) + Dashboard tab (analytics)
- DB connection: `src/lib/db.ts` — singleton `better-sqlite3` with WAL mode + foreign keys

## Database (`movies.db`)
Schema files live at project root (`*_schema.sql`), seed scripts are Python.

**movies** — 100 seeded movies
- id, name, actors (comma-separated), category, length_minutes, language, director, release_date

**theaters** — 15 rooms (1 IMAX, 2 Dolby, 2 3D, 10 Standard)
- id, name, seat_count (60–300), screen_type, is_active

**showtimes** — ~416 seeded (7 days, 3–5 per theater/day)
- id, movie_id (FK), theater_id (FK), show_date, start_time, end_time, ticket_price, seats_available, status
- Pricing: IMAX $18, Dolby $16, 3D $15, Standard $12 (with matinee/evening multipliers)

**Not yet created** (per WORK.md): bookings, promotions, promo_codes, events

## Current State
- Chat works end-to-end with 11 tools (getNowShowing, getMovieDetails, getShowtimes, getTheaters, checkSeatAvailability, bookTickets, searchMovies, getConcessionMenu, checkLoyaltyPoints)
- Dashboard has Overview, Theaters, Movies, Schedule views
- `bookTickets` currently decrements seats_available but doesn't write to a bookings table

## Conventions
- .env is gitignored but committed as .env (hackathon context)
- Schema files: `*_schema.sql` at project root
- Seed scripts: Python at project root
