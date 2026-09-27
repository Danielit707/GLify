/**
 * Removes works that don't have "yuri" or "shoujo ai" in their first 6 tags.
 * Also removes the corresponding Neo4j nodes.
 *
 * Usage:
 *   npm run db:filter-yuri
 */

import "dotenv/config";
import { initPostgres, closePostgres } from "./postgres.js";
import { initNeo4j, closeNeo4j } from "./neo4j.js";
import { loadConfig } from "../config.js";

async function filterYuri() {
  const config = loadConfig();
  const pg = initPostgres(config);
  const neo4j = initNeo4j(config);
  if (!neo4j) throw new Error("Neo4j is not configured.");

  try {
    // Find works without yuri/shoujo-ai in first 6 tags
    const result = await pg`
      SELECT id, title, tags FROM works
    `;

    const toDelete: string[] = [];
    for (const row of result) {
      const tags = row.tags as string[];
      const firstSix = tags.slice(0, 6).map((t) => t.toLowerCase());
      if (!firstSix.includes("yuri") && !firstSix.includes("shoujo ai")) {
        toDelete.push(row.id);
      }
    }

    console.log(`Found ${toDelete.length} works without yuri in first 6 tags.`);

    if (toDelete.length === 0) {
      console.log("Nothing to delete.");
      return;
    }

    // Delete from Postgres
    await pg`
      DELETE FROM works WHERE id IN ${pg(toDelete)}
    `;
    console.log(`Deleted ${toDelete.length} works from Postgres.`);

    // Delete from Neo4j
    const session = neo4j.session();
    try {
      for (const id of toDelete) {
        await session.run(
          "MATCH (w:GL_Work {id: $id}) DETACH DELETE w",
          { id }
        );
      }
      console.log(`Deleted ${toDelete.length} works from Neo4j.`);
    } finally {
      await session.close();
    }

    // Verify
    const remaining = await pg`SELECT count(*) AS count FROM works`;
    console.log(`\nRemaining works: ${remaining[0].count}`);
  } finally {
    await closePostgres();
    await closeNeo4j();
  }
}

filterYuri().catch((error) => {
  console.error("Filter failed:", error);
  process.exitCode = 1;
});
