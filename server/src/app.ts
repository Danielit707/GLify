/**
 * Application factory.
 *
 * Builds and configures the Fastify instance without starting it.
 * Kept separate from index.ts so it can be imported by tests and
 * deployment scripts without triggering a listen() call.
 */

import Fastify from "fastify";
import cors from "@fastify/cors";
import { getAllowedOrigins, type AppConfig } from "./config.js";
import contextPlugin from "./plugins/context.js";
import healthRoutes from "./routes/health.js";
import workRoutes from "./routes/works.js";
import recommendationRoutes from "./routes/recommendations.js";
import favoriteRoutes from "./routes/favorites.js";
import activityRoutes from "./routes/activity.js";
import communityRoutes from "./routes/communities.js";

export async function buildApp(config: AppConfig): Promise<ReturnType<typeof Fastify>> {
  const app = Fastify({
    logger: {
      level: process.env["LOG_LEVEL"] ?? "info",
    },
  });

  // CORS — restrict to known origins
  await app.register(cors, {
    origin: getAllowedOrigins(config),
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  });

  // Attach database clients to the Fastify instance
  await app.register(contextPlugin);

  // Routes
  await app.register(healthRoutes);
  await app.register(workRoutes);
  await app.register(recommendationRoutes);
  await app.register(favoriteRoutes);
  await app.register(activityRoutes);
  await app.register(communityRoutes);

  return app;
}
