/**
 * Neo4j graph seeder.
 *
 * Reads works from Postgres and creates the initial graph structure:
 *   (:GL_Work)-[:HAS_TAG]->(:Tag)
 *   (:User)-[:LIKED {rating}]->(:GL_Work)
 *
 * Also creates seed users and random likes so the recommendation
 * engine has data to work with immediately.
 *
 * Usage:
 *   npm run db:seed-graph
 */

import "dotenv/config";
import { closePostgres, initPostgres } from "./postgres.js";
import { closeNeo4j, initNeo4j } from "./neo4j.js";
import { loadConfig } from "../config.js";

// ---------------------------------------------------------------------------
// Seed users (for testing recommendations before real auth exists)
// ---------------------------------------------------------------------------

const SEED_USERS = [
  { id: "user-1", username: "yuri_fan" },
  { id: "user-2", username: "manga_reader" },
  { id: "user-3", username: "slow_burn_lover" },
  { id: "user-4", username: "webtoon_addict" },
  { id: "user-5", username: "anime_watcher" },
];

// ---------------------------------------------------------------------------
// Cypher queries
// ---------------------------------------------------------------------------

const CREATE_CONSTRAINTS = /* Cypher */ `
  CREATE CONSTRAINT gl_work_id IF NOT EXISTS
  FOR (w:GL_Work) REQUIRE w.id IS UNIQUE;

  CREATE CONSTRAINT tag_name IF NOT EXISTS
  FOR (t:Tag) REQUIRE t.name IS UNIQUE;

  CREATE CONSTRAINT user_id IF NOT EXISTS
  FOR (u:User) REQUIRE u.id IS UNIQUE;
`;

const SEED_WORKS = /* Cypher */ `
  UNWIND $works AS work
  MERGE (w:GL_Work {id: work.id})
  SET w.title = work.title,
      w.format = work.format,
      w.genre = work.genre
  WITH w, work
  UNWIND work.tags AS tag
  MERGE (t:Tag {name: tag})
  MERGE (w)-[:HAS_TAG]->(t)
`;

const SEED_USERS_CYPHER = /* Cypher */ `
  UNWIND $users AS user
  MERGE (u:User {id: user.id})
  SET u.username = user.username
`;

const SEED_LIKES = /* Cypher */ `
  UNWIND $likes AS like
  MATCH (u:User {id: like.userId})
  MATCH (w:GL_Work {id: like.workId})
  MERGE (u)-[r:LIKED]->(w)
  SET r.rating = like.rating,
      r.createdAt = like.createdAt
`;

// ---------------------------------------------------------------------------
// Deterministic pseudo-random generator (seeded, so re-runs are consistent)
// ---------------------------------------------------------------------------

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function seedGraph(): Promise<void> {
  const config = loadConfig();
  const pg = initPostgres(config);
  const neo4j = initNeo4j(config);

  try {
    // 1. Read works from Postgres
    const works = await pg`
      SELECT id, title, format, genre, tags FROM works
    `;

    console.info(`Read ${works.length} works from Postgres.`);

    if (!neo4j) throw new Error("Neo4j driver not initialized");

    // 2. Create constraints + seed everything in one session
    const session = neo4j.session();
    try {
      for (const statement of CREATE_CONSTRAINTS.split(";").map((s) => s.trim()).filter(Boolean)) {
        await session.run(statement);
      }

      // 3. Seed works and tags
      const worksData = works.map((w) => ({
        id: w.id,
        title: w.title,
        format: w.format,
        genre: w.genre,
        tags: w.tags,
      }));

      await session.run(SEED_WORKS, { works: worksData });
      console.info(`Seeded ${worksData.length} works with tags.`);

      // 4. Seed users
      await session.run(SEED_USERS_CYPHER, { users: SEED_USERS });
      console.info(`Seeded ${SEED_USERS.length} users.`);

      // 5. Generate deterministic likes
      const rand = mulberry32(42);
      const likes: Array<{ userId: string; workId: string; rating: number; createdAt: string }> = [];

      for (const user of SEED_USERS) {
        for (const work of works) {
          // Each user likes ~40% of works, deterministically
          if (rand() < 0.4) {
            const rating = Math.round((3 + rand() * 2) * 10) / 10; // 3.0–5.0
            const daysAgo = Math.floor(rand() * 365);
            const createdAt = new Date(Date.now() - daysAgo * 86400000).toISOString();
            likes.push({ userId: user.id, workId: work.id, rating, createdAt });
          }
        }
      }

      await session.run(SEED_LIKES, { likes });
      console.info(`Seeded ${likes.length} likes.`);

      // 6. Summary
      const tagResult = await session.run("MATCH (t:Tag) RETURN count(t) AS count");
      const workResult = await session.run("MATCH (w:GL_Work) RETURN count(w) AS count");
      const userResult = await session.run("MATCH (u:User) RETURN count(u) AS count");
      const likeResult = await session.run("MATCH ()-[r:LIKED]->() RETURN count(r) AS count");

      const tagCount = tagResult.records[0]?.get("count")?.toNumber?.() ?? 0;
      const workCount = workResult.records[0]?.get("count")?.toNumber?.() ?? 0;
      const userCount = userResult.records[0]?.get("count")?.toNumber?.() ?? 0;
      const likeCount = likeResult.records[0]?.get("count")?.toNumber?.() ?? 0;

    console.info(`
Graph seed complete:
  Works:  ${workCount}
  Tags:   ${tagCount}
  Users:  ${userCount}
  Likes:  ${likeCount}
    `);
    } finally {
      await session.close();
    }
  } finally {
    await closePostgres();
    await closeNeo4j();
  }
}

seedGraph().catch((error: unknown) => {
  console.error("Graph seed failed:", error);
  process.exitCode = 1;
});
