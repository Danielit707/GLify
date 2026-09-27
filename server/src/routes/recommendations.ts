/**
 * Recommendation endpoints.
 *
 * Uses Neo4j graph traversals to find similar works and explainable
 * match scores based on shared tags and collaborative signals.
 */

import type { FastifyInstance } from "fastify";
import neo4j from "neo4j-driver";
import { z } from "zod";

const SimilarWorksSchema = z.object({
  workId: z.string().min(1),
  limit: z.coerce.number().int().min(1).max(20).default(6),
});

const UserRecommendationsSchema = z.object({
  userId: z.string().min(1),
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
   * GET /api/users/:userId/recommendations
   *
   * Collaborative filtering: finds works liked by users with similar
   * taste, excluding works the current user already liked.
   */
  fastify.get("/api/users/:userId/recommendations", async (request, reply) => {
    const params = request.params as { userId: string };
    const query = request.query as { limit?: string };
    const parsed = UserRecommendationsSchema.safeParse({ ...params, ...query });
    if (!parsed.success) {
      return reply.code(400).send({
        error: "Invalid request",
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const { userId, limit } = parsed.data;

    const driver = fastify.neo4j;
    if (!driver) throw new Error("Neo4j not initialized");

    const session = driver.session();
    try {
      const result = await session.run(
        /* Cypher */ `
          MATCH (u1:User {id: $userId})-[:LIKED]->(shared:GL_Work)<-[:LIKED]-(u2:User)
          WHERE u1 <> u2
          WITH u1, u2, count(DISTINCT shared) AS commonLikes
          ORDER BY commonLikes DESC
          LIMIT 5
          MATCH (u2)-[:LIKED]->(candidate:GL_Work)
          WHERE NOT (u1)-[:LIKED]->(candidate)
          WITH candidate, sum(commonLikes) AS neighborScore
          ORDER BY neighborScore DESC
          LIMIT $limit
          RETURN candidate.id AS id,
                 candidate.title AS title,
                 candidate.format AS format,
                 neighborScore
        `,
        { userId, limit: neo4j.int(limit) }
      );

      const recommendations = result.records.map((record) => ({
        id: record.get("id"),
        title: record.get("title"),
        format: record.get("format"),
        neighborScore: toJsonNumber(record.get("neighborScore")),
      }));

      return { userId, recommendations };
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

    const driver = fastify.neo4j;
    if (!driver) throw new Error("Neo4j not initialized");

    const session = driver.session();
    try {
      const result = await session.run(
        /* Cypher */ `
          MATCH (u:User {id: $userId})-[:LIKED]->(liked:GL_Work)-[:HAS_TAG]->(t:Tag)
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
