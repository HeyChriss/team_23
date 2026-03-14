import { getDb } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET() {
  const db = getDb();
  // Only show customers who haven't booked yet (still in the pool)
  const customers = db
    .prepare(
      `SELECT c.id, c.name, c.customer_type, c.age, c.preferences, c.loyalty_tier,
              c.visit_frequency, c.budget_preference, c.preferred_showtime,
              c.interested_in_concessions, c.group_size_preference, c.notes
       FROM customers c
       WHERE NOT EXISTS (
         SELECT 1 FROM bookings b WHERE b.customer_name = c.name
       )
       ORDER BY c.customer_type, c.name`
    )
    .all();
  return NextResponse.json({ customers });
}
