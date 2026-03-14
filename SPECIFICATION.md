# CinemaAI — The Self-Running Movie Theater

## Vision

An end-to-end AI agent system that autonomously operates a movie theater — from optimizing the lineup to engaging customers, scheduling showtimes, running promotions, and handling the full ticket-buying experience. The agents collaborate, make decisions, and react to real-time conditions like a living business, all visualized in a real-time dashboard.

---

## The Agents

### 1. Optimizer Agent (`optimizer`)
The strategic brain. Analyzes theater performance and optimizes operations. Absorbed the original Curator role.

- **Analyzes fill rates** across all theaters and flags underperformers
- **Requests extra screenings** for high-demand movies
- **Flags low-fill showtimes** for the Promoter to create deals
- **Monitors genre distribution** and rebalances the catalog
- **Model**: Claude Sonnet 4.6
- **Frequency**: Every simulated day

### 2. Schedule Manager Agent (`scheduler`)
The operations brain. Builds and optimizes the showtime calendar.

- **Adds showtimes** for movies in demand using available theater slots
- **Cancels showtimes** with very low fills that won't sell
- **Checks theater availability** to avoid conflicts
- **Balances schedule** across theaters and time slots
- **Model**: Claude Sonnet 4.6
- **Frequency**: Every simulated day

### 3. Promotions Agent (`promoter`)
The hustler. Drives ticket sales through discounts and deals.

- **Creates targeted flash sales** for struggling showtimes (15-40% off)
- **Generates promo codes** — unique codes tied to specific promotions
- **Runs broader promotions** targeting categories or all movies
- **Checks promo performance** to avoid overlap and waste
- **Model**: Claude Sonnet 4.6
- **Frequency**: Every simulated day

### 4. Manager Agent (`manager`)
The customer service expert. Helps active customers find movies and book tickets.

- **Browses movies** matching customer preferences (genre, budget, time)
- **Shows available showtimes** with pricing and seat availability
- **Books tickets** with proper seat decrement and booking records
- **Handles the full conversation** from browsing to confirmed booking
- **Model**: Claude Haiku 4.5
- **Frequency**: Per active customer interaction

### 5. Customer Agents (`customer-active`, `customer-passive`)
The audience. Simulated customers with distinct personalities.

**Active Customers** (LLM-driven):
- Have preferences (favorite genres, budget sensitivity, group size, time preference)
- Talk to the Manager Agent to find and book movies
- Make autonomous decisions to book or leave
- **Model**: Claude Haiku 4.5

**Passive Customers** (Deterministic):
- Receive promotions and decide whether to accept based on preferences
- Rule-based decision: genre match + budget sensitivity + spontaneity + discount value
- No LLM call — cheap and fast

---

## The Simulation Model

### Day-Based Architecture

Each simulation "day" is a complete cycle. There are no artificial timers — the simulation runs at the speed of the LLM API calls.

```
Day N:
  ┌─────────────────────────────────────────────────┐
  │  Phase 1: Strategic Agents (Sequential)          │
  │    Optimizer → Scheduler → Promoter              │
  ├─────────────────────────────────────────────────┤
  │  Phase 2: Customer Waves (3 per day)             │
  │    Morning (10:00):  3 active + 1 passive        │
  │    Afternoon (14:00): 5 active + 2 passive       │
  │    Evening (18:00):  7 active + 3 passive        │
  ├─────────────────────────────────────────────────┤
  │  Phase 3: End of Day                             │
  │    KPI snapshot → Advance clock → Day N+1        │
  └─────────────────────────────────────────────────┘
```

### Why Day-Based?

- **Natural pacing**: Each day completes fully before the next begins
- **No artificial delays**: Speed is determined by how fast conversations happen
- **Visually exciting**: Events stream in rapidly as each phase completes
- **Deterministic completion**: Every day has a clear start and end

### Customer Spawner

25 predefined personality templates (data, not LLM-generated):
- Name, favorite genres, budget sensitivity (low/medium/high), group size (1-6), time preference (matinee/evening/any), spontaneity (0-1)
- Per wave: customers are randomly selected, ensuring no duplicates within a day

---

## Shared Theater State

Central SQLite database — source of truth for all agents.

**Tables**: movies, theaters, showtimes, promotions, promo_codes, bookings, simulation_events

**State Controller** (`TheaterStateController`):
- KPIs: revenue, tickets sold, fill rates, promo stats
- Theater summaries: per-theater capacity and fills
- Genre trends: performance by category
- Alerts: sold out, low fill, high demand, expiring promos

---

## Tech Stack

| Layer | Choice | Why |
|-------|--------|-----|
| **Runtime** | Next.js 16 + TypeScript | Full-stack React framework |
| **AI** | Claude via Vercel AI SDK v6 | Powers agent reasoning and tool use |
| **Models** | Sonnet 4.6 (strategic), Haiku 4.5 (customers) | Cost-efficient model mix |
| **Data Store** | SQLite via `better-sqlite3` | Lightweight, file-based, no server needed |
| **Frontend** | React 19 + Tailwind CSS v4 | Chat UI + real-time simulation dashboard |
| **Streaming** | Server-Sent Events (SSE) | Real-time event delivery to dashboard |
| **Concurrency** | Async mutex + Promise.allSettled | Safe writes + concurrent customer batches |

