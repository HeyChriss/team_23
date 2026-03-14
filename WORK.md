# Work Breakdown — CinemaAI Hackathon

## What's Done

- [x] SQLite database with movies table (100 movies seeded)
- [x] Theaters table (15 rooms) + showtimes table (416 showtimes, 7 days)
- [x] Next.js app with Chat tab (AI chatbot connected to real DB)
- [x] Dashboard tab (Overview, Theaters, Movies, Schedule views)
- [x] Chat tools: getNowShowing, getMovieDetails, getShowtimes, getTheaters, checkSeatAvailability, bookTickets, searchMovies, getConcessionMenu, checkLoyaltyPoints

---

## Dev 1 — Curator Agent + Scheduler Agent

**Focus**: The content pipeline — what movies are playing and when.

### Curator Agent

- [ ] **API route** `POST /api/agents/curator` — agent endpoint with its own system prompt and tools
- [ ] **Tool: `addMovie`** — AI generates a new movie (title, genre, cast, synopsis, runtime) and inserts into DB
- [ ] **Tool: `retireMovie`** — removes a movie from the catalog and cancels its future showtimes
- [ ] **Tool: `getGenreDistribution`** — returns how many movies per genre are in the catalog
- [ ] **Tool: `getMoviePerformance`** — returns fill rates and booking counts per movie to identify underperformers
- [ ] **Tool: `trendAnalysis`** — shows which genres/categories are selling best
- [ ] **Frontend**: Add a "Curator" tab or panel where you can trigger/watch the curator agent work
- [ ] **Auto-mode**: Curator can be triggered to autonomously rebalance the catalog (add trending genres, retire flops)

### Scheduler Agent

- [ ] **API route** `POST /api/agents/scheduler` — agent endpoint with its own system prompt and tools
- [ ] **Tool: `generateDaySchedule`** — builds a conflict-free schedule for a given date across all theaters
- [ ] **Tool: `addShowtime`** — manually add a single showtime (with conflict checking)
- [ ] **Tool: `cancelShowtime`** — cancel a specific showtime
- [ ] **Tool: `getTheaterUtilization`** — shows how full each theater's schedule is (gaps, dead time)
- [ ] **Tool: `addExtraScreening`** — detects sold-out shows and adds another screening in an available theater
- [ ] **Frontend**: Add a "Scheduler" panel — visual calendar/grid showing the week's schedule per theater
- [ ] **Auto-mode**: Scheduler can fill gaps, respond to sold-out shows, and optimize prime-time allocation

### DB Changes (Dev 1)

- [ ] Add `synopsis` and `poster_url` columns to movies table (for curator-generated content)
- [ ] Add `is_active` column to movies table (soft-delete for retired movies)

---

## Dev 2 — Promotions Agent + Booking System

**Focus**: Revenue engine — promotions, discounts, and the full booking pipeline.

### Promotions Agent

- [ ] **API route** `POST /api/agents/promoter` — agent endpoint with its own system prompt and tools
- [ ] **Tool: `createPromotion`** — create a new discount (name, type, discount %, applicable movies/showtimes, start/end dates)
- [ ] **Tool: `createPromoCode`** — generate a unique promo code tied to a promotion
- [ ] **Tool: `deactivatePromotion`** — expire or disable a promo
- [ ] **Tool: `getPromotionPerformance`** — how many times each promo was used, revenue impact
- [ ] **Tool: `detectLowFillShowtimes`** — find showtimes with low seat fill rates (candidates for flash sales)
- [ ] **Tool: `createFlashSale`** — auto-generate a time-limited discount for struggling showtimes
- [ ] **Frontend**: Add a "Promotions" tab showing active promos, codes, and performance metrics
- [ ] **Auto-mode**: Promoter scans for low-fill showtimes and autonomously creates flash sales

### Booking System

