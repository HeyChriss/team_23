"use client";

import { useEffect, useRef } from "react";
import type { SimulationEvent } from "@/lib/agents/types";

const AGENT_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  optimizer:  { bg: "rgba(139, 92, 246, 0.15)", text: "#a78bfa", label: "OPT" },
  scheduler:  { bg: "rgba(91, 143, 217, 0.15)", text: "#5b8fd9", label: "SCH" },
  promoter:   { bg: "rgba(212, 168, 83, 0.15)",  text: "#d4a853", label: "PRO" },
  manager:    { bg: "rgba(91, 217, 123, 0.15)", text: "#5bd97b", label: "MGR" },
  customer:   { bg: "rgba(161, 161, 170, 0.1)",  text: "#8a8880", label: "CUS" },
  engine:     { bg: "rgba(100, 100, 110, 0.1)",  text: "#5a5850", label: "SYS" },
};

interface ActivityFeedProps {
  events: SimulationEvent[];
}

export default function ActivityFeed({ events }: ActivityFeedProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events.length]);

  if (events.length === 0) {
    return (
      <div className="flex items-center justify-center py-20" style={{ color: "var(--text-muted)" }}>
        No events yet — start the simulation to see activity.
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="max-h-[32rem] space-y-1.5 overflow-y-auto pr-1">
      {events.map((event, i) => {
        const agent = AGENT_COLORS[event.agent] || AGENT_COLORS.engine;
        return (
          <div
            key={event.id ?? i}
            className="animate-fade-in flex items-start gap-3 rounded-lg px-3 py-2"
            style={{ background: agent.bg }}
          >
            {/* Agent badge */}
            <span
              className="mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider"
              style={{ color: agent.text, background: "rgba(0,0,0,0.3)" }}
            >
              {agent.label}
            </span>

            {/* Content */}
            <div className="min-w-0 flex-1">
              <p className="text-sm leading-snug" style={{ color: "var(--text-primary)" }}>
                {event.summary}
              </p>
              {event.sim_time && (
                <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                  {new Date(event.sim_time).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                </span>
              )}
            </div>

            {/* Event type chip */}
            <span
              className="mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[10px]"
              style={{ background: "var(--surface)", color: "var(--text-muted)" }}
            >
              {event.event_type.replace(/_/g, " ")}
            </span>
          </div>
        );
      })}
    </div>
  );
}
