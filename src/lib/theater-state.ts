/**
 * TheaterStateController — Central source of truth for all theater data.
 *
 * Every agent queries this controller to understand the current state of the business.
 * All reads go through here so we have a single, consistent view of the theater.
 */

import type Database from "better-sqlite3";

// ── Types ────────────────────────────────────────────────────────────────────

export interface TheaterSummary {
  id: number;
  name: string;
  seat_count: number;
  screen_type: string;
  is_active: number;
  total_showtimes: number;
  total_capacity: number;
  total_booked: number;
  fill_rate: number; // 0-100
}

export interface MoviePerformance {
  id: number;
  name: string;
  category: string;
  language: string;
  director: string;
  total_showtimes: number;
  total_bookings: number;
  total_tickets: number;
  total_revenue: number;
  avg_fill_rate: number;
}

export interface ShowtimeStatus {
  id: number;
  movie_id: number;
  movie_name: string;
  category: string;
  theater_id: number;
  theater_name: string;
  screen_type: string;
  show_date: string;
  start_time: string;
  end_time: string;
  ticket_price: number;
  seat_count: number;
  seats_available: number;
  seats_booked: number;
  fill_rate: number;
  status: string;
  revenue: number;
}

export interface KPIs {
  total_revenue: number;
  total_tickets_sold: number;
  total_bookings: number;
  avg_booking_value: number;
  avg_fill_rate: number;
  total_showtimes: number;
  sold_out_count: number;
  total_promos_active: number;
  total_promo_redemptions: number;
  total_discount_given: number;
  revenue_per_screen: number;
  tickets_per_showtime: number;
}

export interface GenreTrend {
  category: string;
  total_showtimes: number;
  total_tickets: number;
  total_revenue: number;
  avg_fill_rate: number;
  booking_count: number;
}

export interface ScreenTypeStats {
  screen_type: string;
  theater_count: number;
  total_seats: number;
  total_showtimes: number;
  total_tickets: number;
  total_revenue: number;
  avg_fill_rate: number;
}

export interface DailySnapshot {
  date: string;
  total_showtimes: number;
  total_capacity: number;
  total_booked: number;
  fill_rate: number;
  revenue: number;
  bookings: number;
}

export interface Alert {
  type: "sold_out" | "low_fill" | "no_showtimes" | "promo_expiring" | "high_demand";
  severity: "info" | "warning" | "critical";
  message: string;
  data: Record<string, unknown>;
}

export interface FullTheaterState {
  kpis: KPIs;
  theaters: TheaterSummary[];
  dailySnapshots: DailySnapshot[];
  genreTrends: GenreTrend[];
  screenTypeStats: ScreenTypeStats[];
  alerts: Alert[];
  simTime: string;
}

// ── Controller ───────────────────────────────────────────────────────────────

export class TheaterStateController {
  constructor(private db: Database.Database) {}

  // ── KPIs ─────────────────────────────────────────────────────────────────

