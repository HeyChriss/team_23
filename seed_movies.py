#!/usr/bin/env python3
"""Generate fake movie data for SQLite database."""

import sqlite3
import random
from datetime import datetime, timedelta

# Fake data pools
MOVIE_NAMES = [
    "The Crimson Shadow", "Midnight Echo", "Silver Horizon", "The Last Whisper",
    "Eternal Flame", "Dark Waters Rising", "Starlight Dreams", "The Forgotten Key",
    "Thunder Valley", "Silent Storm", "Golden Sands", "The Phantom Gate",
    "Crystal Dreams", "Winter's End", "The Broken Crown", "Rivers of Fire",
    "Shadow of Tomorrow", "The Lost Compass", "Diamond Heart", "Autumn's Promise",
    "The Iron Fortress", "Moonlit Path", "Storm Chaser", "The Hidden Blade",
    "Velvet Night", "Crimson Dawn", "The Seventh Seal", "Whisper in the Dark",
    "Ocean's Fury", "The Stone Guardian", "Northern Lights", "Desert Wind",
    "The Glass Tower", "Twilight's Edge", "Frozen Echo", "The Burning Bridge",
    "Starfall", "The Jade Dragon", "Midnight Sun", "Rivers of Gold",
    "The Obsidian Heart", "Summer Storm", "The Ivory Tower", "Ghost in the Machine",
    "Emerald City", "The Rusted Key", "Winter's Kiss", "The Copper Road",
    "Nightfall", "The Scarlet Letter", "Dust and Dreams", "The Bronze Serpent",
    "Sunset Boulevard", "The Pearl Diver", "Storm Warning", "The Silver Lining",
    "Rainfall", "The Golden Hour", "Frostbite", "The Iron Maiden",
    "Daybreak", "The Crystal Cave", "Windfall", "The Steel Resolve",
    "Cloudburst", "The Amber Road", "Snowdrift", "The Marble Hall",
    "Lightning Strike", "The Ruby Crown", "Hailstorm", "The Granite Wall",
    "Thunderclap", "The Sapphire Eye", "Blizzard", "The Onyx Throne",
    "Sunrise", "The Topaz Ring", "Mistral", "The Jade Palace",
    "Moonrise", "The Opal Dream", "Cyclone", "The Coral Reef",
    "Starlight", "The Quartz Heart", "Typhoon", "The Ivory Coast",
    "Dusk", "The Turquoise Sea", "Monsoon", "The Ebony Forest",
    "Dawn", "The Amethyst Cave", "Hurricane", "The Bronze Age",
    "Noon", "The Garnet Crown", "Tornado", "The Silver Age",
    "Midnight", "The Lapis Lazuli", "Earthquake", "The Golden Age",
]

ACTORS = [
    "Marcus Thornwood", "Elena Voss", "Derek Blackwood", "Sofia Chen",
    "James Holloway", "Nina Petrov", "Victor Cross", "Luna Martinez",
    "Alexander Kane", "Iris Watanabe", "Oscar Blake", "Maya Johnson",
    "Theodore Reed", "Zara Khan", "Nathan Frost", "Clara Dubois",
    "Felix Sterling", "Ruby Hayes", "Leo Morrison", "Violet Adams",
    "Maxwell Grant", "Ivy Chen", "Roman Pierce", "Jade Williams",
    "Sebastian Cole", "Amber Lee", "Damian Shaw", "Rose Thompson",
    "Vincent Holt", "Pearl Kim", "Lucas Webb", "Opal Davis",
    "Harrison Brooks", "Coral Evans", "Ethan Walsh", "Jasmine Foster",
    "Oliver Quinn", "Sienna Gray", "Julian Hart", "Willow Brooks",
    "Adrian Stone", "Hazel Moore", "Christian Bell", "Maple Taylor",
    "Dominic West", "Olive Clark", "Gabriel Fox", "Iris Young",
]

CATEGORIES = [
    "Action", "Drama", "Comedy", "Thriller", "Horror", "Sci-Fi",
    "Romance", "Adventure", "Mystery", "Fantasy", "Crime", "Animation",
    "Documentary", "Musical", "Western", "War", "Biography",
]

LANGUAGES = [
    "English", "Spanish", "French", "German", "Japanese", "Korean",
    "Italian", "Portuguese", "Mandarin", "Hindi", "Russian", "Arabic",
]

DIRECTORS = [
    "Vincent Moreau", "Helena Richter", "Marcus Chen", "Sofia Andersson",
    "James Nakamura", "Elena Kowalski", "David Petrov", "Anna Bergman",
    "Robert Kim", "Maria Santos", "William Zhang", "Claire Dubois",
    "Thomas Mueller", "Laura Fernandez", "Michael O'Brien", "Rachel Park",
    "Christopher Lee", "Sarah Johnson", "Daniel Schmidt", "Emma Williams",
    "Andrew Garcia", "Jennifer Brown", "Matthew Taylor", "Jessica Davis",
    "Joseph Martinez", "Amanda Wilson", "Kevin Anderson", "Nicole Thompson",
]


def random_date(start_year=1990, end_year=2024):
    """Generate a random date between start_year and end_year."""
    start = datetime(start_year, 1, 1)
    end = datetime(end_year, 12, 31)
    delta = end - start
    random_days = random.randint(0, delta.days)
    return (start + timedelta(days=random_days)).strftime("%Y-%m-%d")


def generate_movie():
    """Generate a single fake movie record."""
    num_actors = random.randint(2, 5)
    actors = ", ".join(random.sample(ACTORS, num_actors))
    return {
        "name": random.choice(MOVIE_NAMES),
        "actors": actors,
        "category": random.choice(CATEGORIES),
        "length_minutes": random.randint(75, 210),
        "language": random.choice(LANGUAGES),
        "director": random.choice(DIRECTORS),
        "release_date": random_date(),
    }


def main():
    conn = sqlite3.connect("movies.db")
    cursor = conn.cursor()

    # Create table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS movies (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            actors TEXT NOT NULL,
            category TEXT NOT NULL,
            length_minutes INTEGER NOT NULL,
            language TEXT NOT NULL,
            director TEXT NOT NULL,
            release_date DATE NOT NULL
        )
    """)

    # Generate 100 unique movies (ensure no exact duplicates)
    seen = set()
    movies = []
    while len(movies) < 100:
        m = generate_movie()
        key = (m["name"], m["director"], m["release_date"])
        if key not in seen:
            seen.add(key)
            movies.append(m)

    # Insert movies
    for m in movies:
        cursor.execute(
            """INSERT INTO movies (name, actors, category, length_minutes, language, director, release_date)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (m["name"], m["actors"], m["category"], m["length_minutes"], m["language"], m["director"], m["release_date"]),
        )

    conn.commit()
    print(f"Successfully inserted {len(movies)} movies into movies.db")
    conn.close()


if __name__ == "__main__":
    main()
