/**
 * AniList → GLify catalog importer.
 *
 * Queries the AniList GraphQL API for media tagged with yuri/GL genres,
 * maps the response to the works table schema, and inserts into Postgres.
 *
 * Usage:
 *   npm run db:import-anilist              # imports first 50 yuri titles
 *   npm run db:import-anilist -- --page 2  # imports page 2
 *
 * AniList GraphQL endpoint: https://graphql.anilist.co
 * No auth required for read-only queries.
 */

import "dotenv/config";
import { z } from "zod";
import { closePostgres, initPostgres } from "./postgres.js";
import { loadConfig } from "../config.js";

// ---------------------------------------------------------------------------
// AniList format → GLify format mapping
// ---------------------------------------------------------------------------

type WorkFormat = "Anime" | "Manga" | "Light novel";

const ANILIST_FORMAT_MAP = new Map<string, WorkFormat>([
  ["TV", "Anime"],
  ["TV_SHORT", "Anime"],
  ["MOVIE", "Anime"],
  ["SPECIAL", "Anime"],
  ["OVA", "Anime"],
  ["ONA", "Anime"],
  ["MUSIC", "Anime"],
  ["MANGA", "Manga"],
  ["ONE_SHOT", "Manga"],
  ["NOVEL", "Light novel"],
]);

// ---------------------------------------------------------------------------
// GraphQL query — fetch media tagged with "Yuri" genre
// ---------------------------------------------------------------------------

const YURI_MEDIA_QUERY = /* GraphQL */ `
  query GetYuriMedia($page: Int, $perPage: Int) {
    Page(page: $page, perPage: $perPage) {
      pageInfo {
        hasNextPage
        currentPage
      }
      media(
        genre: "Yuri"
        sort: POPULARITY_DESC
        isAdult: false
      ) {
        id
        title {
          romaji
          english
          native
        }
        format
        description
        coverImage {
          large
          medium
        }
        averageScore
        chapters
        volumes
        episodes
        genres
        studios(isMain: true) {
          nodes {
            name
          }
        }
        staff(sort: ROLE) {
          nodes {
            name {
              full
            }
          }
        }
      }
    }
  }
`;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AniListMedia {
  id: number;
  title: { romaji: string | null; english: string | null; native: string | null };
  format: string;
  description: string | null;
  coverImage: { large: string | null; medium: string | null };
  averageScore: number | null;
  chapters: number | null;
  episodes: number | null;
  genres: string[];
  studios: { nodes: Array<{ name: string }> };
  staff: { nodes: Array<{ name: { full: string } }> };
}

const AniListResponseSchema = z.object({
  data: z.object({
    Page: z.object({
      pageInfo: z.object({
        hasNextPage: z.boolean(),
        currentPage: z.number().int().positive(),
      }),
      media: z.array(z.object({
        id: z.number().int().positive(),
        title: z.object({
          romaji: z.string().nullable(),
          english: z.string().nullable(),
          native: z.string().nullable(),
        }),
        format: z.string(),
        description: z.string().nullable(),
        coverImage: z.object({
          large: z.string().nullable(),
          medium: z.string().nullable(),
        }),
        averageScore: z.number().min(0).max(100).nullable(),
        chapters: z.number().int().positive().nullable(),
        episodes: z.number().int().positive().nullable(),
        genres: z.array(z.string()),
        studios: z.object({
          nodes: z.array(z.object({ name: z.string() })),
        }),
        staff: z.object({
          nodes: z.array(z.object({
            name: z.object({ full: z.string() }),
          })),
        }),
      })),
    }),
  }).optional(),
  errors: z.array(z.object({ message: z.string() })).optional(),
});

// ---------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------

