/**
 * Recommendation endpoints.
 *
 * Uses Neo4j graph traversals to find similar works and explainable
 * match scores based on shared tags and collaborative signals.
 */

import type { FastifyInstance } from "fastify";
import neo4j from "neo4j-driver";
import { z } from "zod";
import { loadConfig } from "../config.js";
import {
  filterEligibleInteractions,
  rankPersonalizedWorks,
  type RecommendationWork,
  type WorkInteraction,
} from "../recommendations/scoring.js";
import { authenticateUser } from "./auth.js";
import { syncUserGraph } from "./user-graph-sync.js";

const SimilarWorksSchema = z.object({
  workId: z.string().min(1),
  limit: z.coerce.number().int().min(1).max(20).default(6),
});

const RecommendationLimitSchema = z.object({
  limit: z.coerce.number().int().min(1).max(20).default(10),
});

function toJsonNumber(value: unknown): number {
  if (neo4j.isInt(value)) return value.toNumber();
  if (typeof value === "number" && Number.isFinite(value)) return value;
  throw new Error("Neo4j returned a non-numeric recommendation score.");
}

export default async function recommendationRoutes(
  fastify: FastifyInstance
): Promise<void> {
  const config = loadConfig();

  fastify.get("/api/recommendations", async (request, reply) => {
    const userId = await authenticateUser(fastify, config, request, reply);
    if (!userId) return;

    const parsed = RecommendationLimitSchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({
        error: "Invalid request",
        details: parsed.error.flatten().fieldErrors,
      });
    }
    const driver = fastify.neo4j;
    if (!driver) {
      return reply.code(503).send({ error: "Recommendation graph is not configured." });
    }
    if (!(await syncUserGraph(fastify, userId))) {
      return reply.code(503).send({ error: "Recommendation graph is not synchronized." });
    }

    const catalogRows = await fastify.postgres`
      SELECT id, title, format, tags
      FROM works
      WHERE curation_status = 'approved'
        AND EXISTS (
          SELECT 1
          FROM unnest(tags[1:6]) AS tag
          WHERE lower(tag) IN ('yuri', 'shoujo ai')
        )
    `;
    const optedInRows = await fastify.postgres`
      SELECT user_id
      FROM recommendation_preferences
      WHERE share_activity = true
    `;
    const optedInUserIds = new Set(optedInRows.map((row) => String(row.user_id)));
    const workById = new Map<string, RecommendationWork>();
    for (const row of catalogRows) {
      if (!Array.isArray(row.tags) || !row.tags.every((tag) => typeof tag === "string")) {
        throw new Error(`Invalid tags returned for recommendation work ${String(row.id)}`);
      }
      workById.set(String(row.id), {
        id: String(row.id),
        title: String(row.title),
        format: String(row.format),
        tags: row.tags,
      });
    }

    const session = driver.session();
    try {
      const result = await session.run(
        `MATCH (u:User)-[r]->(w:GL_Work)
         WHERE type(r) IN ['FAVORITED', 'WATCHED']
         RETURN u.id AS userId, w.id AS workId, type(r) AS kind`,
      );
      const interactions: WorkInteraction[] = result.records.flatMap((record) => {
        const interactionUserId: unknown = record.get("userId");
        const workId: unknown = record.get("workId");
        const kind: unknown = record.get("kind");
        if (
          typeof interactionUserId !== "string" ||
          typeof workId !== "string" ||
          !workById.has(workId) ||
          (kind !== "FAVORITED" && kind !== "WATCHED")
        ) {
          return [];
        }
        return [{
          userId: interactionUserId,
          workId,
          kind: kind === "FAVORITED" ? "favorite" : "watched",
        }];
      });
      const currentUserInteractions = await fastify.postgres`
        SELECT work_id, 'favorite' AS kind
        FROM favorites
        WHERE user_id = ${userId}
        UNION ALL
        SELECT work_id, 'watched' AS kind
        FROM watched_works
        WHERE user_id = ${userId}
      `;
      for (const row of currentUserInteractions) {
        const workId = String(row.work_id);
        if (workById.has(workId) && (row.kind === "favorite" || row.kind === "watched")) {
          interactions.push({ userId, workId, kind: row.kind });
        }
      }
      const eligibleInteractions = filterEligibleInteractions(
        userId,
        optedInUserIds,
        interactions,
      );

      const communityRows = await fastify.postgres`
        SELECT user_id, community_id
        FROM community_members
      `;
      const communityInteractions = communityRows
        .filter((row) => row.user_id === userId || optedInUserIds.has(String(row.user_id)))
        .map((row) => ({
          userId: String(row.user_id),
          communityId: String(row.community_id),
        }));

      const shipRows = await fastify.postgres`
        SELECT user_id, ship_id
        FROM ship_favorites
      `;
      const shipInteractions = shipRows
        .filter((row) => row.user_id === userId || optedInUserIds.has(String(row.user_id)))
        .map((row) => ({
          userId: String(row.user_id),
          shipId: String(row.ship_id),
        }));

      const ranked = rankPersonalizedWorks(
        userId,
        [...workById.values()],
        eligibleInteractions,
        parsed.data.limit,
        communityInteractions,
        shipInteractions,
      );
      return ranked;
    } finally {
      await session.close();
    }
  });

  fastify.put("/api/recommendations/participation", async (request, reply) => {
    const userId = await authenticateUser(fastify, config, request, reply);
    if (!userId) return;
    const parsed = z.object({ shareActivity: z.boolean() }).safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: "Invalid request",
        details: parsed.error.flatten().fieldErrors,
      });
    }
    const rows = await fastify.postgres`
      INSERT INTO recommendation_preferences (user_id, share_activity, updated_at)
      VALUES (${userId}, ${parsed.data.shareActivity}, now())
      ON CONFLICT (user_id)
      DO UPDATE SET share_activity = EXCLUDED.share_activity, updated_at = now()
      RETURNING share_activity
    `;
    return { shareActivity: Boolean(rows[0]?.share_activity) };
  });

  /**
   * GET /api/works/:workId/similar
   *
   * Returns works that share tags with the given work, ranked by
   * tag overlap. Includes an explainable match score.
   */
  fastify.get("/api/works/:workId/similar", async (request, reply) => {
    const params = request.params as { workId: string };
    const query = request.query as { limit?: string };
    const parsed = SimilarWorksSchema.safeParse({ ...params, ...query });
    if (!parsed.success) {
      return reply.code(400).send({
        error: "Invalid request",
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const { workId } = parsed.data;
    const limit = neo4j.int(parsed.data.limit);
    const driver = fastify.neo4j;
    if (!driver) throw new Error("Neo4j not initialized");

    const session = driver.session();
    try {
      const result = await session.run(
        /* Cypher */ `
          MATCH (w:GL_Work {id: $workId})-[:HAS_TAG]->(t:Tag)<-[:HAS_TAG]-(similar:GL_Work)
          WHERE similar.id <> $workId
          WITH similar, count(DISTINCT t) AS sharedTags, collect(DISTINCT t.name) AS sharedTagNames
          ORDER BY sharedTags DESC, similar.title ASC
          LIMIT $limit
          RETURN similar.id AS id,
                 similar.title AS title,
                 similar.format AS format,
                 sharedTags,
                 sharedTagNames,
                 round(100.0 * sharedTags / $maxTags) AS matchScore
        `,
        { workId, limit, maxTags: 10 }
      );

      const recommendations = result.records.map((record) => ({
        id: record.get("id"),
        title: record.get("title"),
        format: record.get("format"),
        sharedTags: toJsonNumber(record.get("sharedTags")),
        sharedTagNames: record.get("sharedTagNames"),
        matchScore: toJsonNumber(record.get("matchScore")),
      }));

      return { workId, recommendations };
    } finally {
      await session.close();
    }
  });

  /**
   * GET /api/users/:userId/matches/:workId
   *
   * Explainable match score between a user and a work.
   * Based on tag overlap between the user's liked works and the target work.
   */
  fastify.get("/api/users/:userId/matches/:workId", async (request, reply) => {
    const params = request.params as { userId: string; workId: string };
    const { userId, workId } = params;
    const authenticatedUserId = await authenticateUser(fastify, config, request, reply);
    if (!authenticatedUserId) return;
    if (authenticatedUserId !== userId) {
      return reply.code(403).send({ error: "You can only view your own match scores." });
    }

    const driver = fastify.neo4j;
    if (!driver) throw new Error("Neo4j not initialized");

    const session = driver.session();
    try {
      const result = await session.run(
        /* Cypher */ `
          MATCH (u:User {id: $userId})-[:FAVORITED|WATCHED]->(liked:GL_Work)-[:HAS_TAG]->(t:Tag)
          WITH u, collect(DISTINCT t.name) AS userTags
          MATCH (w:GL_Work {id: $workId})-[:HAS_TAG]->(wt:Tag)
          WITH u, userTags, w, collect(DISTINCT wt.name) AS workTags
          WITH userTags, workTags,
               [t IN userTags WHERE t IN workTags] AS sharedTags
          RETURN size(sharedTags) AS sharedCount,
                 size(workTags) AS workTagCount,
                 sharedTags,
                 round(100.0 * size(sharedTags) / size(workTags)) AS matchScore
        `,
        { userId, workId }
      );

      const record = result.records[0];
      if (!record) {
        return reply.code(404).send({ error: "User or work not found" });
      }

      return {
        userId,
        workId,
        sharedCount: toJsonNumber(record.get("sharedCount")),
        workTagCount: toJsonNumber(record.get("workTagCount")),
        sharedTags: record.get("sharedTags"),
        matchScore: toJsonNumber(record.get("matchScore")),
      };
    } finally {
      await session.close();
    }
  });
}
