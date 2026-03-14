"use client";

import { useEffect, useState } from "react";

interface Customer {
  id: number;
  name: string;
  customer_type: string;
  age: number;
  preferences: string;
  loyalty_tier: string;
  visit_frequency: string;
  budget_preference: string;
  preferred_showtime: string;
  interested_in_concessions: number;
  group_size_preference: number;
  notes: string;
}

const TYPE_LABEL: Record<string, { label: string; className: string }> = {
  buyer: { label: "Ready to Buy", className: "bg-emerald-600/20 text-emerald-400 border-emerald-500/30" },
  persuadable: { label: "Needs Persuasion", className: "bg-amber-600/20 text-amber-400 border-amber-500/30" },
};

const TIER_COLORS: Record<string, string> = {
  None: "text-zinc-500",
  Silver: "text-zinc-300",
  Gold: "text-amber-400",
  Platinum: "text-purple-400",
};

function formatLabel(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function CustomersPanel() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "buyer" | "persuadable">("all");

  useEffect(() => {
    fetch("/api/customers")
      .then((r) => r.json())
      .then((d) => {
        setCustomers(d.customers);
        setLoading(false);
      });
  }, []);

  const filtered = customers.filter(
    (c) => filter === "all" || c.customer_type === filter
  );

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <span className="animate-pulse text-zinc-400">Loading customers...</span>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-6 py-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold" style={{ color: "var(--text)" }}>
            Customer Pool
          </h2>
          <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
            20 stub customers — agent will create and modify later
          </p>
        </div>
        <div className="flex gap-1 rounded-lg p-1" style={{ background: "var(--surface)" }}>
          {(["all", "buyer", "persuadable"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                filter === f
                  ? "bg-blue-600 text-white"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {f === "all" ? "All" : f === "buyer" ? "Ready to Buy" : "Needs Persuasion"}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border" style={{ borderColor: "var(--border)" }}>
        <table className="w-full text-left text-sm">
          <thead className="uppercase" style={{ background: "var(--surface)", color: "var(--text-muted)" }}>
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Age</th>
              <th className="px-4 py-3">Preferences</th>
              <th className="px-4 py-3">Tier</th>
              <th className="px-4 py-3">Frequency</th>
              <th className="px-4 py-3">Budget</th>
              <th className="px-4 py-3">Showtime</th>
              <th className="px-4 py-3">Group</th>
              <th className="px-4 py-3">Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y" style={{ borderColor: "var(--border)" }}>
            {filtered.map((c) => {
              const typeInfo = TYPE_LABEL[c.customer_type] || TYPE_LABEL.buyer;
              return (
                <tr
                  key={c.id}
                  className="transition-colors hover:bg-zinc-900/50"
                  style={{ background: "var(--bg)" }}
                >
                  <td className="px-4 py-3 font-medium" style={{ color: "var(--text)" }}>
                    {c.name}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${typeInfo.className}`}
                    >
                      {typeInfo.label}
                    </span>
                  </td>
                  <td className="px-4 py-3" style={{ color: "var(--text-muted)" }}>
                    {c.age}
                  </td>
                  <td className="px-4 py-3" style={{ color: "var(--text-muted)" }}>
                    {c.preferences}
                  </td>
                  <td className={`px-4 py-3 ${TIER_COLORS[c.loyalty_tier] || TIER_COLORS.None}`}>
                    {c.loyalty_tier}
                  </td>
                  <td className="px-4 py-3" style={{ color: "var(--text-muted)" }}>
                    {formatLabel(c.visit_frequency)}
                  </td>
                  <td className="px-4 py-3" style={{ color: "var(--text-muted)" }}>
                    {formatLabel(c.budget_preference)}
                  </td>
                  <td className="px-4 py-3" style={{ color: "var(--text-muted)" }}>
                    {formatLabel(c.preferred_showtime)}
                  </td>
                  <td className="px-4 py-3" style={{ color: "var(--text-muted)" }}>
                    {c.group_size_preference === 1 ? "Solo" : c.group_size_preference === 2 ? "Date" : `${c.group_size_preference}+`}
                  </td>
                  <td className="max-w-[200px] truncate px-4 py-3 text-xs" style={{ color: "var(--text-muted)" }} title={c.notes}>
                    {c.notes}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
        Showing {filtered.length} of {customers.length} customers
      </p>
    </div>
  );
}
