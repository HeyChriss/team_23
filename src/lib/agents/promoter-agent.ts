/**
 * Promoter Agent — creates promotions for low-fill showtimes.
 * Wraps existing promoter-tools.ts functions for autonomous operation.
 * Runs every 3rd tick.
 */

import { generateText, tool, stepCountIs } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { getDb } from "@/lib/db";
import {
  createFlashSale as createFlashSaleFn,
  createPromotion as createPromotionFn,
  createPromoCode as createPromoCodeFn,
  detectLowFillShowtimes as detectLowFillFn,
  getPromotionPerformance as getPromoPerfFn,
} from "@/lib/promoter-tools";
import { insertEvent } from "@/lib/event-store";
import { withWriteLock } from "@/lib/write-queue";
import type { AgentResult } from "./types";

export async function runPromoter(simTime: string): Promise<AgentResult> {
  const db = getDb();
  const today = simTime.split("T")[0];
  const actions: AgentResult["actions"] = [];

  try {
    await generateText({
      model: anthropic("claude-sonnet-4-6"),
      stopWhen: stepCountIs(3),
      system: `You are the Promotions Agent for StarLight Cinemas. You create deals to fill empty seats.

Current simulation time: ${simTime}

Your job:
1. Detect low-fill showtimes that need help
2. Create flash sales or promotions with attractive discounts
3. Check what promos are already active to avoid overlap

Be aggressive with promotions — empty seats earn nothing. Create 1-2 promos per cycle.
Use discounts of 15-40% depending on how empty the showtime is.`,
      prompt: "Find struggling showtimes and create promotions to boost ticket sales.",
      tools: {
        detectLowFillShowtimes: tool({
          description: "Find showtimes with low fill rates",
          inputSchema: z.object({
            maxFillPercent: z.number().default(40),
          }),
          execute: async ({ maxFillPercent }) => {
            return detectLowFillFn(db, maxFillPercent, today);
          },
        }),

        createFlashSale: tool({
          description: "Create a flash sale for a specific struggling showtime",
          inputSchema: z.object({
            showtimeId: z.number(),
            discountPercent: z.number().min(10).max(50),
            maxUses: z.number().default(30),
          }),
          execute: async ({ showtimeId, discountPercent, maxUses }) => {
            return await withWriteLock(() => {
              const result = createFlashSaleFn(db, { showtimeId, discountPercent, maxUses });
              if ("error" in result) return result;

              const action = {
                agent: "promoter",
                action: "flash_sale",
                summary: `Flash sale: ${discountPercent}% off ${result.movie} at ${result.theater} (code: ${result.code})`,
                data: { ...result },
              };
              actions.push(action);

              insertEvent({
                sim_time: simTime,
                event_type: "flash_sale",
                agent: "promoter",
                summary: action.summary,
                data: action.data as Record<string, unknown>,
              });

              return result;
            });
          },
        }),

        createPromotion: tool({
          description: "Create a broader promotion targeting a category or all movies",
          inputSchema: z.object({
            name: z.string(),
            description: z.string(),
            discountType: z.enum(["percent", "fixed"]),
            discountValue: z.number(),
            applicableCategory: z.string().optional(),
            minTickets: z.number().default(1),
            maxDiscount: z.number().optional(),
          }),
          execute: async (input) => {
            return await withWriteLock(() => {
              const result = createPromotionFn(db, {
                ...input,
                startDate: today,
                endDate: today,
              });

              if ("error" in result) return result;

              // Auto-create a promo code
              const code = `PROMO${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
              createPromoCodeFn(db, {
                promotionId: result.promotionId as number,
                code,
                maxUses: 50,
              });

              const action = {
                agent: "promoter",
                action: "create_promotion",
                summary: `Created "${input.name}" — ${input.discountValue}${input.discountType === "percent" ? "%" : "$"} off (code: ${code})`,
                data: { ...result, code },
              };
              actions.push(action);

              insertEvent({
                sim_time: simTime,
                event_type: "promotion_created",
                agent: "promoter",
                summary: action.summary,
                data: action.data as Record<string, unknown>,
              });

              return { ...result, code };
            });
          },
        }),

        getPromotionPerformance: tool({
          description: "Check how existing promotions are performing",
          inputSchema: z.object({}),
          execute: async () => {
            return getPromoPerfFn(db);
          },
        }),
      },
    });
  } catch (error) {
    return {
      agent: "promoter",
      actions,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }

  return { agent: "promoter", actions };
}
