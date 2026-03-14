-- Curator agent: add synopsis, poster_url, is_active to movies table
-- Run: sqlite3 movies.db < migrations/001_curator_movies.sql

ALTER TABLE movies ADD COLUMN synopsis TEXT;
ALTER TABLE movies ADD COLUMN poster_url TEXT;
ALTER TABLE movies ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1;
