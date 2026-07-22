"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { favoriteAgent, unfavoriteAgent, getAgent, ApiError } from "@/lib/api";

export function FavoriteButton({ genticspaceId }: { genticspaceId: string }) {
  const { token } = useAuth();
  const [favorited, setFavorited] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) return;
    getAgent(genticspaceId, token)
      .then((a) => setFavorited(!!a.is_favorited))
      .catch(() => undefined);
  }, [genticspaceId, token]);

  if (!token) return null;

  async function toggle() {
    setBusy(true);
    try {
      if (favorited) {
        await unfavoriteAgent(genticspaceId, token!);
        setFavorited(false);
      } else {
        await favoriteAgent(genticspaceId, token!);
        setFavorited(true);
      }
    } catch (err) {
      if (!(err instanceof ApiError)) throw err;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      onClick={busy ? undefined : toggle}
      title={favorited ? "Remove from favorites" : "Add to favorites"}
      className="w-9 h-9 rounded flex items-center justify-center cursor-pointer flex-none"
      style={{
        background: favorited ? "rgba(53,192,176,.14)" : "rgba(244,247,243,.06)",
        border: `1px solid ${favorited ? "rgba(53,192,176,.4)" : "rgba(244,247,243,.14)"}`,
      }}
    >
      <span className="text-base leading-none" style={{ color: favorited ? "#35C0B0" : "#F4F7F3" }}>
        {favorited ? "★" : "☆"}
      </span>
    </div>
  );
}