  getKPIs(): KPIs {
    const booking = this.db
      .prepare(
        `SELECT COUNT(*) AS total_bookings,
                COALESCE(SUM(num_tickets), 0) AS total_tickets_sold,
                COALESCE(SUM(total_price), 0) AS total_revenue,
                COALESCE(AVG(total_price), 0) AS avg_booking_value,
                COALESCE(SUM(discount_amount), 0) AS total_discount_given
         FROM bookings`
      )
      .get() as Record<string, number>;

    const showtime = this.db
      .prepare(
        `SELECT COUNT(*) AS total_showtimes,
                SUM(CASE WHEN s.status = 'sold_out' THEN 1 ELSE 0 END) AS sold_out_count,
                COALESCE(AVG(
                  ROUND(100.0 * (t.seat_count - s.seats_available) / t.seat_count, 1)
                ), 0) AS avg_fill_rate
         FROM showtimes s
         JOIN theaters t ON s.theater_id = t.id`
      )
      .get() as Record<string, number>;

    const promo = this.db
      .prepare(
        `SELECT COUNT(*) AS total_promos_active
         FROM promotions WHERE is_active = 1`
      )
      .get() as Record<string, number>;

    const promoRedemptions = this.db
      .prepare(
        `SELECT COUNT(*) AS total_promo_redemptions
         FROM bookings WHERE promo_code_id IS NOT NULL`
      )
      .get() as Record<string, number>;

    const theaterCount = this.db
      .prepare("SELECT COUNT(*) AS cnt FROM theaters WHERE is_active = 1")
      .get() as Record<string, number>;

    return {
      total_revenue: booking.total_revenue,
      total_tickets_sold: booking.total_tickets_sold,
      total_bookings: booking.total_bookings,
      avg_booking_value: Math.round(booking.avg_booking_value * 100) / 100,
      avg_fill_rate: Math.round(showtime.avg_fill_rate * 10) / 10,
      total_showtimes: showtime.total_showtimes,
      sold_out_count: showtime.sold_out_count,
      total_promos_active: promo.total_promos_active,
      total_promo_redemptions: promoRedemptions.total_promo_redemptions,
      total_discount_given: booking.total_discount_given,
      revenue_per_screen:
        theaterCount.cnt > 0
          ? Math.round((booking.total_revenue / theaterCount.cnt) * 100) / 100
          : 0,
      tickets_per_showtime:
        showtime.total_showtimes > 0
          ? Math.round((booking.total_tickets_sold / showtime.total_showtimes) * 100) / 100
          : 0,
    };
  }

  // ── Theater Summaries ────────────────────────────────────────────────────

  getTheaterSummaries(): TheaterSummary[] {
    return this.db
      .prepare(
        `SELECT t.id, t.name, t.seat_count, t.screen_type, t.is_active,
                COUNT(s.id) AS total_showtimes,
                COALESCE(SUM(t.seat_count), 0) AS total_capacity,
                COALESCE(SUM(t.seat_count - s.seats_available), 0) AS total_booked,
                COALESCE(
                  ROUND(100.0 * SUM(t.seat_count - s.seats_available) / NULLIF(SUM(t.seat_count), 0), 1),
                  0
                ) AS fill_rate
         FROM theaters t
         LEFT JOIN showtimes s ON t.id = s.theater_id
         GROUP BY t.id
         ORDER BY t.id`
      )
      .all() as TheaterSummary[];
  }

  // ── Movie Performance ────────────────────────────────────────────────────

  getMoviePerformance(limit = 20): MoviePerformance[] {
    return this.db
      .prepare(
        `SELECT m.id, m.name, m.category, m.language, m.director,
                COUNT(DISTINCT s.id) AS total_showtimes,
                COUNT(DISTINCT b.id) AS total_bookings,
                COALESCE(SUM(b.num_tickets), 0) AS total_tickets,
                COALESCE(SUM(b.total_price), 0) AS total_revenue,
                COALESCE(
                  ROUND(AVG(100.0 * (t.seat_count - s.seats_available) / t.seat_count), 1),
                  0
                ) AS avg_fill_rate
         FROM movies m
         LEFT JOIN showtimes s ON m.id = s.movie_id
         LEFT JOIN theaters t ON s.theater_id = t.id
         LEFT JOIN bookings b ON s.id = b.showtime_id
         WHERE s.id IS NOT NULL
         GROUP BY m.id
         ORDER BY total_revenue DESC
         LIMIT ?`
      )
      .all(limit) as MoviePerformance[];
  }

  getUnderperformingMovies(maxFillRate = 20): MoviePerformance[] {
    return this.getMoviePerformance(100).filter(
      (m) => m.avg_fill_rate < maxFillRate && m.total_showtimes > 0
    );
  }

  getTopMovies(limit = 10): MoviePerformance[] {
    return this.getMoviePerformance(limit);
  }

  // ── Showtime Status ──────────────────────────────────────────────────────

