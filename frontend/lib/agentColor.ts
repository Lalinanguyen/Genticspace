const PALETTE = ["#072AC8", "#35C0B0", "#EF233C"];

/** Deterministic per-agent accent color so the same agent always renders the same banner/avatar tint. */
export function agentColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return PALETTE[Math.abs(hash) % PALETTE.length];
}
