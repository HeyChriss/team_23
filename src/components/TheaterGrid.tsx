"use client";

import TheaterCard from "./TheaterCard";

interface TheaterSummary {
  id: number;
  name: string;
  seat_count: number;
  screen_type: string;
  is_active: number;
  total_showtimes: number;
  total_capacity: number;
  total_booked: number;
  fill_rate: number;
}

interface TheaterGridProps {
  theaters: TheaterSummary[];
}

export default function TheaterGrid({ theaters }: TheaterGridProps) {
  return (
    <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
      {theaters.map((t) => (
        <TheaterCard
          key={t.id}
          name={t.name}
          screenType={t.screen_type}
          seatCount={t.seat_count}
          fillRate={t.fill_rate}
          totalBooked={t.total_booked}
          totalCapacity={t.total_capacity}
          isActive={!!t.is_active}
        />
      ))}
    </div>
  );
}
