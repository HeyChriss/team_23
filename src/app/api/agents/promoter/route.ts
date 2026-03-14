import {
  type UIMessage,
  convertToModelMessages,
  streamText,
  tool,
  stepCountIs,
} from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { getDb } from "@/lib/db";

export const maxDuration = 60;

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();
  const db = getDb();

  const result = streamText({
    model: anthropic("claude-sonnet-4-6"),
    system: `You are the Promotions Agent for StarLight Cinemas. Your job is to maximize ticket sales and revenue through strategic discounts, promo codes, and flash sales.

You have access to real booking data, showtime fill rates, and promotion performance metrics.

Your responsibilities:
- Analyze showtime fill rates to identify struggling screenings
- Create targeted promotions (percent or fixed discounts)
- Generate promo codes for promotions
- Launch flash sales for low-fill showtimes
- Deactivate underperforming or expired promotions
- Report on promotion effectiveness

Strategy guidelines:
- Flash sales: If a showtime has < 30% fill rate, consider a flash sale
- Don't over-discount: Keep discounts between 10-40% for percent-based, $2-$8 for fixed
- Target underperformers: Focus promos on movies/showtimes that need a boost
- Category promos work well for themed events (Horror weekend, Romance Valentine's, etc.)
- Always set reasonable end dates — don't let promos run forever
- Track ROI: A promo is only good if it drives incremental revenue

When asked to analyze or act, use your tools to gather real data first, then make data-driven decisions.`,
    messages: await convertToModelMessages(messages),
    tools: {
      getPromotionPerformance: tool({
        description:
          "Get performance metrics for all promotions — usage count, total discounts given, and revenue impact",
        inputSchema: z.object({}),
        execute: async () => {
          const promos = db
            .prepare(
              `SELECT p.id, p.name, p.description, p.discount_type, p.discount_value,
                      p.applicable_category, p.start_date, p.end_date, p.is_active,
                      COUNT(b.id) AS total_bookings,
                      COALESCE(SUM(b.num_tickets), 0) AS total_tickets,
                      COALESCE(SUM(b.discount_amount), 0) AS total_discounted,
                      COALESCE(SUM(b.total_price), 0) AS total_revenue
               FROM promotions p
               LEFT JOIN promo_codes pc ON p.id = pc.promotion_id
               LEFT JOIN bookings b ON pc.id = b.promo_code_id
               GROUP BY p.id
               ORDER BY total_bookings DESC`
            )
            .all();

          const summary = db
            .prepare(
              `SELECT COUNT(*) AS total_promo_bookings,
                      COALESCE(SUM(discount_amount), 0) AS total_discounts,
                      COALESCE(SUM(total_price), 0) AS total_promo_revenue
               FROM bookings WHERE promo_code_id IS NOT NULL`
            )
            .get();

          return { promotions: promos, summary };
        },
      }),

      detectLowFillShowtimes: tool({
        description:
          "Find showtimes with low seat fill rates — candidates for flash sales. Returns showtimes below the given fill threshold.",
        inputSchema: z.object({
          maxFillPercent: z
            .number()
            .default(30)
            .describe(
              "Maximum fill percentage to include (default 30 = shows less than 30% full)"
            ),
          date: z
            .string()
            .optional()
            .describe("Filter by date (YYYY-MM-DD). Defaults to all dates."),
        }),
        execute: async ({ maxFillPercent, date }) => {
          let query = `
            SELECT s.id AS showtime_id, s.show_date, s.start_time, s.end_time,
                   s.ticket_price, s.seats_available, s.status,
                   t.seat_count, t.name AS theater_name, t.screen_type,
                   m.id AS movie_id, m.name AS movie_name, m.category,
                   ROUND(100.0 * (t.seat_count - s.seats_available) / t.seat_count, 1) AS fill_percent
            FROM showtimes s
            JOIN movies m ON s.movie_id = m.id
            JOIN theaters t ON s.theater_id = t.id
            WHERE s.status NOT IN ('cancelled', 'completed', 'sold_out')
              AND ROUND(100.0 * (t.seat_count - s.seats_available) / t.seat_count, 1) < ?
          `;
          const params: (string | number)[] = [maxFillPercent];

          if (date) {
            query += " AND s.show_date = ?";
            params.push(date);
          }

          query += " ORDER BY fill_percent ASC LIMIT 30";

          const showtimes = db.prepare(query).all(...params);
          return {
            threshold: `${maxFillPercent}%`,
            showtimes,
            count: showtimes.length,
          };
        },
      }),

      createPromotion: tool({
        description:
          "Create a new promotion/discount. Returns the created promotion with its ID.",
        inputSchema: z.object({
          name: z.string().describe("Promotion name (e.g., 'Flash Sale: Thunder Valley')"),
          description: z.string().describe("Human-readable description of the deal"),
          discountType: z.enum(["percent", "fixed"]).describe("'percent' for % off, 'fixed' for $ off"),
          discountValue: z.number().describe("Discount amount (e.g., 30 for 30% or $30)"),
          applicableMovieId: z.number().optional().describe("Target a specific movie (NULL = all movies)"),
          applicableShowtimeId: z.number().optional().describe("Target a specific showtime (NULL = all)"),
          applicableCategory: z.string().optional().describe("Target a genre (e.g., 'Horror', 'Action')"),
          minTickets: z.number().default(1).describe("Minimum tickets to qualify"),
          maxDiscount: z.number().optional().describe("Cap on total discount amount"),
          startDate: z.string().describe("Start date (YYYY-MM-DD)"),
          endDate: z.string().describe("End date (YYYY-MM-DD)"),
        }),
        execute: async ({
          name, description, discountType, discountValue,
          applicableMovieId, applicableShowtimeId, applicableCategory,
          minTickets, maxDiscount, startDate, endDate,
        }) => {
          const result = db
            .prepare(
              `INSERT INTO promotions
               (name, description, discount_type, discount_value,
                applicable_movie_id, applicable_showtime_id, applicable_category,
                min_tickets, max_discount, start_date, end_date, created_by)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'promoter')`
            )
            .run(
              name, description, discountType, discountValue,
              applicableMovieId ?? null, applicableShowtimeId ?? null,
              applicableCategory ?? null, minTickets, maxDiscount ?? null,
              startDate, endDate,
            );

          return {
            success: true,
            promotionId: result.lastInsertRowid,
            name,
            discountType,
            discountValue,
            startDate,
            endDate,
            message: `Promotion "${name}" created. Now generate promo codes for it using createPromoCode.`,
          };
        },
      }),

      createPromoCode: tool({
        description: "Generate a promo code for an existing promotion",
        inputSchema: z.object({
          promotionId: z.number().describe("The promotion ID to attach this code to"),
          code: z.string().describe("The promo code string (e.g., 'FLASH50', 'HORROR20')"),
          maxUses: z.number().default(100).describe("Maximum number of times this code can be used"),
        }),
        execute: async ({ promotionId, code, maxUses }) => {
          // Check promotion exists
          const promo = db
            .prepare("SELECT id, name FROM promotions WHERE id = ?")
            .get(promotionId) as Record<string, unknown> | undefined;

          if (!promo) return { error: "Promotion not found" };

          // Check code doesn't already exist
          const existing = db
            .prepare("SELECT id FROM promo_codes WHERE UPPER(code) = UPPER(?)")
            .get(code);

          if (existing) return { error: `Code "${code}" already exists.` };

          db.prepare(
            "INSERT INTO promo_codes (promotion_id, code, max_uses) VALUES (?, ?, ?)"
          ).run(promotionId, code.toUpperCase(), maxUses);

          return {
            success: true,
            code: code.toUpperCase(),
            promotionName: promo.name,
            maxUses,
            message: `Promo code ${code.toUpperCase()} is live! Customers can use it at checkout.`,
          };
        },
      }),

      deactivatePromotion: tool({
        description: "Deactivate a promotion and all its promo codes",
        inputSchema: z.object({
          promotionId: z.number().describe("The promotion ID to deactivate"),
        }),
        execute: async ({ promotionId }) => {
          const promo = db
            .prepare("SELECT id, name FROM promotions WHERE id = ?")
            .get(promotionId) as Record<string, unknown> | undefined;

          if (!promo) return { error: "Promotion not found" };

          db.prepare("UPDATE promotions SET is_active = 0 WHERE id = ?").run(promotionId);
          db.prepare("UPDATE promo_codes SET is_active = 0 WHERE promotion_id = ?").run(promotionId);

          return {
            success: true,
            message: `Promotion "${promo.name}" and all its codes have been deactivated.`,
          };
        },
      }),

      createFlashSale: tool({
        description:
          "Quick action: Create a flash sale for a specific showtime with auto-generated promo code. Combines creating a promotion + code in one step.",
        inputSchema: z.object({
          showtimeId: z.number().describe("The showtime ID to create a flash sale for"),
          discountPercent: z
            .number()
            .min(5)
            .max(50)
            .describe("Discount percentage (5-50%)"),
          maxUses: z
            .number()
            .default(50)
            .describe("Max uses for the flash sale code"),
        }),
        execute: async ({ showtimeId, discountPercent, maxUses }) => {
          const showtime = db
            .prepare(
              `SELECT s.*, m.name AS movie_name, m.category,
                      t.name AS theater_name, t.seat_count, t.screen_type,
                      ROUND(100.0 * (t.seat_count - s.seats_available) / t.seat_count, 1) AS fill_percent
               FROM showtimes s
               JOIN movies m ON s.movie_id = m.id
               JOIN theaters t ON s.theater_id = t.id
               WHERE s.id = ?`
            )
            .get(showtimeId) as Record<string, unknown> | undefined;

          if (!showtime) return { error: "Showtime not found" };

          const name = `Flash Sale: ${showtime.movie_name} @ ${showtime.start_time}`;
          const description = `${discountPercent}% off ${showtime.movie_name} in ${showtime.theater_name} (${showtime.screen_type}) on ${showtime.show_date} at ${showtime.start_time}. Currently ${showtime.fill_percent}% full.`;

          const promoResult = db
            .prepare(
              `INSERT INTO promotions
               (name, description, discount_type, discount_value,
                applicable_showtime_id, min_tickets, start_date, end_date, created_by)
               VALUES (?, ?, 'percent', ?, ?, 1, ?, ?, 'promoter')`
            )
            .run(
              name, description, discountPercent,
              showtimeId, showtime.show_date as string, showtime.show_date as string,
            );

          const promoId = promoResult.lastInsertRowid;
          const code = `FLASH${discountPercent}-${Date.now().toString(36).toUpperCase().slice(-5)}`;

          db.prepare(
            "INSERT INTO promo_codes (promotion_id, code, max_uses) VALUES (?, ?, ?)"
          ).run(promoId, code, maxUses);

          return {
            success: true,
            promotionId: promoId,
            code,
            movie: showtime.movie_name,
            theater: showtime.theater_name,
            showtime: `${showtime.show_date} ${showtime.start_time}`,
            currentFillRate: `${showtime.fill_percent}%`,
            discount: `${discountPercent}% off`,
            originalPrice: `$${(showtime.ticket_price as number).toFixed(2)}`,
            salePrice: `$${((showtime.ticket_price as number) * (1 - discountPercent / 100)).toFixed(2)}`,
            maxUses,
            message: `Flash sale live! Code ${code} for ${discountPercent}% off. Share it to fill those empty seats!`,
          };
        },
      }),

      getRevenueStats: tool({
        description:
          "Get revenue and booking statistics — totals, averages, breakdowns by date/theater/movie",
        inputSchema: z.object({
          groupBy: z
            .enum(["date", "movie", "theater"])
            .optional()
            .describe("How to break down the stats"),
        }),
        execute: async ({ groupBy }) => {
          const overall = db
            .prepare(
              `SELECT COUNT(*) AS total_bookings,
                      COALESCE(SUM(num_tickets), 0) AS total_tickets,
                      COALESCE(SUM(total_price), 0) AS total_revenue,
                      COALESCE(SUM(discount_amount), 0) AS total_discounts,
                      COALESCE(AVG(total_price), 0) AS avg_booking_value
               FROM bookings`
            )
            .get();

          let breakdown = null;
          if (groupBy === "date") {
            breakdown = db
              .prepare(
                `SELECT DATE(b.booked_at) AS date,
                        COUNT(*) AS bookings, SUM(b.num_tickets) AS tickets,
                        SUM(b.total_price) AS revenue
                 FROM bookings b
                 GROUP BY DATE(b.booked_at)
                 ORDER BY date`
              )
              .all();
          } else if (groupBy === "movie") {
            breakdown = db
              .prepare(
                `SELECT m.name AS movie, m.category,
                        COUNT(*) AS bookings, SUM(b.num_tickets) AS tickets,
                        SUM(b.total_price) AS revenue
                 FROM bookings b
                 JOIN showtimes s ON b.showtime_id = s.id
                 JOIN movies m ON s.movie_id = m.id
                 GROUP BY m.id
                 ORDER BY revenue DESC
                 LIMIT 20`
              )
              .all();
          } else if (groupBy === "theater") {
            breakdown = db
              .prepare(
                `SELECT t.name AS theater, t.screen_type,
                        COUNT(*) AS bookings, SUM(b.num_tickets) AS tickets,
                        SUM(b.total_price) AS revenue
                 FROM bookings b
                 JOIN showtimes s ON b.showtime_id = s.id
                 JOIN theaters t ON s.theater_id = t.id
                 GROUP BY t.id
                 ORDER BY revenue DESC`
              )
              .all();
          }

          return { overall, breakdown };
        },
      }),

      listPromoCodes: tool({
        description: "List all promo codes with their usage stats and associated promotions",
        inputSchema: z.object({
          activeOnly: z
            .boolean()
            .default(true)
            .describe("Only show active codes"),
        }),
        execute: async ({ activeOnly }) => {
          let query = `
            SELECT pc.id, pc.code, pc.max_uses, pc.times_used, pc.is_active,
                   p.name AS promotion_name, p.discount_type, p.discount_value,
                   p.applicable_category, p.start_date, p.end_date
            FROM promo_codes pc
            JOIN promotions p ON pc.promotion_id = p.id
          `;
          if (activeOnly) {
            query += " WHERE pc.is_active = 1 AND p.is_active = 1";
          }
          query += " ORDER BY pc.times_used DESC";

          const codes = db.prepare(query).all();
          return { codes, totalCount: codes.length };
        },
      }),
    },
    stopWhen: stepCountIs(5),
  });

  return result.toUIMessageStreamResponse();
}
