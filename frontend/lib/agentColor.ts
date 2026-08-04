// Same palette as the homepage spotlight (SpotlightClient.tsx) so agent
// cards read consistently across the site.
export const CARD_COLORS = ["#35C0B0", "#072AC8", "#EF233C", "#E8A33D"];

export function agentColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return CARD_COLORS[hash % CARD_COLORS.length];
}
