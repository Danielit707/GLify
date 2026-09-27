/**
 * Centralised environment configuration.
 * Values are read once at startup and validated with Zod so misconfiguration
 * fails fast with clear messages rather than surfacing as cryptic runtime errors.
 */

import { z } from "zod";

const DatabaseUrlSchema = z.string().min(1).refine(
  (value) => {
    try {
      const url = new URL(value);
      return (
        (url.protocol === "postgres:" || url.protocol === "postgresql:") &&
        url.hostname.length > 0 &&
        url.pathname.length > 1 &&
        !/[<>]/.test(value)
      );
    } catch {
      return false;
    }
  },
  {
    message:
      "Use the real Neon connection string (postgresql://user:password@host/database?sslmode=require); replace all template placeholders and do not include angle brackets.",
  },
);

const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3001),
  HOST: z.string().min(1).default("0.0.0.0"),
  CORS_ORIGIN: z.string().min(1).default("http://localhost:5173"),
  NEO4J_URI: z.string().url().optional(),
  NEO4J_USER: z.string().min(1).optional(),
  NEO4J_PASSWORD: z.string().min(1).optional(),
  CLERK_SECRET_KEY: z.string().min(1).optional(),
  DATABASE_URL: DatabaseUrlSchema,
  UPSTASH_REDIS_REST_URL: z.string().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
}).refine(
  ({ NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD }) =>
    [NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD].every((value) => !value) ||
    [NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD].every(Boolean),
  {
    message: "Set NEO4J_URI, NEO4J_USER, and NEO4J_PASSWORD together.",
    path: ["NEO4J_URI"],
  },
);

export type AppConfig = z.infer<typeof EnvSchema>;

const productionFrontendOrigins = ["https://glify-chi.vercel.app"];

let cached: AppConfig | null = null;

export function loadConfig(): AppConfig {
  if (cached) return cached;

  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }

  cached = parsed.data;
  return cached;
}

/** Origins trusted for browser access and Clerk token authorized-party checks. */
export function getAllowedOrigins(config: AppConfig = loadConfig()): string[] {
  return [...new Set([
    ...config.CORS_ORIGIN.split(","),
    ...productionFrontendOrigins,
  ])]
    .map((o) => o.trim())
    .filter((o) => o.length > 0);
}
