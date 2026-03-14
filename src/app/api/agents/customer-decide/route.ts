import { generateText, tool, stepCountIs } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { NextResponse } from "next/server";

export const maxDuration = 60;

interface CustomerRow {
  id: number;
  name: string;
  customer_type: string;
  preferences: string;
  budget_preference: string;
  preferred_showtime: string;
  group_size_preference: number;
  notes: string;
}

/**
 * POST /api/agents/customer-decide
 *
 * Body: { customerId: number } — process a specific customer
 *   or  { count: number }      — process N random customers from the pool
 *
 * The customer sees current movies/showtimes/promos and decides to buy or leave.
 */
export async function POST(req: Request) {
  const body = await req.json();
  const db = getDb();

  // Get customers to process
  let customers: CustomerRow[];
  if (body.customerId) {
    const c = db.prepare(
      `SELECT c.* FROM customers c
       WHERE c.id = ? AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.customer_name = c.name)`
    ).get(body.customerId) as CustomerRow | undefined;
    customers = c ? [c] : [];
  } else {
    const count = body.count || 3;
    customers = db.prepare(
      `SELECT c.* FROM customers c
       WHERE NOT EXISTS (SELECT 1 FROM bookings b WHERE b.customer_name = c.name)
       ORDER BY RANDOM() LIMIT ?`
    ).all(count) as CustomerRow[];
  }

  if (customers.length === 0) {
    return NextResponse.json({ processed: 0, results: [], message: "No customers in pool" });
  }

  // Get current movies with showtimes
  const movies = db.prepare(
    `SELECT DISTINCT m.name, m.category, m.director,
            COUNT(s.id) AS showtime_count,
            MIN(s.ticket_price) AS min_price,
            MAX(s.seats_available) AS best_availability
     FROM movies m
     JOIN showtimes s ON m.id = s.movie_id
     WHERE m.is_active = 1 AND s.status IN ('scheduled', 'selling') AND s.seats_available > 0
     GROUP BY m.id
     ORDER BY showtime_count DESC
     LIMIT 15`
  ).all() as Record<string, unknown>[];

  // Get active promotions
  const promos = db.prepare(
    `SELECT p.name, p.description, p.discount_type, p.discount_value,
            p.applicable_category, pc.code
     FROM promotions p
     JOIN promo_codes pc ON p.id = pc.promotion_id
     WHERE p.is_active = 1 AND pc.is_active = 1 AND pc.times_used < pc.max_uses
     LIMIT 10`
  ).all() as Record<string, unknown>[];

  const movieList = movies.map((m) =>
    `${m.name} (${m.category}) — from $${(m.min_price as number).toFixed(2)}, ${m.best_availability} seats left`
  ).join("\n");

  const promoList = promos.length > 0
    ? promos.map((p) =>
        `${p.name}: ${p.description} (code: ${p.code}, ${p.discount_type === "percent" ? `${p.discount_value}% off` : `$${p.discount_value} off`}${p.applicable_category ? `, ${p.applicable_category} only` : ""})`
      ).join("\n")
    : "No active promotions right now.";

  // Process customers in parallel
  const results = await Promise.allSettled(
    customers.map(async (customer) => {
      const result = await generateText({
        model: anthropic("claude-haiku-4-5-20251001"),
        system: `You are simulating a customer deciding whether to buy movie tickets at StarLight Cinemas.

You ARE this customer:
- Name: ${customer.name}
- Preferences: ${customer.preferences}
- Budget: ${customer.budget_preference}
- Preferred showtime: ${customer.preferred_showtime}
- Group size: ${customer.group_size_preference}
- Type: ${customer.customer_type === "buyer" ? "Ready to buy — you came to the theater wanting to see a movie" : "Persuadable — you're browsing, need a good deal or perfect match to commit"}
- Notes: ${customer.notes}

Current movies playing:
${movieList}

Active promotions:
${promoList}

Based on your personality, preferences, and what's available, decide whether to buy tickets or leave.
- Buyers: ~70% chance you buy if something matches your preferences
- Persuadable: ~30% chance without a promo, ~60% with a matching promo
- If a promo matches your preferred genre AND you're budget-conscious, you're very likely to buy
- Call buyTickets if you decide to buy, or leaveTheater if you pass`,
        prompt: `Look at the movies and promotions. What do you want to do?`,
        tools: {
          buyTickets: tool({
            description: "Buy tickets for a movie",
            inputSchema: z.object({
              movieName: z.string().describe("The movie to watch"),
              numTickets: z.number().min(1).max(6).describe("Number of tickets"),
              promoCode: z.string().optional().describe("Promo code to use, if any"),
              reasoning: z.string().describe("Brief reason for choosing this movie"),
            }),
            execute: async ({ movieName, numTickets, promoCode, reasoning }) => {
              // Find a matching showtime
              const showtime = db.prepare(
                `SELECT s.id, s.ticket_price, s.seats_available, m.name AS movie_name,
                        t.name AS theater_name
                 FROM showtimes s
                 JOIN movies m ON s.movie_id = m.id
                 JOIN theaters t ON s.theater_id = t.id
                 WHERE LOWER(m.name) LIKE LOWER(?) AND s.status IN ('scheduled','selling')
                   AND s.seats_available >= ?
                 ORDER BY s.seats_available DESC LIMIT 1`
              ).get(`%${movieName}%`, numTickets) as Record<string, unknown> | undefined;

              if (!showtime) return { error: "No available showtime found for that movie." };

              let unitPrice = showtime.ticket_price as number;
              let discount = 0;
              let promoCodeId: number | null = null;

              // Apply promo if provided
              if (promoCode) {
                const pc = db.prepare(
                  `SELECT pc.id, p.discount_type, p.discount_value, p.max_discount
                   FROM promo_codes pc JOIN promotions p ON pc.promotion_id = p.id
                   WHERE UPPER(pc.code) = UPPER(?) AND pc.is_active = 1 AND p.is_active = 1
                     AND pc.times_used < pc.max_uses`
                ).get(promoCode) as Record<string, unknown> | undefined;

                if (pc) {
                  if (pc.discount_type === "percent") {
                    discount = ((pc.discount_value as number) / 100) * unitPrice * numTickets;
                  } else {
                    discount = (pc.discount_value as number) * numTickets;
                  }
                  if (pc.max_discount && discount > (pc.max_discount as number)) {
                    discount = pc.max_discount as number;
                  }
                  discount = Math.round(discount * 100) / 100;
                  promoCodeId = pc.id as number;
                  db.prepare("UPDATE promo_codes SET times_used = times_used + 1 WHERE id = ?").run(promoCodeId);
                }
              }

              const totalPrice = Math.max(0, Math.round((unitPrice * numTickets - discount) * 100) / 100);
              const confirmationCode = `SLC-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

              // Decrement seats
              db.prepare(
                "UPDATE showtimes SET seats_available = seats_available - ?, status = CASE WHEN seats_available - ? <= 0 THEN 'sold_out' ELSE 'selling' END WHERE id = ?"
              ).run(numTickets, numTickets, showtime.id);

              // Record booking
              db.prepare(
                `INSERT INTO bookings (showtime_id, customer_name, num_tickets, unit_price, discount_amount, total_price, promo_code_id, confirmation_code)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
              ).run(showtime.id, customer.name, numTickets, unitPrice, discount, totalPrice, promoCodeId, confirmationCode);

              return {
                success: true,
                confirmationCode,
                movie: showtime.movie_name,
                theater: showtime.theater_name,
                tickets: numTickets,
                totalPrice,
                discount,
                promoUsed: promoCode || null,
                reasoning,
              };
            },
          }),
          leaveTheater: tool({
            description: "Decide not to buy and leave the theater",
            inputSchema: z.object({
              reasoning: z.string().describe("Brief reason for leaving"),
            }),
            execute: async ({ reasoning }) => {
              return { left: true, reasoning };
            },
          }),
        },
        stopWhen: stepCountIs(2),
      });

      // Parse outcome from tool results
      const steps = result.steps || [];
      let outcome: "bought" | "left" = "left";
      let details: Record<string, unknown> = {};

      for (const step of steps) {
        for (let j = 0; j < (step.toolResults || []).length; j++) {
          const tr = step.toolResults[j] as unknown as { toolName: string; result: Record<string, unknown> };
          if (tr.toolName === "buyTickets" && tr.result?.success) {
            outcome = "bought";
            details = tr.result;
          } else if (tr.toolName === "leaveTheater") {
            outcome = "left";
            details = tr.result || {};
          }
        }
      }

      return {
        customerId: customer.id,
        customerName: customer.name,
        customerType: customer.customer_type,
        outcome,
        details,
      };
    })
  );

  const processed = results
    .filter((r) => r.status === "fulfilled")
    .map((r) => (r as PromiseFulfilledResult<Record<string, unknown>>).value);

  return NextResponse.json({
    processed: processed.length,
    results: processed,
  });
}
