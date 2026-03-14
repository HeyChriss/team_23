import { generateText, tool, stepCountIs } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { NextResponse } from "next/server";

export const maxDuration = 120;

const BATCH_SIZE = 3; // customers per parallel LLM call

async function spawnBatch(
  batchNum: number,
  count: number,
  genreList: string,
  existingNames: Set<string>,
): Promise<Record<string, unknown>[]> {
  const db = getDb();
  const generated: Record<string, unknown>[] = [];

  await generateText({
    model: anthropic("claude-haiku-4-5-20251001"),
    system: `You are a customer generator for StarLight Cinemas. Generate realistic, diverse customer profiles.

Available movie genres: ${genreList}

Rules:
- Each customer needs a unique, realistic full name — avoid these names: ${[...existingNames].slice(-20).join(", ")}
- Preferences should be 2-3 genres from the available list, comma-separated
- Mix of buyer (ready to buy) and persuadable (needs convincing) types — roughly 60/40 split
- Age range: 16-75, with realistic distribution
- Vary loyalty tiers: mostly None/Silver, some Gold, rare Platinum
- Vary visit frequency: rare, occasional, regular, frequent
- Budget: budget, standard, premium — mostly standard
- Showtime: matinee, evening, late_night
- Group sizes: 1 (solo), 2 (date), 3-6 (group) — vary realistically
- Notes should be a brief personality note (1 sentence)
- Make them feel like real people with distinct personalities
- This is batch ${batchNum}, so make names distinct from other batches`,
    prompt: `Generate exactly ${count} new customers. Use the addCustomer tool for each one.`,
    tools: {
      addCustomer: tool({
        description: "Add a new customer to the theater's customer pool",
        inputSchema: z.object({
          name: z.string().describe("Full name (first + last)"),
          customer_type: z.enum(["buyer", "persuadable"]),
          age: z.number().min(16).max(75),
          preferences: z.string().describe("Comma-separated genre preferences (2-3 genres)"),
          loyalty_tier: z.enum(["None", "Silver", "Gold", "Platinum"]),
          visit_frequency: z.enum(["rare", "occasional", "regular", "frequent"]),
          budget_preference: z.enum(["budget", "standard", "premium"]),
          preferred_showtime: z.enum(["matinee", "evening", "late_night"]),
          interested_in_concessions: z.boolean(),
          group_size_preference: z.number().min(1).max(6),
          notes: z.string().describe("Brief personality note"),
        }),
        execute: async (input) => {
          if (existingNames.has(input.name)) {
            return { error: `"${input.name}" already exists.` };
          }

          try {
            // Normal distribution around 75 for buy_likelihood
            const u1 = Math.random(), u2 = Math.random();
            const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
            const buyLikelihood = Math.round(Math.max(0, Math.min(100, 75 + z * 15)));

            db.prepare(
              `INSERT INTO customers (name, customer_type, age, preferences, loyalty_tier, visit_frequency, budget_preference, preferred_showtime, interested_in_concessions, group_size_preference, notes, buy_likelihood)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            ).run(
              input.name, input.customer_type, input.age, input.preferences,
              input.loyalty_tier, input.visit_frequency, input.budget_preference,
              input.preferred_showtime, input.interested_in_concessions ? 1 : 0,
              input.group_size_preference, input.notes, buyLikelihood,
            );

            existingNames.add(input.name);
            generated.push({ name: input.name, type: input.customer_type, preferences: input.preferences });
            return { success: true, name: input.name };
          } catch (e) {
            return { error: (e as Error).message };
          }
        },
      }),
    },
    stopWhen: stepCountIs(3),
  });

  return generated;
}

export async function POST(req: Request) {
  const { count = 5 } = await req.json();
  const db = getDb();

  // Collect existing names for dedup
  const existing = db
    .prepare("SELECT name FROM customers")
    .all() as { name: string }[];
  const existingNames = new Set(existing.map((c) => c.name));

  // Get genres
  const categories = db
    .prepare("SELECT DISTINCT category FROM movies WHERE is_active = 1 ORDER BY category")
    .all() as { category: string }[];
  const genreList = categories.map((c) => c.category).join(", ");

  // Split into parallel batches
  const numBatches = Math.ceil(count / BATCH_SIZE);
  const batches: Promise<Record<string, unknown>[]>[] = [];

  for (let i = 0; i < numBatches; i++) {
    const batchCount = Math.min(BATCH_SIZE, count - i * BATCH_SIZE);
    batches.push(spawnBatch(i + 1, batchCount, genreList, existingNames));
  }

  const results = await Promise.allSettled(batches);
  const allGenerated = results
    .filter((r) => r.status === "fulfilled")
    .flatMap((r) => (r as PromiseFulfilledResult<Record<string, unknown>[]>).value);

  return NextResponse.json({
    generated: allGenerated.length,
    customers: allGenerated,
  });
}
