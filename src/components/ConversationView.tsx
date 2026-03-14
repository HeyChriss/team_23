"use client";

import { useState } from "react";
import type { ConversationEntry } from "@/lib/agents/types";

interface ConversationViewProps {
  conversations: ConversationEntry[];
}

export default function ConversationView({ conversations }: ConversationViewProps) {
  const [expanded, setExpanded] = useState<number | null>(null);

  if (conversations.length === 0) {
    return (
      <div className="flex items-center justify-center py-20" style={{ color: "var(--text-muted)" }}>
        No conversations yet — start the simulation to see customer interactions.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {conversations.map((conv, i) => {
        const isExpanded = expanded === i;
        const outcomeColor =
          conv.outcome === "booked"
            ? "var(--accent-green)"
            : conv.outcome === "left"
              ? "var(--accent-red)"
              : "var(--gold)";
        const outcomeLabel =
          conv.outcome === "booked"
            ? "Booked"
            : conv.outcome === "left"
              ? "Left"
              : "In Progress";

        return (
          <div
            key={i}
            className="surface-card animate-fade-in overflow-hidden rounded-xl transition-all"
          >
            {/* Header — always visible */}
            <button
              onClick={() => setExpanded(isExpanded ? null : i)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[#1f1f25]"
            >
              {/* Customer avatar */}
              <div
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold"
                style={{ background: "var(--gold-glow)", color: "var(--gold)" }}
              >
                {conv.customerName.charAt(0)}
              </div>

              {/* Name + preferences */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                    {conv.customerName}
                  </span>
                  <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                    {conv.personality.favoriteGenres.join(", ")} &middot; group of {conv.personality.groupSize}
                  </span>
                </div>
                {conv.bookingDetails && (
                  <div className="truncate text-xs" style={{ color: "var(--text-secondary)" }}>
                    {conv.bookingDetails.movie as string} &middot; ${(conv.bookingDetails.totalPrice as number)?.toFixed(2)}
                  </div>
                )}
              </div>

              {/* Outcome badge */}
              <span
                className="shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium"
                style={{ color: outcomeColor, background: `color-mix(in srgb, ${outcomeColor} 15%, transparent)` }}
              >
                {outcomeLabel}
              </span>

              {/* Expand arrow */}
              <span
                className="shrink-0 text-xs transition-transform"
                style={{
                  color: "var(--text-muted)",
                  transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
                }}
              >
                &#9660;
              </span>
            </button>

            {/* Expanded: conversation messages */}
            {isExpanded && (
              <div className="border-t px-4 py-3 space-y-2" style={{ borderColor: "var(--surface-border)" }}>
                {conv.messages.length === 0 ? (
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                    No message transcript available.
                  </p>
                ) : (
                  conv.messages.map((msg, j) => (
                    <div
                      key={j}
                      className={`flex ${msg.role === "customer" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed ${
                          msg.role === "customer" ? "msg-user" : "msg-bot"
                        }`}
                      >
                        {msg.content}
                      </div>
                    </div>
                  ))
                )}

                {/* Booking details card */}
                {conv.bookingDetails && (
                  <div
                    className="mt-2 rounded-lg p-3 text-xs"
                    style={{ background: "rgba(91, 217, 123, 0.08)", border: "1px solid rgba(91, 217, 123, 0.2)" }}
                  >
                    <div className="font-medium" style={{ color: "var(--accent-green)" }}>
                      Booking Confirmed
                    </div>
                    <div className="mt-1 grid grid-cols-2 gap-1" style={{ color: "var(--text-secondary)" }}>
                      <span>Movie: {conv.bookingDetails.movie as string}</span>
                      <span>Theater: {conv.bookingDetails.theater as string}</span>
                      <span>Time: {conv.bookingDetails.time as string}</span>
                      <span>Tickets: {conv.bookingDetails.tickets as number}</span>
                      <span>Total: ${(conv.bookingDetails.totalPrice as number)?.toFixed(2)}</span>
                      <span className="font-mono text-[10px]">{conv.bookingDetails.confirmationCode as string}</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
