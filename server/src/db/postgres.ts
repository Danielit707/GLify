/**
 * Neon Postgres connection module.
 *
 * Uses the `postgres` library (postgres.js) for its first-class ESM support,
 * parameterized queries (SQL-injection safe), and serverless-friendly
 * connection handling.
 *
 * Connection string format:
 *   postgresql://user:password@host/dbname?sslmode=require
 */

import postgres from "postgres";
import type { AppConfig } from "../config.js";

let client: postgres.Sql | null = null;

export function initPostgres(config: AppConfig): postgres.Sql {
  if (client) return client;

  client = postgres(config.DATABASE_URL, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
    onnotice: () => {},
  });

  return client;
}

export function getPostgres(): postgres.Sql {
  if (!client) {
    throw new Error("Postgres not initialised. Call initPostgres() first.");
  }
  return client;
}

export async function closePostgres(): Promise<void> {
  if (client) {
    await client.end();
    client = null;
  }
}

/** Run a query and return rows. Uses parameterized SQL to prevent injection. */
export async function query<T = postgres.Row>(
  sql: string,
  params: any[] = []
): Promise<T[]> {
  const db = getPostgres();
  const rows = await db.unsafe<T[]>(sql, params);
  return rows;
}
