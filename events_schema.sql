-- Simulation Events — log of all agent actions during simulation
CREATE TABLE IF NOT EXISTS simulation_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sim_time TEXT NOT NULL,
    event_type TEXT NOT NULL,
    agent TEXT NOT NULL,
    summary TEXT NOT NULL,
    data TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sim_events_type ON simulation_events(event_type);
CREATE INDEX IF NOT EXISTS idx_sim_events_agent ON simulation_events(agent);
CREATE INDEX IF NOT EXISTS idx_sim_events_time ON simulation_events(sim_time);
