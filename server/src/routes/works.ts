import { z } from "zod";
import type postgres from "postgres";
import type { FastifyInstance } from "fastify";

type WorkFormat = "Manga" | "Manhwa" | "Light novel" | "Live action" | "Anime" | "Webtoon";

interface CatalogWork {
  id: string;
  title: string;
  creator: string;
  format: WorkFormat;
  genre: string;
  description: string;
  image: string;
  imageAlt: string;
  rating?: string;
  chapters: string;
  match?: number;
  tags: string[];
}

const Formats = ["Manga", "Manhwa", "Light novel", "Live action", "Anime", "Webtoon"] as const;

const QuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  genre: z.string().trim().min(1).max(80).optional(),
  format: z.enum(Formats).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

function toCatalogWork(row: postgres.Row): CatalogWork {
  const format = row.format;
  if (
    format !== "Manga" &&
    format !== "Manhwa" &&
    format !== "Light novel" &&
    format !== "Live action" &&
    format !== "Anime" &&
    format !== "Webtoon"
  ) {
    throw new Error(`Unexpected catalog format returned by Postgres: ${String(format)}`);
  }

  if (!Array.isArray(row.tags) || !row.tags.every((tag) => typeof tag === "string")) {
    throw new Error(`Invalid tags returned for catalog work ${String(row.id)}`);
  }

  const match = row.match === null ? undefined : Number(row.match);
  if (match !== undefined && (!Number.isInteger(match) || match < 0 || match > 100)) {
    throw new Error(`Invalid match score returned for catalog work ${String(row.id)}`);
  }

  return {
    id: String(row.id),
    title: String(row.title),
    creator: String(row.creator),
    format,
    genre: String(row.genre),
    description: String(row.description),
    image: String(row.image),
    imageAlt: String(row.image_alt),
    rating: row.rating === null ? undefined : String(row.rating),
    chapters: String(row.chapters),
    match,
    tags: row.tags,
  };
}

export default async function workRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get("/api/works", async (request, reply) => {
    const parsed = QuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({
        error: "Invalid catalog filters",
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const { q, genre, format, limit } = parsed.data;
    const rows = await fastify.postgres`
      SELECT
        id, title, creator, format, genre, description, image,
        image_alt, rating::text AS rating, chapters, match_score AS match, tags
      FROM works
      WHERE (
        ${q ?? null}::text IS NULL
        OR title ILIKE '%' || ${q ?? null} || '%'
        OR creator ILIKE '%' || ${q ?? null} || '%'
        OR genre ILIKE '%' || ${q ?? null} || '%'
        OR array_to_string(tags, ' ') ILIKE '%' || ${q ?? null} || '%'
      )
      AND (${format ?? null}::text IS NULL OR format = ${format ?? null})
      AND (
        ${genre ?? null}::text IS NULL
        OR lower(genre) = lower(${genre ?? null})
        OR EXISTS (
          SELECT 1
          FROM unnest(tags) AS tag
          WHERE lower(tag) = lower(${genre ?? null})
        )
      )
      ORDER BY created_at DESC, title ASC
      LIMIT ${limit}
    `;

    return { works: rows.map(toCatalogWork) };
  });
}
