import { verifyToken } from "@clerk/backend";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { AppConfig } from "../config.js";

export async function authenticateUser(
  fastify: FastifyInstance,
  config: AppConfig,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<string | null> {
  const authorization = request.headers.authorization;
  const token = authorization?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token) {
    reply.code(401).send({ error: "Sign in is required to manage favorites." });
    return null;
  }

  if (!config.CLERK_SECRET_KEY) {
    reply.code(503).send({ error: "Account favorites are not configured on the server." });
    return null;
  }

  try {
    const claims = await verifyToken(token, {
      secretKey: config.CLERK_SECRET_KEY,
      authorizedParties: config.CORS_ORIGIN.split(",").map((origin) => origin.trim()),
    });
    if (typeof claims.sub !== "string" || claims.sub.length === 0) {
      reply.code(401).send({ error: "The sign-in token has no user identity." });
      return null;
    }
    return claims.sub;
  } catch {
    fastify.log.warn("Clerk token verification failed");
    reply.code(401).send({ error: "The sign-in token is invalid or expired." });
    return null;
  }
}
