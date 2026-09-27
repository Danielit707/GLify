import { useAuth } from "@clerk/react";
import { useCallback, useEffect, useState } from "react";
import App from "./App";

const apiBase = import.meta.env.VITE_API_URL?.replace(/\/$/, "") ?? "";

function isFavoritesResponse(
  value: unknown,
): value is { favorites: string[]; graphSynced: boolean } {
  return (
    typeof value === "object" &&
    value !== null &&
    "favorites" in value &&
    Array.isArray(value.favorites) &&
    value.favorites.every((id) => typeof id === "string") &&
    "graphSynced" in value &&
    typeof value.graphSynced === "boolean"
  );
}

export default function AuthenticatedApp() {
  const { getToken, isLoaded, isSignedIn, userId } = useAuth();
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [favoritesLoading, setFavoritesLoading] = useState(true);
  const [favoritesError, setFavoritesError] = useState<string | null>(null);
  const [graphSyncPending, setGraphSyncPending] = useState(false);
  const [pendingFavoriteId, setPendingFavoriteId] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      setSavedIds([]);
      setFavoritesError(null);
      setGraphSyncPending(false);
      setFavoritesLoading(false);
      return;
    }

    const controller = new AbortController();
    setFavoritesLoading(true);
    setFavoritesError(null);
    setSavedIds([]);

    void (async () => {
      try {
        const token = await getToken();
        if (!token) throw new Error("Could not get a sign-in token. Please sign in again.");

        const response = await fetch(`${apiBase}/api/favorites`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`Could not load favorites (HTTP ${response.status}).`);
        }

        const payload: unknown = await response.json();
        if (!isFavoritesResponse(payload)) {
          throw new Error("Favorites API returned an unexpected response.");
        }
        setSavedIds(payload.favorites);
        setGraphSyncPending(!payload.graphSynced);
      } catch (error) {
        if (controller.signal.aborted) return;
        setSavedIds([]);
        setFavoritesError(
          error instanceof Error ? error.message : "Could not load your favorites.",
        );
      } finally {
        if (!controller.signal.aborted) setFavoritesLoading(false);
      }
    })();

    return () => controller.abort();
  }, [getToken, isLoaded, isSignedIn, userId]);

  const toggleFavorite = useCallback(async (workId: string) => {
    if (!isLoaded || !isSignedIn) return;

    setPendingFavoriteId(workId);
    setFavoritesError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error("Could not get a sign-in token. Please sign in again.");

      const isSaved = savedIds.includes(workId);
      const response = await fetch(`${apiBase}/api/favorites/${encodeURIComponent(workId)}`, {
        method: isSaved ? "DELETE" : "PUT",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        throw new Error(`Could not update favorite (HTTP ${response.status}).`);
      }
      const result: unknown = await response.json();
      if (
        typeof result !== "object" ||
        result === null ||
        !("graphSynced" in result) ||
        typeof result.graphSynced !== "boolean"
      ) {
        throw new Error("Favorites API returned an unexpected sync status.");
      }

      setSavedIds((current) =>
        isSaved
          ? current.filter((savedId) => savedId !== workId)
          : current.includes(workId) ? current : [...current, workId],
      );
      setGraphSyncPending(!result.graphSynced);
    } catch (error) {
      setFavoritesError(
        error instanceof Error ? error.message : "Could not update your favorites.",
      );
    } finally {
      setPendingFavoriteId(null);
    }
  }, [getToken, isLoaded, isSignedIn, savedIds, userId]);

  const accountStatus = !isLoaded
    ? "loading"
    : isSignedIn
      ? "signed-in"
      : "signed-out";

  return (
    <App
      accountStatus={accountStatus}
      savedIds={savedIds}
      favoritesLoading={favoritesLoading}
      favoritesError={favoritesError}
      graphSyncPending={graphSyncPending}
      pendingFavoriteId={pendingFavoriteId}
      onToggleFavorite={toggleFavorite}
    />
  );
}
