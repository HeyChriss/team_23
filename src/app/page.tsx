"use client";

import { useState } from "react";
import Dashboard from "@/components/Dashboard";
import SimulationPanel from "@/components/SimulationPanel";
import CustomersPanel from "@/components/CustomersPanel";

type Tab = "dashboard" | "simulation" | "customers";

export default function Home() {
  const [tab, setTab] = useState<Tab>("simulation");

  return (
    <div className="flex min-h-screen flex-col" style={{ background: "#08080a" }}>
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <header className="header-bg px-6 py-4">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg gold-glow" style={{ background: "var(--gold-glow)", border: "1px solid rgba(212,168,83,0.3)" }}>
              <span className="text-lg">&#9733;</span>
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-wide gold-text" style={{ fontFamily: "'Playfair Display', serif" }}>
                STARLIGHT CINEMAS
              </h1>
              <p className="text-xs tracking-widest uppercase" style={{ color: "var(--text-muted)" }}>
                AI-Powered Theater
              </p>
            </div>
          </div>

          {/* Tab navigation */}
          <nav className="flex gap-1 rounded-lg p-1" style={{ background: "var(--surface)" }}>
            {([
              { key: "dashboard", label: "Dashboard" },
              { key: "simulation", label: "Simulation" },
              { key: "customers", label: "Customers" },
            ] as { key: Tab; label: string }[]).map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`tab-pill ${tab === key ? "active" : ""}`}
              >
                {label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {/* ── Dashboard Tab ─────────────────────────────────────────────────── */}
      {tab === "dashboard" && (
        <main className="flex-1 overflow-y-auto">
          <Dashboard />
        </main>
      )}

      {/* ── Simulation Tab ────────────────────────────────────────────────── */}
      {tab === "simulation" && (
        <main className="flex-1 overflow-y-auto">
          <SimulationPanel />
        </main>
      )}

      {/* ── Customers Tab ────────────────────────────────────────────────── */}
      {tab === "customers" && (
        <main className="flex-1 overflow-y-auto">
          <CustomersPanel />
        </main>
      )}
    </div>
  );
}
