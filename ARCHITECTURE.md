# CinemaAI Architecture

## System Overview

CinemaAI is a **multi-agent AI theater simulation** where autonomous AI agents run a cinema building. The system features accelerated day-by-day simulation, autonomous customer pools, and strategic agents that optimize, schedule, promote, and manage the theater — all visualized in a real-time dashboard.

## Architecture Diagram

```mermaid
graph TB
    subgraph Frontend["Frontend (React 19 + Next.js 16)"]
        Page["page.tsx<br/>Tab Switcher"]
        Dash["Dashboard"]
        CuratorTab["Curator Panel<br/>Add/retire movies"]
        CustomersTab["Customers Panel<br/>Bubble pool, live updates"]
        TimeTab["Time Control"]

        subgraph DashTabs["Dashboard Subtabs"]
            SimTab["Simulation<br/>Controls + TheaterGrid + KPIs"]
            ActTab["Activity Feed<br/>Agent Action Log"]
            ConvTab["Conversations<br/>Customer Dialogues"]
            AnalTab["Analytics<br/>Revenue, Genres, Daily"]
            SchedTab["Schedule<br/>Showtime Table"]
            AlertTab["Alerts"]
        end

        SimControls["SimulationControls"]
        KPIBar["KPIBar"]
        TheaterGrid["TheaterGrid<br/>15 Theater Cards"]
        ActivityFeed["ActivityFeed"]
        ConversationView["ConversationView"]
    end

    subgraph SSE["SSE Event Stream"]
        Stream["/api/simulation/stream"]
    end

    subgraph API["API Routes"]
        ClockAPI["/api/clock<br/>Clock Control"]
        StateAPI["/api/theater-state<br/>State Queries"]
        SimControl["/api/simulation/control<br/>Start/Stop/Reset"]
        CuratorAPI["/api/agents/curator<br/>Curator Agent"]
        CustomersAPI["/api/customers<br/>Customer Pool (excludes booked)"]
    end

    subgraph Engine["Simulation Engine"]
        SE["SimulationEngine<br/>Day-by-Day Loop"]

        subgraph DayPhases["Day Phases (Sequential)"]
            P1["Phase 1: Strategic Agents"]
            P2["Phase 2: Customer Waves"]
            P3["Phase 3: End of Day"]
        end
    end

    subgraph Agents["AI Agents"]
        Opt["Optimizer<br/>claude-sonnet-4-6<br/>Fill rates, rebalance"]
        Sched["Scheduler<br/>claude-sonnet-4-6<br/>Add/cancel showtimes"]
        Promo["Promoter<br/>claude-sonnet-4-6<br/>Flash sales, promos"]
        Curator["Curator<br/>claude-sonnet-4-6<br/>Add/retire movies, trends"]
        Mgr["Manager<br/>claude-haiku-4-5<br/>Help customers book"]
    end

    subgraph Customers["Customer Agents"]
        Spawner["Customer Spawner<br/>25 Personality Templates"]
        Active["Active Customers<br/>claude-haiku-4-5<br/>Browse + Book"]
        Passive["Passive Customers<br/>Deterministic<br/>Respond to Promos"]
    end

    subgraph Data["Data Layer"]
        DB[("SQLite<br/>movies.db")]
        Clock["SimulationClock<br/>Singleton"]
        TSC["TheaterStateController<br/>KPIs, Fill Rates"]
        EventStore["Event Store<br/>simulation_events"]
        WriteLock["Write Queue<br/>Async Mutex"]
    end

    %% Frontend connections
    Page --> Dash
    Page --> CuratorTab
    Page --> CustomersTab
    Page --> TimeTab
    CuratorTab -->|"POST"| CuratorAPI
    CustomersTab -->|"GET (poll 3s)"| CustomersAPI
    Dash --> DashTabs
    SimTab --> SimControls
    SimTab --> KPIBar
    SimTab --> TheaterGrid
    ActTab --> ActivityFeed
    ConvTab --> ConversationView

    %% SSE
    Dash -->|"EventSource"| Stream
    Stream -->|"day_start, wave_start,<br/>event, conversation,<br/>kpi, state, day_end"| Dash

    %% API
    SimControls -->|"POST"| SimControl
    Dash -->|"GET (poll)"| StateAPI

    %% Engine flow
    Stream -->|"starts"| SE
    SE --> P1
    P1 --> P2
    P2 --> P3

    %% Agent connections
    P1 --> Opt
    P1 --> Sched
    P1 --> Promo
    CuratorAPI --> Curator
    Curator --> DB
    P2 --> Spawner
    Spawner --> Active
    Spawner --> Passive
    Active -->|"talks to"| Mgr

    %% Data connections
    Opt --> TSC
    Sched --> DB
    Promo --> DB
    Mgr --> DB
    Active --> DB
    Passive --> DB
    StateAPI --> TSC
    TSC --> DB
    CustomersAPI --> DB
    SE --> EventStore
    Mgr --> WriteLock
    Sched --> WriteLock
    Promo --> WriteLock
    Passive --> WriteLock
    WriteLock --> DB
    SE --> Clock
```

