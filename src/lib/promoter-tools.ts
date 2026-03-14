import type Database from "better-sqlite3";

// ── Types ────────────────────────────────────────────────────────────────────

export interface CreatePromotionInput {
  name: string;
  description: string;
  discountType: "percent" | "fixed";
  discountValue: number;
  applicableMovieId?: number;
  applicableShowtimeId?: number;
  applicableCategory?: string;
  minTickets: number;
  maxDiscount?: number;
  startDate: string;
  endDate: string;
}

export interface CreatePromoCodeInput {
  promotionId: number;
  code: string;
  maxUses: number;
}

export interface CreateFlashSaleInput {
  showtimeId: number;
  discountPercent: number;
  maxUses: number;
}

export interface BookTicketsInput {
  showtimeId: number;
  numTickets: number;
  customerName: string;
  promoCode?: string;
}

// ── Tool Functions ───────────────────────────────────────────────────────────

export function createPromotion(db: Database.Database, input: CreatePromotionInput) {
  const result = db
    .prepare(
      `INSERT INTO promotions
       (name, description, discount_type, discount_value,
        applicable_movie_id, applicable_showtime_id, applicable_category,
        min_tickets, max_discount, start_date, end_date, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'promoter')`
    )
    .run(
      input.name, input.description, input.discountType, input.discountValue,
      input.applicableMovieId ?? null, input.applicableShowtimeId ?? null,
      input.applicableCategory ?? null, input.minTickets, input.maxDiscount ?? null,
      input.startDate, input.endDate,
    );

  return {
    success: true,
    promotionId: result.lastInsertRowid,
    name: input.name,
    discountType: input.discountType,
    discountValue: input.discountValue,
    startDate: input.startDate,
    endDate: input.endDate,
  };
}

export function createPromoCode(db: Database.Database, input: CreatePromoCodeInput) {
  const promo = db
    .prepare("SELECT id, name FROM promotions WHERE id = ?")
    .get(input.promotionId) as Record<string, unknown> | undefined;

  if (!promo) return { error: "Promotion not found" };

  const existing = db
    .prepare("SELECT id FROM promo_codes WHERE UPPER(code) = UPPER(?)")
    .get(input.code);

  if (existing) return { error: `Code "${input.code}" already exists.` };

  db.prepare(
    "INSERT INTO promo_codes (promotion_id, code, max_uses) VALUES (?, ?, ?)"
  ).run(input.promotionId, input.code.toUpperCase(), input.maxUses);

  return {
    success: true,
    code: input.code.toUpperCase(),
    promotionName: promo.name,
    maxUses: input.maxUses,
  };
}

export function deactivatePromotion(db: Database.Database, promotionId: number) {
  const promo = db
    .prepare("SELECT id, name FROM promotions WHERE id = ?")
    .get(promotionId) as Record<string, unknown> | undefined;

  if (!promo) return { error: "Promotion not found" };

  db.prepare("UPDATE promotions SET is_active = 0 WHERE id = ?").run(promotionId);
  db.prepare("UPDATE promo_codes SET is_active = 0 WHERE promotion_id = ?").run(promotionId);

  return { success: true, name: promo.name };
}

export function detectLowFillShowtimes(
  db: Database.Database,
  maxFillPercent: number,
  date?: string
) {
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
  return { threshold: `${maxFillPercent}%`, showtimes, count: showtimes.length };
}

export function createFlashSale(db: Database.Database, input: CreateFlashSaleInput) {
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
    .get(input.showtimeId) as Record<string, unknown> | undefined;

  if (!showtime) return { error: "Showtime not found" };

  const name = `Flash Sale: ${showtime.movie_name} @ ${showtime.start_time}`;
  const description = `${input.discountPercent}% off ${showtime.movie_name} in ${showtime.theater_name} (${showtime.screen_type}) on ${showtime.show_date} at ${showtime.start_time}. Currently ${showtime.fill_percent}% full.`;

  const promoResult = db
    .prepare(
      `INSERT INTO promotions
       (name, description, discount_type, discount_value,
        applicable_showtime_id, min_tickets, start_date, end_date, created_by)
       VALUES (?, ?, 'percent', ?, ?, 1, ?, ?, 'promoter')`
    )
    .run(
      name, description, input.discountPercent,
      input.showtimeId, showtime.show_date as string, showtime.show_date as string,
    );

  const promoId = promoResult.lastInsertRowid;
  const code = `FLASH${input.discountPercent}-${Date.now().toString(36).toUpperCase().slice(-5)}`;

  db.prepare(
    "INSERT INTO promo_codes (promotion_id, code, max_uses) VALUES (?, ?, ?)"
  ).run(promoId, code, input.maxUses);

  return {
    success: true,
    promotionId: promoId,
    code,
    movie: showtime.movie_name,
    theater: showtime.theater_name,
    currentFillRate: `${showtime.fill_percent}%`,
    discount: `${input.discountPercent}% off`,
    originalPrice: (showtime.ticket_price as number),
    salePrice: (showtime.ticket_price as number) * (1 - input.discountPercent / 100),
    maxUses: input.maxUses,
  };
}

