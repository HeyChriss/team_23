#!/usr/bin/env python3
"""Seed theater rooms and generate a full week of showtimes."""

import sqlite3
import random
from datetime import datetime, timedelta

# ── 15 Theater Rooms ──────────────────────────────────────────────────────────
# Mix of sizes and screen types like a real multiplex
THEATERS = [
    {"name": "Theater 1",  "seat_count": 300},
    {"name": "Theater 2",  "seat_count": 250},
    {"name": "Theater 3",  "seat_count": 200},
    {"name": "Theater 4",  "seat_count": 200},
    {"name": "Theater 5",  "seat_count": 180},
    {"name": "Theater 6",  "seat_count": 180},
    {"name": "Theater 7",  "seat_count": 150},
    {"name": "Theater 8",  "seat_count": 150},
    {"name": "Theater 9",  "seat_count": 120},
    {"name": "Theater 10", "seat_count": 120},
    {"name": "Theater 11", "seat_count": 100},
    {"name": "Theater 12", "seat_count": 100},
    {"name": "Theater 13", "seat_count": 80},
    {"name": "Theater 14", "seat_count": 80},
    {"name": "Theater 15", "seat_count": 60},
]

BASE_TICKET_PRICE = 12.00

# Time-of-day pricing multipliers
TIME_MULTIPLIER = {
    "morning": 0.75,   # matinee discount
    "afternoon": 1.0,
    "evening": 1.25,   # prime time premium
    "late": 1.0,
}

# Showtime start windows (24hr format)
TIME_SLOTS = {
    "morning": ["09:00", "09:30", "10:00", "10:30", "11:00", "11:30"],
    "afternoon": ["12:00", "12:30", "13:00", "13:30", "14:00", "14:30", "15:00", "15:30"],
    "evening": ["16:00", "16:30", "17:00", "17:30", "18:00", "18:30", "19:00", "19:30", "20:00"],
    "late": ["20:30", "21:00", "21:30", "22:00", "22:30"],
}

CLEANUP_BUFFER_MINUTES = 20  # time between showings for cleanup


def get_time_period(start_time: str) -> str:
    """Determine time period from a start time string."""
    hour = int(start_time.split(":")[0])
    if hour < 12:
        return "morning"
    elif hour < 16:
        return "afternoon"
    elif hour < 20:
        return "evening"
    else:
        return "late"


def add_minutes(time_str: str, minutes: int) -> str:
    """Add minutes to a HH:MM time string."""
    h, m = map(int, time_str.split(":"))
    total = h * 60 + m + minutes
    return f"{(total // 60) % 24:02d}:{total % 60:02d}"


def times_overlap(start1: str, end1: str, start2: str, end2: str) -> bool:
    """Check if two time ranges overlap."""
    s1 = int(start1.replace(":", ""))
    e1 = int(end1.replace(":", ""))
    s2 = int(start2.replace(":", ""))
    e2 = int(end2.replace(":", ""))
    return s1 < e2 and s2 < e1


def schedule_day(movies: list, theaters: list, date_str: str) -> list:
    """Generate a full day of non-overlapping showtimes for all theaters."""
    showtimes = []

    for theater in theaters:
        # Each theater gets 3-5 showings per day depending on size
        num_showings = random.randint(3, 5)
        theater_schedule = []  # track (start, end) to prevent overlaps

        # Gather all possible time slots and shuffle
        all_slots = []
        for period, times in TIME_SLOTS.items():
            for t in times:
                all_slots.append(t)
        random.shuffle(all_slots)

        showings_placed = 0
        for start_time in sorted(all_slots):
            if showings_placed >= num_showings:
                break

            movie = random.choice(movies)
            movie_id, length = movie[0], movie[4]  # id and length_minutes

            end_time = add_minutes(start_time, length + CLEANUP_BUFFER_MINUTES)

            # Skip if it runs past 1am
            if int(end_time.replace(":", "")) > 100 and int(end_time.replace(":", "")) < int(start_time.replace(":", "")):
                continue

            # Check for overlap with existing showings in this theater
            has_conflict = False
            for existing_start, existing_end in theater_schedule:
                if times_overlap(start_time, end_time, existing_start, existing_end):
                    has_conflict = True
                    break

            if has_conflict:
                continue

            # Calculate price
            period = get_time_period(start_time)
            price = round(BASE_TICKET_PRICE * TIME_MULTIPLIER[period], 2)

            theater_schedule.append((start_time, end_time))
            showtimes.append({
                "movie_id": movie_id,
                "theater_id": theater["db_id"],
                "show_date": date_str,
                "start_time": start_time,
                "end_time": end_time,
                "ticket_price": price,
                "seats_available": theater["seat_count"],
                "status": "scheduled",
            })
            showings_placed += 1

    return showtimes


def main():
    conn = sqlite3.connect("movies.db")
    cursor = conn.cursor()

    # ── Create tables ─────────────────────────────────────────────────────
    with open("theater_schema.sql", "r") as f:
        cursor.executescript(f.read())

    # ── Seed theaters ─────────────────────────────────────────────────────
    # Clear existing data for re-runnability
    cursor.execute("DELETE FROM showtimes")
    cursor.execute("DELETE FROM theaters")

    for t in THEATERS:
        cursor.execute(
            "INSERT INTO theaters (name, seat_count) VALUES (?, ?)",
            (t["name"], t["seat_count"]),
        )
        t["db_id"] = cursor.lastrowid

    # ── Fetch all movies ──────────────────────────────────────────────────
    cursor.execute("SELECT id, name, actors, category, length_minutes FROM movies")
    movies = cursor.fetchall()

    if not movies:
        print("No movies found! Run seed_movies.py first.")
        conn.close()
        return

    # ── Generate 7 days of showtimes ──────────────────────────────────────
    start_date = datetime(2026, 3, 14)  # today
    total_showtimes = 0

    for day_offset in range(7):
        date = start_date + timedelta(days=day_offset)
        date_str = date.strftime("%Y-%m-%d")
        day_showtimes = schedule_day(movies, THEATERS, date_str)

        for st in day_showtimes:
            cursor.execute(
                """INSERT INTO showtimes
                   (movie_id, theater_id, show_date, start_time, end_time,
                    ticket_price, seats_available, status)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (st["movie_id"], st["theater_id"], st["show_date"],
                 st["start_time"], st["end_time"], st["ticket_price"],
                 st["seats_available"], st["status"]),
            )

        total_showtimes += len(day_showtimes)
        print(f"  {date_str}: {len(day_showtimes)} showtimes across 15 theaters")

    conn.commit()

    # ── Summary ───────────────────────────────────────────────────────────
    print(f"\nDone! Seeded:")
    print(f"  {len(THEATERS)} theater rooms")
    print(f"  {total_showtimes} showtimes over 7 days")

    cursor.execute("""
        SELECT t.name, COUNT(s.id), t.seat_count
        FROM theaters t
        LEFT JOIN showtimes s ON t.id = s.theater_id
        GROUP BY t.id
        ORDER BY t.id
    """)
    print("\nShowtimes per theater:")
    for row in cursor.fetchall():
        print(f"  {row[0]} ({row[2]} seats): {row[1]} showings this week")

    conn.close()


if __name__ == "__main__":
    main()