## Day-Based Simulation Model

Each simulation "day" is a complete cycle that runs at the speed of the LLM API calls — no artificial timers.

```mermaid
sequenceDiagram
    participant E as Engine
    participant O as Optimizer
    participant S as Scheduler
    participant P as Promoter
    participant C as Customers
    participant DB as SQLite
    participant UI as Dashboard

    E->>UI: day_start (Day N)

    Note over E: Phase 1: Strategic Agents
    E->>O: Analyze state, optimize
    O->>DB: Read fill rates, flag promos
    O->>UI: optimizer_action events

    E->>S: Manage schedule
    S->>DB: Add/cancel showtimes
    S->>UI: showtime events

    E->>P: Create promotions
    P->>DB: Flash sales, promo codes
    P->>UI: promotion events

    Note over E: Phase 2: Customer Waves
    loop Morning → Afternoon → Evening
        E->>UI: wave_start
        E->>C: Spawn 3-7 active customers
        C->>DB: Browse movies, book tickets
        C->>UI: conversation + booking events
        E->>C: Spawn 1-3 passive customers
        C->>DB: Accept/reject promos
        E->>UI: wave_end + kpi update
    end

    Note over E: Phase 3: End of Day
    E->>DB: Final KPI snapshot
    E->>UI: state + day_end
    E->>E: Advance clock → Day N+1
```

## Customer Wave Structure

| Wave | Time | Active Customers | Passive Customers | Profile |
|------|------|-----------------|-------------------|---------|
| Morning | 10:00 | 3 | 1 | Matinee crowd, budget-conscious |
| Afternoon | 14:00 | 5 | 2 | Families, diverse |
| Evening | 18:00 | 7 | 3 | Peak hours, date nights |

## Database Schema

```mermaid
erDiagram
    movies ||--o{ showtimes : "has"
    theaters ||--o{ showtimes : "hosts"
    showtimes ||--o{ bookings : "generates"
    promotions ||--o{ promo_codes : "has"
    promo_codes ||--o{ bookings : "applied_to"
    simulation_events ||--|| simulation_events : "log"

    movies {
        int id PK
        text name
        text category
        text actors
        text director
        int length_minutes
        int is_active
    }

    theaters {
        int id PK
        text name
        int seat_count
        text screen_type
        int is_active
    }

    showtimes {
        int id PK
        int movie_id FK
        int theater_id FK
        date show_date
        text start_time
        text end_time
        real ticket_price
        int seats_available
        text status
    }

    bookings {
        int id PK
        int showtime_id FK
        text customer_name
        int num_tickets
        real total_price
        text confirmation_code
    }

    promotions {
        int id PK
        text name
        text discount_type
        real discount_value
        date start_date
        date end_date
        int is_active
    }

    promo_codes {
        int id PK
        int promotion_id FK
        text code
        int max_uses
        int times_used
    }

    simulation_events {
        int id PK
        text sim_time
        text event_type
        text agent
        text summary
        text data
    }

    customers {
        int id PK
        text name
        text customer_type
        int age
        text preferences
        text loyalty_tier
        text visit_frequency
        text budget_preference
        text preferred_showtime
        int interested_in_concessions
        int group_size_preference
        text notes
    }
```

