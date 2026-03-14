import {
  type UIMessage,
  convertToModelMessages,
  streamText,
  tool,
  stepCountIs,
} from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";

export const maxDuration = 60;

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();

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

Be friendly, helpful, and knowledgeable about movies. When a customer wants to book,
guide them through: selecting a movie → choosing a showtime → picking seats → confirming the booking.`,
    messages: await convertToModelMessages(messages),
    tools: {
      getNowShowing: tool({
        description: "Get the list of movies currently showing at the theater",
        inputSchema: z.object({}),
        execute: async () => {
          return [
            {
              id: "1",
              title: "Dune: Part Three",
              genre: "Sci-Fi/Adventure",
              rating: "PG-13",
              duration: "2h 45m",
              showtimes: ["11:00 AM", "2:30 PM", "6:00 PM", "9:30 PM"],
            },
            {
              id: "2",
              title: "The Return of the King (Re-Release)",
              genre: "Fantasy/Adventure",
              rating: "PG-13",
              duration: "3h 21m",
              showtimes: ["12:00 PM", "4:30 PM", "8:00 PM"],
            },
            {
              id: "3",
              title: "Midnight in Tokyo",
              genre: "Romance/Drama",
              rating: "R",
              duration: "1h 58m",
              showtimes: ["1:00 PM", "3:45 PM", "6:30 PM", "9:15 PM"],
            },
            {
              id: "4",
              title: "Byte Me: A Hacker's Tale",
              genre: "Thriller/Comedy",
              rating: "PG-13",
              duration: "2h 10m",
              showtimes: ["11:30 AM", "2:00 PM", "5:00 PM", "7:45 PM", "10:15 PM"],
            },
            {
              id: "5",
              title: "Whiskers & Wings",
              genre: "Animation/Family",
              rating: "G",
              duration: "1h 35m",
              showtimes: ["10:00 AM", "12:30 PM", "3:00 PM", "5:30 PM"],
            },
          ];
        },
      }),

      getMovieDetails: tool({
        description: "Get detailed information about a specific movie",
        inputSchema: z.object({
          movieId: z.string().describe("The movie ID"),
        }),
        execute: async ({ movieId }) => {
          const movies: Record<string, object> = {
            "1": {
              title: "Dune: Part Three",
              director: "Denis Villeneuve",
              cast: ["Timothée Chalamet", "Zendaya", "Florence Pugh"],
              synopsis:
                "The epic conclusion to the Dune saga. Paul Atreides faces his ultimate destiny as emperor while ancient forces threaten to unravel the fabric of the universe.",
              imdbRating: 8.9,
              audienceScore: "95%",
            },
            "2": {
              title: "The Return of the King (Re-Release)",
              director: "Peter Jackson",
              cast: ["Elijah Wood", "Viggo Mortensen", "Ian McKellen"],
              synopsis:
                "The remastered 4K IMAX re-release of the Oscar-winning epic. Experience Middle-earth like never before on the big screen.",
              imdbRating: 9.0,
              audienceScore: "98%",
            },
            "3": {
              title: "Midnight in Tokyo",
              director: "Sofia Coppola",
              cast: ["Saoirse Ronan", "Ryunosuke Kamiki"],
              synopsis:
                "Two strangers meet at a Tokyo jazz bar and share one transformative night wandering the neon-lit streets.",
              imdbRating: 7.8,
              audienceScore: "88%",
            },
            "4": {
              title: "Byte Me: A Hacker's Tale",
              director: "Jordan Peele",
              cast: ["Donald Glover", "Awkwafina"],
              synopsis:
                "A disgruntled IT worker accidentally hacks into a secret government AI and must team up with an unlikely ally to prevent digital chaos.",
              imdbRating: 7.5,
              audienceScore: "91%",
            },
            "5": {
              title: "Whiskers & Wings",
              director: "Hayao Miyazaki",
              cast: ["Voice Cast TBA"],
              synopsis:
                "A curious cat befriends a wounded bird, and together they embark on a magical journey across enchanted lands.",
              imdbRating: 8.4,
              audienceScore: "97%",
            },
          };
          return movies[movieId] || { error: "Movie not found" };
        },
      }),

      checkSeatAvailability: tool({
        description: "Check available seats for a specific movie and showtime",
        inputSchema: z.object({
          movieId: z.string().describe("The movie ID"),
          showtime: z.string().describe("The showtime to check"),
        }),
        execute: async ({ movieId, showtime }) => {
          const totalSeats = 120;
          const booked = Math.floor(Math.random() * 80) + 10;
          const available = totalSeats - booked;

          const availableSeats = [];
          const rows = ["A", "B", "C", "D", "E", "F", "G", "H"];
          for (let i = 0; i < Math.min(available, 15); i++) {
            const row = rows[Math.floor(Math.random() * rows.length)];
            const seat = Math.floor(Math.random() * 15) + 1;
            availableSeats.push(`${row}${seat}`);
          }

          return {
            movieId,
            showtime,
            totalSeats,
            availableCount: available,
            sampleAvailableSeats: [...new Set(availableSeats)].sort(),
            pricePerTicket: "$14.50",
            premiumSeats: "$19.50",
          };
        },
      }),

      bookTickets: tool({
        description: "Book tickets for a movie screening",
        inputSchema: z.object({
          movieId: z.string().describe("The movie ID"),
          showtime: z.string().describe("The selected showtime"),
          seats: z.array(z.string()).describe("Array of seat numbers to book"),
          customerName: z.string().describe("Customer name for the booking"),
        }),
        execute: async ({ movieId, showtime, seats, customerName }) => {
          const confirmationCode = `SLC-${Date.now().toString(36).toUpperCase()}`;
          const pricePerSeat = 14.5;
          const total = seats.length * pricePerSeat;

          return {
            success: true,
            confirmationCode,
            customerName,
            movieId,
            showtime,
            seats,
            totalPrice: `$${total.toFixed(2)}`,
            message: `Booking confirmed! Your confirmation code is ${confirmationCode}. Please arrive 15 minutes before showtime.`,
          };
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
