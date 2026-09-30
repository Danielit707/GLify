import { z } from "zod";
import { randomUUID } from "node:crypto";
import type postgres from "postgres";
import type { FastifyInstance } from "fastify";

type WorkFormat = "Manga" | "Manhwa" | "Light novel" | "Live action" | "Anime" | "Webtoon";

interface CatalogWork {
  id: string;
  title: string;
  creator: string;
  format: WorkFormat;
  genre: string;
  description: string;
  image: string;
  imageAlt: string;
  rating?: string;
  chapters: string;
  match?: number;
  tags: string[];
}

const Formats = ["Manga", "Manhwa", "Light novel", "Live action", "Anime", "Webtoon"] as const;

const QuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  genre: z.string().trim().min(1).max(80).optional(),
  format: z.enum(Formats).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(200),
});

function toCatalogWork(row: postgres.Row): CatalogWork {
  const format = row.format;
  if (
    format !== "Manga" &&
    format !== "Manhwa" &&
    format !== "Light novel" &&
    format !== "Live action" &&
    format !== "Anime" &&
    format !== "Webtoon"
  ) {
    throw new Error(`Unexpected catalog format returned by Postgres: ${String(format)}`);
  }

  if (!Array.isArray(row.tags) || !row.tags.every((tag) => typeof tag === "string")) {
    throw new Error(`Invalid tags returned for catalog work ${String(row.id)}`);
  }

  const match = row.match === null ? undefined : Number(row.match);
  if (match !== undefined && (!Number.isInteger(match) || match < 0 || match > 100)) {
    throw new Error(`Invalid match score returned for catalog work ${String(row.id)}`);
  }

  return {
    id: String(row.id),
    title: String(row.title),
    creator: String(row.creator),
    format,
    genre: String(row.genre),
    description: String(row.description),
    image: String(row.image),
    imageAlt: String(row.image_alt),
    rating: row.rating === null ? undefined : String(row.rating),
    chapters: String(row.chapters),
    match,
    tags: row.tags,
  };
}

