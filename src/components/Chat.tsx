"use client";

import { useChat } from "@ai-sdk/react";
import { useState, useRef, useEffect, useCallback } from "react";
import { ToolResultCard } from "./ToolCards";

const suggestions = [
  { emoji: "🎬", text: "What movies are showing today?" },
  { emoji: "🎟️", text: "I'd like to book tickets" },
  { emoji: "🍿", text: "Show me the concession menu" },
  { emoji: "⭐", text: "Check my loyalty points" },
];

export default function Chat() {
  const [input, setInput] = useState("");
  const { messages, sendMessage, status } = useChat();
  const isLoading = status === "streaming" || status === "submitted";
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  // Auto-resize textarea
  const resizeTextarea = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 120) + "px";
  }, []);

  const handleSend = () => {
    if (!input.trim()) return;
    sendMessage({ text: input });
    setInput("");
    // Reset height after send
    setTimeout(() => {
      if (textareaRef.current) textareaRef.current.style.height = "auto";
    }, 0);
  };

  return (
    <>
      <main ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto max-w-3xl space-y-4">
          {/* ── Empty state ───────────────────── */}
          {messages.length === 0 && (
            <div className="py-20 text-center">
              <p className="text-5xl">🍿</p>
              <h2 className="mt-4 text-2xl font-semibold">
                Welcome to StarLight Cinemas
              </h2>
              <p className="mt-2 text-zinc-400">
                Your AI concierge for movies, tickets, and snacks
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                {suggestions.map(({ emoji, text }) => (
                  <button
                    key={text}
                    onClick={() => sendMessage({ text })}
                    className="rounded-full border border-zinc-700 px-4 py-2 text-sm text-zinc-300 transition-colors hover:border-zinc-500 hover:bg-zinc-800/50 hover:text-white"
                  >
                    {emoji} {text}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Messages ──────────────────────── */}
          {messages.map((message) => {
            // Separate text parts from tool parts
            const textParts = message.parts.filter((p) => p.type === "text");
            const toolParts = message.parts.filter((p) => p.type.startsWith("tool-"));

            return (
              <div key={message.id} className="space-y-2">
                {/* Text bubble */}
                {textParts.length > 0 && (
                  <div className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                        message.role === "user"
                          ? "bg-blue-600 text-white"
                          : "bg-zinc-800 text-zinc-100"
                      }`}
                    >
                      {textParts.map((part, i) => (
                        <div key={`${message.id}-text-${i}`} className="whitespace-pre-wrap">
                          {(part as { type: "text"; text: string }).text}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Tool cards — full width, outside bubble */}
                {toolParts.map((part, i) => (
                  <ToolResultCard
                    key={`${message.id}-tool-${i}`}
                    part={part as { type: string; state: string; result?: unknown }}
                  />
                ))}
              </div>
            );
          })}

          {/* ── Streaming indicator ───────────── */}
          {isLoading && messages.length > 0 && (() => {
            const last = messages[messages.length - 1];
            const hasText = last.parts.some((p) => p.type === "text" && (p as { text: string }).text);
            const hasToolRunning = last.parts.some(
              (p) => p.type.startsWith("tool-") && (p as { state: string }).state !== "output-available"
            );
            if (hasText || hasToolRunning) return null;
            return (
              <div className="flex justify-start">
                <div className="rounded-2xl bg-zinc-800 px-4 py-3 text-zinc-400">
                  <span className="animate-pulse">Thinking...</span>
                </div>
              </div>
            );
          })()}
        </div>
      </main>

      {/* ── Input ─────────────────────────────── */}
      <footer className="border-t border-zinc-800 px-6 py-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="mx-auto flex max-w-3xl gap-3"
        >
          <textarea
            ref={textareaRef}
            value={input}
            rows={1}
            onChange={(e) => {
              setInput(e.target.value);
              resizeTextarea();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Ask about movies, book tickets, or order snacks..."
            className="flex-1 resize-none rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-white placeholder-zinc-500 outline-none focus:border-blue-500"
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="self-end rounded-xl bg-blue-600 px-6 py-3 font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
          >
            Send
          </button>
        </form>
      </footer>
    </>
  );
}
