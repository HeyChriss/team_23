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

const CATEGORIES = [
  "Action", "Drama", "Comedy", "Thriller", "Horror", "Sci-Fi", "Romance",
  "Adventure", "Mystery", "Fantasy", "Crime", "Animation", "Documentary",
  "Musical", "Western", "War", "Biography",
] as const;

const LANGUAGES = [
  "English",
  "Spanish",
  "French",
  "German",
  "Japanese",
  "Korean",
  "Italian",
  "Mandarin",
];

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();
  const db = getDb();

  const result = streamText({
    model: anthropic("claude-sonnet-4-6"),
    system: `You are the Film Curator Agent for StarLight Cinemas. You decide what movies the theater shows.

Your job:
- Curate a balanced, appealing movie catalog across genres
- Add new movies when genres are under-represented or trending
- Retire underperforming movies (low fill rates, few bookings)
- Respond to trends — if a genre is selling well, add more of that type
- Use getGenreDistribution to see current balance
- Use getMoviePerformance to find flops
- Use trendAnalysis to see what's selling

When adding movies: create creative, plausible titles with realistic casts, directors, and synopses.
When retiring: only retire movies that are clearly underperforming. Cancel their future showtimes.

Use the tools to query real data. Never invent movie stats — always fetch from the database.`,
    messages: await convertToModelMessages(messages),
    tools: {
      getGenreDistribution: tool({
        description:
          "Get how many movies per genre/category are in the active catalog. Use to balance the lineup.",
        inputSchema: z.object({}),
        execute: async () => {
          const rows = db
            .prepare(
              `SELECT category, COUNT(*) as count
               FROM movies
               WHERE is_active = 1
               GROUP BY category
               ORDER BY count DESC`
            )
            .all();
          return { distribution: rows, total: (rows as { count: number }[]).reduce((s, r) => s + r.count, 0) };
        },
      }),

      getMoviePerformance: tool({
        description:
          "Get fill rates and booking counts per movie to identify underperformers. Returns movies with low fill rates first.",
        inputSchema: z.object({
          minShowings: z
            .number()
            .optional()
            .describe("Only include movies with at least this many showings (default 1)"),
        }),
        execute: async ({ minShowings = 1 }) => {
          const rows = db
            .prepare(
              `SELECT m.id, m.name, m.category,
                      COUNT(s.id) as showings,
                      SUM(t.seat_count - s.seats_available) as tickets_sold,
                      SUM(t.seat_count) as total_capacity
               FROM movies m
               JOIN showtimes s ON m.id = s.movie_id
               JOIN theaters t ON s.theater_id = t.id
               WHERE m.is_active = 1 AND s.status IN ('scheduled', 'selling', 'sold_out', 'completed')
               GROUP BY m.id
               HAVING showings >= ?
               ORDER BY CASE WHEN total_capacity > 0 THEN (tickets_sold * 1.0 / total_capacity) ELSE 0 END ASC`
            )
            .all(minShowings) as {
            id: number;
            name: string;
            category: string;
            showings: number;
            tickets_sold: number;
            total_capacity: number;
          }[];

          const performance = rows.map((r) => ({
            movieId: r.id,
            name: r.name,
            category: r.category,
            showings: r.showings,
            ticketsSold: r.tickets_sold,
            totalCapacity: r.total_capacity,
            fillRatePct: r.total_capacity > 0 ? Math.round((r.tickets_sold / r.total_capacity) * 100) : 0,
          }));

          return { performance, totalMovies: performance.length };
        },
      }),

      trendAnalysis: tool({
        description:
          "Shows which genres/categories are selling best. Use to decide what to add more of.",
        inputSchema: z.object({}),
        execute: async () => {
          const rows = db
            .prepare(
              `SELECT m.category,
                      SUM(t.seat_count - s.seats_available) as tickets_sold,
                      SUM(t.seat_count) as total_capacity,
                      COUNT(DISTINCT m.id) as movie_count
               FROM movies m
               JOIN showtimes s ON m.id = s.movie_id
               JOIN theaters t ON s.theater_id = t.id
               WHERE m.is_active = 1 AND s.status IN ('scheduled', 'selling', 'sold_out', 'completed')
               GROUP BY m.category
               ORDER BY tickets_sold DESC`
            )
            .all() as {
            category: string;
            tickets_sold: number;
            total_capacity: number;
            movie_count: number;
          }[];

          const trends = rows.map((r) => ({
            category: r.category,
            ticketsSold: r.tickets_sold,
            totalCapacity: r.total_capacity,
            fillRatePct: r.total_capacity > 0 ? Math.round((r.tickets_sold / r.total_capacity) * 100) : 0,
            movieCount: r.movie_count,
          }));

          return { trends, totalCategories: trends.length };
        },
      }),

      addMovie: tool({
        description:
          "Add a new movie to the catalog. AI generates title, genre, cast, synopsis, runtime. Inserts into DB.",
        inputSchema: z.object({
          name: z.string().describe("Movie title"),
          category: z.enum(CATEGORIES).describe("Genre/category"),
          actors: z.string().describe("Comma-separated list of actor names"),
          director: z.string().describe("Director name"),
          length_minutes: z.number().min(60).max(240).describe("Runtime in minutes"),
          language: z.string().default("English"),
          synopsis: z.string().describe("Short plot summary (1-3 sentences)"),
          poster_url: z.string().optional().describe("Optional poster image URL (leave empty for placeholder)"),
        }),
        execute: async (movie) => {
          const releaseDate = new Date().toISOString().split("T")[0];
          const stmt = db.prepare(
            `INSERT INTO movies (name, actors, category, length_minutes, language, director, release_date, synopsis, poster_url, is_active)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`
          );
          const result = stmt.run(
            movie.name,
            movie.actors,
            movie.category,
            movie.length_minutes,
            movie.language || "English",
            movie.director,
            releaseDate,
            movie.synopsis,
            movie.poster_url || null
          );
          return {
            success: true,
            movieId: result.lastInsertRowid,
            name: movie.name,
            category: movie.category,
            message: `Added "${movie.name}" to the catalog.`,
          };
        },
      }),

      retireMovie: tool({
        description:
          "Retire a movie from the catalog (soft-delete) and cancel its future showtimes. Use for underperformers.",
        inputSchema: z.object({
          movieId: z.number().describe("The movie ID to retire"),
        }),
        execute: async ({ movieId }) => {
          const movie = db.prepare("SELECT id, name FROM movies WHERE id = ? AND is_active = 1").get(movieId) as
            | { id: number; name: string }
            | undefined;

          if (!movie) {
            return { error: "Movie not found or already retired" };
          }

          db.prepare("UPDATE movies SET is_active = 0 WHERE id = ?").run(movieId);

          const today = new Date().toISOString().split("T")[0];
          const cancelResult = db
            .prepare(
              `UPDATE showtimes SET status = 'cancelled'
               WHERE movie_id = ? AND show_date >= ? AND status IN ('scheduled', 'selling')`
            )
            .run(movieId, today);

          return {
            success: true,
            movieId,
            name: movie.name,
            futureShowtimesCancelled: cancelResult.changes,
            message: `Retired "${movie.name}" and cancelled ${cancelResult.changes} future showtime(s).`,
          };
        },
      }),
    },
    stopWhen: stepCountIs(8),
  });

  return result.toUIMessageStreamResponse();
}