---

## Frontend

### Tab Structure
- **Chat Tab**: Manual customer chatbot (independent of simulation)
- **Dashboard Tab**: Simulation + analytics with 6 subtabs

### Dashboard Subtabs
1. **Simulation**: Controls (play/stop/reset) + KPI bar + Theater grid (15 cards) + recent activity
2. **Activity**: Full scrolling log of agent actions with color-coded badges
3. **Conversations**: Expandable customer-manager dialogues with outcomes
4. **Analytics**: Revenue, genre performance, daily charts, promo stats
5. **Schedule**: Filterable showtime table with fill buttons
6. **Alerts**: Color-coded alerts (sold out, low fill, high demand, promo expiring)

### Design System
- Luxury cinema gold theme (#d4a853 accent)
- Dark background (#08080a)
- Playfair Display + DM Sans fonts
- CSS custom properties for consistent theming
- Agent-colored badges: Optimizer=purple, Scheduler=blue, Promoter=gold, Manager=green, Customer=zinc

---

## Demo Flow (Hackathon Presentation)

1. **Start simulation** — click Play, watch Day 1 begin
2. **Strategic phase** — Optimizer analyzes, Scheduler adjusts, Promoter creates deals
3. **Morning wave** — watch 3 customers arrive, browse, and book (or leave)
4. **Afternoon/Evening waves** — traffic builds, fill rates climb, promos get redeemed
5. **Day ends** — KPI snapshot, theater grid updates
6. **Day 2+ begins** — agents adapt to new data, promotions evolve
7. **Show conversations** — click into customer dialogues to see natural language booking
8. **Show analytics** — revenue charts, genre performance, fill rate trends

---

## Model Cost Budget (10-min demo, ~3-4 simulated days)

| Agent | Model | Calls/Day | Total (4 days) | Est. Cost |
|-------|-------|-----------|----------------|-----------|
| Optimizer | Sonnet 4.6 | 1 | 4 | ~$0.12 |
| Scheduler | Sonnet 4.6 | 1 | 4 | ~$0.12 |
| Promoter | Sonnet 4.6 | 1 | 4 | ~$0.12 |
| Manager | Haiku 4.5 | ~15/day | 60 | ~$0.30 |
| Active Customers | Haiku 4.5 | ~15/day | 60 | ~$0.30 |
| Passive Customers | None | ~6/day | 24 | $0.00 |
| **Total** | | | | **~$1.00** |

---

## Success Criteria

- [x] Core agents functional and autonomous (Optimizer, Scheduler, Promoter, Manager)
- [x] Full ticket-booking workflow works end-to-end
- [x] Promotions affect customer behavior
- [x] Live dashboard shows theater state updating in real-time
- [x] Day-by-day simulation with customer waves
- [x] Manual chat tab works independently
- [ ] Demo tells a compelling story in under 5 minutes

---

## File Structure

```
team_23/
├── CLAUDE.md                     # Project instructions for Claude Code
├── SPECIFICATION.md              # This file
├── ARCHITECTURE.md               # Full architecture diagrams (Mermaid)
├── movies_schema.sql             # Movies table schema
├── theater_schema.sql            # Theaters + showtimes schema
├── bookings_schema.sql           # Bookings + promotions schema
├── events_schema.sql             # Simulation events schema
├── movies.db                     # SQLite database
├── src/
│   ├── app/
│   │   ├── page.tsx              # Main page (Chat + Dashboard tabs)
│   │   ├── layout.tsx            # Root layout
│   │   ├── globals.css           # Theme + animations
│   │   └── api/
│   │       ├── chat/route.ts     # Customer chatbot
│   │       ├── clock/route.ts    # Clock control
│   │       ├── theater-state/    # State query API
│   │       └── simulation/
│   │           ├── stream/       # SSE event stream
│   │           └── control/      # Start/stop/reset
│   ├── lib/
│   │   ├── db.ts                 # SQLite singleton
│   │   ├── simulation-clock.ts   # Time control
│   │   ├── simulation-engine.ts  # Day-by-day orchestrator
│   │   ├── theater-state.ts      # KPI controller
│   │   ├── event-store.ts        # Event persistence
│   │   ├── write-queue.ts        # Async mutex
│   │   ├── promoter-tools.ts     # Shared promo functions
│   │   └── agents/
│   │       ├── types.ts          # Shared types
│   │       ├── customer-spawner.ts
│   │       ├── customer-active.ts
│   │       ├── customer-passive.ts
│   │       ├── manager-agent.ts
│   │       ├── optimizer.ts
│   │       ├── scheduler.ts
│   │       └── promoter-agent.ts
│   └── components/
│       ├── Dashboard.tsx         # Main dashboard + SSE listener
│       ├── SimulationControls.tsx
│       ├── KPIBar.tsx
│       ├── TheaterGrid.tsx
│       ├── TheaterCard.tsx
│       ├── ActivityFeed.tsx
│       └── ConversationView.tsx
```
