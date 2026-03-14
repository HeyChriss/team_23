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
    <div className="mx-auto max-w-4xl space-y-6 px-6 py-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">Film Curator Agent</h2>
          <p className="mt-1 text-sm text-zinc-400">
            Curate the movie catalog — add new films, retire underperformers, balance genres
          </p>
        </div>
        <button
          onClick={runAutoRebalance}
          disabled={isLoading}
          className="rounded-xl border border-amber-500/50 bg-amber-500/10 px-4 py-2 text-sm font-medium text-amber-400 transition-colors hover:bg-amber-500/20 disabled:opacity-50"
        >
          Auto Rebalance
        </button>
      </div>

      {/* Chat area */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
        <div className="mb-4 max-h-96 space-y-3 overflow-y-auto">
          {messages.length === 0 && (
            <div className="py-12 text-center">
              <p className="text-4xl">🎬</p>
              <p className="mt-3 text-zinc-400">
                Ask the Curator to analyze the catalog, add movies, or retire underperformers.
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {[
                  "What's the genre distribution?",
                  "Which movies are underperforming?",
                  "Add a new horror movie",
                  "Analyze trends and suggest changes",
                ].map((s) => (
                  <button
                    key={s}
                    onClick={() => sendMessage({ text: s })}
                    className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 transition-colors hover:border-zinc-500 hover:text-white"
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
              className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[90%] rounded-xl px-4 py-3 ${
                  message.role === "user"
                    ? "bg-blue-600/80 text-white"
                    : "bg-zinc-800 text-zinc-100"
                }`}
              >
                {message.parts.map((part, i) => {
                  if (part.type === "text") {
                    return (
                      <div
                        key={`${message.id}-${i}`}
                        className="whitespace-pre-wrap text-sm"
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
                        className="my-1 rounded border border-zinc-600 bg-zinc-900/80 px-2 py-1 text-xs text-zinc-400"
                      >
                        {toolPart.state === "output-available"
                          ? `✓ ${toolPart.type.replace("tool-", "")}`
                          : `⟳ ${toolPart.type.replace("tool-", "")}...`}
                      </div>
                    );
                  }
                  return null;
                })}
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex justify-start">
              <div className="rounded-xl bg-zinc-800 px-4 py-3 text-sm text-zinc-400">
                <span className="animate-pulse">Curator thinking...</span>
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
          className="flex gap-2"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask the Curator to add movies, retire flops, or analyze the catalog..."
            className="flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-sm text-white placeholder-zinc-500 outline-none focus:border-amber-500"
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-amber-500 disabled:opacity-50"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
