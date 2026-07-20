// Generic fallback icon (coolicons "code" glyph, via Iconify's ci set) shown
// when an agent has no real photo of its own. Deliberately NOT a GitHub/HF
// developer profile picture — that's a person's photo, not the agent's.
function FallbackIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-1/2 h-1/2 text-foreground-faint" fill="none">
      <path
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        d="m15 7l5 5l-5 5m-6 0l-5-5l5-5"
      />
    </svg>
  );
}

export function AgentAvatar({
  imageUrl,
  size = 48,
  className = "",
}: {
  imageUrl?: string | null;
  size?: number;
  className?: string;
}) {
  if (imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={imageUrl}
        alt=""
        className={`rounded flex-none object-cover bg-surface border border-border ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className={`rounded flex-none bg-surface border border-border flex items-center justify-center ${className}`}
      style={{ width: size, height: size }}
    >
      <FallbackIcon />
    </div>
  );
}