  getShowtimeStatuses(filters?: {
    date?: string;
    theaterId?: number;
    movieId?: number;
    status?: string;
    maxFillRate?: number;
    minFillRate?: number;
  }): ShowtimeStatus[] {
    let query = `
      SELECT s.id, s.movie_id, m.name AS movie_name, m.category,
             s.theater_id, t.name AS theater_name, t.screen_type,
             s.show_date, s.start_time, s.end_time,
             s.ticket_price, t.seat_count, s.seats_available,
             (t.seat_count - s.seats_available) AS seats_booked,
             ROUND(100.0 * (t.seat_count - s.seats_available) / t.seat_count, 1) AS fill_rate,
             s.status,
             COALESCE((SELECT SUM(b.total_price) FROM bookings b WHERE b.showtime_id = s.id), 0) AS revenue
      FROM showtimes s
      JOIN movies m ON s.movie_id = m.id
      JOIN theaters t ON s.theater_id = t.id
      WHERE 1=1
    `;
    const params: (string | number)[] = [];

    if (filters?.date) {
      query += " AND s.show_date = ?";
      params.push(filters.date);
    }
    if (filters?.theaterId) {
      query += " AND s.theater_id = ?";
      params.push(filters.theaterId);
    }
    if (filters?.movieId) {
      query += " AND s.movie_id = ?";
      params.push(filters.movieId);
    }
    if (filters?.status) {
      query += " AND s.status = ?";
      params.push(filters.status);
    }
    if (filters?.maxFillRate !== undefined) {
      query +=
        " AND ROUND(100.0 * (t.seat_count - s.seats_available) / t.seat_count, 1) <= ?";
      params.push(filters.maxFillRate);
    }
    if (filters?.minFillRate !== undefined) {
      query +=
        " AND ROUND(100.0 * (t.seat_count - s.seats_available) / t.seat_count, 1) >= ?";
      params.push(filters.minFillRate);
    }

    query += " ORDER BY s.show_date, s.start_time, t.name";

    return this.db.prepare(query).all(...params) as ShowtimeStatus[];
  }

  getSoldOutShowtimes(): ShowtimeStatus[] {
    return this.getShowtimeStatuses({ status: "sold_out" });
  }

  getLowFillShowtimes(maxFillRate = 25): ShowtimeStatus[] {
    return this.getShowtimeStatuses({ maxFillRate }).filter(
      (s) => s.status !== "cancelled" && s.status !== "completed" && s.status !== "sold_out"
    );
  }

  getHighDemandShowtimes(minFillRate = 80): ShowtimeStatus[] {
    return this.getShowtimeStatuses({ minFillRate }).filter(
      (s) => s.status !== "cancelled" && s.status !== "completed"
    );
  }

  // ── Genre Trends ─────────────────────────────────────────────────────────

  getGenreTrends(): GenreTrend[] {
    return this.db
      .prepare(
        `SELECT m.category,
                COUNT(DISTINCT s.id) AS total_showtimes,
                COALESCE(SUM(b.num_tickets), 0) AS total_tickets,
                COALESCE(SUM(b.total_price), 0) AS total_revenue,
                COALESCE(
                  ROUND(AVG(100.0 * (t.seat_count - s.seats_available) / t.seat_count), 1),
                  0
                ) AS avg_fill_rate,
                COUNT(DISTINCT b.id) AS booking_count
         FROM movies m
         JOIN showtimes s ON m.id = s.movie_id
         JOIN theaters t ON s.theater_id = t.id
         LEFT JOIN bookings b ON s.id = b.showtime_id
         GROUP BY m.category
         ORDER BY total_revenue DESC`
      )
      .all() as GenreTrend[];
  }

  // ── Screen Type Stats ────────────────────────────────────────────────────