export function bookTickets(db: Database.Database, input: BookTicketsInput) {
  const showtime = db
    .prepare(
      `SELECT s.*, m.name AS movie_name, m.category, t.name AS theater_name, t.screen_type
       FROM showtimes s
       JOIN movies m ON s.movie_id = m.id
       JOIN theaters t ON s.theater_id = t.id
       WHERE s.id = ?`
    )
    .get(input.showtimeId) as Record<string, unknown> | undefined;

  if (!showtime) return { error: "Showtime not found" };

  const available = showtime.seats_available as number;
  if (available < input.numTickets) {
    return { error: `Only ${available} seats remaining for this showing.` };
  }

  const unitPrice = showtime.ticket_price as number;
  let discountAmount = 0;
  let promoCodeId: number | null = null;
  let promoName: string | null = null;

  if (input.promoCode) {
    const pc = db
      .prepare(
        `SELECT pc.id, pc.promotion_id, pc.max_uses, pc.times_used,
                p.name, p.discount_type, p.discount_value, p.min_tickets,
                p.max_discount, p.applicable_movie_id, p.applicable_showtime_id,
                p.applicable_category, p.start_date, p.end_date, p.is_active AS promo_active
         FROM promo_codes pc
         JOIN promotions p ON pc.promotion_id = p.id
         WHERE UPPER(pc.code) = UPPER(?) AND pc.is_active = 1`
      )
      .get(input.promoCode) as Record<string, unknown> | undefined;

    if (!pc) return { error: "Invalid promo code." };
    if ((pc.times_used as number) >= (pc.max_uses as number))
      return { error: "This promo code has reached its usage limit." };
    if (!(pc.promo_active as number))
      return { error: "This promotion is no longer active." };
    if (input.numTickets < (pc.min_tickets as number))
      return { error: `This promo requires at least ${pc.min_tickets} tickets.` };
    if (pc.applicable_category && (pc.applicable_category as string).toLowerCase() !== (showtime.category as string).toLowerCase())
      return { error: `This promo is only for ${pc.applicable_category} movies.` };
    if (pc.applicable_showtime_id && pc.applicable_showtime_id !== input.showtimeId)
      return { error: "This promo code doesn't apply to this showtime." };

    if (pc.discount_type === "percent") {
      discountAmount = ((pc.discount_value as number) / 100) * unitPrice * input.numTickets;
    } else {
      discountAmount = (pc.discount_value as number) * input.numTickets;
    }
    if (pc.max_discount && discountAmount > (pc.max_discount as number)) {
      discountAmount = pc.max_discount as number;
    }
    discountAmount = Math.round(discountAmount * 100) / 100;

    promoCodeId = pc.id as number;
    promoName = pc.name as string;

    db.prepare("UPDATE promo_codes SET times_used = times_used + 1 WHERE id = ?").run(promoCodeId);
  }

  const totalPrice = Math.max(0, Math.round((unitPrice * input.numTickets - discountAmount) * 100) / 100);
  const confirmationCode = `SLC-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

  db.prepare(
    "UPDATE showtimes SET seats_available = seats_available - ?, status = CASE WHEN seats_available - ? <= 0 THEN 'sold_out' ELSE 'selling' END WHERE id = ?"
  ).run(input.numTickets, input.numTickets, input.showtimeId);

  db.prepare(
    `INSERT INTO bookings
     (showtime_id, customer_name, num_tickets, unit_price, discount_amount, total_price, promo_code_id, confirmation_code)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(input.showtimeId, input.customerName, input.numTickets, unitPrice, discountAmount, totalPrice, promoCodeId, confirmationCode);

  return {
    success: true,
    confirmationCode,
    customerName: input.customerName,
    movie: showtime.movie_name,
    tickets: input.numTickets,
    unitPrice,
    discountAmount,
    totalPrice,
    promoApplied: promoName,
  };
}

export function getPromotionPerformance(db: Database.Database) {
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
}

export function getRevenueStats(db: Database.Database, groupBy?: "date" | "movie" | "theater") {
  const overall = db
    .prepare(
      `SELECT COUNT(*) AS total_bookings,
              COALESCE(SUM(num_tickets), 0) AS total_tickets,
              COALESCE(SUM(total_price), 0) AS total_revenue,
              COALESCE(SUM(discount_amount), 0) AS total_discounts,
              COALESCE(AVG(total_price), 0) AS avg_booking_value
       FROM bookings`
    )
    .get() as Record<string, unknown>;

  let breakdown = null;
  if (groupBy === "movie") {
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
  }

  return { overall, breakdown };
}
