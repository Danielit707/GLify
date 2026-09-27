/**
 * Fastify plugin that attaches shared database clients to the Fastify instance,
 * making them available in route handlers via `fastify.postgres` / `fastify.neo4j`.
 */

import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import { loadConfig } from "../config.js";
import { initPostgres, closePostgres } from "../db/postgres.js";
import { initNeo4j, closeNeo4j } from "../db/neo4j.js";
import { syncCatalogGraph, type GraphFavorite, type GraphWork } from "../db/graph-sync.js";

declare module "fastify" {
  interface FastifyInstance {
    postgres: ReturnType<typeof initPostgres>;
    neo4j: ReturnType<typeof initNeo4j>;
  }
}

export default fp(async function contextPlugin(
  fastify: FastifyInstance
): Promise<void> {
  const config = loadConfig();

  const postgresClient = initPostgres(config);
  const neo4jDriver = initNeo4j(config);

  fastify.decorate("postgres", postgresClient);
  fastify.decorate("neo4j", neo4jDriver);

  if (neo4jDriver) {
    try {
      const works = await postgresClient`
        SELECT id, title, format, genre, tags FROM works
      `;
      const workById = new Map<string, GraphWork>();
      for (const row of works) {
        if (!Array.isArray(row.tags) || !row.tags.every((tag) => typeof tag === "string")) {
          throw new Error(`Invalid tags returned for graph work ${String(row.id)}`);
        }
        workById.set(String(row.id), {
          id: String(row.id),
          title: String(row.title),
          format: String(row.format),
          genre: String(row.genre),
          tags: row.tags,
        });
      }

      const favoriteRows = await postgresClient`
        SELECT f.user_id, f.work_id
        FROM favorites f
        ORDER BY f.user_id, f.created_at
      `;
      const favorites: GraphFavorite[] = favoriteRows.flatMap((row) => {
        const work = workById.get(String(row.work_id));
        return work
          ? [{ userId: String(row.user_id), work }]
          : [];
      });

      const counts = await syncCatalogGraph(
        neo4jDriver,
        [...workById.values()],
        favorites,
      );
      fastify.log.info(
        { ...counts },
        "Synchronized Neo4j catalog and account favorites from Postgres",
      );
    } catch (error) {
      fastify.log.error(
        { err: error },
        "Neo4j catalog sync failed; Postgres remains the source of truth",
      );
    }
  }

  fastify.addHook("onClose", async () => {
    await closePostgres();
    if (neo4jDriver) await closeNeo4j();
  });
});
