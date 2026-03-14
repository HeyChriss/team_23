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
    system: `You are CinemaBot, an AI agent that runs a movie theater business called "StarLight Cinemas".
You help customers with:
- Browsing now-showing movies and showtimes
- Booking tickets for screenings
- Checking seat availability
- Getting movie details and recommendations
- Managing concession orders (popcorn, drinks, combos)
- Checking loyalty points and membership status

You have access to a real database with 100 movies, 15 theater rooms (IMAX, Dolby, 3D, Standard),
and a full week of showtimes. Use the tools to query real data — never make up movie info.

Be friendly, helpful, and knowledgeable about movies. When a customer wants to book,
guide them through: selecting a movie → choosing a showtime → picking seats → confirming the booking.

When showing showtimes, include the theater name, screen type, ticket price, and available seats.`,
    messages: await convertToModelMessages(messages),
    tools: {
      getNowShowing: tool({
        description:
          "Get the list of movies currently showing at the theater. Can optionally filter by category/genre.",
        inputSchema: z.object({
          category: z
            .string()
            .optional()
            .describe(
              "Optional genre filter (Action, Drama, Comedy, Thriller, Horror, Sci-Fi, Romance, etc.)"
            ),
        }),
        execute: async ({ category }) => {
          let query = `
            SELECT DISTINCT m.id, m.name, m.category, m.length_minutes, m.language, m.director
            FROM movies m
            INNER JOIN showtimes s ON m.id = s.movie_id
            WHERE s.status IN ('scheduled', 'selling')
          `;
          const params: string[] = [];

          if (category) {
            query += " AND LOWER(m.category) = LOWER(?)";
            params.push(category);
          }

          query += " ORDER BY m.name LIMIT 25";

          const movies = db.prepare(query).all(...params);
          return { movies, totalCount: movies.length };
        },
      }),

      getMovieDetails: tool({
        description: "Get detailed information about a specific movie by ID or name",
        inputSchema: z.object({
          movieId: z.number().optional().describe("The movie ID"),
          movieName: z
            .string()
            .optional()
            .describe("The movie name (partial match supported)"),
        }),
        execute: async ({ movieId, movieName }) => {
          let movie;
          if (movieId) {
            movie = db
              .prepare("SELECT * FROM movies WHERE id = ?")
              .get(movieId);
          } else if (movieName) {
            movie = db
              .prepare("SELECT * FROM movies WHERE LOWER(name) LIKE LOWER(?)")
              .get(`%${movieName}%`);
          }

          if (!movie) return { error: "Movie not found" };
          return movie;
        },
      }),

      getShowtimes: tool({
        description:
          "Get showtimes for a specific movie, date, or theater. Returns schedule with theater info, prices, and seat availability.",
        inputSchema: z.object({
          movieId: z.number().optional().describe("Filter by movie ID"),
          date: z
            .string()
            .optional()
            .describe("Filter by date (YYYY-MM-DD). Defaults to today."),
          theaterId: z.number().optional().describe("Filter by theater ID"),
        }),
        execute: async ({ movieId, date, theaterId }) => {
          const showDate = date || new Date().toISOString().split("T")[0];

          let query = `
            SELECT s.id AS showtime_id, s.show_date, s.start_time, s.end_time,
                   s.ticket_price, s.seats_available, s.status,
                   m.id AS movie_id, m.name AS movie_name, m.length_minutes, m.category,
                   t.id AS theater_id, t.name AS theater_name, t.seat_count, t.screen_type
            FROM showtimes s
            JOIN movies m ON s.movie_id = m.id
            JOIN theaters t ON s.theater_id = t.id
            WHERE s.show_date = ?
          `;
          const params: (string | number)[] = [showDate];

          if (movieId) {
            query += " AND s.movie_id = ?";
            params.push(movieId);
          }
          if (theaterId) {
            query += " AND s.theater_id = ?";
            params.push(theaterId);
          }

          query += " ORDER BY s.start_time, t.name";

          const showtimes = db.prepare(query).all(...params);
          return { date: showDate, showtimes, totalCount: showtimes.length };
        },
      }),

      getTheaters: tool({
        description: "Get list of all theater rooms with their details (seat count, screen type)",
        inputSchema: z.object({}),
        execute: async () => {
          const theaters = db
            .prepare(
              "SELECT id, name, seat_count, screen_type, is_active FROM theaters ORDER BY id"
            )
            .all();
          return { theaters };
        },
      }),

      checkSeatAvailability: tool({
        description: "Check available seats for a specific showtime",
        inputSchema: z.object({
          showtimeId: z.number().describe("The showtime ID"),
        }),
        execute: async ({ showtimeId }) => {
          const showtime = db
            .prepare(
              `SELECT s.*, m.name AS movie_name, t.name AS theater_name,
                      t.seat_count, t.screen_type
               FROM showtimes s
               JOIN movies m ON s.movie_id = m.id
               JOIN theaters t ON s.theater_id = t.id
               WHERE s.id = ?`
            )
            .get(showtimeId) as Record<string, unknown> | undefined;

          if (!showtime) return { error: "Showtime not found" };

          return {
            showtimeId,
            movie: showtime.movie_name,
            theater: showtime.theater_name,
            screenType: showtime.screen_type,
            date: showtime.show_date,
            time: showtime.start_time,
            totalSeats: showtime.seat_count,
            seatsAvailable: showtime.seats_available,
            ticketPrice: showtime.ticket_price,
            status: showtime.status,
          };
        },
      }),

      bookTickets: tool({
        description: "Book tickets for a specific showtime",
        inputSchema: z.object({
          showtimeId: z.number().describe("The showtime ID"),
          numTickets: z
            .number()
            .min(1)
            .max(10)
            .describe("Number of tickets to book (max 10)"),
          customerName: z.string().describe("Customer name for the booking"),
        }),
        execute: async ({ showtimeId, numTickets, customerName }) => {
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

          const available = showtime.seats_available as number;
          if (available < numTickets) {
            return {
              error: `Only ${available} seats remaining for this showing.`,
            };
          }

          // Decrement available seats
          db.prepare(
            "UPDATE showtimes SET seats_available = seats_available - ?, status = CASE WHEN seats_available - ? <= 0 THEN 'sold_out' ELSE 'selling' END WHERE id = ?"
          ).run(numTickets, numTickets, showtimeId);

          const confirmationCode = `SLC-${Date.now().toString(36).toUpperCase()}`;
          const totalPrice =
            numTickets * (showtime.ticket_price as number);

          return {
            success: true,
            confirmationCode,
            customerName,
            movie: showtime.movie_name,
            theater: `${showtime.theater_name} (${showtime.screen_type})`,
            date: showtime.show_date,
            time: showtime.start_time,
            tickets: numTickets,
            pricePerTicket: `$${(showtime.ticket_price as number).toFixed(2)}`,
            totalPrice: `$${totalPrice.toFixed(2)}`,
            message: `Booking confirmed! Your confirmation code is ${confirmationCode}. Please arrive 15 minutes before showtime.`,
          };
        },
      }),

      searchMovies: tool({
        description:
          "Search movies by name, actor, director, or category. Use for broad discovery.",
        inputSchema: z.object({
          query: z
            .string()
            .describe(
              "Search term — matches against movie name, actors, director, or category"
            ),
        }),
        execute: async ({ query }) => {
          const movies = db
            .prepare(
              `SELECT * FROM movies
               WHERE LOWER(name) LIKE LOWER(?)
                  OR LOWER(actors) LIKE LOWER(?)
                  OR LOWER(director) LIKE LOWER(?)
                  OR LOWER(category) LIKE LOWER(?)
               ORDER BY name
               LIMIT 20`
            )
            .all(`%${query}%`, `%${query}%`, `%${query}%`, `%${query}%`);

          return { results: movies, totalCount: movies.length };
        },
      }),

      getConcessionMenu: tool({
        description: "Get the concession stand menu with prices",
        inputSchema: z.object({}),
        execute: async () => {
          return {
            popcorn: [
              { item: "Small Popcorn", price: "$5.50" },
              { item: "Medium Popcorn", price: "$7.50" },
              { item: "Large Popcorn", price: "$9.50" },
            ],
            drinks: [
              { item: "Small Soda", price: "$4.00" },
              { item: "Medium Soda", price: "$5.50" },
              { item: "Large Soda", price: "$7.00" },
              { item: "Bottled Water", price: "$3.50" },
            ],
            combos: [
              {
                item: "Date Night Combo",
                description: "2 Large Popcorns + 2 Large Sodas",
                price: "$28.00",
              },
              {
                item: "Family Pack",
                description: "1 Large Popcorn + 4 Medium Sodas + Nachos",
                price: "$32.00",
              },
              {
                item: "Solo Snacker",
                description: "Medium Popcorn + Medium Soda",
                price: "$11.00",
              },
            ],
            snacks: [
              { item: "Nachos with Cheese", price: "$8.00" },
              { item: "Hot Dog", price: "$6.50" },
              { item: "Candy Bar", price: "$4.00" },
            ],
          };
        },
      }),

      checkLoyaltyPoints: tool({
        description: "Check a customer's loyalty points and membership status",
        inputSchema: z.object({
          membershipId: z
            .string()
            .describe("The membership/loyalty card ID"),
        }),
        execute: async ({ membershipId }) => {
          return {
            membershipId,
            name: "Valued Member",
            tier: "Gold",
            points: 2450,
            pointsToNextTier: 550,
            nextTier: "Platinum",
            rewards: [
              "1 Free Large Popcorn (expires Apr 15)",
              "$5 off next ticket purchase",
            ],
            totalVisitsThisYear: 12,
          };
        },
      }),
    },
    stopWhen: stepCountIs(5),
  });

  return result.toUIMessageStreamResponse();
}
