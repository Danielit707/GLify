/**
 * Server entry point.
 *
 * Loads configuration, builds the app, starts listening,
 * and wires up graceful shutdown handlers.
 */

import "dotenv/config";
import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const app = await buildApp(config);

  // Graceful shutdown for container orchestration and local Ctrl+C
  const shutdown = async (signal: string) => {
    app.log.info(`${signal} received, shutting down...`);
    try {
      await app.close();
      process.exit(0);
    } catch (err) {
      app.log.error(err, "Error during shutdown");
      process.exit(1);
    }
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  await app.listen({
    port: config.PORT,
    host: config.HOST,
  });
}

main().catch((err) => {
  console.error("Fatal error starting server:", err);
  process.exit(1);
});
