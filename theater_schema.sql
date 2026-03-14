-- Theater rooms and scheduling schema for SQLite

-- Each physical theater room in the cinema
CREATE TABLE IF NOT EXISTS theaters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    seat_count INTEGER NOT NULL,
    screen_type TEXT NOT NULL DEFAULT 'Standard',  -- Standard, IMAX, Dolby, 3D
    is_active INTEGER NOT NULL DEFAULT 1            -- 1 = open, 0 = closed/maintenance
);

-- Showtime schedule: which movie plays in which theater and when
CREATE TABLE IF NOT EXISTS showtimes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    movie_id INTEGER NOT NULL,
    theater_id INTEGER NOT NULL,
    show_date DATE NOT NULL,
    start_time TEXT NOT NULL,          -- HH:MM format (24hr)
    end_time TEXT NOT NULL,            -- HH:MM format (24hr), auto-calculated from movie length + buffer
    ticket_price REAL NOT NULL DEFAULT 12.00,
    seats_available INTEGER NOT NULL,  -- starts equal to theater seat_count, decremented on booking
    status TEXT NOT NULL DEFAULT 'scheduled',  -- scheduled, selling, sold_out, cancelled, completed
    FOREIGN KEY (movie_id) REFERENCES movies(id),
    FOREIGN KEY (theater_id) REFERENCES theaters(id)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_showtimes_date ON showtimes(show_date);
CREATE INDEX IF NOT EXISTS idx_showtimes_movie ON showtimes(movie_id);
CREATE INDEX IF NOT EXISTS idx_showtimes_theater ON showtimes(theater_id);
CREATE INDEX IF NOT EXISTS idx_showtimes_status ON showtimes(status);