- [ ] **DB: `bookings` table** — id, showtime_id, customer_name, num_tickets, total_price, promo_code_used, confirmation_code, booked_at
- [ ] **DB: `promotions` table** — id, name, description, discount_type (percent/fixed), discount_value, applicable_movie_id (nullable), applicable_showtime_id (nullable), start_date, end_date, is_active
- [ ] **DB: `promo_codes` table** — id, promotion_id, code (unique), max_uses, times_used, is_active
- [ ] **Update `bookTickets` tool** — record bookings in the bookings table, support promo code validation and discount application
- [ ] **API route** `GET /api/bookings` — list all bookings with filters (date, movie, theater)
- [ ] **Frontend**: Bookings view in Dashboard — recent bookings, revenue totals, booking trends

### DB Changes (Dev 2)

- [ ] Create `bookings` table
- [ ] Create `promotions` table
- [ ] Create `promo_codes` table
- [ ] Schema file: `bookings_schema.sql`

---

## Dev 3 — Manager Agent + Frontend Polish + Orchestration

**Focus**: The brain that ties everything together, plus making the UI shine for demo day.

### Manager Agent

- [ ] **API route** `POST /api/agents/manager` — orchestrator agent with its own system prompt and tools
- [ ] **Tool: `getDashboardKPIs`** — returns key metrics: total revenue, tickets sold, avg fill rate, top movies, top promos
- [ ] **Tool: `getAgentStatus`** — check what each agent has done recently (event log)
- [ ] **Tool: `issueDirective`** — send a command to another agent (e.g., "Curator: add more horror movies", "Promoter: run a flash sale on Theater 5")
- [ ] **Tool: `generateReport`** — produce a daily/weekly summary report
- [ ] **Tool: `triggerEvent`** — inject a chaos event ("Projector down in Theater 2", "Holiday weekend", "Blockbuster just dropped")
- [ ] **Tool: `getRevenueBreakdown`** — revenue by theater, by movie, by day, by screen type
- [ ] **Frontend**: Manager control panel — KPI dashboard, agent activity feed, event triggers
- [ ] **Auto-mode**: Manager reviews KPIs and issues strategic directives to other agents

### Event & Activity Log

- [ ] **DB: `events` table** — id, event_type, agent, description, data (JSON), created_at
- [ ] Log all agent actions (movie added, showtime created, promo launched, booking made)
- [ ] **API route** `GET /api/events` — paginated event feed
- [ ] **Frontend**: Live activity feed showing what agents are doing in real-time

### Orchestration / Simulation

- [ ] **API route** `POST /api/simulate` — kicks off a simulation tick (manager evaluates state → issues directives → agents respond)
- [ ] **Simulation controls** in frontend — Start/Pause/Step buttons, speed control
- [ ] Wire agents to respond to manager directives
- [ ] Implement at least 1 chaos event scenario end-to-end

### Frontend Polish

- [ ] Unified navigation — clean tab bar for Chat, Dashboard, Curator, Scheduler, Promotions, Manager
- [ ] Real-time refresh — dashboard auto-refreshes as agents make changes
- [ ] Loading states, error handling, empty states across all views
- [ ] Mobile-responsive layout
- [ ] Demo-ready styling and animations

### DB Changes (Dev 3)

- [ ] Create `events` table
- [ ] Schema file: `events_schema.sql`

---

## Coordination Notes

- **All agents use the same SQLite DB** (`movies.db`) — coordinate on schema changes
- **Each agent gets its own API route** under `/api/agents/{name}` with its own system prompt and tool set
- **The chat bot** (`/api/chat`) is the customer-facing interface — it reads from the same DB the agents write to
- **Branch strategy**: Each dev works on a feature branch, merge to main frequently
- **Test your agent** by hitting its API route directly or building a quick UI panel for it
- When adding DB tables, create both a `*_schema.sql` file and a seed script if needed

---

## Priority Order

1. **DB schema** for new tables (bookings, promotions, promo_codes, events) — do this first so everyone can build against it
2. **Agent API routes** with tools — get each agent functional
3. **Frontend panels** for each agent — visualize what they're doing
4. **Manager orchestration** — wire agents together
5. **Simulation loop + chaos events** — the demo wow factor
6. **Polish** — make it look great for presentation
