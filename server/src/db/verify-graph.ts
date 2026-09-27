import "dotenv/config";
import { initNeo4j, closeNeo4j } from "./neo4j.js";
import { loadConfig } from "../config.js";

async function verify() {
  const config = loadConfig();
  const driver = initNeo4j(config);
  if (!driver) throw new Error("Neo4j is not configured.");
  const session = driver.session();

  try {
    const works = await session.run("MATCH (w:GL_Work) RETURN count(w) AS count");
    const tags = await session.run("MATCH (t:Tag) RETURN count(t) AS count");
    const users = await session.run("MATCH (u:User) RETURN count(u) AS count");
    const likes = await session.run("MATCH ()-[r:LIKED]->() RETURN count(r) AS count");
    const sample = await session.run("MATCH (w:GL_Work) RETURN w.id AS id, w.title AS title LIMIT 5");

    console.log("Works:", works.records[0]?.get("count")?.toNumber?.());
    console.log("Tags:", tags.records[0]?.get("count")?.toNumber?.());
    console.log("Users:", users.records[0]?.get("count")?.toNumber?.());
    console.log("Likes:", likes.records[0]?.get("count")?.toNumber?.());
    console.log("Sample works:");
    for (const record of sample.records) {
      console.log(`  ${record.get("id")}: ${record.get("title")}`);
    }
  } finally {
    await session.close();
    await closeNeo4j();
  }
}

verify().catch((error) => {
  console.error("Verification failed:", error);
  process.exitCode = 1;
});
