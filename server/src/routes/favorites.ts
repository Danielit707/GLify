import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { loadConfig } from "../config.js";
import { syncUserFavorites, type GraphWork } from "../db/graph-sync.js";
import { authenticateUser } from "./auth.js";

const WorkParamsSchema = z.object({
  workId: z.string().trim().min(1).max(200),
});

async function syncUserFavoriteGraph(
  fastify: FastifyInstance,
  userId: string,
): Promise<boolean> {
  if (!fastify.neo4j) {
    fastify.log.warn({ userId }, "Neo4j is not configured; account favorites remain in Postgres");
    return false;
  }

  const rows = await fastify.postgres`
    SELECT w.id, w.title, w.format, w.genre, w.tags
    FROM favorites f
    JOIN works w ON w.id = f.work_id
    WHERE f.user_id = ${userId}
  `;
  const works: GraphWork[] = rows.map((row) => {
    if (!Array.isArray(row.tags) || !row.tags.every((tag) => typeof tag === "string")) {
      throw new Error(`Invalid tags returned for favorite work ${String(row.id)}`);
    }
    return {
      id: String(row.id),
      title: String(row.title),
      format: String(row.format),
      genre: String(row.genre),
      tags: row.tags,
    };
  });

  try {
    await syncUserFavorites(fastify.neo4j, userId, works);
    return true;
  } catch (error) {
    fastify.log.error(
      { err: error, userId },
      "Neo4j favorite sync failed; Postgres remains the source of truth",
    );
    return false;
  }
}

export default async function favoriteRoutes(fastify: FastifyInstance): Promise<void> {
  const config = loadConfig();

  fastify.get("/api/favorites", async (request, reply) => {
    const userId = await authenticateUser(fastify, config, request, reply);
    if (!userId) return;

    const rows = await fastify.postgres`
      SELECT work_id
      FROM favorites
      WHERE user_id = ${userId}
      ORDER BY created_at DESC, work_id ASC
    `;
    const graphSynced = await syncUserFavoriteGraph(fastify, userId);
    return {
      favorites: rows.map((row) => String(row.work_id)),
      graphSynced,
    };
  });

  fastify.put("/api/favorites/:workId", async (request, reply) => {
    const userId = await authenticateUser(fastify, config, request, reply);
    if (!userId) return;

    const parsed = WorkParamsSchema.safeParse(request.params);
    if (!parsed.success) {
      return reply.code(400).send({
        error: "Invalid work ID",
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const work = await fastify.postgres`
      SELECT id FROM works WHERE id = ${parsed.data.workId}
    `;
    if (work.length === 0) {
      return reply.code(404).send({ error: "Work not found." });
    }

    await fastify.postgres`
      INSERT INTO favorites (user_id, work_id)
      VALUES (${userId}, ${parsed.data.workId})
      ON CONFLICT (user_id, work_id) DO NOTHING
    `;
    const graphSynced = await syncUserFavoriteGraph(fastify, userId);
    return reply.send({ graphSynced });
  });

  fastify.delete("/api/favorites/:workId", async (request, reply) => {
    const userId = await authenticateUser(fastify, config, request, reply);
    if (!userId) return;

    const parsed = WorkParamsSchema.safeParse(request.params);
    if (!parsed.success) {
      return reply.code(400).send({
        error: "Invalid work ID",
        details: parsed.error.flatten().fieldErrors,
      });
    }

    await fastify.postgres`
      DELETE FROM favorites
      WHERE user_id = ${userId} AND work_id = ${parsed.data.workId}
    `;
    const graphSynced = await syncUserFavoriteGraph(fastify, userId);
    return reply.send({ graphSynced });
  });
}
