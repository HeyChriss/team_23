"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useState } from "react";

const AUTO_PROMPTS = [
  "Analyze the current catalog. Check genre distribution and movie performance. Add 1-2 movies in under-represented or trending genres, and retire any clear underperformers.",
  "Run a full rebalance: get genre distribution, trend analysis, and movie performance. Add movies where needed and retire the worst performers.",
];

export default function CuratorPanel() {
  const [input, setInput] = useState("");
  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({ api: "/api/agents/curator" }),
  });
  const isLoading = status === "streaming" || status === "submitted";

  const runAutoRebalance = () => {
    sendMessage({
      text: AUTO_PROMPTS[0],
    });
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-6 py-8">
      {/* Header */}
      <div className="animate-fade-in flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold" style={{ fontFamily: "'Playfair Display', serif", color: "var(--text-primary)" }}>
            Film Curator Agent
          </h2>
          <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
            Curate the movie catalog — add new films, retire underperformers, balance genres
          </p>
        </div>
        <button
          onClick={runAutoRebalance}
          disabled={isLoading}
          className="rounded-lg px-5 py-2.5 text-sm font-semibold transition-all hover:translate-y-[-1px] disabled:opacity-40"
          style={{
            background: "var(--gold-glow)",
            border: "1px solid rgba(212,168,83,0.35)",
            color: "var(--gold)",
          }}
        >
          Auto Rebalance
        </button>
      </div>

      {/* Chat area */}
      <div className="animate-fade-in-delay-1 surface-card rounded-2xl p-5">
        <div className="mb-5 max-h-[28rem] space-y-4 overflow-y-auto pr-1">
          {messages.length === 0 && (
            <div className="py-14 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-xl" style={{ background: "var(--gold-glow)", border: "1px solid rgba(212,168,83,0.15)" }}>
                <span className="text-3xl">&#127916;</span>
              </div>
              <p style={{ color: "var(--text-secondary)" }}>
                Ask the Curator to analyze the catalog, add movies, or retire underperformers.
              </p>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                {[
                  "What's the genre distribution?",
                  "Which movies are underperforming?",
                  "Add a new horror movie",
                  "Analyze trends and suggest changes",
                ].map((s) => (
                  <button
                    key={s}
                    onClick={() => sendMessage({ text: s })}
                    className="suggestion-chip"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex animate-fade-in ${message.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[90%] rounded-xl px-4 py-3 ${
                  message.role === "user" ? "msg-user" : "msg-bot"
                }`}
              >
                {message.parts.map((part, i) => {
                  if (part.type === "text") {
                    return (
                      <div
                        key={`${message.id}-${i}`}
                        className="whitespace-pre-wrap text-sm leading-relaxed"
                      >
                        {part.text}
                      </div>
                    );
                  }
                  if (part.type.startsWith("tool-") && "state" in part) {
                    const toolPart = part as { type: string; state: string };
                    return (
                      <div
                        key={`${message.id}-${i}`}
                        className="my-1.5 flex items-center gap-2 rounded-lg px-3 py-2 text-xs"
                        style={{ background: "rgba(0,0,0,0.2)", color: "var(--text-secondary)" }}
                      >
                        <span className={toolPart.state === "output-available" ? "gold-text" : "animate-pulse"}>
                          {toolPart.state === "output-available" ? "&#10003;" : "&#9696;"}
                        </span>
                        <span className="font-mono">
                          {toolPart.type.replace("tool-", "")}
                        </span>
                      </div>
                    );
                  }
                  return null;
                })}
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex animate-fade-in justify-start">
              <div className="msg-bot rounded-xl px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="inline-block h-2 w-2 animate-pulse rounded-full" style={{ background: "var(--gold)" }} />
                  <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
                    Curator thinking...
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (input.trim()) {
              sendMessage({ text: input });
              setInput("");
            }
          }}
          className="flex gap-3"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask the Curator to add movies, retire flops, or analyze the catalog..."
            className="cinema-input flex-1 rounded-xl px-4 py-3 text-sm"
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="btn-send"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
