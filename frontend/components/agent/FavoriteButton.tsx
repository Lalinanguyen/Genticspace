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
      className={
        favorited
          ? "w-9 h-9 rounded flex items-center justify-center cursor-pointer flex-none bg-amber/12 border border-amber/35"
          : "glass-chip w-9 h-9 rounded flex items-center justify-center cursor-pointer flex-none"
      }
    >
      <span className={`text-base leading-none ${favorited ? "text-amber" : "text-foreground"}`}>
        {favorited ? "★" : "☆"}
      </span>
    </div>
  );
}
