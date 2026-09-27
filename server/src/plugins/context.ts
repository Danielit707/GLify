/**
 * Fastify plugin that attaches shared database clients to the Fastify instance,
 * making them available in route handlers via `fastify.postgres` / `fastify.neo4j`.
 */

import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import { loadConfig } from "../config.js";
import { initPostgres, closePostgres } from "../db/postgres.js";
import { initNeo4j, closeNeo4j } from "../db/neo4j.js";

declare module "fastify" {
  interface FastifyInstance {
    postgres: ReturnType<typeof initPostgres>;
    neo4j: ReturnType<typeof initNeo4j>;
  }
}

export default fp(async function contextPlugin(
  fastify: FastifyInstance
): Promise<void> {
  const config = loadConfig();

  const postgresClient = initPostgres(config);
  const neo4jDriver = initNeo4j(config);

  fastify.decorate("postgres", postgresClient);
  fastify.decorate("neo4j", neo4jDriver);

  fastify.addHook("onClose", async () => {
    await closePostgres();
    if (neo4jDriver) await closeNeo4j();
  });
});
