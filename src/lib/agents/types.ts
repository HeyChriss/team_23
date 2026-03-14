// ── Shared types for multi-agent simulation ─────────────────────────────────

export interface AgentAction {
  agent: string;
  action: string;
  summary: string;
  data?: Record<string, unknown>;
}

export interface AgentResult {
  agent: string;
  actions: AgentAction[];
  error?: string;
}

export interface CustomerPersonality {
  name: string;
  favoriteGenres: string[];
  budgetSensitivity: "low" | "medium" | "high";
  groupSize: number;
  timePreference: "matinee" | "evening" | "any";
  spontaneity: number; // 0-1
}

export interface SimulationEvent {
  id?: number;
  sim_time: string;
  event_type: string;
  agent: string;
  summary: string;
  data?: string; // JSON string
}

export interface ConversationEntry {
  customerName: string;
  personality: CustomerPersonality;
  messages: { role: "customer" | "manager"; content: string }[];
  outcome: "booked" | "left" | "in_progress";
  bookingDetails?: Record<string, unknown>;
}

export interface ConversationUpdate {
  customerName: string;
  step: "greeting" | "browsing" | "checking" | "booking" | "booked" | "response" | "left";
  message: string;
  data?: Record<string, unknown>;
}

export interface SimulationTickResult {
  tickNumber: number;
  simTime: string;
  events: SimulationEvent[];
  conversations: ConversationEntry[];
  kpis: Record<string, unknown>;
}

export type SimEventType =
  | "booking"
  | "promotion_created"
  | "flash_sale"
  | "movie_swapped"
  | "showtime_added"
  | "showtime_cancelled"
  | "customer_arrived"
  | "customer_left"
  | "customer_booked"
  | "optimizer_action"
  | "promotion_sent"
  | "promotion_accepted"
  | "promotion_rejected"
  | "scheduler_action"
  | "tick_start"
  | "tick_end";
