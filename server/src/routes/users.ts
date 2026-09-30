/**
 * User endpoints.
 *
 * Handles user sync, profile updates, public profiles, and user matching.
 */

import type { FastifyInstance } from "fastify";

export default async function userRoutes(
  fastify: FastifyInstance
): Promise<void> {
  /**
   * POST /api/users/sync
   *
   * Sync the current user's data to the users table.
   * Called when a user signs in to ensure their data is available
   * for community member lists, chat messages, etc.
   */
  fastify.post("/api/users/sync", async (request, reply) => {
    const clerkToken = request.headers["authorization"]?.replace("Bearer ", "");
    if (!clerkToken) {
      return reply.code(401).send({ error: "Authentication required" });
    }

    let userId = "unknown-user";
    try {
      const payload = clerkToken.split(".")[1];
      const decoded = JSON.parse(Buffer.from(payload, "base64").toString());
      userId = decoded.sub || decoded.user_id || "unknown-user";
    } catch {
      return reply.code(401).send({ error: "Invalid token" });
    }

    // Accept user data from frontend (Clerk user object)
    const body = request.body as { username?: string; nametag?: string; avatarUrl?: string };
    const username = body.username || "Unknown";
    const nametag = body.nametag || body.username || "Unknown";
    const avatarUrl = body.avatarUrl || null;

    await fastify.postgres`
      INSERT INTO users (id, username, nametag, avatar_url)
      VALUES (${userId}, ${username}, ${nametag}, ${avatarUrl})
      ON CONFLICT (id) DO UPDATE SET
        username = EXCLUDED.username,
        nametag = EXCLUDED.nametag,
        avatar_url = EXCLUDED.avatar_url
    `;

    return { success: true, user: { id: userId, username, nametag, avatarUrl } };
  });

  /**
   * PUT /api/users/me
   *
   * Update the current user's profile (username, nametag).
   */
  fastify.put("/api/users/me", async (request, reply) => {
    const clerkToken = request.headers["authorization"]?.replace("Bearer ", "");
    if (!clerkToken) {
      return reply.code(401).send({ error: "Authentication required" });
    }

    let userId = "unknown-user";
    try {
      const payload = clerkToken.split(".")[1];
      const decoded = JSON.parse(Buffer.from(payload, "base64").toString());
      userId = decoded.sub || decoded.user_id || "unknown-user";
    } catch {
      return reply.code(401).send({ error: "Invalid token" });
    }

    const body = request.body as { username?: string; nametag?: string };
    const updates: string[] = [];
    const params: any[] = [];

    if (body.username !== undefined) {
      const username = body.username.trim();
      if (username.length < 1 || username.length > 30) {
        return reply.code(400).send({ error: "Username must be 1-30 characters" });
      }
      params.push(username);
      updates.push(`username = $${params.length}`);
    }

    if (body.nametag !== undefined) {
      const nametag = body.nametag.trim();
      if (nametag.length < 1 || nametag.length > 30) {
        return reply.code(400).send({ error: "Nametag must be 1-30 characters" });
      }
      params.push(nametag);
      updates.push(`nametag = $${params.length}`);
    }

    if (updates.length === 0) {
      return reply.code(400).send({ error: "No fields to update" });
    }

    try {
      params.push(userId);
      const result = await fastify.postgres.unsafe(
        `INSERT INTO users (id, username, nametag, avatar_url)
         VALUES ($${params.length}, $${params.length - updates.length}, $${params.length - updates.length + 1}, NULL)
         ON CONFLICT (id) DO UPDATE SET ${updates.join(", ")}
         RETURNING id, username, nametag, avatar_url AS "avatarUrl"`,
        params
      );

      const row = result[0];
      return {
        user: {
          id: String(row.id),
          username: String(row.username),
          nametag: row.nametag ? String(row.nametag) : null,
          avatarUrl: row.avatarUrl ? String(row.avatarUrl) : null,
        },
      };
    } catch (error) {
      if (error instanceof Error && error.message.includes("unique constraint")) {
        return reply.code(409).send({ error: "Username is already taken" });
      }
      request.log.error({ err: error }, "Failed to update user profile");
      return reply.code(500).send({ error: "Failed to update profile" });
    }
  });

  /**
   * GET /api/users/:id
   *
   * Get a user's public profile info.
   */
  fastify.get("/api/users/:id", async (request, reply) => {
    const { id } = request.params as { id: string };

    const rows = await fastify.postgres`
      SELECT
        id,
        username,
        nametag,
        avatar_url AS "avatarUrl"
      FROM users
      WHERE id = ${id}
      LIMIT 1
    `;

    if (rows.length === 0) {
      return reply.code(404).send({ error: "User not found" });
    }

    const row = rows[0];

    // Get public favorites if user has sharing enabled
    const prefs = await fastify.postgres`
      SELECT share_activity FROM recommendation_preferences WHERE user_id = ${id}
    `;
    const isPublic = prefs.length > 0 && prefs[0].share_activity === true;

    const favorites = isPublic
      ? await fastify.postgres`
          SELECT w.id, w.title, w.format, w.image
          FROM favorites f
          JOIN works w ON w.id = f.work_id
          WHERE f.user_id = ${id}
          LIMIT 20
        `
      : [];

    const watched = isPublic
      ? await fastify.postgres`
          SELECT w.id, w.title, w.format, w.image
          FROM watched_works f
          JOIN works w ON w.id = f.work_id
          WHERE f.user_id = ${id}
          LIMIT 20
        `
      : [];

    return {
      user: {
        id: String(row.id),
        username: String(row.username),
        nametag: row.nametag ? String(row.nametag) : null,
        avatarUrl: row.avatarUrl ? String(row.avatarUrl) : null,
        isPublic,
        favorites: favorites.map((w) => ({
          id: String(w.id),
          title: String(w.title),
          format: String(w.format),
          image: String(w.image),
        })),
        watched: watched.map((w) => ({
          id: String(w.id),
          title: String(w.title),
          format: String(w.format),
          image: String(w.image),
        })),
      },
    };
  });

  /**
   * GET /api/users/match
   *
   * Get users sorted by match score with the current user.
   * Match is based on shared watched works, favorites, and communities.
   */
  fastify.get("/api/users/match", async (request, reply) => {
    const clerkToken = request.headers["authorization"]?.replace("Bearer ", "");
    if (!clerkToken) {
      return reply.code(401).send({ error: "Authentication required" });
    }

    let currentUserId = "unknown-user";
    try {
      const payload = clerkToken.split(".")[1];
      const decoded = JSON.parse(Buffer.from(payload, "base64").toString());
      currentUserId = decoded.sub || decoded.user_id || "unknown-user";
    } catch {
      return reply.code(401).send({ error: "Invalid token" });
    }

    // Calculate match score based on shared watched, favorites, and communities
    const rows = await fastify.postgres`
      WITH current_user_watched AS (
        SELECT work_id FROM watched_works WHERE user_id = ${currentUserId}
      ),
      current_user_favorites AS (
        SELECT work_id FROM favorites WHERE user_id = ${currentUserId}
      ),
      current_user_communities AS (
        SELECT community_id FROM community_members WHERE user_id = ${currentUserId}
      ),
      other_users AS (
        SELECT DISTINCT user_id FROM watched_works WHERE user_id != ${currentUserId}
        UNION
        SELECT DISTINCT user_id FROM favorites WHERE user_id != ${currentUserId}
        UNION
        SELECT DISTINCT user_id FROM community_members WHERE user_id != ${currentUserId}
      )
      SELECT
        ou.user_id AS "userId",
        u.username,
        u.nametag,
        u.avatar_url AS "avatarUrl",
        (SELECT COUNT(*) FROM watched_works wu WHERE wu.user_id = ou.user_id AND wu.work_id IN (SELECT work_id FROM current_user_watched)) AS "sharedWatched",
        (SELECT COUNT(*) FROM favorites f WHERE f.user_id = ou.user_id AND f.work_id IN (SELECT work_id FROM current_user_favorites)) AS "sharedFavorites",
        (SELECT COUNT(*) FROM community_members cm WHERE cm.user_id = ou.user_id AND cm.community_id IN (SELECT community_id FROM current_user_communities)) AS "sharedCommunities"
      FROM other_users ou
      LEFT JOIN users u ON u.id = ou.user_id
      ORDER BY (sharedWatched + sharedFavorites + sharedCommunities) DESC
      LIMIT 50
    `;

    const matches = rows.map((row) => ({
      userId: String(row.userId),
      username: row.username ? String(row.username) : "Unknown",
      nametag: row.nametag ? String(row.nametag) : row.username ? String(row.username) : "Unknown",
      avatarUrl: row.avatarUrl ? String(row.avatarUrl) : null,
      sharedWatched: Number(row.sharedWatched),
      sharedFavorites: Number(row.sharedFavorites),
      sharedCommunities: Number(row.sharedCommunities),
      matchScore: Number(row.sharedWatched) + Number(row.sharedFavorites) + Number(row.sharedCommunities),
    }));

    return { matches };
  });
}
