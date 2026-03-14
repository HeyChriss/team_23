/**
 * Scheduler Agent — manages movie schedule, adds/cancels showtimes.
 * Runs every 3rd tick to adjust the schedule based on demand.
 */

import { generateText, tool, stepCountIs } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { TheaterStateController } from "@/lib/theater-state";
import { withWriteLock } from "@/lib/write-queue";
import { insertEvent } from "@/lib/event-store";
import type { AgentResult } from "./types";

export async function runScheduler(simTime: string): Promise<AgentResult> {
  const db = getDb();
  const controller = new TheaterStateController(db);
  const today = simTime.split("T")[0];
  const actions: AgentResult["actions"] = [];

  try {
    await generateText({
      model: anthropic("claude-sonnet-4-6"),
      stopWhen: stepCountIs(3),
      system: `You are the Scheduler Agent for StarLight Cinemas. You manage the movie schedule.

Current simulation time: ${simTime}

Your responsibilities:
1. Add showtimes for movies that are in high demand
2. Cancel showtimes that have very low fills and won't sell
3. Ensure theaters aren't sitting empty during peak hours
4. Balance the schedule across theaters

Take 1-2 actions per cycle. Be strategic.`,
      prompt: "Review theater availability and current demand. Optimize the schedule.",
      tools: {
        getTheaterAvailability: tool({
          description: "Check which theaters have open slots today",
          inputSchema: z.object({}),
          execute: async () => {
            return controller.getTheaterAvailability(today);
          },
        }),

        getActiveMovies: tool({
          description: "Get active movies with their performance stats",
          inputSchema: z.object({}),
          execute: async () => {
            const movies = controller.getMoviePerformance(20);
            return movies.map((m) => ({
              id: m.id, name: m.name, category: m.category,
              showtimes: m.total_showtimes, tickets: m.total_tickets,
              fillRate: m.avg_fill_rate,
            }));
          },
        }),

        addShowtime: tool({
          description: "Add a new showtime for a movie",
          inputSchema: z.object({
            movieId: z.number(),
            theaterId: z.number(),
            startTime: z.string().describe("HH:MM format"),
            ticketPrice: z.number().default(12),
          }),
          execute: async ({ movieId, theaterId, startTime, ticketPrice }) => {
            return await withWriteLock(() => {
              const movie = db
                .prepare("SELECT id, name, length_minutes FROM movies WHERE id = ? AND is_active = 1")
                .get(movieId) as { id: number; name: string; length_minutes: number } | undefined;

              if (!movie) return { error: "Movie not found" };

              const theater = db
                .prepare("SELECT id, name, seat_count, screen_type FROM theaters WHERE id = ? AND is_active = 1")
                .get(theaterId) as { id: number; name: string; seat_count: number; screen_type: string } | undefined;

              if (!theater) return { error: "Theater not found" };

              // Calculate end time
              const [h, m] = startTime.split(":").map(Number);
              const endMinutes = h * 60 + m + movie.length_minutes;
              const endTime = `${Math.floor(endMinutes / 60).toString().padStart(2, "0")}:${(endMinutes % 60).toString().padStart(2, "0")}`;

              // Check for conflicts
              const conflict = db
                .prepare(
                  `SELECT id FROM showtimes
                   WHERE theater_id = ? AND show_date = ?
                     AND status NOT IN ('cancelled')
                     AND NOT (end_time <= ? OR start_time >= ?)`
                )
                .get(theaterId, today, startTime, endTime);

              if (conflict) return { error: "Time slot conflicts with existing showtime" };

              const result = db
                .prepare(
                  `INSERT INTO showtimes (movie_id, theater_id, show_date, start_time, end_time, ticket_price, seats_available, status)
                   VALUES (?, ?, ?, ?, ?, ?, ?, 'scheduled')`
                )
                .run(movieId, theaterId, today, startTime, endTime, ticketPrice, theater.seat_count);

              const action = {
                agent: "scheduler",
                action: "add_showtime",
                summary: `Added ${movie.name} at ${startTime} in ${theater.name}`,
                data: { showtimeId: result.lastInsertRowid, movie: movie.name, theater: theater.name, time: startTime },
              };
              actions.push(action);

              insertEvent({
                sim_time: simTime,
                event_type: "showtime_added",
                agent: "scheduler",
                summary: action.summary,
                data: action.data,
              });

              return { success: true, showtimeId: result.lastInsertRowid, movie: movie.name, theater: theater.name, time: `${startTime}-${endTime}` };
            });
          },
        }),

        cancelShowtime: tool({
          description: "Cancel a showtime with very low fills",
          inputSchema: z.object({
            showtimeId: z.number(),
            reason: z.string(),
          }),
          execute: async ({ showtimeId, reason }) => {
            return await withWriteLock(() => {
              const showtime = db
                .prepare(
                  `SELECT s.*, m.name AS movie_name, t.name AS theater_name
                   FROM showtimes s JOIN movies m ON s.movie_id = m.id JOIN theaters t ON s.theater_id = t.id
                   WHERE s.id = ? AND s.status IN ('scheduled', 'selling')`
                )
                .get(showtimeId) as Record<string, unknown> | undefined;

              if (!showtime) return { error: "Showtime not found or already cancelled" };

              db.prepare("UPDATE showtimes SET status = 'cancelled' WHERE id = ?").run(showtimeId);

              const action = {
                agent: "scheduler",
                action: "cancel_showtime",
                summary: `Cancelled ${showtime.movie_name} at ${showtime.start_time} in ${showtime.theater_name}: ${reason}`,
                data: { showtimeId, movie: showtime.movie_name, theater: showtime.theater_name, reason },
              };
              actions.push(action);

              insertEvent({
                sim_time: simTime,
                event_type: "showtime_cancelled",
                agent: "scheduler",
                summary: action.summary,
                data: action.data,
              });

              return { success: true, cancelled: showtime.movie_name, theater: showtime.theater_name };
            });
          },
        }),
      },
    });
  } catch (error) {
    return {
      agent: "scheduler",
      actions,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }

  return { agent: "scheduler", actions };
}
