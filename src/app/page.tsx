"use client";

import { useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import Dashboard from "@/components/Dashboard";
import SimulationPanel from "@/components/SimulationPanel";
import CustomersPanel from "@/components/CustomersPanel";

type Tab = "chat" | "dashboard" | "simulation" | "customers";

export default function Home() {
  const [tab, setTab] = useState<Tab>("chat");
  const [input, setInput] = useState("");
  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({ api: "/api/chat" }),
  });
  const isLoading = status === "streaming" || status === "submitted";

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
              { key: "chat", label: "Chat" },
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

      {/* ── Chat Tab ──────────────────────────────────────────────────────── */}
      {tab === "chat" && (
        <>
          <main className="flex-1 overflow-y-auto px-6 py-8">
            <div className="mx-auto max-w-3xl space-y-5">
              {messages.length === 0 && (
                <div className="animate-fade-in py-24 text-center">
                  <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl" style={{ background: "var(--gold-glow)", border: "1px solid rgba(212,168,83,0.2)" }}>
                    <span className="text-4xl">&#127871;</span>
                  </div>
                  <h2 className="text-2xl font-semibold" style={{ fontFamily: "'Playfair Display', serif", color: "var(--text-primary)" }}>
                    Welcome to StarLight
                  </h2>
                  <p className="mt-3 text-sm" style={{ color: "var(--text-secondary)" }}>
                    Your personal cinema concierge. Ask about movies, showtimes, or book tickets.
                  </p>
                  <div className="mt-8 flex flex-wrap justify-center gap-3">
                    {[
                      "What movies are showing today?",
                      "I'd like to book tickets",
                      "Show me the concession menu",
                      "Check my loyalty points",
                    ].map((suggestion, i) => (
                      <button
                        key={suggestion}
                        onClick={() => sendMessage({ text: suggestion })}
                        className={`suggestion-chip animate-fade-in-delay-${i + 1}`}
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex animate-fade-in ${
                    message.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`max-w-[80%] rounded-2xl px-5 py-3.5 ${
                      message.role === "user" ? "msg-user" : "msg-bot"
                    }`}
                  >
                    {message.parts.map((part, i) => {
                      switch (part.type) {
                        case "text":
                          return (
                            <div key={`${message.id}-${i}`} className="whitespace-pre-wrap text-sm leading-relaxed">
                              {part.text}
                            </div>
                          );
                        default: {
                          if (part.type.startsWith("tool-") && "state" in part) {
                            const toolPart = part as { type: string; state: string };
                            return (
                              <div key={`${message.id}-${i}`}
                                className="my-1.5 flex items-center gap-2 rounded-lg px-3 py-2 text-xs"
                                style={{ background: "rgba(0,0,0,0.2)", color: "var(--text-secondary)" }}>
                                <span className={toolPart.state === "output-available" ? "gold-text" : "animate-pulse"}>
                                  {toolPart.state === "output-available" ? "&#10003;" : "&#9696;"}
                                </span>
                                <span className="font-mono">{toolPart.type.replace("tool-", "")}</span>
                              </div>
                            );
                          }
                          return null;
                        }
                      }
                    })}
                  </div>
                </div>
              ))}

              {isLoading && (
                <div className="flex animate-fade-in justify-start">
                  <div className="msg-bot rounded-2xl px-5 py-3.5">
                    <div className="flex items-center gap-2">
                      <span className="inline-block h-2 w-2 animate-pulse rounded-full" style={{ background: "var(--gold)" }} />
                      <span className="text-sm" style={{ color: "var(--text-secondary)" }}>Thinking...</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </main>

          <footer className="px-6 py-5" style={{ borderTop: "1px solid var(--surface-border)" }}>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (input.trim()) { sendMessage({ text: input }); setInput(""); }
              }}
              className="mx-auto flex max-w-3xl gap-3"
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask about movies, book tickets, or order snacks..."
                className="cinema-input flex-1 rounded-xl px-5 py-3.5 text-sm"
              />
              <button type="submit" disabled={isLoading || !input.trim()} className="btn-send">
                Send
              </button>
            </form>
          </footer>
        </>
      )}
    </div>
  );
}
