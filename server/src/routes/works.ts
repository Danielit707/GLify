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
        c.user_id AS "userId",
        c.text,
        c.created_at AS "createdAt",
        u.username,
        u.nametag,
        u.avatar_url AS "avatarUrl"
      FROM work_comments c
      LEFT JOIN users u ON u.id = c.user_id
      WHERE c.work_id = ${workId}
      ORDER BY c.created_at DESC
      LIMIT 100
    `;

    const comments = rows.map((row) => ({
      id: String(row.id),
      userId: String(row.userId),
      text: String(row.text),
      createdAt: String(row.createdAt),
      username: row.username ? String(row.username) : "Unknown",
      nametag: row.nametag ? String(row.nametag) : row.username ? String(row.username) : "Unknown",
      avatarUrl: row.avatarUrl ? String(row.avatarUrl) : null,
    }));

    return { comments };
  });

  /**
   * POST /api/works/:workId/comments
   *
   * Add a comment to a work. One comment per user per work.
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

    // Sync user data
    await fastify.postgres`
      INSERT INTO users (id, username, nametag, avatar_url)
      VALUES (${userId}, ${username}, ${nametag}, ${avatarUrl})
      ON CONFLICT (id) DO UPDATE SET
        username = EXCLUDED.username,
        nametag = EXCLUDED.nametag,
        avatar_url = EXCLUDED.avatar_url
    `;

    const commentId = randomUUID();
    try {
      await fastify.postgres`
        INSERT INTO work_comments (id, work_id, user_id, text)
        VALUES (${commentId}, ${workId}, ${userId}, ${text})
      `;
    } catch (error) {
      if (error instanceof Error && error.message.includes("unique constraint")) {
        return reply.code(409).send({ error: "You have already commented on this work" });
      }
      throw error;
    }

    return reply.code(201).send({
      comment: {
        id: commentId,
        userId,
        username,
        nametag,
        avatarUrl,
        text,
        createdAt: new Date().toISOString(),
      },
    });
  });
}
