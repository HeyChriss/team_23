/**
 * Active Customer Agent — spawns customers who actively seek movies.
 * Each customer talks to the Manager Agent to find and book tickets.
 */

import type { CustomerPersonality, ConversationEntry } from "./types";
import { runManagerConversation } from "./manager-agent";

export async function runActiveCustomer(
  customer: CustomerPersonality,
  simTime: string
): Promise<ConversationEntry> {
  return runManagerConversation(customer, simTime);
}

export async function runActiveCustomerBatch(
  customers: CustomerPersonality[],
  simTime: string
): Promise<ConversationEntry[]> {
  const results = await Promise.allSettled(
    customers.map((c) => runActiveCustomer(c, simTime))
  );

  return results.map((r, i) => {
    if (r.status === "fulfilled") return r.value;
    return {
      customerName: customers[i].name,
      personality: customers[i],
      messages: [{ role: "manager" as const, content: `[Error: ${r.reason}]` }],
      outcome: "left" as const,
    };
  });
}
