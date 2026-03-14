"use client";

interface KPIBarProps {
  revenue: number;
  ticketsSold: number;
  activePromos: number;
  avgFillRate: number;
  totalBookings: number;
  dayNumber: number;
}

function formatCurrency(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function KPIBar({
  revenue,
  ticketsSold,
  activePromos,
  avgFillRate,
  totalBookings,
  dayNumber,
}: KPIBarProps) {
  const items = [
    { label: "Revenue", value: formatCurrency(revenue), color: "var(--gold)" },
    { label: "Tickets", value: ticketsSold.toLocaleString(), color: "var(--text-primary)" },
    { label: "Bookings", value: totalBookings.toLocaleString(), color: "var(--text-primary)" },
    { label: "Fill Rate", value: `${avgFillRate}%`, color: avgFillRate > 60 ? "var(--accent-green)" : avgFillRate > 30 ? "var(--gold)" : "var(--accent-red)" },
    { label: "Promos", value: activePromos.toString(), color: "var(--accent-blue)" },
    { label: "Day", value: dayNumber.toString(), color: "var(--gold)" },
  ];

  return (
    <div className="surface-card flex items-center justify-between rounded-xl px-5 py-3">
      {items.map((item) => (
        <div key={item.label} className="text-center">
          <div className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
            {item.label}
          </div>
          <div className="text-lg font-bold tabular-nums" style={{ color: item.color }}>
            {item.value}
          </div>
        </div>
      ))}
    </div>
  );
}
