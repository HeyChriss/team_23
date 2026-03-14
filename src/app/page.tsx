"use client";

import { useChat } from "@ai-sdk/react";
import { useState } from "react";
import Dashboard from "@/components/Dashboard";

type Tab = "chat" | "dashboard";

export default function Home() {
  const [tab, setTab] = useState<Tab>("chat");
  const [input, setInput] = useState("");
  const { messages, sendMessage, status } = useChat();
  const isLoading = status === "streaming" || status === "submitted";

  return (
    <div className="flex min-h-screen flex-col bg-zinc-950 text-white">
      {/* Header */}
      <header className="border-b border-zinc-800 px-6 py-4">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🎬</span>
            <div>
              <h1 className="text-xl font-bold tracking-tight">
                StarLight Cinemas
              </h1>
              <p className="text-sm text-zinc-400">
                AI-Powered Movie Theater Experience
              </p>
            </div>
          </div>

          {/* Tab switcher */}
          <div className="flex gap-1 rounded-lg bg-zinc-900 p-1">
            <button
              onClick={() => setTab("chat")}
              className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                tab === "chat"
                  ? "bg-blue-600 text-white"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Chat
            </button>
            <button
              onClick={() => setTab("dashboard")}
              className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                tab === "dashboard"
                  ? "bg-blue-600 text-white"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Dashboard
            </button>
          </div>
        </div>
      </header>

      {/* ── Dashboard Tab ──────────────────────────────── */}
      {tab === "dashboard" && (
        <main className="flex-1 overflow-y-auto">
          <Dashboard />
        </main>
      )}

      {/* ── Chat Tab ───────────────────────────────────── */}
      {tab === "chat" && (
        <>
          <main className="flex-1 overflow-y-auto px-6 py-6">
            <div className="mx-auto max-w-3xl space-y-4">
              {messages.length === 0 && (
                <div className="py-20 text-center">
                  <p className="text-5xl">🍿</p>
                  <h2 className="mt-4 text-2xl font-semibold">
                    Welcome to StarLight Cinemas
                  </h2>
                  <p className="mt-2 text-zinc-400">
                    Ask me about movies, showtimes, or book your tickets!
                  </p>
                  <div className="mt-6 flex flex-wrap justify-center gap-2">
                    {[
                      "What movies are showing today?",
                      "I'd like to book tickets",
                      "Show me the concession menu",
                      "Check my loyalty points",
                    ].map((suggestion) => (
                      <button
                        key={suggestion}
                        onClick={() => sendMessage({ text: suggestion })}
                        className="rounded-full border border-zinc-700 px-4 py-2 text-sm text-zinc-300 transition-colors hover:border-zinc-500 hover:text-white"
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
                  className={`flex ${
                    message.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                      message.role === "user"
                        ? "bg-blue-600 text-white"
                        : "bg-zinc-800 text-zinc-100"
                    }`}
                  >
                    {message.parts.map((part, i) => {
                      switch (part.type) {
                        case "text":
                          return (
                            <div
                              key={`${message.id}-${i}`}
                              className="whitespace-pre-wrap"
                            >
                              {part.text}
                            </div>
                          );
                        default: {
                          if (
                            part.type.startsWith("tool-") &&
                            "state" in part
                          ) {
                            const toolPart = part as {
                              type: string;
                              state: string;
                            };
                            return (
                              <div
                                key={`${message.id}-${i}`}
                                className="my-1 rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-zinc-400"
                              >
                                {toolPart.state === "output-available"
                                  ? `Done: ${toolPart.type.replace("tool-", "")}`
                                  : `Running: ${toolPart.type.replace("tool-", "")}...`}
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
                <div className="flex justify-start">
                  <div className="rounded-2xl bg-zinc-800 px-4 py-3 text-zinc-400">
                    <span className="animate-pulse">Thinking...</span>
                  </div>
                </div>
              )}
            </div>
          </main>

          {/* Input */}
          <footer className="border-t border-zinc-800 px-6 py-4">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (input.trim()) {
                  sendMessage({ text: input });
                  setInput("");
                }
              }}
              className="mx-auto flex max-w-3xl gap-3"
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask about movies, book tickets, or order snacks..."
                className="flex-1 rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-white placeholder-zinc-500 outline-none focus:border-blue-500"
              />
              <button
                type="submit"
                disabled={isLoading || !input.trim()}
                className="rounded-xl bg-blue-600 px-6 py-3 font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
              >
                Send
              </button>
            </form>
          </footer>
        </>
      )}
    </div>
  );
}
