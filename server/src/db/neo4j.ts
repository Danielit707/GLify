/**
 * Neo4j AuraDB connection module.
 *
 * Uses the official `neo4j-driver` with parameterized Cypher queries.
 *
 * AuraDB connection URIs use the `neo4j+s://` scheme.
 *
 */

import neo4j, { type Driver } from "neo4j-driver";
import type { AppConfig } from "../config.js";

let driver: Driver | null = null;

export function initNeo4j(config: AppConfig): Driver | null {
  if (driver) return driver;
  if (!config.NEO4J_URI || !config.NEO4J_USER || !config.NEO4J_PASSWORD) return null;

  driver = neo4j.driver(
    config.NEO4J_URI,
    neo4j.auth.basic(config.NEO4J_USER, config.NEO4J_PASSWORD),
    {
      maxConnectionLifetime: 60 * 60 * 1000,
      maxConnectionPoolSize: 50,
      connectionTimeout: 30_000,
    }
  );

  return driver;
}

export function getNeo4jDriver(): Driver {
  if (!driver) {
    throw new Error("Neo4j not initialised. Call initNeo4j() first.");
  }
  return driver;
}

export async function closeNeo4j(): Promise<void> {
  if (driver) {
    await driver.close();
    driver = null;
  }
}

/**
 * Execute a parameterized Cypher read query.
 * Always pass user-supplied values via `parameters` — never string-interpolate
 * them into the Cypher string.
 */
export async function cypherQuery(
  cypher: string,
  parameters: Record<string, unknown> = {}
): Promise<any[]> {
  const session = getNeo4jDriver().session();
  try {
    const result = await session.run(cypher, parameters);
    return result.records.map((record: any) => record.toObject());
  } finally {
    await session.close();
  }
}