## Agent Details

| Agent | Model | Frequency | Role | Tools |
|-------|-------|-----------|------|-------|
| **Optimizer** | Sonnet 4.6 | Every day | Analyze fill rates, flag low-fill for promos, request extra screenings | `getTheaterState`, `flagForPromotion`, `addExtraScreening`, `getGenreDistribution` |
| **Scheduler** | Sonnet 4.6 | Every day | Add/cancel showtimes based on demand | `getTheaterAvailability`, `getActiveMovies`, `addShowtime`, `cancelShowtime` |
| **Promoter** | Sonnet 4.6 | Every day | Create flash sales and promotions for struggling showtimes | `detectLowFillShowtimes`, `createFlashSale`, `createPromotion`, `getPromotionPerformance` |
| **Curator** | Sonnet 4.6 | On demand | Curate movie catalog — add new films, retire underperformers | `addMovie`, `retireMovie`, `getGenreDistribution`, `getMoviePerformance`, `trendAnalysis` |
| **Manager** | Haiku 4.5 | Per active customer | Help customers find movies and book tickets | `getNowShowing`, `getShowtimes`, `bookTickets` |
| **Active Customer** | Haiku 4.5 | 3-7 per wave | Browse movies, talk to Manager, decide to book or leave | Talks to Manager agent |
| **Passive Customer** | Deterministic | 1-3 per wave | Receive promotions, accept/reject based on preferences | No LLM — rule-based decision |

## Key Design Decisions

1. **Day-based simulation**: No artificial timers. Each day runs as fast as API calls complete.
2. **Sequential phases, concurrent customers**: Agents run sequentially to avoid SQLite contention. Customers within a wave run concurrently via `Promise.allSettled`.
3. **Write queue mutex**: All DB writes go through an async mutex to prevent SQLITE_BUSY errors.
4. **SSE streaming**: Events stream in real-time — individual conversation results emit as each completes (not batched). Step-by-step `conversation_update` events show tool-call progress live.
5. **Singleton patterns**: DB connection, simulation clock, and engine are all singletons for consistent state.
6. **Shared SQLite DB**: All agents read/write the same database — single source of truth.
7. **DB-driven customer pool**: Customer spawner reads from the `customers` table (buyer → active, persuadable → passive). LLM-powered spawner API can generate new customers on demand.
8. **Passive customers are deterministic**: No LLM call — just probability-based acceptance of promos.
9. **Persistent tabs**: All tabs stay mounted (CSS display toggle) so SSE connections survive tab switches. Cross-component communication uses `window` custom events.
10. **Real-time agent visualization**: Manager/Promoter agent nodes with SVG connection lines to active customers. Live conversation feed shows step-by-step progress.

## Customer Pool & Agent Visualization

The **Customers** tab is a two-panel "Agent Theater" view:

### Left Panel — Physics Bubble Pool
- **Physics engine**: Velocity, gravity, repulsion between bubbles (requestAnimationFrame loop)
- **Bubble colors**: Green = buyer, amber = persuadable, gold glow = talking to Manager, gold border = talking to Promoter
- **Agent nodes**: Individual Manager (top-left) and Promoter (top-right) icons appear during active conversations
- **SVG connection lines**: Animated dashed lines from active customers to their agent
- **Active badges**: "Chatting" / "Promo" labels on customers in conversation
- **Spawn zone** (top): New customers drop in with physics
- **Exit zones** (bottom): Booked → bottom-left, Left → bottom-right
- **Auto-spawn**: Pool auto-refills via LLM spawner when below threshold

