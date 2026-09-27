/**
 * Reconciles the Neo4j catalog and account favorites against Neon Postgres.
 *
 * Usage:
 *   npm run db:seed-graph
 */

import "dotenv/config";
import { closePostgres, initPostgres } from "./postgres.js";
import { closeNeo4j, initNeo4j } from "./neo4j.js";
import {
  syncCatalogGraph,
  type GraphFavorite,
  type GraphWatchedWork,
  type GraphWork,
} from "./graph-sync.js";
import { loadConfig } from "../config.js";

async function seedGraph(): Promise<void> {
  const config = loadConfig();
  const pg = initPostgres(config);
  const driver = initNeo4j(config);
  if (!driver) {
    await closePostgres();
    throw new Error("Neo4j is not configured.");
  }

  try {
    const rows = await pg`
      SELECT id, title, format, genre, tags FROM works
    `;
    const works: GraphWork[] = rows.map((row) => {
      if (!Array.isArray(row.tags) || !row.tags.every((tag) => typeof tag === "string")) {
        throw new Error(`Invalid tags returned for graph work ${String(row.id)}`);
      }
      return {
        id: String(row.id),
        title: String(row.title),
        format: String(row.format),
        genre: String(row.genre),
        tags: row.tags,
      };
    });

    const favoriteRows = await pg`
      SELECT f.user_id, w.id AS work_id, w.title, w.format, w.genre, w.tags
      FROM favorites f
      JOIN works w ON w.id = f.work_id
      ORDER BY f.user_id, f.created_at
    `;
    const favorites: GraphFavorite[] = favoriteRows.map((row) => {
      if (!Array.isArray(row.tags) || !row.tags.every((tag) => typeof tag === "string")) {
        throw new Error(`Invalid tags returned for favorite work ${String(row.work_id)}`);
      }
      return {
        userId: String(row.user_id),
        work: {
          id: String(row.work_id),
          title: String(row.title),
          format: String(row.format),
          genre: String(row.genre),
          tags: row.tags,
        },
      };
    });

    const watchedRows = await pg`
      SELECT a.user_id, w.id AS work_id, w.title, w.format, w.genre, w.tags
      FROM watched_works a
      JOIN works w ON w.id = a.work_id
      ORDER BY a.user_id, a.created_at
    `;
    const watchedWorks: GraphWatchedWork[] = watchedRows.map((row) => {
      if (!Array.isArray(row.tags) || !row.tags.every((tag) => typeof tag === "string")) {
        throw new Error(`Invalid tags returned for watched work ${String(row.work_id)}`);
      }
      return {
        userId: String(row.user_id),
        work: {
          id: String(row.work_id),
          title: String(row.title),
          format: String(row.format),
          genre: String(row.genre),
          tags: row.tags,
        },
      };
    });

    const counts = await syncCatalogGraph(driver, works, favorites, watchedWorks);
    console.info(
      `Neo4j synchronized from Neon: ${counts.workCount} works, ${counts.userCount} users, ${counts.favoriteCount} favorites, ${watchedWorks.length} watched works.`,
    );
  } finally {
    await closePostgres();
    await closeNeo4j();
  }
}

seedGraph().catch((error: unknown) => {
  console.error("Graph synchronization failed:", error);
  process.exitCode = 1;
});
