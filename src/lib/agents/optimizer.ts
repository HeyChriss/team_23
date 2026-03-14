/**
 * Optimizer Agent — analyzes theater performance and takes strategic actions.
 * Runs once per tick to optimize fill rates, flag promotions, and rebalance catalog.
 */

import { generateText, tool, stepCountIs } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { TheaterStateController } from "@/lib/theater-state";
import { withWriteLock } from "@/lib/write-queue";
import { insertEvent } from "@/lib/event-store";
import type { AgentResult } from "./types";

export async function runOptimizer(simTime: string): Promise<AgentResult> {
  const db = getDb();
  const controller = new TheaterStateController(db);
  const today = simTime.split("T")[0];
  const actions: AgentResult["actions"] = [];

  try {
    await generateText({
      model: anthropic("claude-opus-4-6"),
      stopWhen: stepCountIs(4),
      system: `You are the Optimizer Agent for StarLight Cinemas. Your job is to maximize theater utilization and revenue.

Current simulation time: ${simTime}

Analyze the theater state and take actions:
1. Check fill rates across theaters — flag low-fill showtimes for promotion
2. Look for high-demand movies that could use extra screenings
3. Consider swapping underperforming movies to smaller theaters
4. Flag genres that are trending for the Scheduler to add more

Be decisive and take 1-3 actions per cycle. Don't just analyze — act.`,
      prompt: "Analyze current theater state and optimize operations. Take concrete actions.",
      tools: {
        getTheaterState: tool({
          description: "Get current theater fill rates, KPIs, and alerts",
          inputSchema: z.object({}),
          execute: async () => {
            const kpis = controller.getKPIs();
            const theaters = controller.getTheaterSummaries();
            const lowFill = controller.getLowFillShowtimes(30);
            const highDemand = controller.getHighDemandShowtimes(80);
            return {
              kpis: { avg_fill_rate: kpis.avg_fill_rate, total_revenue: kpis.total_revenue, total_tickets_sold: kpis.total_tickets_sold },
              theaterFills: theaters.map((t) => ({ name: t.name, fill_rate: t.fill_rate, screen_type: t.screen_type })),
              lowFillCount: lowFill.length,
              lowFillSample: lowFill.slice(0, 5).map((s) => ({
                id: s.id, movie: s.movie_name, theater: s.theater_name,
                fill_rate: s.fill_rate, time: s.start_time, date: s.show_date,
              })),
              highDemandCount: highDemand.length,
              highDemandSample: highDemand.slice(0, 3).map((s) => ({
                movie: s.movie_name, theater: s.theater_name, fill_rate: s.fill_rate,
              })),
            };
          },
        }),

        flagForPromotion: tool({
          description: "Flag a low-fill showtime for the Promotion Agent to create a deal",
          inputSchema: z.object({
            showtimeId: z.number(),
            reason: z.string(),
          }),
          execute: async ({ showtimeId, reason }) => {
            const showtime = db
              .prepare(
                `SELECT s.*, m.name AS movie_name, t.name AS theater_name
                 FROM showtimes s JOIN movies m ON s.movie_id = m.id JOIN theaters t ON s.theater_id = t.id
                 WHERE s.id = ?`
              )
              .get(showtimeId) as Record<string, unknown> | undefined;

            if (!showtime) return { error: "Showtime not found" };

            const action = {
              agent: "optimizer",
              action: "flag_for_promotion",
              summary: `Flagged ${showtime.movie_name} at ${showtime.start_time} for promotion: ${reason}`,
              data: { showtimeId, movie: showtime.movie_name, reason },
            };
            actions.push(action);

            insertEvent({
              sim_time: simTime,
              event_type: "optimizer_action",
              agent: "optimizer",
              summary: action.summary,
              data: action.data,
            });

            return { success: true, flagged: showtime.movie_name, reason };
          },
        }),

        addExtraScreening: tool({
          description: "Request an extra screening for a high-demand movie",
          inputSchema: z.object({
            movieId: z.number(),
            reason: z.string(),
          }),
          execute: async ({ movieId, reason }) => {
            const movie = db
              .prepare("SELECT id, name, length_minutes FROM movies WHERE id = ? AND is_active = 1")
              .get(movieId) as { id: number; name: string; length_minutes: number } | undefined;

            if (!movie) return { error: "Movie not found" };

            // Find an available theater slot
            const availability = controller.getTheaterAvailability(today);
            const freeTheater = availability.find((a) => a.available_hours >= movie.length_minutes / 60 + 0.5);

            if (!freeTheater) return { note: "No available theater slots for extra screening" };

            const action = {
              agent: "optimizer",
              action: "request_extra_screening",
              summary: `Requested extra screening of "${movie.name}" — ${reason}`,
              data: { movieId, movie: movie.name, suggestedTheater: freeTheater.theater_name, reason },
            };
            actions.push(action);

            insertEvent({
              sim_time: simTime,
              event_type: "optimizer_action",
              agent: "optimizer",
              summary: action.summary,
              data: action.data,
            });

            return { success: true, movie: movie.name, suggestedTheater: freeTheater.theater_name };
          },
        }),

        getGenreDistribution: tool({
          description: "See genre balance and performance",
          inputSchema: z.object({}),
          execute: async () => {
            const trends = controller.getGenreTrends();
            return trends.map((t) => ({
              genre: t.category,
              showtimes: t.total_showtimes,
              tickets: t.total_tickets,
              revenue: t.total_revenue,
              fillRate: t.avg_fill_rate,
            }));
          },
        }),
      },
    });
  } catch (error) {
    return {
      agent: "optimizer",
      actions,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }

  return { agent: "optimizer", actions };
}