function mapAniListToWork(media: AniListMedia) {
  const format = ANILIST_FORMAT_MAP.get(media.format);
  if (!format) return null;

  const title = media.title.english || media.title.romaji || media.title.native;
  if (!title) return null;

  const studio = media.studios.nodes[0]?.name ?? "Unknown";
  const creator = media.staff.nodes[0]?.name.full ?? studio;

  const chapters =
    media.format === "MANGA"
      ? media.chapters
        ? `${media.chapters} chapters`
        : "Unknown chapters"
      : media.episodes
        ? `${media.episodes} episodes`
        : "Unknown episodes";

  const rating =
    media.averageScore === null ? null : (media.averageScore / 20).toFixed(1);

  const description =
    media.description?.replace(/<[^>]*>/g, "").slice(0, 300) ??
    "No description available.";

  const tags = media.genres.filter(
    (g) => !["Romance", "Drama"].includes(g)
  );

  return {
    id: `anilist-${media.id}`,
    title,
    creator,
    format,
    genre: media.genres[0] ?? "Romance",
    description,
    image: media.coverImage.large || media.coverImage.medium || "",
    imageAlt: `Cover art for ${title}`,
    rating,
    chapters,
    match: null,
    tags,
  };
}

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

async function fetchYuriMedia(
  page: number,
  perPage: number
): Promise<AniListMedia[]> {
  const endpoint = process.env["ANILIST_API_URL"] ?? "https://graphql.anilist.co";
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      query: YURI_MEDIA_QUERY,
      variables: { page, perPage },
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    throw new Error(
      `AniList API returned HTTP ${response.status}: ${response.statusText}`
    );
  }

  const parsed = AniListResponseSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new Error(`AniList API returned an unexpected response: ${parsed.error.message}`);
  }
  if (parsed.data.errors?.length) {
    throw new Error(`AniList GraphQL error: ${parsed.data.errors.map((error) => error.message).join("; ")}`);
  }
  if (!parsed.data.data) {
    throw new Error("AniList API response did not include catalog data.");
  }
  return parsed.data.data.Page.media;
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

function parsePositiveInteger(value: string | undefined, name: string, fallback: number): number {
  if (value === undefined) return fallback;
  if (!/^[1-9]\d*$/.test(value)) {
    throw new Error(`--${name} must be a positive integer; received "${value}".`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`--${name} is outside the supported integer range.`);
  }
  return parsed;
}

async function importFromAniList(page = 1, perPage = 50): Promise<void> {
  const config = loadConfig();
  const db = initPostgres(config);

  try {
    const media = await fetchYuriMedia(page, perPage);
    let upserted = 0;
    let skipped = 0;

    await db.begin(async (transaction) => {
      for (const item of media) {
        const work = mapAniListToWork(item);
        if (!work) {
          skipped++;
          continue;
        }

        await transaction`
          INSERT INTO works (
            id, title, creator, format, genre, description, image, image_alt,
            rating, chapters, match_score, tags
          )
          VALUES (
            ${work.id}, ${work.title}, ${work.creator}, ${work.format},
            ${work.genre}, ${work.description}, ${work.image}, ${work.imageAlt},
            ${work.rating}, ${work.chapters}, ${work.match}, ${work.tags}
          )
          ON CONFLICT (id) DO UPDATE SET
            title = EXCLUDED.title,
            creator = EXCLUDED.creator,
            format = EXCLUDED.format,
            genre = EXCLUDED.genre,
            description = EXCLUDED.description,
            image = EXCLUDED.image,
            image_alt = EXCLUDED.image_alt,
            rating = EXCLUDED.rating,
            chapters = EXCLUDED.chapters,
            match_score = EXCLUDED.match_score,
            tags = EXCLUDED.tags,
            updated_at = now()
        `;
        upserted++;
      }
    });

    console.info(
      `AniList import complete: ${upserted} inserted/updated, ${skipped} skipped (page ${page}).`
    );
  } finally {
    await closePostgres();
  }
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const options = new Map<string, string>();
for (let index = 0; index < args.length; index++) {
  const argument = args[index];
  if (argument !== "--page" && argument !== "--per-page") {
    throw new Error(`Unknown option "${argument}". Use --page or --per-page.`);
  }
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${argument}.`);
  }
  if (options.has(argument)) {
    throw new Error(`Option ${argument} may only be specified once.`);
  }
  options.set(argument, value);
  index++;
}

const page = parsePositiveInteger(options.get("--page"), "page", 1);
const perPage = parsePositiveInteger(options.get("--per-page"), "per-page", 50);
if (perPage > 50) {
  throw new Error("--per-page cannot exceed AniList's 50-item page limit.");
}

importFromAniList(page, perPage).catch((error: unknown) => {
  console.error("AniList import failed:", error);
  process.exitCode = 1;
});
