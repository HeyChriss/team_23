-- Bookings, Promotions, and Promo Codes schema for SQLite

-- ── Promotions ───────────────────────────────────────────────────────────────
-- A promotion is a discount rule. It can target all showtimes, a specific
-- movie, a specific showtime, or an entire category.
CREATE TABLE IF NOT EXISTS promotions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,                        -- "Matinee Monday", "Flash Sale: Theater 5"
    description TEXT NOT NULL,                 -- human-readable description
    discount_type TEXT NOT NULL,               -- 'percent' or 'fixed'
    discount_value REAL NOT NULL,              -- 30 = 30% off (percent) or $5 off (fixed)
    applicable_movie_id INTEGER,               -- NULL = applies to all movies
    applicable_showtime_id INTEGER,            -- NULL = applies to all showtimes
    applicable_category TEXT,                  -- NULL = applies to all categories
    min_tickets INTEGER NOT NULL DEFAULT 1,    -- minimum tickets to qualify (e.g., 4 for "Family 4-Pack")
    max_discount REAL,                         -- cap on discount amount (NULL = no cap)
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_by TEXT NOT NULL DEFAULT 'promoter', -- which agent created it
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (applicable_movie_id) REFERENCES movies(id),
    FOREIGN KEY (applicable_showtime_id) REFERENCES showtimes(id)
);

-- ── Promo Codes ──────────────────────────────────────────────────────────────
-- Individual codes customers enter at booking. Tied to a promotion.
CREATE TABLE IF NOT EXISTS promo_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    promotion_id INTEGER NOT NULL,
    code TEXT NOT NULL UNIQUE,                 -- "FLASH50", "MATINEE30", "HORROR2026"
    max_uses INTEGER NOT NULL DEFAULT 100,     -- how many times this code can be used
    times_used INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (promotion_id) REFERENCES promotions(id)
);

-- ── Bookings ─────────────────────────────────────────────────────────────────
-- Every ticket purchase. Source of truth for revenue.
CREATE TABLE IF NOT EXISTS bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    showtime_id INTEGER NOT NULL,
    customer_name TEXT NOT NULL,
    num_tickets INTEGER NOT NULL,
    unit_price REAL NOT NULL,                  -- price per ticket before discount
    discount_amount REAL NOT NULL DEFAULT 0,   -- total discount applied
    total_price REAL NOT NULL,                 -- final price paid
    promo_code_id INTEGER,                     -- NULL if no promo used
    confirmation_code TEXT NOT NULL UNIQUE,
    booked_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (showtime_id) REFERENCES showtimes(id),
    FOREIGN KEY (promo_code_id) REFERENCES promo_codes(id)
);

-- ── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_promotions_active ON promotions(is_active, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_promotions_movie ON promotions(applicable_movie_id);
CREATE INDEX IF NOT EXISTS idx_promotions_category ON promotions(applicable_category);
CREATE INDEX IF NOT EXISTS idx_promo_codes_code ON promo_codes(code);
CREATE INDEX IF NOT EXISTS idx_promo_codes_promotion ON promo_codes(promotion_id);
CREATE INDEX IF NOT EXISTS idx_bookings_showtime ON bookings(showtime_id);
CREATE INDEX IF NOT EXISTS idx_bookings_promo ON bookings(promo_code_id);
CREATE INDEX IF NOT EXISTS idx_bookings_date ON bookings(booked_at);
