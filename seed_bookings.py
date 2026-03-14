#!/usr/bin/env python3
"""Seed promotions, promo codes, and sample bookings to populate the system."""

import sqlite3
import random
import string
from datetime import datetime, timedelta

# ── Sample Promotions ─────────────────────────────────────────────────────────
PROMOTIONS = [
    {
        "name": "Matinee Monday",
        "description": "30% off all showings before noon on Mondays",
        "discount_type": "percent",
        "discount_value": 30,
        "applicable_category": None,
        "min_tickets": 1,
        "max_discount": 10.00,
    },
    {
        "name": "Family 4-Pack",
        "description": "Buy 4+ tickets and get 25% off the total",
        "discount_type": "percent",
        "discount_value": 25,
        "applicable_category": None,
        "min_tickets": 4,
        "max_discount": 30.00,
    },
    {
        "name": "Student Night",
        "description": "$5 off any evening showing with a valid student ID",
        "discount_type": "fixed",
        "discount_value": 5,
        "applicable_category": None,
        "min_tickets": 1,
        "max_discount": None,
    },
    {
        "name": "Horror Weekend",
        "description": "20% off all Horror movies this weekend",
        "discount_type": "percent",
        "discount_value": 20,
        "applicable_category": "Horror",
        "min_tickets": 1,
        "max_discount": 8.00,
    },
    {
        "name": "IMAX Experience Deal",
        "description": "$3 off any IMAX screening",
        "discount_type": "fixed",
        "discount_value": 3,
        "applicable_category": None,
        "min_tickets": 1,
        "max_discount": None,
    },
    {
        "name": "Date Night Combo",
        "description": "Buy 2 tickets and get 15% off — perfect for date night",
        "discount_type": "percent",
        "discount_value": 15,
        "applicable_category": "Romance",
        "min_tickets": 2,
        "max_discount": 10.00,
    },
    {
        "name": "Early Bird Special",
        "description": "$4 off any showing before 10 AM",
        "discount_type": "fixed",
        "discount_value": 4,
        "applicable_category": None,
        "min_tickets": 1,
        "max_discount": None,
    },
    {
        "name": "Action Packed Weekend",
        "description": "15% off all Action movies Friday through Sunday",
        "discount_type": "percent",
        "discount_value": 15,
        "applicable_category": "Action",
        "min_tickets": 1,
        "max_discount": 6.00,
    },
]

CUSTOMER_NAMES = [
    "Alice Johnson", "Bob Smith", "Charlie Davis", "Diana Chen", "Eric Williams",
    "Fiona Brown", "George Martinez", "Hannah Lee", "Ian Thompson", "Julia Garcia",
    "Kevin Anderson", "Laura Petrov", "Mike Robinson", "Nancy Kim", "Oscar Hernandez",
    "Patricia Moore", "Quinn Taylor", "Rachel Clark", "Sam Wilson", "Tina Nguyen",
    "Uma Patel", "Victor Lopez", "Wendy Scott", "Xavier Adams", "Yara Hassan",
    "Zach Turner", "Amy Rivera", "Brian Foster", "Cora Mitchell", "Derek Chang",
]


def generate_promo_code(prefix: str, length: int = 6) -> str:
    """Generate a unique promo code like MATINEE-A3X9K2."""
    suffix = "".join(random.choices(string.ascii_uppercase + string.digits, k=length))
    return f"{prefix}-{suffix}"


