import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { loadConfig } from "../config.js";
import { authenticateUser } from "./auth.js";
import { syncUserGraph } from "./user-graph-sync.js";

const WorkParamsSchema = z.object({
  workId: z.string().trim().min(1).max(200),
});

export default async function activityRoutes(fastify: FastifyInstance): Promise<void> {
  const config = loadConfig();

  fastify.get("/api/library", async (request, reply) => {
    const userId = await authenticateUser(fastify, config, request, reply);
    if (!userId) return;

    await fastify.postgres`
      INSERT INTO recommendation_preferences (user_id)
      VALUES (${userId})
      ON CONFLICT (user_id) DO NOTHING
    `;
    const [favoriteRows, watchedRows, preferenceRows, commentedRows] = await Promise.all([
      fastify.postgres`
        SELECT work_id FROM favorites
        WHERE user_id = ${userId}
        ORDER BY created_at DESC, work_id ASC
      `,
      fastify.postgres`
        SELECT work_id FROM watched_works
        WHERE user_id = ${userId}
        ORDER BY created_at DESC, work_id ASC
      `,
      fastify.postgres`
        SELECT share_activity FROM recommendation_preferences
        WHERE user_id = ${userId}
      `,
      fastify.postgres`
        SELECT DISTINCT work_id FROM work_comments
        WHERE user_id = ${userId}
      `,
    ]);
    const graphSynced = await syncUserGraph(fastify, userId);
    return {
      favorites: favoriteRows.map((row) => String(row.work_id)),
      watched: watchedRows.map((row) => String(row.work_id)),
      commented: commentedRows.map((row) => String(row.work_id)),
      shareActivity: Boolean(preferenceRows[0]?.share_activity),
      graphSynced,
    };
  });

  fastify.put("/api/activity/:workId", async (request, reply) => {
    const userId = await authenticateUser(fastify, config, request, reply);
    if (!userId) return;

    const parsed = WorkParamsSchema.safeParse(request.params);
    if (!parsed.success) {
      return reply.code(400).send({
        error: "Invalid work ID",
        details: parsed.error.flatten().fieldErrors,
      });
    }
    const workRows = await fastify.postgres`
      SELECT id FROM works WHERE id = ${parsed.data.workId}
    `;
    if (workRows.length === 0) return reply.code(404).send({ error: "Work not found." });

    await fastify.postgres`
      INSERT INTO watched_works (user_id, work_id)
      VALUES (${userId}, ${parsed.data.workId})
      ON CONFLICT (user_id, work_id) DO NOTHING
    `;
    return reply.send({ graphSynced: await syncUserGraph(fastify, userId) });
  });

  fastify.delete("/api/activity/:workId", async (request, reply) => {
    const userId = await authenticateUser(fastify, config, request, reply);
    if (!userId) return;

    const parsed = WorkParamsSchema.safeParse(request.params);
    if (!parsed.success) {
      return reply.code(400).send({
        error: "Invalid work ID",
        details: parsed.error.flatten().fieldErrors,
      });
    }
    await fastify.postgres`
      DELETE FROM watched_works
      WHERE user_id = ${userId} AND work_id = ${parsed.data.workId}
    `;
    return reply.send({ graphSynced: await syncUserGraph(fastify, userId) });
  });
}
