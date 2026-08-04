import type { Agent, Review } from "./types";

/**
 * The backend's column is `tracent_id` (its earlier genticspace_id rename
 * was reverted). `genticspace_id` is kept as a defensive fallback only, in
 * case a stale/rolled-back deploy is still serving the old field name.
 * Always read an agent's ID through this helper rather than either field
 * directly.
 */
export function agentId(agent: Pick<Agent, "genticspace_id" | "tracent_id"> | Pick<Review, "genticspace_id" | "tracent_id">): string {
  return agent.tracent_id || agent.genticspace_id || "";
}
