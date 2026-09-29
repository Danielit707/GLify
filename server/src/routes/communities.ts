/**
 * Community endpoints.
 *
 * Communities are spaces for members to discuss and connect. There are two types:
 * - Work communities: tied to a specific work (grouping all its formats)
 * - General communities: not tied to a specific work
 *
 * Communities can have an image and are created by members.
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { randomUUID } from "node:crypto";

const CreateCommunitySchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().min(1).max(500),
  isGeneral: z.boolean().default(true),
  workIds: z.array(z.string()).optional(),
  image: z.string().url().optional(),
});

const QuerySchema = z.object({
  filter: z.enum(["all", "general", "work"]).default("all"),
  workId: z.string().optional(),
});

interface Community {
  id: string;
  name: string;
  description: string;
  memberCount: number;
  isGeneral: boolean;
  image: string | null;
  workIds: string[];
  createdBy: string;
  createdAt: string;
}

export default async function communityRoutes(
  fastify: FastifyInstance
): Promise<void> {
  /**
   * GET /api/communities
   *
   * List communities with optional filtering.
   * - filter=all: show all communities
   * - filter=general: show only general communities
   * - filter=work: show only work-focused communities
   * - workId: filter by specific work
   */
  fastify.get("/api/communities", async (request, reply) => {
    const parsed = QuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({
        error: "Invalid query parameters",
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const { filter, workId } = parsed.data;

    // Get current user ID from Clerk token
    const clerkToken = request.headers["authorization"]?.replace("Bearer ", "");
    let currentUserId: string | null = null;
    if (clerkToken) {
      try {
        const payload = clerkToken.split(".")[1];
        const decoded = JSON.parse(Buffer.from(payload, "base64").toString());
        currentUserId = decoded.sub || decoded.user_id || null;
      } catch {
        // Invalid token, treat as anonymous
      }
    }

    // Build the query based on filters using parameterized SQL
    const conditions: string[] = [];
    const params: any[] = [];

    if (filter === "general") {
      conditions.push("is_general = true");
    } else if (filter === "work") {
      conditions.push("is_general = false");
    }

    if (workId) {
      params.push(workId);
      conditions.push(`$${params.length} = ANY(work_ids)`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    // Add user ID as a parameter for the EXISTS subquery
    const allParams = [...params];
    if (currentUserId) {
      allParams.push(currentUserId);
    }

    const memberCheck = currentUserId
      ? `EXISTS (SELECT 1 FROM community_members cm WHERE cm.community_id = c.id AND cm.user_id = $${allParams.length})`
      : `false`;

    const rows = await fastify.postgres.unsafe(
      `SELECT
        c.id,
        c.name,
        c.description,
        c.member_count AS "memberCount",
        c.is_general AS "isGeneral",
        c.image,
        c.work_ids AS "workIds",
        c.created_by AS "createdBy",
        c.created_at AS "createdAt",
        ${memberCheck} AS "isMember"
      FROM communities c
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT 100`,
      allParams
    );

    const communities: Community[] = rows.map((row) => ({
      id: String(row.id),
      name: String(row.name),
      description: String(row.description),
      memberCount: Number(row.memberCount),
      isGeneral: Boolean(row.isGeneral),
      image: row.image ? String(row.image) : null,
      workIds: row.workIds ? row.workIds.map(String) : [],
      createdBy: String(row.createdBy),
      createdAt: String(row.createdAt),
      isMember: Boolean(row.isMember),
    }));

    return { communities };
  });

  /**
   * POST /api/communities
   *
   * Create a new community. Requires authentication.
   */
  fastify.post("/api/communities", async (request, reply) => {
    // Verify Clerk session token
    const clerkToken = request.headers["authorization"]?.replace("Bearer ", "");
    if (!clerkToken) {
      return reply.code(401).send({ error: "Authentication required" });
    }

    // Decode JWT payload to get user ID (Clerk tokens are JWTs)
    let userId = "unknown-user";
    try {
      const payload = clerkToken.split(".")[1];
      const decoded = JSON.parse(Buffer.from(payload, "base64").toString());
      userId = decoded.sub || decoded.user_id || "unknown-user";
    } catch {
      return reply.code(401).send({ error: "Invalid token" });
    }

    const parsed = CreateCommunitySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: "Invalid community data",
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const { name, description, isGeneral, workIds, image } = parsed.data;

    const communityId = randomUUID();

    let rows;
    try {
      rows = await fastify.postgres`
        INSERT INTO communities (
          id,
          name,
          description,
          is_general,
          work_ids,
          image,
          created_by,
          member_count
        )
        VALUES (
          ${communityId},
          ${name},
          ${description},
          ${isGeneral},
          ${workIds ?? []},
          ${image ?? null},
          ${userId},
          1
        )
        RETURNING
          id,
          name,
          description,
          member_count AS "memberCount",
          is_general AS "isGeneral",
          image,
          work_ids AS "workIds",
          created_by AS "createdBy",
          created_at AS "createdAt"
      `;

      // Add creator as owner in community_members
      await fastify.postgres`
        INSERT INTO community_members (community_id, user_id, role)
        VALUES (${communityId}, ${userId}, 'owner')
      `;
    } catch (error) {
      request.log.error({ err: error }, "Failed to create community");
      return reply.code(500).send({
        error: "Failed to create community",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }

    const row = rows[0];
    const community: Community = {
      id: String(row.id),
      name: String(row.name),
      description: String(row.description),
      memberCount: Number(row.memberCount),
      isGeneral: Boolean(row.isGeneral),
      image: row.image ? String(row.image) : null,
      workIds: row.workIds ? row.workIds.map(String) : [],
      createdBy: String(row.createdBy),
      createdAt: String(row.createdAt),
    };

    return reply.code(201).send({ community });
  });

  /**
   * POST /api/communities/:id/join
   *
   * Join a community. Requires authentication.
   */
  fastify.post("/api/communities/:id/join", async (request, reply) => {
    const { id } = request.params as { id: string };

    // Verify Clerk session token
    const clerkToken = request.headers["authorization"]?.replace("Bearer ", "");
    if (!clerkToken) {
      return reply.code(401).send({ error: "Authentication required" });
    }

    // Decode JWT payload to get user ID
    let userId = "unknown-user";
    try {
      const payload = clerkToken.split(".")[1];
      const decoded = JSON.parse(Buffer.from(payload, "base64").toString());
      userId = decoded.sub || decoded.user_id || "unknown-user";
    } catch {
      return reply.code(401).send({ error: "Invalid token" });
    }

    try {
      // Add user as member (only if not already a member)
      const result = await fastify.postgres`
        WITH inserted AS (
          INSERT INTO community_members (community_id, user_id, role)
          VALUES (${id}, ${userId}, 'member')
          ON CONFLICT (community_id, user_id) DO NOTHING
          RETURNING community_id
        )
      UPDATE communities
        SET member_count = member_count + 1
        WHERE id = ${id} AND EXISTS (SELECT 1 FROM inserted)
        RETURNING member_count AS "memberCount"
      `;

      const wasInserted = result.length > 0;
      return reply.code(200).send({ success: true, wasInserted });
    } catch (error) {
      request.log.error({ err: error }, "Failed to join community");
      return reply.code(500).send({
        error: "Failed to join community",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  /**
   * POST /api/communities/:id/leave
   *
   * Leave a community. Requires authentication.
   */
  fastify.post("/api/communities/:id/leave", async (request, reply) => {
    const { id } = request.params as { id: string };

    const clerkToken = request.headers["authorization"]?.replace("Bearer ", "");
    if (!clerkToken) {
      return reply.code(401).send({ error: "Authentication required" });
    }

    let userId = "unknown-user";
    try {
      const payload = clerkToken.split(".")[1];
      const decoded = JSON.parse(Buffer.from(payload, "base64").toString());
      userId = decoded.sub || decoded.user_id || "unknown-user";
    } catch {
      return reply.code(401).send({ error: "Invalid token" });
    }

    try {
      const result = await fastify.postgres`
        WITH deleted AS (
          DELETE FROM community_members
          WHERE community_id = ${id} AND user_id = ${userId} AND role != 'owner'
          RETURNING community_id
        )
        UPDATE communities
        SET member_count = member_count - 1
        WHERE id = ${id} AND EXISTS (SELECT 1 FROM deleted)
        RETURNING member_count AS "memberCount"
      `;

      const wasDeleted = result.length > 0;
      return reply.code(200).send({ success: true, wasDeleted });
    } catch (error) {
      request.log.error({ err: error }, "Failed to leave community");
      return reply.code(500).send({
        error: "Failed to leave community",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  /**
   * GET /api/communities/:id
   *
   * Get a single community by ID.
   */
  fastify.get("/api/communities/:id", async (request, reply) => {
    const { id } = request.params as { id: string };

    const rows = await fastify.postgres`
      SELECT
        id,
        name,
        description,
        member_count AS "memberCount",
        is_general AS "isGeneral",
        image,
        work_ids AS "workIds",
        created_by AS "createdBy",
        created_at AS "createdAt"
      FROM communities
      WHERE id = ${id}
      LIMIT 1
    `;

    if (rows.length === 0) {
      return reply.code(404).send({ error: "Community not found" });
    }

    const row = rows[0];
    const community: Community = {
      id: String(row.id),
      name: String(row.name),
      description: String(row.description),
      memberCount: Number(row.memberCount),
      isGeneral: Boolean(row.isGeneral),
      image: row.image ? String(row.image) : null,
      workIds: row.workIds ? row.workIds.map(String) : [],
      createdBy: String(row.createdBy),
      createdAt: String(row.createdAt),
    };

    return { community };
  });
}
