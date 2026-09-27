import type { FastifyInstance } from "fastify";
import { syncUserInteractions, type GraphWork } from "../db/graph-sync.js";

function mapWorks(rows: Record<string, unknown>[]): GraphWork[] {
  return rows.map((row) => {
    if (!Array.isArray(row.tags) || !row.tags.every((tag) => typeof tag === "string")) {
      throw new Error(`Invalid tags returned for interaction work ${String(row.id)}`);
    }
    return {
      id: String(row.id),
      title: String(row.title),
      format: String(row.format),
      genre: String(row.genre),
      tags: row.tags,
    };
  });
}

export async function syncUserGraph(
  fastify: FastifyInstance,
  userId: string,
): Promise<boolean> {
  if (!fastify.neo4j) {
    fastify.log.warn({ userId }, "Neo4j is not configured; Neon remains the source of truth");
    return false;
  }

  const [favoriteRows, watchedRows] = await Promise.all([
    fastify.postgres`
      SELECT w.id, w.title, w.format, w.genre, w.tags
      FROM favorites f
      JOIN works w ON w.id = f.work_id
      WHERE f.user_id = ${userId}
    `,
    fastify.postgres`
      SELECT w.id, w.title, w.format, w.genre, w.tags
      FROM watched_works a
      JOIN works w ON w.id = a.work_id
      WHERE a.user_id = ${userId}
    `,
  ]);

  try {
    await syncUserInteractions(
      fastify.neo4j,
      userId,
      mapWorks(favoriteRows),
      mapWorks(watchedRows),
    );
    return true;
  } catch (error) {
    fastify.log.error(
      { err: error, userId },
      "Neo4j interaction sync failed; Neon remains the source of truth",
    );
    return false;
  }
}
