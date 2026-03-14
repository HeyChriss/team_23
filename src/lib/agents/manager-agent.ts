/**
 * Manager Agent — helps active customers find movies and book tickets.
 * Called by the simulation engine for each active customer interaction.
 * Uses Opus for high-quality conversation.
 */

import { generateText, tool, stepCountIs } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { getSimulationClock } from "@/lib/simulation-clock";
import { withWriteLock } from "@/lib/write-queue";
import { insertEvent } from "@/lib/event-store";
import type { CustomerPersonality, ConversationEntry, ConversationUpdate } from "./types";

export async function runManagerConversation(
  customer: CustomerPersonality,
  simTime: string,
  onProgress?: (update: ConversationUpdate) => void
): Promise<ConversationEntry> {
  const db = getDb();
  const clock = getSimulationClock();
  const today = clock.today();
  const currentTime = clock.currentTime();

  const conversation: ConversationEntry = {
    customerName: customer.name,
    personality: customer,
    messages: [],
    outcome: "in_progress",
  };

  const budgetConstraint =
    customer.budgetSensitivity === "high"
      ? "I'm on a tight budget, prefer cheaper options under $13."
      : customer.budgetSensitivity === "medium"
        ? "I want good value but willing to spend for the right movie."
        : "Price doesn't matter, I want the best experience.";

  const timeConstraint =
    customer.timePreference === "matinee"
      ? "I prefer matinee showings (before 5 PM)."
      : customer.timePreference === "evening"
        ? "I prefer evening showings (after 5 PM)."
        : "I'm flexible on timing.";

  const customerPrompt = `You are ${customer.name}, a movie theater customer. You want to watch a movie today.

Your preferences:
- Favorite genres: ${customer.favoriteGenres.join(", ")}
- Group size: ${customer.groupSize} ticket(s)
- ${budgetConstraint}
- ${timeConstraint}
- Spontaneity: ${customer.spontaneity > 0.6 ? "You're open to suggestions outside your usual genres." : "You stick to what you like."}

Talk to the theater manager to find a movie and book tickets. Be conversational but concise (1-2 sentences per reply).
If nothing appeals to you or everything is sold out or too expensive, politely leave.
The current time is ${currentTime} on ${today}.`;

  // Emit greeting
  onProgress?.({
    customerName: customer.name,
    step: "greeting",
    message: `Hi! I'm looking for ${customer.favoriteGenres.join(" or ")} movies for ${customer.groupSize} ${customer.groupSize > 1 ? "people" : "person"}.`,
  });

  try {
    const result = await generateText({
      model: anthropic("claude-haiku-4-5-20251001"),
      stopWhen: stepCountIs(3),
      system: `You are the Manager Agent for StarLight Cinemas. A customer has arrived and wants to book tickets.
Help them find a movie and complete their booking. Be helpful and efficient.
Today is ${today}, current time is ${currentTime}.
Guide the customer: suggest movies matching their preferences → show available showtimes → book tickets.
Always try to make a sale, but respect the customer's preferences.`,
      prompt: customerPrompt,
      tools: {
        getNowShowing: tool({
          description: "Get movies showing today, optionally filtered by genre",
          inputSchema: z.object({
            category: z.string().optional(),
          }),
          execute: async ({ category }) => {
            onProgress?.({
              customerName: customer.name,
              step: "browsing",
              message: category ? `Browsing ${category} movies...` : "Browsing what's showing...",
            });
            let query = `
              SELECT DISTINCT m.id, m.name, m.category, m.length_minutes, m.director
              FROM movies m
              INNER JOIN showtimes s ON m.id = s.movie_id
              WHERE s.show_date = ? AND s.status IN ('scheduled', 'selling') AND m.is_active = 1
            `;
            const params: (string | number)[] = [today];
            if (category) {
              query += " AND LOWER(m.category) = LOWER(?)";
              params.push(category);
            }
            query += " ORDER BY m.name LIMIT 10";
            return db.prepare(query).all(...params);
          },
        }),

        getShowtimes: tool({
          description: "Get showtimes for a specific movie today",
          inputSchema: z.object({
            movieId: z.number(),
          }),
          execute: async ({ movieId }) => {
            onProgress?.({
              customerName: customer.name,
              step: "checking",
              message: "Checking available showtimes...",
            });
            return db
              .prepare(
                `SELECT s.id AS showtime_id, s.start_time, s.end_time, s.ticket_price,
                        s.seats_available, t.name AS theater_name, t.screen_type
                 FROM showtimes s
                 JOIN theaters t ON s.theater_id = t.id
                 WHERE s.movie_id = ? AND s.show_date = ?
                   AND s.status IN ('scheduled', 'selling')
                   AND s.seats_available >= ?
                 ORDER BY s.start_time`
              )
              .all(movieId, today, customer.groupSize);
          },
        }),

        bookTickets: tool({
          description: "Book tickets for a showtime",
          inputSchema: z.object({
            showtimeId: z.number(),
            numTickets: z.number(),
          }),
          execute: async ({ showtimeId, numTickets }) => {
            onProgress?.({
              customerName: customer.name,
              step: "booking",
              message: `Booking ${numTickets} ticket${numTickets > 1 ? "s" : ""}...`,
            });
            return await withWriteLock(() => {
              const showtime = db
                .prepare(
                  `SELECT s.*, m.name AS movie_name, t.name AS theater_name, t.screen_type
                   FROM showtimes s
                   JOIN movies m ON s.movie_id = m.id
                   JOIN theaters t ON s.theater_id = t.id
                   WHERE s.id = ?`
                )
                .get(showtimeId) as Record<string, unknown> | undefined;

              if (!showtime) return { error: "Showtime not found" };
              if ((showtime.seats_available as number) < numTickets)
                return { error: `Only ${showtime.seats_available} seats left` };

              const unitPrice = showtime.ticket_price as number;
              const totalPrice = Math.round(unitPrice * numTickets * 100) / 100;
              const confirmationCode = `SIM-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

              db.prepare(
                "UPDATE showtimes SET seats_available = seats_available - ?, status = CASE WHEN seats_available - ? <= 0 THEN 'sold_out' ELSE 'selling' END WHERE id = ?"
              ).run(numTickets, numTickets, showtimeId);

              db.prepare(
                `INSERT INTO bookings (showtime_id, customer_name, num_tickets, unit_price, discount_amount, total_price, confirmation_code)
                 VALUES (?, ?, ?, ?, 0, ?, ?)`
              ).run(showtimeId, customer.name, numTickets, unitPrice, totalPrice, confirmationCode);

              insertEvent({
                sim_time: simTime,
                event_type: "customer_booked",
                agent: "manager",
                summary: `${customer.name} booked ${numTickets} tickets for ${showtime.movie_name} at ${showtime.start_time}`,
                data: {
                  customer: customer.name,
                  movie: showtime.movie_name,
                  theater: showtime.theater_name,
                  tickets: numTickets,
                  totalPrice,
                  confirmationCode,
                },
              });

              conversation.outcome = "booked";
              onProgress?.({
                customerName: customer.name,
                step: "booked",
                message: `Booked! ${showtime.movie_name} at ${showtime.start_time}`,
                data: { movie: showtime.movie_name, theater: showtime.theater_name, tickets: numTickets, totalPrice },
              });
              conversation.bookingDetails = {
                movie: showtime.movie_name,
                theater: showtime.theater_name,
                time: showtime.start_time,
                tickets: numTickets,
                totalPrice,
                confirmationCode,
              };

              return {
                success: true,
                confirmationCode,
                movie: showtime.movie_name,
                theater: `${showtime.theater_name} (${showtime.screen_type})`,
                time: showtime.start_time,
                tickets: numTickets,
                totalPrice,
              };
            });
          },
        }),
      },
    });

    // Extract conversation messages from the result
    if (result.text) {
      conversation.messages.push({ role: "manager", content: result.text });
      onProgress?.({
        customerName: customer.name,
        step: "response",
        message: result.text,
      });
    }

    if (conversation.outcome === "in_progress") {
      conversation.outcome = "left";
      onProgress?.({
        customerName: customer.name,
        step: "left",
        message: "Left without booking",
      });
    }
  } catch (error) {
    conversation.outcome = "left";
    conversation.messages.push({
      role: "manager",
      content: `[Error: ${error instanceof Error ? error.message : "unknown"}]`,
    });
    onProgress?.({
      customerName: customer.name,
      step: "left",
      message: "Left — conversation error",
    });
  }

  // Log arrival/departure events
  insertEvent({
    sim_time: simTime,
    event_type: "customer_arrived",
    agent: "customer",
    summary: `${customer.name} arrived looking for ${customer.favoriteGenres.join("/")} movies (group of ${customer.groupSize})`,
    data: { customer: customer.name, genres: customer.favoriteGenres, groupSize: customer.groupSize },
  });

  if (conversation.outcome === "left") {
    insertEvent({
      sim_time: simTime,
      event_type: "customer_left",
      agent: "customer",
      summary: `${customer.name} left without booking`,
      data: { customer: customer.name },
    });
  }

  return conversation;
}