export default async function workRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get("/api/works", async (request, reply) => {
    const parsed = QuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({
        error: "Invalid catalog filters",
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const { q, genre, format, limit } = parsed.data;
    const rows = await fastify.postgres`
      SELECT
        id, title, creator, format, genre, description, image,
        image_alt, rating::text AS rating, chapters, match_score AS match, tags
      FROM works
      WHERE curation_status = 'approved'
      AND EXISTS (
        SELECT 1
        FROM unnest(tags[1:6]) AS tag
        WHERE lower(tag) IN ('yuri', 'shoujo ai')
      )
      AND (
        ${q ?? null}::text IS NULL
        OR title ILIKE '%' || ${q ?? null} || '%'
        OR creator ILIKE '%' || ${q ?? null} || '%'
        OR genre ILIKE '%' || ${q ?? null} || '%'
        OR array_to_string(tags, ' ') ILIKE '%' || ${q ?? null} || '%'
      )
      AND (${format ?? null}::text IS NULL OR format = ${format ?? null})
      AND (
        ${genre ?? null}::text IS NULL
        OR lower(genre) = lower(${genre ?? null})
        OR EXISTS (
          SELECT 1
          FROM unnest(tags) AS tag
          WHERE lower(tag) = lower(${genre ?? null})
        )
      )
      ORDER BY created_at DESC, title ASC
      LIMIT ${limit}
    `;

    return { works: rows.map(toCatalogWork) };
  });

  /**
   * GET /api/works/:workId/comments
   *
   * Get comments for a work.
   */
  fastify.get("/api/works/:workId/comments", async (request, reply) => {
    const { workId } = request.params as { workId: string };

    const rows = await fastify.postgres`
      SELECT
        c.id,
        c.work_id AS "workId",
        c.user_id AS "userId",
        c.text,
        c.created_at AS "createdAt",
        COALESCE(u.username, 'Unknown') AS username,
        COALESCE(u.nametag, u.username, 'Unknown') AS nametag,
        u.avatar_url AS "avatarUrl"
      FROM work_comments c
      LEFT JOIN users u ON u.id = c.user_id
      WHERE c.work_id = ${workId}
      ORDER BY c.created_at DESC
      LIMIT 100
    `;

    const comments = rows.map((row) => ({
      id: String(row.id),
      workId: String(row.workId || workId),
      userId: String(row.userId),
      text: String(row.text),
      createdAt: String(row.createdAt),
      username: String(row.username),
      nametag: String(row.nametag),
      avatarUrl: row.avatarUrl ? String(row.avatarUrl) : null,
    }));

    return { comments };
  });

  /**
   * POST /api/works/:workId/comments
   *
   * Add or update a comment for a work. One comment per user per work.
   */
  fastify.post("/api/works/:workId/comments", async (request, reply) => {
    const { workId } = request.params as { workId: string };

    const clerkToken = request.headers["authorization"]?.replace("Bearer ", "");
    if (!clerkToken) {
      return reply.code(401).send({ error: "Authentication required" });
    }

    let userId = "unknown-user";
    let username = "Unknown";
    let nametag = "Unknown";
    let avatarUrl: string | null = null;
    try {
      const payload = clerkToken.split(".")[1];
      const decoded = JSON.parse(Buffer.from(payload, "base64").toString());
      userId = decoded.sub || decoded.user_id || "unknown-user";
      username = decoded.name || decoded.username || "Unknown";
      nametag = decoded.nickname || decoded.name || decoded.username || "Unknown";
      avatarUrl = decoded.picture || decoded.avatar_url || null;
    } catch {
      return reply.code(401).send({ error: "Invalid token" });
    }

    const body = request.body as { text?: string };
    const text = body.text?.trim();
    if (!text || text.length > 1000) {
      return reply.code(400).send({ error: "Comment text is required (max 1000 chars)" });
    }

    // Ensure work exists in database if it's from catalog
    const workExists = await fastify.postgres`
      SELECT id FROM works WHERE id = ${workId}
    `;
    if (workExists.length === 0) {
      return reply.code(404).send({ error: "Work not found" });
    }

    // Sync user data (only update avatar, preserve custom username/nametag)
    await fastify.postgres`
      INSERT INTO users (id, username, nametag, avatar_url)
      VALUES (${userId}, ${username}, ${nametag}, ${avatarUrl})
      ON CONFLICT (id) DO UPDATE SET
        avatar_url = COALESCE(EXCLUDED.avatar_url, users.avatar_url)
    `;

    const commentId = randomUUID();
    const rows = await fastify.postgres`
      INSERT INTO work_comments (id, work_id, user_id, text, created_at)
      VALUES (${commentId}, ${workId}, ${userId}, ${text}, now())
      ON CONFLICT (work_id, user_id) DO UPDATE SET
        text = EXCLUDED.text,
        created_at = now()
      RETURNING id, work_id AS "workId", user_id AS "userId", text, created_at AS "createdAt"
    `;

    const saved = rows[0];
    const userRow = await fastify.postgres`
      SELECT username, nametag, avatar_url AS "avatarUrl"
      FROM users
      WHERE id = ${userId}
    `;

    const currentUsername = userRow[0]?.username ? String(userRow[0].username) : username;
    const currentNametag = userRow[0]?.nametag
      ? String(userRow[0].nametag)
      : userRow[0]?.username
        ? String(userRow[0].username)
        : nametag;
    const currentAvatarUrl = userRow[0]?.avatarUrl ? String(userRow[0].avatarUrl) : avatarUrl;

    return reply.code(200).send({
      comment: {
        id: String(saved.id),
        workId: String(saved.workId || workId),
        userId: String(saved.userId),
        username: currentUsername,
        nametag: currentNametag,
        avatarUrl: currentAvatarUrl,
        text: String(saved.text),
        createdAt: new Date(saved.createdAt).toISOString(),
      },
    });
  });

  /**
   * PUT /api/works/:id/comments
   * Update user's opinion about the work
   */
  fastify.put("/api/works/:id/comments", async (request, reply) => {
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

    const { id } = request.params as { id: string };
    const { text } = request.body as { text?: string };

    if (!text || text.trim().length === 0) {
      return reply.code(400).send({ error: "Comment text cannot be empty" });
    }

    try {
      const [updated] = await fastify.postgres`
        UPDATE work_comments
        SET text = ${text.trim()}
        WHERE work_id = ${id} AND user_id = ${userId}
        RETURNING id, user_id AS "userId", text, created_at AS "createdAt"
      `;

      if (!updated) {
        return reply.code(404).send({ error: "Comment not found or not owned by user" });
      }

      const [userRow] = await fastify.postgres`
        SELECT
          COALESCE(username, 'Unknown') AS username,
          COALESCE(nametag, username, 'Unknown') AS nametag,
          avatar_url AS "avatarUrl"
        FROM users
        WHERE id = ${userId}
        LIMIT 1
      `;

      return {
        comment: {
          id: String(updated.id),
          userId: String(updated.userId),
          text: String(updated.text),
          createdAt: String(updated.createdAt),
          username: userRow ? String(userRow.username) : "Unknown",
          nametag: userRow ? String(userRow.nametag) : "Unknown",
          avatarUrl: userRow?.avatarUrl ? String(userRow.avatarUrl) : null,
        },
      };
    } catch (error) {
      request.log.error({ err: error }, "Failed to update comment");
      return reply.code(500).send({ error: "Failed to update comment" });
    }
  });

  /**
   * DELETE /api/works/:id/comments
   * Delete user's opinion about a work
   */
  fastify.delete("/api/works/:id/comments", async (request, reply) => {
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

    const { id } = request.params as { id: string };

    try {
      await fastify.postgres`
        DELETE FROM work_comments
        WHERE work_id = ${id} AND user_id = ${userId}
      `;

      return { success: true };
    } catch (error) {
      request.log.error({ err: error }, "Failed to delete comment");
      return reply.code(500).send({ error: "Failed to delete comment" });
    }
  });
}
