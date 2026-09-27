/**
 * Health check endpoint.
 *
 * Used by load balancers, uptime monitors, and container orchestrators
 * to verify the service is alive and its database connections are healthy.
 */

import type { FastifyInstance } from "fastify";

export default async function healthRoutes(
  fastify: FastifyInstance
): Promise<void> {
  const healthResponseSchema = {
    type: "object",
    properties: {
      status: { type: "string" },
      uptime: { type: "number" },
      services: {
        type: "object",
        properties: {
          postgres: { type: "string" },
          neo4j: { type: "string" },
        },
      },
    },
  } as const;

  fastify.get(
    "/health",
    {
      schema: {
        description: "Liveness and dependency health check",
        tags: ["health"],
        response: {
          200: healthResponseSchema,
          503: healthResponseSchema,
        },
      },
    },
    async (_request, reply) => {
      // Check Postgres connectivity
      let postgresStatus = "up";
      try {
        await fastify.postgres`SELECT 1`;
      } catch {
        postgresStatus = "down";
      }

      let neo4jStatus = "not_configured";
      if (fastify.neo4j) {
        neo4jStatus = "up";
        try {
          const session = fastify.neo4j.session();
          try {
            await session.run("RETURN 1");
          } finally {
            await session.close();
          }
        } catch {
          neo4jStatus = "down";
        }
      }

      const allUp = postgresStatus === "up" && neo4jStatus !== "down";
      const health = {
        status: allUp ? "ok" : "degraded",
        uptime: process.uptime(),
        services: {
          postgres: postgresStatus,
          neo4j: neo4jStatus,
        },
      };

      if (!allUp) return reply.code(503).send(health);
      return reply.code(200).send(health);
    }
  );
}
