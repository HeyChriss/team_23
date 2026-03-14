-- Bookings, Promotions, and Promo Codes (Dev 2)
-- Run: node scripts/run-migration.js 002_bookings_promotions

CREATE TABLE IF NOT EXISTS promotions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    discount_type TEXT NOT NULL,
    discount_value REAL NOT NULL,
    applicable_movie_id INTEGER,
    applicable_showtime_id INTEGER,
    applicable_category TEXT,
    min_tickets INTEGER NOT NULL DEFAULT 1,
    max_discount REAL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_by TEXT NOT NULL DEFAULT 'promoter',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (applicable_movie_id) REFERENCES movies(id),
    FOREIGN KEY (applicable_showtime_id) REFERENCES showtimes(id)
);

CREATE TABLE IF NOT EXISTS promo_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    promotion_id INTEGER NOT NULL,
    code TEXT NOT NULL UNIQUE,
    max_uses INTEGER NOT NULL DEFAULT 100,
    times_used INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (promotion_id) REFERENCES promotions(id)
);

CREATE TABLE IF NOT EXISTS bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    showtime_id INTEGER NOT NULL,
    customer_name TEXT NOT NULL,
    num_tickets INTEGER NOT NULL,
    unit_price REAL NOT NULL,
    discount_amount REAL NOT NULL DEFAULT 0,
    total_price REAL NOT NULL,
    promo_code_id INTEGER,
    confirmation_code TEXT NOT NULL UNIQUE,
    booked_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (showtime_id) REFERENCES showtimes(id),
    FOREIGN KEY (promo_code_id) REFERENCES promo_codes(id)
);

CREATE INDEX IF NOT EXISTS idx_promotions_active ON promotions(is_active, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_promotions_movie ON promotions(applicable_movie_id);
CREATE INDEX IF NOT EXISTS idx_promotions_category ON promotions(applicable_category);
CREATE INDEX IF NOT EXISTS idx_promo_codes_code ON promo_codes(code);
CREATE INDEX IF NOT EXISTS idx_promo_codes_promotion ON promo_codes(promotion_id);
CREATE INDEX IF NOT EXISTS idx_bookings_showtime ON bookings(showtime_id);
CREATE INDEX IF NOT EXISTS idx_bookings_promo ON bookings(promo_code_id);
CREATE INDEX IF NOT EXISTS idx_bookings_date ON bookings(booked_at);
