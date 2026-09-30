import { useEffect, useState } from "react";
import { Search, UsersRound } from "lucide-react";
import { useAuth, useUser } from "@clerk/react";

type AccountStatus = "disabled" | "loading" | "signed-out" | "signed-in";

interface MatchUser {
  userId: string;
  username: string;
  nametag: string;
  avatarUrl: string | null;
  sharedWatched: number;
  sharedFavorites: number;
  sharedCommunities: number;
  matchScore: number;
  matchPercentage: number;
}

export default function UserMatches({
  accountStatus,
}: {
  accountStatus: AccountStatus;
}) {
  const [matches, setMatches] = useState<MatchUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const { getToken } = useAuth();
  const { user } = useUser();

  useEffect(() => {
    if (accountStatus !== "signed-in") {
      setLoading(false);
      return;
    }
    const fetchMatches = async () => {
      try {
        const apiBase = import.meta.env.VITE_API_URL?.replace(/\/$/, "") ?? "";
        const token = await getToken();
        const response = await fetch(`${apiBase}/api/users/match`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        if (!response.ok) throw new Error("Failed to load matches");
        const payload = await response.json();
        setMatches(payload.matches);
      } catch (error) {
        console.error("Failed to load user matches:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchMatches();
  }, [accountStatus, getToken, user]);

  if (accountStatus === "disabled") return null;

  if (accountStatus === "signed-out") {
    return (
      <div className="community-empty">
        <span><UsersRound size={28} /></span>
        <h3>Sign in to find matching members</h3>
        <p>See who shares your taste in stories based on watched, favorites, and communities.</p>
      </div>
    );
  }

  if (loading) {
    return <p className="favorites-prompt" role="status">Finding matching members…</p>;
  }

  // Show top 15 matches, filtered by search query
  const filteredMatches = searchQuery.trim()
    ? matches.filter(
        (m) =>
          m.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
          m.nametag.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : matches.slice(0, 15);

  if (matches.length === 0) {
    return (
      <div className="community-empty">
        <span><UsersRound size={28} /></span>
        <h3>No matching members yet</h3>
        <p>Add favorites, mark works watched, or join communities to find members with similar interests.</p>
      </div>
    );
  }

  return (
    <div className="user-matches-container">
      <div className="user-matches-search">
        <div className="search-input-wrapper">
          <Search size={16} />
          <input
            type="text"
            placeholder="Search users by username..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        {!searchQuery && (
          <p className="user-matches-count">Top 15 matching members</p>
        )}
      </div>
      <div className="user-matches">
        {filteredMatches.map((match) => (
          <div className="user-match-card" key={match.userId}>
            <img
              className="user-match-avatar"
              src={match.avatarUrl ?? "https://ui-avatars.com/api/?name=" + encodeURIComponent(match.nametag)}
              alt={match.nametag}
            />
            <div className="user-match-info">
              <h4>{match.nametag}</h4>
              <p className="user-match-username">@{match.username}</p>
              <div className="user-match-stats">
                <span>{match.sharedWatched} watched</span>
                <span>{match.sharedFavorites} favorites</span>
                <span>{match.sharedCommunities} communities</span>
              </div>
            </div>
            <div className="user-match-score">
              <span>{match.matchPercentage}% match</span>
            </div>
          </div>
        ))}
      </div>
      {filteredMatches.length === 0 && searchQuery && (
        <div className="community-empty">
          <span><Search size={28} /></span>
          <h3>No users found</h3>
          <p>No users match "{searchQuery}". Try a different username.</p>
        </div>
      )}
    </div>
  );
}
