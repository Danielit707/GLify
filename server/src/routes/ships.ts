import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { moderateContent, reviewRelevance } from "../moderation.js";

const CreateShipSchema = z.object({
  name: z.string().trim().min(1).max(100),
  characters: z.string().trim().min(1).max(200),
  image: z.string().trim().min(1).max(2000),
});

function getUserIdFromRequest(request: { headers: Record<string, string | string[] | undefined> }): string | null {
  const authHeader = request.headers["authorization"];
  const token = typeof authHeader === "string" ? authHeader.replace("Bearer ", "") : undefined;
  if (!token) return null;
  try {
    const payload = token.split(".")[1];
    const decoded = JSON.parse(Buffer.from(payload, "base64").toString());
    return decoded.sub || decoded.user_id || null;
  } catch {
    return null;
  }
}

export default async function shipRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /api/ships
   *
   * List all ships with like and favorite counts, and whether current user liked/favorited.
   */
  fastify.get("/api/ships", async (request, reply) => {
    const userId = getUserIdFromRequest(request);

    const rows = await fastify.postgres`
      SELECT
        s.id,
        s.name,
        s.characters,
        s.image,
        s.created_by AS "createdBy",
        s.created_at AS "createdAt",
        COALESCE(u.username, 'Community member') AS "creatorUsername",
        COALESCE(u.nametag, u.username, 'Community member') AS "creatorNametag",
        u.avatar_url AS "creatorAvatar",
        (SELECT COUNT(*)::int FROM ship_likes sl WHERE sl.ship_id = s.id) AS "likeCount",
        (SELECT COUNT(*)::int FROM ship_favorites sf WHERE sf.ship_id = s.id) AS "favoriteCount",
        ${userId ? fastify.postgres`EXISTS(SELECT 1 FROM ship_likes sl WHERE sl.ship_id = s.id AND sl.user_id = ${userId})` : false} AS "isLiked",
        ${userId ? fastify.postgres`EXISTS(SELECT 1 FROM ship_favorites sf WHERE sf.ship_id = s.id AND sf.user_id = ${userId})` : false} AS "isFavorited"
      FROM ships s
      LEFT JOIN users u ON u.id = s.created_by
      ORDER BY (SELECT COUNT(*) FROM ship_favorites sf WHERE sf.ship_id = s.id) DESC,
               (SELECT COUNT(*) FROM ship_likes sl WHERE sl.ship_id = s.id) DESC,
               s.created_at DESC
    `;

    const ships = rows.map((r) => ({
      id: String(r.id),
      name: String(r.name),
      characters: String(r.characters),
      image: String(r.image),
      createdBy: String(r.createdBy),
      createdAt: new Date(r.createdAt).toISOString(),
      creator: {
        username: String(r.creatorUsername),
        nametag: String(r.creatorNametag),
        avatarUrl: r.creatorAvatar ? String(r.creatorAvatar) : null,
      },
      likeCount: Number(r.likeCount || 0),
      favoriteCount: Number(r.favoriteCount || 0),
      isLiked: Boolean(r.isLiked),
      isFavorited: Boolean(r.isFavorited),
    }));

    return { ships };
  });

  /**
   * POST /api/ships
   *
   * Create a new ship with name, characters, and image.
   */
  fastify.post("/api/ships", async (request, reply) => {
    const userId = getUserIdFromRequest(request);
    if (!userId) {
      return reply.code(401).send({ error: "Authentication required to create a ship." });
    }

    const parsed = CreateShipSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: "Invalid ship data",
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const shipId = randomUUID();
    const { name, characters, image } = parsed.data;
    const moderation = await moderateContent({ text: `${name}\n${characters}`, imageUrl: image });
    if (!moderation.allowed) {
      return reply.code(moderation.statusCode).send({ error: moderation.error });
    }
    const relevance = await reviewRelevance({
      subject: "ship",
      text: `Ship name: ${name}\nCharacters: ${characters}`,
      context: "The name, characters, and image must describe the same romantic pairing.",
      imageUrl: image,
    });
    if (!relevance.allowed) {
      return reply.code(relevance.statusCode).send({ error: relevance.error });
    }

    await fastify.postgres`
      INSERT INTO ships (id, name, characters, image, created_by)
      VALUES (${shipId}, ${name}, ${characters}, ${image}, ${userId})
    `;

    // Also automatically favorite the creator's new ship
    await fastify.postgres`
      INSERT INTO ship_favorites (ship_id, user_id)
      VALUES (${shipId}, ${userId})
      ON CONFLICT DO NOTHING
    `;

    const [userRow] = await fastify.postgres`
      SELECT username, nametag, avatar_url AS "avatarUrl"
      FROM users
      WHERE id = ${userId}
    `;

    return reply.code(201).send({
      ship: {
        id: shipId,
        name,
        characters,
        image,
        createdBy: userId,
        createdAt: new Date().toISOString(),
        creator: {
          username: userRow?.username ? String(userRow.username) : "You",
          nametag: userRow?.nametag ? String(userRow.nametag) : (userRow?.username ? String(userRow.username) : "You"),
          avatarUrl: userRow?.avatarUrl ? String(userRow.avatarUrl) : null,
        },
        likeCount: 0,
        favoriteCount: 1,
        isLiked: false,
        isFavorited: true,
      },
    });
  });

  /** Delete a ship. Only its creator can delete it. */
  fastify.delete("/api/ships/:shipId", async (request, reply) => {
    const userId = getUserIdFromRequest(request);
    if (!userId) {
      return reply.code(401).send({ error: "Authentication required." });
    }

    const { shipId } = request.params as { shipId: string };
    const [ship] = await fastify.postgres`
      SELECT created_by AS "createdBy" FROM ships WHERE id = ${shipId}
    `;
    if (!ship) return reply.code(404).send({ error: "Ship not found." });
    if (String(ship.createdBy) !== userId) {
      return reply.code(403).send({ error: "Only the ship creator can delete it." });
    }

    await fastify.postgres`DELETE FROM ships WHERE id = ${shipId}`;
    return reply.code(204).send();
  });

  /**
   * POST /api/ships/:shipId/like
   *
   * Toggle like on a ship.
   */
  fastify.post("/api/ships/:shipId/like", async (request, reply) => {
    const userId = getUserIdFromRequest(request);
    if (!userId) {
      return reply.code(401).send({ error: "Authentication required." });
    }

    const { shipId } = request.params as { shipId: string };
    const shipExists = await fastify.postgres`
      SELECT id FROM ships WHERE id = ${shipId}
    `;
    if (shipExists.length === 0) {
      return reply.code(404).send({ error: "Ship not found." });
    }

    const existing = await fastify.postgres`
      SELECT 1 FROM ship_likes WHERE ship_id = ${shipId} AND user_id = ${userId}
    `;

    let liked = false;
    if (existing.length > 0) {
      await fastify.postgres`
        DELETE FROM ship_likes WHERE ship_id = ${shipId} AND user_id = ${userId}
      `;
      liked = false;
    } else {
      await fastify.postgres`
        INSERT INTO ship_likes (ship_id, user_id) VALUES (${shipId}, ${userId})
        ON CONFLICT DO NOTHING
      `;
      liked = true;
    }

    const [count] = await fastify.postgres`
      SELECT COUNT(*)::int AS "likeCount" FROM ship_likes WHERE ship_id = ${shipId}
    `;

    return { liked, likeCount: Number(count?.likeCount || 0) };
  });

  /**
   * POST /api/ships/:shipId/favorite
   *
   * Toggle favorite on a ship.
   */
  fastify.post("/api/ships/:shipId/favorite", async (request, reply) => {
    const userId = getUserIdFromRequest(request);
    if (!userId) {
      return reply.code(401).send({ error: "Authentication required." });
    }

    const { shipId } = request.params as { shipId: string };
    const shipExists = await fastify.postgres`
      SELECT id FROM ships WHERE id = ${shipId}
    `;
    if (shipExists.length === 0) {
      return reply.code(404).send({ error: "Ship not found." });
    }

    const existing = await fastify.postgres`
      SELECT 1 FROM ship_favorites WHERE ship_id = ${shipId} AND user_id = ${userId}
    `;

    let favorited = false;
    if (existing.length > 0) {
      await fastify.postgres`
        DELETE FROM ship_favorites WHERE ship_id = ${shipId} AND user_id = ${userId}
      `;
      favorited = false;
    } else {
      await fastify.postgres`
        INSERT INTO ship_favorites (ship_id, user_id) VALUES (${shipId}, ${userId})
        ON CONFLICT DO NOTHING
      `;
      favorited = true;
    }

    const [count] = await fastify.postgres`
      SELECT COUNT(*)::int AS "favoriteCount" FROM ship_favorites WHERE ship_id = ${shipId}
    `;

    return { favorited, favoriteCount: Number(count?.favoriteCount || 0) };
  });
}
