import { useEffect, useState } from "react";
import { Heart, Plus, Sparkles, Star, Trash2, UsersRound } from "lucide-react";
import { useAuth } from "@clerk/react";

interface Ship {
  id: string;
  name: string;
  image: string;
  characters: string;
  createdBy: string;
  createdAt: string;
  creator: {
    username: string;
    nametag: string;
    avatarUrl: string | null;
  };
  likeCount: number;
  isLiked: boolean;
  isFavorited: boolean;
}

export default function Ships({
  accountStatus,
  onSelectUser,
}: {
  accountStatus: string;
  onSelectUser: (userId: string) => void;
}) {
  const [ships, setShips] = useState<Ship[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [image, setImage] = useState("");
  const [characters, setCharacters] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { getToken, userId } = useAuth();

  const fetchShips = async () => {
    try {
      const apiBase = import.meta.env.VITE_API_URL?.replace(/\/$/, "") ?? "";
      const token = await getToken();
      const response = await fetch(`${apiBase}/api/ships`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (response.ok) {
        const payload = await response.json();
        setShips(payload.ships);
      }
    } catch (error) {
      console.error("Failed to load ships:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchShips();
  }, [accountStatus]);

  async function createShip() {
    if (!name.trim() || !image.trim() || !characters.trim()) return;
    setSubmitting(true);
    try {
      const apiBase = import.meta.env.VITE_API_URL?.replace(/\/$/, "") ?? "";
      const token = await getToken();
      const response = await fetch(`${apiBase}/api/ships`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: name.trim(), image: image.trim(), characters: characters.trim() }),
      });
      if (response.ok) {
        setName("");
        setImage("");
        setCharacters("");
        setShowCreate(false);
        fetchShips();
      }
    } catch (error) {
      console.error("Failed to create ship:", error);
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleLike(shipId: string) {
    if (accountStatus !== "signed-in") return;
    try {
      const apiBase = import.meta.env.VITE_API_URL?.replace(/\/$/, "") ?? "";
      const token = await getToken();
      const response = await fetch(`${apiBase}/api/ships/${shipId}/like`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const payload = await response.json();
        setShips((prev) =>
          prev.map((s) =>
            s.id === shipId
              ? {
                  ...s,
                  isLiked: payload.liked,
                  likeCount: payload.liked ? s.likeCount + 1 : s.likeCount - 1,
                }
              : s
          )
        );
      }
    } catch (error) {
      console.error("Failed to like ship:", error);
    }
  }

  async function toggleFavorite(shipId: string) {
    if (accountStatus !== "signed-in") return;
    try {
      const apiBase = import.meta.env.VITE_API_URL?.replace(/\/$/, "") ?? "";
      const token = await getToken();
      const response = await fetch(`${apiBase}/api/ships/${shipId}/favorite`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const payload = await response.json();
        setShips((prev) =>
          prev.map((s) => (s.id === shipId ? { ...s, isFavorited: payload.favorited } : s))
        );
      }
    } catch (error) {
      console.error("Failed to favorite ship:", error);
    }
  }

  async function deleteShip(shipId: string) {
    try {
      const apiBase = import.meta.env.VITE_API_URL?.replace(/\/$/, "") ?? "";
      const token = await getToken();
      const response = await fetch(`${apiBase}/api/ships/${shipId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("Failed to delete ship");
      setShips((current) => current.filter((ship) => ship.id !== shipId));
    } catch (error) {
      console.error("Failed to delete ship:", error);
    }
  }

  if (loading) return <p className="favorites-prompt">Loading ships...</p>;

  return (
    <section className="content-width" style={{ padding: "40px 0 76px" }}>
      <div className="section-heading">
        <div>
          <span className="section-kicker"><Sparkles size={14} /> FAN FAVORITES</span>
          <h2>Ships & Pairings</h2>
          <p>Create, like, and favorite your top pairings.</p>
        </div>
        {accountStatus === "signed-in" && (
          <button type="button" className="create-community-button" onClick={() => setShowCreate(!showCreate)}>
            <Plus size={14} /> Create ship
          </button>
        )}
      </div>

      {showCreate && (
        <div className="create-community-form">
          <h3>Create a Ship</h3>
          <label>
            <span>Ship Name (e.g., Korrasami)</span>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ship Name" />
          </label>
          <label>
            <span>Image URL</span>
            <input type="url" value={image} onChange={(e) => setImage(e.target.value)} placeholder="https://example.com/image.jpg" />
            <small className="image-guidance">Portrait images close to 736 × 883 px work best. Other sizes are cropped to fit.</small>
          </label>
          <label>
            <span>Characters (comma separated)</span>
            <input type="text" value={characters} onChange={(e) => setCharacters(e.target.value)} placeholder="Korra, Asami" />
          </label>
          <div className="form-actions">
            <button type="button" className="submit-community" onClick={createShip} disabled={submitting}>
              {submitting ? "Creating..." : "Create ship"}
            </button>
            <button type="button" className="cancel-community" onClick={() => setShowCreate(false)}>Cancel</button>
          </div>
        </div>
      )}

      {ships.length === 0 ? (
        <div className="community-empty">
          <span><UsersRound size={28} /></span>
          <h3>No ships created yet</h3>
          <p>Be the first to create a ship pairing for your favorite characters!</p>
        </div>
      ) : (
        <div className="ships-grid">
          {ships.map((ship) => (
            <article className="ship-card" key={ship.id}>
              <div className="ship-card-image">
                <img src={ship.image} alt={ship.name} loading="lazy" />
              </div>
              <div className="ship-card-info">
                <h3>{ship.name}</h3>
                <p>{ship.characters}</p>
                <p className="ship-creator">
                  Created by: {" "}
                  <button type="button" onClick={() => onSelectUser(ship.createdBy)}>
                    {ship.creator.username}
                  </button>
                </p>
                <div className="ship-card-actions">
                  <button
                    type="button"
                    className={`watched-button ${ship.isLiked ? "is-watched" : ""}`}
                    onClick={() => toggleLike(ship.id)}
                  >
                    <Heart size={14} fill={ship.isLiked ? "currentColor" : "none"} /> {ship.likeCount}
                  </button>
                  <button
                    type="button"
                    className={`save-button ${ship.isFavorited ? "is-saved" : ""}`}
                    onClick={() => toggleFavorite(ship.id)}
                    aria-label={ship.isFavorited ? "Remove from favorite ships" : "Add to favorite ships"}
                  >
                    <Star size={14} fill={ship.isFavorited ? "currentColor" : "none"} />
                  </button>
                  {userId === ship.createdBy && (
                    <button
                      type="button"
                      className="ship-delete-button"
                      onClick={() => void deleteShip(ship.id)}
                      aria-label={`Delete ${ship.name}`}
                    >
                      <Trash2 size={14} /> Delete
                    </button>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
