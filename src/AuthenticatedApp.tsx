import { useAuth } from "@clerk/react";
import { useCallback, useEffect, useState } from "react";
import App, { type PersonalizedRecommendation } from "./App";

const apiBase = import.meta.env.VITE_API_URL?.replace(/\/$/, "") ?? "";

interface LibraryResponse {
  favorites: string[];
  watched: string[];
  commented?: string[];
  shareActivity: boolean;
  graphSynced: boolean;
}

function isLibraryResponse(
  value: unknown,
): value is LibraryResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    "favorites" in value &&
    Array.isArray(value.favorites) &&
    value.favorites.every((id) => typeof id === "string") &&
    "watched" in value &&
    Array.isArray(value.watched) &&
    value.watched.every((id) => typeof id === "string") &&
    (!("commented" in value) || (Array.isArray(value.commented) && value.commented.every((id) => typeof id === "string"))) &&
    "shareActivity" in value &&
    typeof value.shareActivity === "boolean" &&
    "graphSynced" in value &&
    typeof value.graphSynced === "boolean"
  );
}

function isRecommendation(value: unknown): value is PersonalizedRecommendation {
  if (typeof value !== "object" || value === null) return false;
  const recommendation = value as Record<string, unknown>;
  return (
    typeof recommendation.id === "string" &&
    typeof recommendation.title === "string" &&
    typeof recommendation.format === "string" &&
    typeof recommendation.tagFitScore === "number" &&
    typeof recommendation.similarMemberScore === "number" &&
    typeof recommendation.recommendationScore === "number" &&
    Array.isArray(recommendation.sharedTags) &&
    recommendation.sharedTags.every((tag) => typeof tag === "string") &&
    typeof recommendation.similarMemberCount === "number"
  );
}

function isRecommendationsResponse(
  value: unknown,
): value is { recommendations: PersonalizedRecommendation[]; coldStart: boolean } {
  if (typeof value !== "object" || value === null) return false;
  const response = value as Record<string, unknown>;
  return (
    Array.isArray(response.recommendations) &&
    response.recommendations.every(isRecommendation) &&
    typeof response.coldStart === "boolean"
  );
}

