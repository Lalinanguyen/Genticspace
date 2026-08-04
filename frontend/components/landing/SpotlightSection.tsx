import { listAgents } from "@/lib/api";
import { SpotlightClient } from "./SpotlightClient";

export async function SpotlightSection() {
  let agents: Awaited<ReturnType<typeof listAgents>>["agents"] = [];
  try {
    const res = await listAgents({ page: 1, page_size: 4, with_photo: true });
    agents = res.agents;
  } catch {
    agents = [];
  }

  return <SpotlightClient agents={agents} />;
}