def main():
    conn = sqlite3.connect("movies.db")
    cursor = conn.cursor()

    # ── Create tables ─────────────────────────────────────────────────────
    with open("bookings_schema.sql", "r") as f:
        cursor.executescript(f.read())

    # ── Clear existing data for re-runnability ────────────────────────────
    cursor.execute("DELETE FROM bookings")
    cursor.execute("DELETE FROM promo_codes")
    cursor.execute("DELETE FROM promotions")

    # ── Seed promotions ───────────────────────────────────────────────────
    start_date = "2026-03-14"
    end_date = "2026-03-20"

    promo_ids = {}
    for p in PROMOTIONS:
        cursor.execute(
            """INSERT INTO promotions
               (name, description, discount_type, discount_value,
                applicable_category, min_tickets, max_discount,
                start_date, end_date, created_by)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'system')""",
            (p["name"], p["description"], p["discount_type"], p["discount_value"],
             p["applicable_category"], p["min_tickets"], p["max_discount"],
             start_date, end_date),
        )
        promo_ids[p["name"]] = cursor.lastrowid

    print(f"  Created {len(PROMOTIONS)} promotions")

    # ── Seed promo codes ──────────────────────────────────────────────────
    code_prefixes = {
        "Matinee Monday": "MATINEE",
        "Family 4-Pack": "FAMILY",
        "Student Night": "STUDENT",
        "Horror Weekend": "HORROR",
        "IMAX Experience Deal": "IMAX",
        "Date Night Combo": "DATE",
        "Early Bird Special": "EARLYBIRD",
        "Action Packed Weekend": "ACTION",
    }

    promo_code_map = {}  # code -> (promo_code_id, promotion)
    total_codes = 0
    for promo_name, promo_id in promo_ids.items():
        prefix = code_prefixes.get(promo_name, "PROMO")
        num_codes = random.randint(2, 4)
        for _ in range(num_codes):
            code = generate_promo_code(prefix)
            max_uses = random.choice([50, 100, 200])
            cursor.execute(
                """INSERT INTO promo_codes (promotion_id, code, max_uses)
                   VALUES (?, ?, ?)""",
                (promo_id, code, max_uses),
            )
            promo_code_map[code] = (cursor.lastrowid, promo_name)
            total_codes += 1

    print(f"  Created {total_codes} promo codes")

    # ── Seed sample bookings ──────────────────────────────────────────────
    # Get all showtimes
    cursor.execute(
        """SELECT s.id, s.ticket_price, s.seats_available, t.seat_count,
                  m.category, t.screen_type
           FROM showtimes s
           JOIN movies m ON s.movie_id = m.id
           JOIN theaters t ON s.theater_id = t.id
           WHERE s.seats_available > 0"""
    )
    showtimes = cursor.fetchall()

    if not showtimes:
        print("  No showtimes found! Run seed_theaters.py first.")
        conn.close()
        return

    total_bookings = 0
    total_revenue = 0.0
    codes_list = list(promo_code_map.keys())

    # Generate 150-250 bookings spread across showtimes
    num_bookings = random.randint(150, 250)
    for _ in range(num_bookings):
        st = random.choice(showtimes)
        st_id, ticket_price, seats_avail, seat_count, category, screen_type = st

        if seats_avail <= 0:
            continue

        num_tickets = random.randint(1, min(6, seats_avail))
        customer = random.choice(CUSTOMER_NAMES)
        unit_price = ticket_price

        # 30% chance of using a promo code
        promo_code_id = None
        discount_amount = 0.0

        if random.random() < 0.3 and codes_list:
            code = random.choice(codes_list)
            pc_id, promo_name = promo_code_map[code]
            promo = next((p for p in PROMOTIONS if p["name"] == promo_name), None)

            if promo and num_tickets >= promo["min_tickets"]:
                if promo["discount_type"] == "percent":
                    raw_discount = (promo["discount_value"] / 100) * unit_price * num_tickets
                    if promo["max_discount"]:
                        raw_discount = min(raw_discount, promo["max_discount"])
                    discount_amount = round(raw_discount, 2)
                else:
                    discount_amount = round(promo["discount_value"] * num_tickets, 2)

                promo_code_id = pc_id
                # Increment usage
                cursor.execute(
                    "UPDATE promo_codes SET times_used = times_used + 1 WHERE id = ?",
                    (pc_id,),
                )

        total_price = round(unit_price * num_tickets - discount_amount, 2)
        total_price = max(total_price, 0)  # never negative

        conf_code = f"SLC-{random.randint(100000, 999999)}"

        # Random booking time within the week
        booked_at = datetime(2026, 3, 14) + timedelta(
            hours=random.randint(0, 167),
            minutes=random.randint(0, 59),
        )

        cursor.execute(
            """INSERT INTO bookings
               (showtime_id, customer_name, num_tickets, unit_price,
                discount_amount, total_price, promo_code_id, confirmation_code, booked_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (st_id, customer, num_tickets, unit_price, discount_amount,
             total_price, promo_code_id, conf_code, booked_at.strftime("%Y-%m-%d %H:%M:%S")),
        )

        # Decrement seats
        cursor.execute(
            "UPDATE showtimes SET seats_available = seats_available - ? WHERE id = ?",
            (num_tickets, st_id),
        )

        total_bookings += 1
        total_revenue += total_price

    conn.commit()

    # ── Summary ───────────────────────────────────────────────────────────
    print(f"  Created {total_bookings} bookings")
    print(f"\nDone! Revenue summary:")
    print(f"  Total bookings: {total_bookings}")
    print(f"  Total revenue: ${total_revenue:,.2f}")

    cursor.execute("SELECT COUNT(*), SUM(discount_amount) FROM bookings WHERE promo_code_id IS NOT NULL")
    promo_row = cursor.fetchone()
    print(f"  Promo bookings: {promo_row[0]} (${promo_row[1]:,.2f} in discounts)")

    cursor.execute("""
        SELECT p.name, COUNT(b.id) as uses, SUM(b.discount_amount) as total_discount
        FROM promotions p
        JOIN promo_codes pc ON p.id = pc.promotion_id
        JOIN bookings b ON pc.id = b.promo_code_id
        GROUP BY p.id
        ORDER BY uses DESC
    """)
    print("\nPromo performance:")
    for row in cursor.fetchall():
        print(f"  {row[0]}: {row[1]} uses, ${row[2]:,.2f} discounted")

    conn.close()


if __name__ == "__main__":
    main()