export default function AuthenticatedApp() {
  const { getToken, isLoaded, isSignedIn, userId } = useAuth();
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [watchedIds, setWatchedIds] = useState<string[]>([]);
  const [commentedIds, setCommentedIds] = useState<string[]>([]);
  const [shareActivity, setShareActivity] = useState(false);
  const [participationPending, setParticipationPending] = useState(false);
  const [favoritesLoading, setFavoritesLoading] = useState(true);
  const [favoritesError, setFavoritesError] = useState<string | null>(null);
  const [recommendations, setRecommendations] = useState<PersonalizedRecommendation[]>([]);
  const [recommendationsLoading, setRecommendationsLoading] = useState(false);
  const [recommendationsError, setRecommendationsError] = useState<string | null>(null);
  const [recommendationsColdStart, setRecommendationsColdStart] = useState(false);
  const [graphSyncPending, setGraphSyncPending] = useState(false);
  const [pendingFavoriteId, setPendingFavoriteId] = useState<string | null>(null);
  const [pendingWatchedId, setPendingWatchedId] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      setSavedIds([]);
      setWatchedIds([]);
      setCommentedIds([]);
      setShareActivity(false);
      setRecommendations([]);
      setRecommendationsError(null);
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

        const response = await fetch(`${apiBase}/api/library`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`Could not load your account library (HTTP ${response.status}).`);
        }

        const payload: unknown = await response.json();
        if (!isLibraryResponse(payload)) {
          throw new Error("Library API returned an unexpected response.");
        }
        setSavedIds(payload.favorites);
        setWatchedIds(payload.watched);
        setCommentedIds(payload.commented ?? []);
        setShareActivity(payload.shareActivity);
        setGraphSyncPending(!payload.graphSynced);
      } catch (error) {
        if (controller.signal.aborted) return;
        setSavedIds([]);
        setWatchedIds([]);
        setCommentedIds([]);
        setShareActivity(false);
        setFavoritesError(
          error instanceof Error ? error.message : "Could not load your account library.",
        );
      } finally {
        if (!controller.signal.aborted) setFavoritesLoading(false);
      }
    })();

    return () => controller.abort();
  }, [getToken, isLoaded, isSignedIn, userId]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn || favoritesLoading) return;

    const controller = new AbortController();
    setRecommendationsLoading(true);
    setRecommendationsError(null);
    void (async () => {
      try {
        const token = await getToken();
        if (!token) throw new Error("Could not get a sign-in token. Please sign in again.");
        const response = await fetch(`${apiBase}/api/recommendations?limit=8`, {
          headers: { Authorization: "Bearer " + token },
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`Could not load recommendations (HTTP ${response.status}).`);
        }
        const payload: unknown = await response.json();
        if (!isRecommendationsResponse(payload)) {
          throw new Error("Recommendations API returned an unexpected response.");
        }
        setRecommendations(payload.recommendations);
        setRecommendationsColdStart(payload.coldStart);
      } catch (error) {
        if (controller.signal.aborted) return;
        setRecommendations([]);
        setRecommendationsError(
          error instanceof Error ? error.message : "Could not load personalized recommendations.",
        );
      } finally {
        if (!controller.signal.aborted) setRecommendationsLoading(false);
      }
    })();

    return () => controller.abort();
  }, [favoritesLoading, getToken, isLoaded, isSignedIn, savedIds, userId, watchedIds]);

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

  const toggleWatched = useCallback(async (workId: string) => {
    if (!isLoaded || !isSignedIn) return;

    setPendingWatchedId(workId);
    setFavoritesError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error("Could not get a sign-in token. Please sign in again.");
      const isWatched = watchedIds.includes(workId);
      const response = await fetch(`${apiBase}/api/activity/${encodeURIComponent(workId)}`, {
        method: isWatched ? "DELETE" : "PUT",
        headers: { Authorization: "Bearer " + token },
      });
      if (!response.ok) {
        throw new Error(`Could not update watched/read status (HTTP ${response.status}).`);
      }
      const result: unknown = await response.json();
      if (
        typeof result !== "object" ||
        result === null ||
        !("graphSynced" in result) ||
        typeof result.graphSynced !== "boolean"
      ) {
        throw new Error("Activity API returned an unexpected sync status.");
      }
      setWatchedIds((current) =>
        isWatched
          ? current.filter((id) => id !== workId)
          : current.includes(workId) ? current : [...current, workId],
      );
      setGraphSyncPending(!result.graphSynced);
    } catch (error) {
      setFavoritesError(
        error instanceof Error ? error.message : "Could not update your watched/read list.",
      );
    } finally {
      setPendingWatchedId(null);
    }
  }, [getToken, isLoaded, isSignedIn, userId, watchedIds]);

  const setRecommendationParticipation = useCallback(async (enabled: boolean) => {
    if (!isLoaded || !isSignedIn) return;

    setParticipationPending(true);
    setFavoritesError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error("Could not get a sign-in token. Please sign in again.");
      const response = await fetch(`${apiBase}/api/recommendations/participation`, {
        method: "PUT",
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ shareActivity: enabled }),
      });
      if (!response.ok) {
        throw new Error(`Could not update recommendation privacy (HTTP ${response.status}).`);
      }
      const payload: unknown = await response.json();
      if (
        typeof payload !== "object" ||
        payload === null ||
        !("shareActivity" in payload) ||
        typeof payload.shareActivity !== "boolean"
      ) {
        throw new Error("Recommendation privacy API returned an unexpected response.");
      }
      setShareActivity(payload.shareActivity);
    } catch (error) {
      setFavoritesError(
        error instanceof Error ? error.message : "Could not update recommendation privacy.",
      );
    } finally {
      setParticipationPending(false);
    }
  }, [getToken, isLoaded, isSignedIn]);

  const accountStatus = !isLoaded
    ? "loading"
    : isSignedIn
      ? "signed-in"
      : "signed-out";

  return (
    <App
      accountStatus={accountStatus}
      savedIds={savedIds}
      watchedIds={watchedIds}
      commentedIds={commentedIds}
      shareActivity={shareActivity}
      participationPending={participationPending}
      recommendations={recommendations}
      recommendationsLoading={recommendationsLoading}
      recommendationsError={recommendationsError}
      recommendationsColdStart={recommendationsColdStart}
      favoritesLoading={favoritesLoading}
      favoritesError={favoritesError}
      graphSyncPending={graphSyncPending}
      pendingFavoriteId={pendingFavoriteId}
      pendingWatchedId={pendingWatchedId}
      onToggleFavorite={toggleFavorite}
      onToggleWatched={toggleWatched}
      onSetRecommendationParticipation={setRecommendationParticipation}
    />
  );
}
