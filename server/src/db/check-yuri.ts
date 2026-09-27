import "dotenv/config";
import { initPostgres, closePostgres } from "./postgres.js";
import { loadConfig } from "../config.js";

async function check() {
  const db = initPostgres(loadConfig());
  try {
    const result = await db`
      SELECT id, title, tags FROM works
      ORDER BY id
    `;

    let withYuri = 0;
    let withoutYuri = 0;
    const toDelete: string[] = [];

    for (const row of result) {
      const tags = row.tags as string[];
      const firstSix = tags.slice(0, 6).map((t) => t.toLowerCase());
      if (firstSix.includes("yuri") || firstSix.includes("shoujo ai")) {
        withYuri++;
      } else {
        withoutYuri++;
        toDelete.push(row.id);
      }
    }

    console.log(`Works with yuri/shoujo-ai in first 6 tags: ${withYuri}`);
    console.log(`Works WITHOUT yuri in first 6 tags: ${withoutYuri}`);
    console.log(`\nWorks to delete (first 10):`);
    for (const id of toDelete.slice(0, 10)) {
      const row = result.find((r) => r.id === id);
      console.log(`  ${id}: ${row?.title} [${row?.tags.join(", ")}]`);
    }
    console.log(`\nTotal to delete: ${toDelete.length}`);
  } finally {
    await closePostgres();
  }
}

check().catch((error) => {
  console.error("Check failed:", error);
  process.exitCode = 1;
});
