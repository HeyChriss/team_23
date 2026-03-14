-- Movies database schema for SQLite
CREATE TABLE IF NOT EXISTS movies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    actors TEXT NOT NULL,
    category TEXT NOT NULL,
    length_minutes INTEGER NOT NULL,
    language TEXT NOT NULL,
    director TEXT NOT NULL,
    release_date DATE NOT NULL,
    synopsis TEXT,
    poster_url TEXT,
    is_active INTEGER NOT NULL DEFAULT 1
);
