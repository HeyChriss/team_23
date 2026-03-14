"use client";

import { useEffect, useState, useRef } from "react";

interface Customer {
  id: number;
  name: string;
  customer_type: string;
  preferences: string;
}

type CustomerStatus = "idle" | "active" | "booked" | "left";

const POLL_MS = 2000;

export default function CustomerPoolLive() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [statuses, setStatuses] = useState<Map<string, CustomerStatus>>(new Map());
  const mountedRef = useRef(true);

  // Poll for customer pool
  useEffect(() => {
    mountedRef.current = true;
    const poll = () => {
      fetch("/api/customers")
        .then((r) => r.json())
        .then((d: { customers: Customer[] }) => {
          if (!mountedRef.current) return;
          setCustomers(d.customers);
        })
        .catch(() => {});
    };
    poll();
    const interval = setInterval(poll, POLL_MS);
    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, []);

  // Listen for simulation customer events
  useEffect(() => {
    const handler = (e: Event) => {
      const { customerName, status } = (e as CustomEvent).detail as {
        customerName: string;
        status: CustomerStatus;
      };
      if (customerName) {
        setStatuses((prev) => new Map(prev).set(customerName, status));
        // Auto-clear "left" status after 3s
        if (status === "left") {
          setTimeout(() => {
            setStatuses((prev) => {
              const next = new Map(prev);
              if (next.get(customerName) === "left") next.delete(customerName);
              return next;
            });
          }, 3000);
        }
      }
    };
    window.addEventListener("sim:customer-status", handler);
    return () => window.removeEventListener("sim:customer-status", handler);
  }, []);

  if (customers.length === 0) return null;

  const buyers = customers.filter((c) => c.customer_type === "buyer");
  const persuadable = customers.filter((c) => c.customer_type === "persuadable");

  return (
    <div className="surface-card rounded-xl p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-[0.15em] gold-text">
          Customer Pool
        </h3>
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
          {customers.length} waiting &middot; {buyers.length} buyers &middot;{" "}
          {persuadable.length} persuadable
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {customers.map((c) => {
          const status = statuses.get(c.name) || "idle";
          const isBuyer = c.customer_type === "buyer";

          return (
            <div
              key={c.id}
              className="group relative"
              title={`${c.name} — ${c.preferences}`}
            >
              <div
                className="flex h-10 w-10 items-center justify-center rounded-full text-[11px] font-semibold transition-all duration-300"
                style={{
                  background:
                    status === "booked"
                      ? "rgba(91,217,123,0.5)"
                      : status === "active"
                        ? "rgba(212,168,83,0.5)"
                        : status === "left"
                          ? "rgba(217,91,91,0.3)"
                          : isBuyer
                            ? "rgba(167,243,208,0.3)"
                            : "rgba(254,240,138,0.25)",
                  border:
                    status === "active"
                      ? "2px solid var(--gold)"
                      : status === "booked"
                        ? "2px solid var(--accent-green)"
                        : "1px solid rgba(255,255,255,0.1)",
                  color: "var(--text-primary)",
                  boxShadow:
                    status === "active"
                      ? "0 0 12px rgba(212,168,83,0.4)"
                      : status === "booked"
                        ? "0 0 12px rgba(91,217,123,0.4)"
                        : "none",
                  animation:
                    status === "active"
                      ? "pulse 1.5s ease-in-out infinite"
                      : undefined,
                  opacity: status === "left" ? 0.4 : 1,
                }}
              >
                {c.name.split(" ")[0][0]}
                {c.name.split(" ").pop()?.[0]}
              </div>
              {/* Hover tooltip */}
              <div
                className="pointer-events-none absolute -top-8 left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-md px-2 py-1 text-[10px] font-medium opacity-0 transition-opacity group-hover:opacity-100"
                style={{
                  background: "var(--surface-raised)",
                  border: "1px solid var(--surface-border)",
                  color: "var(--text-primary)",
                }}
              >
                {c.name}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
