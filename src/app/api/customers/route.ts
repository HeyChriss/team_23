import { getDb } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET() {
  const db = getDb();
  const customers = db
    .prepare(
      `SELECT id, name, customer_type, age, preferences, loyalty_tier,
              visit_frequency, budget_preference, preferred_showtime,
              interested_in_concessions, group_size_preference, notes
       FROM customers
       ORDER BY customer_type, name`
    )
    .all();
  return NextResponse.json({ customers });
}
