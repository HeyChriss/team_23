# CinemaAI — The Self-Running Movie Theater

## Vision

An end-to-end AI agent system that autonomously operates a movie theater — from curating the film lineup to engaging customers, scheduling showtimes, running promotions, and handling the full ticket-buying experience. No humans needed. The agents collaborate, make decisions, and react to real-time conditions like a living business.

---

## The Agents

### 1. Film Curator Agent (`curator`)
The creative mind. Decides what movies the theater should show.

- **Generates movie listings** — titles, genres, synopses, ratings, runtime, poster art (via AI image gen or placeholder)
- **Curates a rotating catalog** — balances genres (action, comedy, horror, family, indie)
- **Responds to trends** — if a genre is selling well, it adds more of that type
- **Retires underperforming films** — pulls movies that aren't filling seats

### 2. Schedule Manager Agent (`scheduler`)
The operations brain. Builds and optimizes the showtime calendar.

- **Creates daily/weekly schedules** across multiple screens (Screen 1, 2, 3, etc.)
- **Avoids conflicts** — no double-booking a screen
- **Optimizes for demand** — popular movies get prime-time slots and more screens
- **Handles gaps intelligently** — fills dead slots with shorter films or special screenings
- **Adapts in real-time** — if a showing sells out, it can add an extra screening

### 3. Promotions Agent (`promoter`)
The hustler. Drives ticket sales through discounts and deals.

- **Creates targeted discounts** — "Matinee Monday: 30% off before noon", "Student Night", "Family 4-Pack"
- **Generates promo codes** — unique, time-limited codes tied to specific movies or showings
- **Runs flash sales** — detects low-attendance showings and drops prices to fill seats
- **Bundles** — "Movie + Popcorn + Drink" combo deals
- **Seasonal campaigns** — horror marathon in October, rom-coms for Valentine's week

### 4. Customer Agent (`customer-sim`) — STRETCH GOAL
> **Status: Deferred.** Will be built if time permits. The other 4 agents are the priority.

The audience. Simulates realistic customer behavior.

- **Browses the catalog** — looks at what's playing, checks times
- **Has preferences** — some customers love action, others want family films
- **Responds to promotions** — more likely to buy with a discount
- **Books tickets** — selects movie, showtime, seats, applies promo codes
- **Leaves reviews** — post-movie feedback that feeds back into the system
- **Asks questions** — "Is this movie kid-friendly?", "Do you have wheelchair seating?"

### 5. Theater Manager Agent (`manager`)
The orchestrator. Oversees everything and makes high-level decisions.

- **Monitors KPIs** — ticket sales, revenue, seat fill rate, customer satisfaction
- **Coordinates agents** — tells the curator to add movies, tells the promoter to run a sale
- **Generates reports** — daily/weekly dashboards of theater performance
- **Handles escalations** — when the customer sim has an issue no other agent can solve
- **Makes strategic calls** — "We need more family content" or "Let's do a midnight premiere"

---

## The Simulation Loop

```
┌─────────────────────────────────────────────────────────┐
│                    THEATER MANAGER                       │
│              (orchestrates everything)                   │
└──────────┬──────────┬──────────┬──────────┬─────────────┘
           │          │          │          │
     ┌─────▼──┐ ┌────▼───┐ ┌───▼────┐ ┌───▼──────────┐
     │CURATOR │ │SCHEDULE│ │PROMOTER│ │CUSTOMER SIMS │
     │        │ │MANAGER │ │        │ │ (many)       │
     └───┬────┘ └───┬────┘ └───┬────┘ └───┬──────────┘
         │          │          │          │
         └──────────┴──────────┴──────────┘
                        │
                  ┌─────▼─────┐
                  │  THEATER  │
                  │   STATE   │
                  │ (shared)  │
                  └───────────┘
```

### Simulation Flow

1. **Initialization** — Manager boots the theater. Curator generates initial movie catalog. Scheduler builds the first week's showtimes.
2. **Tick Loop** (each tick = simulated time block, e.g., 1 hour)
   - Customer agents browse, book, or leave reviews
   - Promoter checks fill rates and creates/adjusts deals
   - Scheduler adapts if screenings sell out or flop
   - Manager reviews KPIs and issues directives
