/**
 * Fastify plugin that attaches shared database clients to the Fastify instance,
 * making them available in route handlers via `fastify.postgres` / `fastify.neo4j`.
 */

import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import { loadConfig } from "../config.js";
import { initPostgres, closePostgres } from "../db/postgres.js";
import { initNeo4j, closeNeo4j } from "../db/neo4j.js";
import {
  syncCatalogGraph,
  type GraphFavorite,
  type GraphWatchedWork,
  type GraphWork,
} from "../db/graph-sync.js";

declare module "fastify" {
  interface FastifyInstance {
    postgres: ReturnType<typeof initPostgres>;
    neo4j: ReturnType<typeof initNeo4j>;
  }
}

import { seedWorks } from "../db/seed-data.js";

export default fp(async function contextPlugin(
  fastify: FastifyInstance
): Promise<void> {
  const config = loadConfig();

  const postgresClient = initPostgres(config);

  await postgresClient`
    CREATE TABLE IF NOT EXISTS works (
      id text PRIMARY KEY,
      title text NOT NULL,
      creator text NOT NULL,
      format text NOT NULL CHECK (format IN ('Manga', 'Manhwa', 'Light novel', 'Live action', 'Anime', 'Webtoon')),
      genre text NOT NULL,
      description text NOT NULL,
      image text NOT NULL,
      image_alt text NOT NULL,
      rating numeric(2, 1) CHECK (rating >= 0 AND rating <= 5),
      chapters text NOT NULL,
      match_score integer CHECK (match_score >= 0 AND match_score <= 100),
      tags text[] NOT NULL DEFAULT '{}',
      curation_status text NOT NULL DEFAULT 'approved'
        CHECK (curation_status IN ('pending_review', 'approved', 'rejected')),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `;

  await postgresClient`
    CREATE TABLE IF NOT EXISTS users (
      id text PRIMARY KEY,
      username text,
      nametag text,
      avatar_url text,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await postgresClient`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_username_key`;

  await postgresClient`
    CREATE TABLE IF NOT EXISTS favorites (
      user_id text NOT NULL,
      work_id text NOT NULL REFERENCES works(id) ON DELETE CASCADE,
      created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, work_id)
    )
  `;
  await postgresClient`
    CREATE TABLE IF NOT EXISTS watched_works (
      user_id text NOT NULL,
      work_id text NOT NULL REFERENCES works(id) ON DELETE CASCADE,
      created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, work_id)
    )
  `;
  await postgresClient`
    CREATE TABLE IF NOT EXISTS recommendation_preferences (
      user_id text PRIMARY KEY,
      share_activity boolean NOT NULL DEFAULT false,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await postgresClient`
    CREATE TABLE IF NOT EXISTS communities (
      id text PRIMARY KEY,
      name text NOT NULL,
      description text NOT NULL,
      is_general boolean NOT NULL DEFAULT true,
      work_ids text[] NOT NULL DEFAULT '{}',
      image text,
      created_by text NOT NULL,
      member_count integer NOT NULL DEFAULT 1,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await postgresClient`
    CREATE TABLE IF NOT EXISTS community_members (
      community_id text NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
      user_id text NOT NULL,
      role text NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
      joined_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (community_id, user_id)
    )
  `;
  await postgresClient`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id text PRIMARY KEY,
      community_id text NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
      user_id text NOT NULL,
      username text NOT NULL,
      avatar_url text,
      text text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await postgresClient`
    CREATE TABLE IF NOT EXISTS work_comments (
      id text PRIMARY KEY,
      work_id text NOT NULL REFERENCES works(id) ON DELETE CASCADE,
      user_id text NOT NULL,
      text text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await postgresClient`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'work_comments_unique'
      ) THEN
        ALTER TABLE work_comments ADD CONSTRAINT work_comments_unique UNIQUE (work_id, user_id);
      END IF;
    END $$;
  `;

  // Seed initial catalog works if table is empty
  const countRow = await postgresClient`SELECT COUNT(*) AS count FROM works`;
  if (Number(countRow[0]?.count || 0) === 0) {
    for (const work of seedWorks) {
      await postgresClient`
        INSERT INTO works (
          id, title, creator, format, genre, description, image, image_alt,
          rating, chapters, match_score, tags, curation_status
        )
        VALUES (
          ${work.id}, ${work.title}, ${work.creator}, ${work.format}, ${work.genre},
          ${work.description}, ${work.image}, ${work.imageAlt}, ${work.rating},
          ${work.chapters}, ${work.match}, ${work.tags}, 'approved'
        )
        ON CONFLICT (id) DO NOTHING
      `;
    }
  }

  fastify.log.info("Verified all database tables, constraints, and seed data");

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
      const watchedRows = await postgresClient`
        SELECT user_id, work_id
        FROM watched_works
        ORDER BY user_id, created_at
      `;
      const watchedWorks: GraphWatchedWork[] = watchedRows.flatMap((row) => {
        const work = workById.get(String(row.work_id));
        return work ? [{ userId: String(row.user_id), work }] : [];
      });

      const counts = await syncCatalogGraph(
        neo4jDriver,
        [...workById.values()],
        favorites,
        watchedWorks,
      );
      fastify.log.info(
        { ...counts },
        "Synchronized Neo4j catalog and account interactions from Postgres",
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
