/**
 * Passive Customer Agent — customers who receive promotions and decide whether to act.
 * Simpler than active customers: they see a promotion and either book or ignore.
 */

import { getDb } from "@/lib/db";
import { withWriteLock } from "@/lib/write-queue";
import { insertEvent } from "@/lib/event-store";
import type { CustomerPersonality } from "./types";

interface PassiveCustomerResult {
  customerName: string;
  accepted: boolean;
  promoName?: string;
  bookingDetails?: Record<string, unknown>;
}

export async function runPassiveCustomer(
  customer: CustomerPersonality,
  simTime: string
): Promise<PassiveCustomerResult> {
  const db = getDb();
  const today = simTime.split("T")[0];

  // Find active promotions
  const promos = db
    .prepare(
      `SELECT p.id, p.name, p.description, p.discount_type, p.discount_value,
              p.applicable_showtime_id, p.applicable_category,
              pc.code, pc.id AS promo_code_id
       FROM promotions p
       JOIN promo_codes pc ON p.id = pc.promotion_id
       WHERE p.is_active = 1 AND pc.is_active = 1
         AND pc.times_used < pc.max_uses
         AND p.start_date <= ? AND p.end_date >= ?
       LIMIT 10`
    )
    .all(today, today) as Record<string, unknown>[];

  if (promos.length === 0) {
    return { customerName: customer.name, accepted: false };
  }

  // Pick a promo that matches their genre preferences
  let bestPromo = promos[0];
  for (const p of promos) {
    if (
      p.applicable_category &&
      customer.favoriteGenres
        .map((g) => g.toLowerCase())
        .includes((p.applicable_category as string).toLowerCase())
    ) {
      bestPromo = p;
      break;
    }
  }

  insertEvent({
    sim_time: simTime,
    event_type: "promotion_sent",
    agent: "promoter",
    summary: `Sent "${bestPromo.name}" to ${customer.name}`,
    data: { customer: customer.name, promo: bestPromo.name, code: bestPromo.code },
  });

  // Decide based on spontaneity and budget sensitivity
  const discountValue = bestPromo.discount_value as number;
  let acceptChance = customer.spontaneity * 0.5;
  if (customer.budgetSensitivity === "high" && discountValue >= 20) acceptChance += 0.3;
  else if (customer.budgetSensitivity === "medium" && discountValue >= 15) acceptChance += 0.2;
  else if (customer.budgetSensitivity === "low") acceptChance += 0.15;

  // Genre match bonus
  if (
    bestPromo.applicable_category &&
    customer.favoriteGenres
      .map((g) => g.toLowerCase())
      .includes((bestPromo.applicable_category as string).toLowerCase())
  ) {
    acceptChance += 0.25;
  }

  const accepts = Math.random() < Math.min(acceptChance, 0.85);

  if (!accepts) {
    insertEvent({
      sim_time: simTime,
      event_type: "promotion_rejected",
      agent: "customer",
      summary: `${customer.name} declined "${bestPromo.name}"`,
      data: { customer: customer.name, promo: bestPromo.name },
    });
    return { customerName: customer.name, accepted: false, promoName: bestPromo.name as string };
  }

  // Accept: find the promoted showtime and book
  let showtimeQuery = `
    SELECT s.id, s.ticket_price, s.seats_available, s.start_time,
           m.name AS movie_name, t.name AS theater_name
    FROM showtimes s
    JOIN movies m ON s.movie_id = m.id
    JOIN theaters t ON s.theater_id = t.id
    WHERE s.show_date = ? AND s.status IN ('scheduled', 'selling')
      AND s.seats_available >= ?
  `;
  const params: (string | number)[] = [today, customer.groupSize];

  if (bestPromo.applicable_showtime_id) {
    showtimeQuery += " AND s.id = ?";
    params.push(bestPromo.applicable_showtime_id as number);
  } else if (bestPromo.applicable_category) {
    showtimeQuery += " AND LOWER(m.category) = LOWER(?)";
    params.push(bestPromo.applicable_category as string);
  }

  showtimeQuery += " ORDER BY s.start_time LIMIT 1";

  const showtime = db.prepare(showtimeQuery).get(...params) as Record<string, unknown> | undefined;

  if (!showtime) {
    insertEvent({
      sim_time: simTime,
      event_type: "promotion_rejected",
      agent: "customer",
      summary: `${customer.name} wanted to use "${bestPromo.name}" but no suitable showtime found`,
      data: { customer: customer.name, promo: bestPromo.name },
    });
    return { customerName: customer.name, accepted: false, promoName: bestPromo.name as string };
  }

  // Book with promo
  const bookingResult = await withWriteLock(() => {
    // Re-check availability inside lock
    const fresh = db
      .prepare("SELECT seats_available FROM showtimes WHERE id = ?")
      .get(showtime.id as number) as { seats_available: number } | undefined;

    if (!fresh || fresh.seats_available < customer.groupSize) return null;

    const unitPrice = showtime.ticket_price as number;
    let discount = 0;
    if (bestPromo.discount_type === "percent") {
      discount = (discountValue / 100) * unitPrice * customer.groupSize;
    } else {
      discount = discountValue * customer.groupSize;
    }
    discount = Math.round(discount * 100) / 100;
    const totalPrice = Math.max(0, Math.round((unitPrice * customer.groupSize - discount) * 100) / 100);
    const confirmationCode = `SIM-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

    db.prepare(
      "UPDATE showtimes SET seats_available = seats_available - ?, status = CASE WHEN seats_available - ? <= 0 THEN 'sold_out' ELSE 'selling' END WHERE id = ?"
    ).run(customer.groupSize, customer.groupSize, showtime.id);

    db.prepare("UPDATE promo_codes SET times_used = times_used + 1 WHERE id = ?").run(
      bestPromo.promo_code_id
    );

    db.prepare(
      `INSERT INTO bookings (showtime_id, customer_name, num_tickets, unit_price, discount_amount, total_price, promo_code_id, confirmation_code)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      showtime.id, customer.name, customer.groupSize, unitPrice,
      discount, totalPrice, bestPromo.promo_code_id, confirmationCode
    );

    return { confirmationCode, totalPrice, discount };
  });

  if (!bookingResult) {
    insertEvent({
      sim_time: simTime,
      event_type: "promotion_rejected",
      agent: "customer",
      summary: `${customer.name} tried to use "${bestPromo.name}" but showtime was full`,
      data: { customer: customer.name, promo: bestPromo.name },
    });
    return { customerName: customer.name, accepted: false, promoName: bestPromo.name as string };
  }

  insertEvent({
    sim_time: simTime,
    event_type: "promotion_accepted",
    agent: "customer",
    summary: `${customer.name} used "${bestPromo.name}" — booked ${customer.groupSize} tickets for ${showtime.movie_name} ($${bookingResult.totalPrice})`,
    data: {
      customer: customer.name,
      promo: bestPromo.name,
      movie: showtime.movie_name,
      tickets: customer.groupSize,
      totalPrice: bookingResult.totalPrice,
      discount: bookingResult.discount,
    },
  });

  return {
    customerName: customer.name,
    accepted: true,
    promoName: bestPromo.name as string,
    bookingDetails: {
      movie: showtime.movie_name,
      theater: showtime.theater_name,
      tickets: customer.groupSize,
      totalPrice: bookingResult.totalPrice,
    },
  };
}

export async function runPassiveCustomerBatch(
  customers: CustomerPersonality[],
  simTime: string
): Promise<PassiveCustomerResult[]> {
  const results = await Promise.allSettled(
    customers.map((c) => runPassiveCustomer(c, simTime))
  );

  return results.map((r, i) => {
    if (r.status === "fulfilled") return r.value;
    return { customerName: customers[i].name, accepted: false };
  });
}