3. **Events** — Random events spice things up: "A blockbuster just dropped!", "Projector broke in Screen 2", "Holiday weekend incoming"
4. **End State** — After N ticks, the manager generates a final report card

---

## Shared Theater State

Central data store all agents read/write. This is the source of truth.

```
theater_state = {
  movies: [...],           // current catalog
  screens: [1, 2, 3, 4],  // available screens
  schedule: {...},         // showtime calendar
  promotions: [...],       // active deals/codes
  bookings: [...],         // all ticket purchases
  reviews: [...],          // customer feedback
  revenue: 0,             // running total
  events: [...],          // event log / audit trail
  kpis: {                 // dashboard metrics
    total_tickets_sold: 0,
    average_fill_rate: 0,
    total_revenue: 0,
    average_rating: 0,
    promo_redemptions: 0
  }
}
```

---

## Tech Stack

| Layer | Choice | Why |
|-------|--------|-----|
| **Runtime** | Next.js 16 + TypeScript | Full-stack React framework |
| **AI Backbone** | Claude API via Vercel AI SDK (`@ai-sdk/anthropic`) | Powers each agent's reasoning and decisions |
| **Agent Framework** | Vercel AI SDK tool-use with `streamText` | Each agent = a Claude tool-use loop |
| **Data Store** | SQLite via `better-sqlite3` | Lightweight, file-based, no server needed |
| **Frontend** | React + Tailwind CSS | Chat UI + dashboard |
| **Styling** | Tailwind CSS v4 | Utility-first, dark theme |

---

## Demo Flow (Hackathon Presentation)

1. **Boot the theater** — show the empty state
2. **Curator generates movies** — watch the catalog populate with creative AI-generated films
3. **Scheduler builds the week** — showtimes appear on the board
4. **Customers start arriving** — simulated customers browse and book
5. **Promoter reacts** — low fill rate triggers a flash sale, watch bookings spike
6. **Chaos event** — "Screen 2 projector is down!" — watch agents adapt
7. **Final dashboard** — revenue, fill rates, top movies, best promos

---

## Success Criteria

- [ ] Core 4 agents are functional and make autonomous decisions (Curator, Scheduler, Promoter, Manager)
- [ ] Agents communicate and react to each other's actions
- [ ] Full ticket-booking workflow works end-to-end
- [ ] Promotions actually affect simulated customer behavior
- [ ] Live dashboard shows the theater state updating in real-time
- [ ] At least one "chaos event" is handled gracefully
- [ ] The demo tells a compelling story in under 5 minutes

---

## Stretch Goals

- **Conversational booking** — customer agent has a natural language chat to book tickets (Podium-style messaging)
- **SMS notifications** — fake SMS flow for booking confirmations and promo alerts
- **Multi-day simulation** — watch the theater evolve over a simulated week
- **Competing theaters** — two AI theaters compete for the same customer pool
- **Voice agent** — phone-based booking experience

---

## File Structure (Planned)

```
team_23/
├── SPECIFICATION.md
├── README.md
├── requirements.txt
├── main.py                  # Entry point — boots the simulation
├── config.py                # Theater config (screens, tick speed, etc.)
├── theater_state.py         # Shared state dataclass
├── agents/
│   ├── __init__.py
│   ├── base_agent.py        # Base class for all agents
│   ├── curator.py           # Film Curator Agent
│   ├── scheduler.py         # Schedule Manager Agent
│   ├── promoter.py          # Promotions Agent
│   ├── customer.py          # Customer Simulator Agent
│   └── manager.py           # Theater Manager Agent
├── models/
│   ├── __init__.py
│   ├── movie.py             # Movie dataclass
│   ├── showtime.py          # Showtime dataclass
│   ├── booking.py           # Booking dataclass
│   ├── promotion.py         # Promotion dataclass
│   └── review.py            # Review dataclass
├── ui/
│   ├── __init__.py
│   └── dashboard.py         # Streamlit or Rich terminal dashboard
└── utils/
    ├── __init__.py
    └── logger.py            # Event logging
```
