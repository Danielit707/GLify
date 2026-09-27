import "dotenv/config";
import { initPostgres, closePostgres } from "./postgres.js";
import { loadConfig } from "../config.js";

async function verify() {
  const db = initPostgres(loadConfig());
  try {
    const count = await db`SELECT count(*) AS count FROM works`;
    console.log("Total works:", count[0].count);

    const formats = await db`
      SELECT format, count(*) AS count FROM works GROUP BY format ORDER BY count DESC
    `;
    console.log("By format:");
    for (const f of formats) {
      console.log(`  ${f.format}: ${f.count}`);
    }

    const sample = await db`
      SELECT id, title, format, image FROM works LIMIT 5
    `;
    console.log("Sample:");
    for (const w of sample) {
      console.log(`  ${w.id} (${w.format}): ${w.title}`);
    }
  } finally {
    await closePostgres();
  }
}

verify().catch((error) => {
  console.error("Verification failed:", error);
  process.exitCode = 1;
});
