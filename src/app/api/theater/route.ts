import { getDb } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET() {
  const db = getDb();

  const theaters = db
    .prepare(
      "SELECT id, name, seat_count, screen_type, is_active FROM theaters ORDER BY id"
    )
    .all();

  const movies = db
    .prepare(
      `SELECT DISTINCT m.id, m.name, m.category, m.length_minutes, m.language, m.director, m.actors
       FROM movies m
       INNER JOIN showtimes s ON m.id = s.movie_id
       ORDER BY m.name`
    )
    .all();

  const showtimes = db
    .prepare(
      `SELECT s.id, s.show_date, s.start_time, s.end_time,
              s.ticket_price, s.seats_available, s.status,
              m.id AS movie_id, m.name AS movie_name, m.category, m.length_minutes,
              t.id AS theater_id, t.name AS theater_name, t.seat_count, t.screen_type
       FROM showtimes s
       JOIN movies m ON s.movie_id = m.id
       JOIN theaters t ON s.theater_id = t.id
       ORDER BY s.show_date, s.start_time, t.name`
    )
    .all();

  const stats = {
    totalTheaters: theaters.length,
    totalSeats: (theaters as { seat_count: number }[]).reduce(
      (sum, t) => sum + t.seat_count,
      0
    ),
    totalMovies: movies.length,
    totalShowtimes: showtimes.length,
    screenTypes: db
      .prepare(
        "SELECT screen_type, COUNT(*) as count, SUM(seat_count) as total_seats FROM theaters GROUP BY screen_type ORDER BY screen_type"
      )
      .all(),
    showtimesByDate: db
      .prepare(
        "SELECT show_date, COUNT(*) as count FROM showtimes GROUP BY show_date ORDER BY show_date"
      )
      .all(),
  };

  return NextResponse.json({ theaters, movies, showtimes, stats });
}