### Right Panel — Live Conversation Feed
- **Real-time step-by-step**: Each conversation card shows progress as it happens:
  - 🗣️ Greeting → 🔍 Browsing → 📋 Checking showtimes → 🎫 Booking → ✅ Booked / 🚶 Left
- **LIVE badge**: Pulses while agent is processing, with "thinking..." indicator
- **BOOKED/LEFT badges**: Final outcome on completed conversations
- **Timeline UI**: Left border connects all steps in a conversation
- **Auto-scroll**: Feed scrolls to latest conversation

### Cross-Tab Integration
- Simulation SSE events broadcast via `window` custom events
- Bubble pool reacts to simulation events even when Simulation tab is active
- All tabs stay mounted — no state loss on tab switch

## File Structure

```
src/
├── app/
│   ├── page.tsx                          # Dashboard + Simulation + Customers tabs (all mounted)
│   └── api/
│       ├── clock/route.ts                # Clock control
│       ├── theater-state/route.ts        # State queries
│       ├── customers/route.ts            # Customer pool (excludes booked)
│       ├── agents/
│       │   ├── curator/route.ts          # Curator agent
│       │   ├── customer-spawner/route.ts # LLM customer generator
│       │   └── customer-decide/route.ts  # LLM buying decisions
│       └── simulation/
│           ├── stream/route.ts           # SSE event stream
│           └── control/route.ts          # Start/stop/reset
├── lib/
│   ├── db.ts                             # SQLite singleton
│   ├── simulation-clock.ts               # Time control
│   ├── simulation-engine.ts              # Day-by-day orchestrator
│   ├── theater-state.ts                  # KPI/state controller
│   ├── event-store.ts                    # Event persistence
│   ├── write-queue.ts                    # Async mutex
│   ├── promoter-tools.ts                 # Shared promo functions
│   └── agents/
│       ├── types.ts                      # Shared types
│       ├── customer-spawner.ts           # DB-integrated spawner (fallback: 25 hard-coded)
│       ├── customer-active.ts            # Active customer runner
│       ├── customer-passive.ts           # Passive customer (deterministic)
│       ├── manager-agent.ts              # Manager (helps customers book)
│       ├── optimizer.ts                  # Optimizer (fill rate strategy)
│       ├── scheduler.ts                  # Scheduler (showtime management)
│       └── promoter-agent.ts             # Promoter (autonomous promos)
└── components/
    ├── Dashboard.tsx                     # Main dashboard with SSE + subtabs
    ├── SimulationControls.tsx            # Play/stop/reset + day/wave display
    ├── KPIBar.tsx                        # Live metric counters
    ├── TheaterGrid.tsx                   # 15 theater cards grid
    ├── TheaterCard.tsx                   # Individual theater visualization
    ├── ActivityFeed.tsx                  # Agent action log
    ├── ConversationView.tsx             # Customer dialogue viewer
    ├── CuratorPanel.tsx                  # Curator agent chat UI
    ├── CustomersPanel.tsx                # Physics bubble pool + live conversation feed
    ├── CustomerPoolLive.tsx              # Compact pool for SimulationPanel embed
    └── TimeControl.tsx                  # Time/simulation clock

scripts/
├── run-migration.js                     # Run migrations (npm run migrate)
├── seed-customers.js                    # Seed 20 customers (npm run seed:customers)
├── add-customer.js                      # Add single customer
└── show-schema.js                       # Print DB schema (npm run db:schema)

migrations/
├── 001_curator_movies.sql               # synopsis, poster_url, is_active on movies
├── 002_bookings_promotions.sql          # promotions, promo_codes, bookings
└── 003_customers.sql                    # customers table
```
