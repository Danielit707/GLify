import "dotenv/config";
import { closePostgres, initPostgres } from "./postgres.js";
import { loadConfig } from "../config.js";

type CurationAction =
  | { action: "list"; ids: [] }
  | { action: "approve" | "reject"; ids: string[] };

function getAction(args: string[]): CurationAction {
  if (args.length === 1 && args[0] === "--list") return { action: "list", ids: [] };

  if (
    args.length === 2 &&
    (args[0] === "--approve" || args[0] === "--reject")
  ) {
    const ids = [...new Set(args[1].split(",").map((id) => id.trim()))];
    if (ids.some((id) => !/^anilist-\d+$/.test(id))) {
      throw new Error("Only AniList IDs in the form anilist-123 can be curated.");
    }
    return { action: args[0] === "--approve" ? "approve" : "reject", ids };
  }

  throw new Error(
    "Use --list, --approve anilist-123[,anilist-456], or --reject anilist-123[,anilist-456].",
  );
}

async function curateAniList(): Promise<void> {
  const { action, ids } = getAction(process.argv.slice(2));
  const db = initPostgres(loadConfig());

  try {
    if (action === "list") {
      const rows = await db`
        SELECT id, title, format, genre, tags
        FROM works
        WHERE id LIKE 'anilist-%' AND curation_status = 'pending_review'
        ORDER BY title
      `;

      if (rows.length === 0) {
        console.info("No AniList titles are waiting for review.");
        return;
      }

      console.info(`${rows.length} AniList title(s) waiting for review:`);
      for (const row of rows) {
        const tags = Array.isArray(row.tags) ? row.tags.join(", ") : "";
        console.info(
          `${row.id}\t${row.format}\t${row.title}\tGenre: ${row.genre}\tTags: ${tags}`,
        );
      }
      return;
    }

    const status = action === "approve" ? "approved" : "rejected";
    await db.begin(async (transaction) => {
      const existing = await transaction`
        SELECT id
        FROM works
        WHERE id = ANY(${ids}) AND id LIKE 'anilist-%'
        FOR UPDATE
      `;
      const existingIds = new Set(existing.map((row) => String(row.id)));
      const missing = ids.filter((id) => !existingIds.has(id));
      if (missing.length > 0) {
        throw new Error(`AniList work(s) not found: ${missing.join(", ")}`);
      }

      await transaction`
        UPDATE works
        SET curation_status = ${status}, updated_at = now()
        WHERE id = ANY(${ids}) AND id LIKE 'anilist-%'
      `;
    });

    console.info(`${ids.length} AniList title(s) marked ${status}.`);
  } finally {
    await closePostgres();
  }
}

curateAniList().catch((error: unknown) => {
  console.error("AniList curation failed:", error);
  process.exitCode = 1;
});