  getScreenTypeStats(): ScreenTypeStats[] {
    return this.db
      .prepare(
        `SELECT t.screen_type,
                COUNT(DISTINCT t.id) AS theater_count,
                (SELECT SUM(t2.seat_count) FROM theaters t2 WHERE t2.screen_type = t.screen_type) AS total_seats,
                COUNT(DISTINCT s.id) AS total_showtimes,
                COALESCE(SUM(b.num_tickets), 0) AS total_tickets,
                COALESCE(SUM(b.total_price), 0) AS total_revenue,
                COALESCE(
                  ROUND(AVG(100.0 * (t.seat_count - s.seats_available) / t.seat_count), 1),
                  0
                ) AS avg_fill_rate
         FROM theaters t
         JOIN showtimes s ON t.id = s.theater_id
         LEFT JOIN bookings b ON s.id = b.showtime_id
         GROUP BY t.screen_type
         ORDER BY total_revenue DESC`
      )
      .all() as ScreenTypeStats[];
  }

  // ── Daily Snapshots ──────────────────────────────────────────────────────

  getDailySnapshots(): DailySnapshot[] {
    return this.db
      .prepare(
        `SELECT s.show_date AS date,
                COUNT(s.id) AS total_showtimes,
                SUM(t.seat_count) AS total_capacity,
                SUM(t.seat_count - s.seats_available) AS total_booked,
                ROUND(100.0 * SUM(t.seat_count - s.seats_available) / NULLIF(SUM(t.seat_count), 0), 1) AS fill_rate,
                COALESCE(SUM(
                  (SELECT COALESCE(SUM(b.total_price), 0) FROM bookings b WHERE b.showtime_id = s.id)
                ), 0) AS revenue,
                COALESCE(SUM(
                  (SELECT COUNT(*) FROM bookings b WHERE b.showtime_id = s.id)
                ), 0) AS bookings
         FROM showtimes s
         JOIN theaters t ON s.theater_id = t.id
         GROUP BY s.show_date
         ORDER BY s.show_date`
      )
      .all() as DailySnapshot[];
  }

  // ── Alerts ───────────────────────────────────────────────────────────────

  generateAlerts(): Alert[] {
    const alerts: Alert[] = [];

    // Sold out shows — might need extra screenings
    const soldOut = this.getSoldOutShowtimes();
    for (const s of soldOut) {
      alerts.push({
        type: "sold_out",
        severity: "info",
        message: `${s.movie_name} in ${s.theater_name} on ${s.show_date} at ${s.start_time} is sold out`,
        data: { showtimeId: s.id, movieId: s.movie_id, theaterId: s.theater_id },
      });
    }

    // Low fill showtimes — need promos or flash sales
    const lowFill = this.getLowFillShowtimes(15);
    for (const s of lowFill) {
      alerts.push({
        type: "low_fill",
        severity: "warning",
        message: `${s.movie_name} in ${s.theater_name} on ${s.show_date} at ${s.start_time} is only ${s.fill_rate}% full`,
        data: {
          showtimeId: s.id,
          movieId: s.movie_id,
          theaterId: s.theater_id,
          fillRate: s.fill_rate,
          seatsAvailable: s.seats_available,
        },
      });
    }

    // High demand — might want to add screenings
    const highDemand = this.getHighDemandShowtimes(90);
    for (const s of highDemand) {
      if (s.status !== "sold_out") {
        alerts.push({
          type: "high_demand",
          severity: "info",
          message: `${s.movie_name} in ${s.theater_name} on ${s.show_date} at ${s.start_time} is ${s.fill_rate}% full — consider adding a screening`,
          data: {
            showtimeId: s.id,
            movieId: s.movie_id,
            fillRate: s.fill_rate,
          },
        });
      }
    }

    // Expiring promos
    const expiringPromos = this.db
      .prepare(
        `SELECT id, name, end_date
         FROM promotions
         WHERE is_active = 1 AND end_date <= date('now', '+1 day')
         ORDER BY end_date`
      )
      .all() as { id: number; name: string; end_date: string }[];

    for (const p of expiringPromos) {
      alerts.push({
        type: "promo_expiring",
        severity: "warning",
        message: `Promotion "${p.name}" expires on ${p.end_date}`,
        data: { promotionId: p.id, endDate: p.end_date },
      });
    }

    return alerts;
  }

