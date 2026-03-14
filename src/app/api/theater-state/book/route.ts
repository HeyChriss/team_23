import { getDb } from "@/lib/db";
import { NextResponse } from "next/server";

/** POST /api/theater-state/book — Quick-add tickets to a showtime */
export async function POST(req: Request) {
  const { showtimeId, tickets = 5 } = await req.json();
  const db = getDb();

  const showtime = db
    .prepare("SELECT seats_available FROM showtimes WHERE id = ?")
    .get(showtimeId) as { seats_available: number } | undefined;

  if (!showtime) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const toBook = Math.min(tickets, showtime.seats_available);
  if (toBook <= 0) return NextResponse.json({ sold_out: true, seats_available: 0 });

  db.prepare(
    `UPDATE showtimes
     SET seats_available = seats_available - ?,
         status = CASE WHEN seats_available - ? <= 0 THEN 'sold_out' ELSE 'selling' END
     WHERE id = ?`
  ).run(toBook, toBook, showtimeId);

  const updated = db
    .prepare("SELECT seats_available FROM showtimes WHERE id = ?")
    .get(showtimeId) as { seats_available: number };

  return NextResponse.json({ booked: toBook, seats_available: updated.seats_available });
}
