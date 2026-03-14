-- Customer pool for theater simulation (stub data, agent will manage later)
-- customer_type: 'buyer' = wants to buy, 'persuadable' = needs promoter to convince

CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    customer_type TEXT NOT NULL CHECK (customer_type IN ('buyer', 'persuadable')),
    age INTEGER NOT NULL,
    preferences TEXT NOT NULL,              -- genre preferences, e.g. "Action, Sci-Fi"
    loyalty_tier TEXT DEFAULT 'None',      -- None, Silver, Gold, Platinum
    visit_frequency TEXT DEFAULT 'occasional',  -- rare, occasional, regular, frequent
    budget_preference TEXT DEFAULT 'standard',  -- budget, standard, premium
    preferred_showtime TEXT DEFAULT 'evening',  -- matinee, evening, late_night
    interested_in_concessions INTEGER DEFAULT 1,
    group_size_preference INTEGER DEFAULT 1,   -- 1=solo, 2=date, 3+=group
    notes TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_customers_type ON customers(customer_type);
CREATE INDEX IF NOT EXISTS idx_customers_preferences ON customers(preferences);