  // ── Full State ───────────────────────────────────────────────────────────

  getFullState(simTime: string): FullTheaterState {
    return {
      kpis: this.getKPIs(),
      theaters: this.getTheaterSummaries(),
      dailySnapshots: this.getDailySnapshots(),
      genreTrends: this.getGenreTrends(),
      screenTypeStats: this.getScreenTypeStats(),
      alerts: this.generateAlerts(),
      simTime,
    };
  }

  // ── Utility Queries ──────────────────────────────────────────────────────

  getTheaterAvailability(date: string): {
    theater_id: number;
    theater_name: string;
    screen_type: string;
    seat_count: number;
    showtimes_count: number;
    occupied_hours: number;
    available_hours: number;
  }[] {
    return this.db
      .prepare(
        `SELECT t.id AS theater_id, t.name AS theater_name, t.screen_type, t.seat_count,
                COUNT(s.id) AS showtimes_count,
                COALESCE(SUM(
                  (CAST(SUBSTR(s.end_time, 1, 2) AS INTEGER) * 60 + CAST(SUBSTR(s.end_time, 4, 2) AS INTEGER))
                  - (CAST(SUBSTR(s.start_time, 1, 2) AS INTEGER) * 60 + CAST(SUBSTR(s.start_time, 4, 2) AS INTEGER))
                ), 0) / 60.0 AS occupied_hours,
                14.0 - COALESCE(SUM(
                  (CAST(SUBSTR(s.end_time, 1, 2) AS INTEGER) * 60 + CAST(SUBSTR(s.end_time, 4, 2) AS INTEGER))
                  - (CAST(SUBSTR(s.start_time, 1, 2) AS INTEGER) * 60 + CAST(SUBSTR(s.start_time, 4, 2) AS INTEGER))
                ), 0) / 60.0 AS available_hours
         FROM theaters t
         LEFT JOIN showtimes s ON t.id = s.theater_id AND s.show_date = ?
         WHERE t.is_active = 1
         GROUP BY t.id
         ORDER BY available_hours DESC`
      )
      .all(date) as {
      theater_id: number;
      theater_name: string;
      screen_type: string;
      seat_count: number;
      showtimes_count: number;
      occupied_hours: number;
      available_hours: number;
    }[];
  }

  getRevenueByDate(): { date: string; revenue: number; tickets: number }[] {
    return this.db
      .prepare(
        `SELECT DATE(b.booked_at) AS date,
                SUM(b.total_price) AS revenue,
                SUM(b.num_tickets) AS tickets
         FROM bookings b
         GROUP BY DATE(b.booked_at)
         ORDER BY date`
      )
      .all() as { date: string; revenue: number; tickets: number }[];
  }

  getPromotionSummary(): {
    id: number;
    name: string;
    discount_type: string;
    discount_value: number;
    is_active: number;
    total_uses: number;
    total_discounted: number;
    total_revenue_from_promo: number;
  }[] {
    return this.db
      .prepare(
        `SELECT p.id, p.name, p.discount_type, p.discount_value, p.is_active,
                COUNT(b.id) AS total_uses,
                COALESCE(SUM(b.discount_amount), 0) AS total_discounted,
                COALESCE(SUM(b.total_price), 0) AS total_revenue_from_promo
         FROM promotions p
         LEFT JOIN promo_codes pc ON p.id = pc.promotion_id
         LEFT JOIN bookings b ON pc.id = b.promo_code_id
         GROUP BY p.id
         ORDER BY total_uses DESC`
      )
      .all() as {
      id: number;
      name: string;
      discount_type: string;
      discount_value: number;
      is_active: number;
      total_uses: number;
      total_discounted: number;
      total_revenue_from_promo: number;
    }[];
  }
}
