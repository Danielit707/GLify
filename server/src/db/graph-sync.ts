import type { Driver, Session } from "neo4j-driver";

export interface GraphWork {
  id: string;
  title: string;
  format: string;
  genre: string;
  tags: string[];
}

export interface GraphFavorite {
  userId: string;
  work: GraphWork;
}

export interface GraphWatchedWork {
  userId: string;
  work: GraphWork;
}

const CREATE_CONSTRAINTS = [
  "CREATE CONSTRAINT gl_work_id IF NOT EXISTS FOR (w:GL_Work) REQUIRE w.id IS UNIQUE",
  "CREATE CONSTRAINT tag_name IF NOT EXISTS FOR (t:Tag) REQUIRE t.name IS UNIQUE",
  "CREATE CONSTRAINT user_id IF NOT EXISTS FOR (u:User) REQUIRE u.id IS UNIQUE",
];

async function ensureConstraints(session: Session): Promise<void> {
  for (const statement of CREATE_CONSTRAINTS) {
    await session.run(statement);
  }
}

async function upsertWorks(session: Session, works: GraphWork[]): Promise<void> {
  if (works.length === 0) return;

  await session.run(
    `UNWIND $works AS work
     MERGE (w:GL_Work {id: work.id})
     SET w.title = work.title,
         w.format = work.format,
         w.genre = work.genre`,
    { works },
  );
  await session.run(
    `UNWIND $workIds AS workId
     MATCH (w:GL_Work {id: workId})-[r:HAS_TAG]->()
     DELETE r`,
    { workIds: works.map((work) => work.id) },
  );
  await session.run(
    `UNWIND $works AS work
     MATCH (w:GL_Work {id: work.id})
     UNWIND work.tags AS tag
     MERGE (t:Tag {name: tag})
     MERGE (w)-[:HAS_TAG]->(t)`,
    { works },
  );
}

async function replaceUserInteractions(
  session: Session,
  userId: string,
  favorites: GraphWork[],
  watchedWorks: GraphWork[],
): Promise<void> {
  await session.run("MERGE (:User {id: $userId})", { userId });
  await session.run(
    `MATCH (:User {id: $userId})-[r:FAVORITED|WATCHED]->()
     DELETE r`,
    { userId },
  );
  await session.run(
    `MATCH (:User {id: $userId})-[r:LIKED {isFavorite: true}]->()
     DELETE r`,
    { userId },
  );
  const works = [...new Map(
    [...favorites, ...watchedWorks].map((work) => [work.id, work]),
  ).values()];
  if (works.length === 0) return;

  await upsertWorks(session, works);
  await session.run(
    `UNWIND $workIds AS workId
     MATCH (u:User {id: $userId})
     MATCH (w:GL_Work {id: workId})
     MERGE (u)-[:FAVORITED]->(w)`,
    { userId, workIds: favorites.map((work) => work.id) },
  );
  await session.run(
    `UNWIND $workIds AS workId
     MATCH (u:User {id: $userId})
     MATCH (w:GL_Work {id: workId})
     MERGE (u)-[:WATCHED]->(w)`,
    { userId, workIds: watchedWorks.map((work) => work.id) },
  );
}

export async function syncUserInteractions(
  driver: Driver,
  userId: string,
  favorites: GraphWork[],
  watchedWorks: GraphWork[],
): Promise<void> {
  const session = driver.session();
  try {
    await ensureConstraints(session);
    await replaceUserInteractions(session, userId, favorites, watchedWorks);
  } finally {
    await session.close();
  }
}

export async function syncCatalogGraph(
  driver: Driver,
  works: GraphWork[],
  favorites: GraphFavorite[],
  watchedWorks: GraphWatchedWork[],
): Promise<{ workCount: number; userCount: number; favoriteCount: number }> {
  const session = driver.session();
  try {
    await ensureConstraints(session);
    await session.run(
      `MATCH (w:GL_Work)
       WHERE NOT w.id IN $workIds
       DETACH DELETE w`,
      { workIds: works.map((work) => work.id) },
    );
    await upsertWorks(session, works);
    await session.run(
      "MATCH ()-[r:FAVORITED|WATCHED]->() DELETE r",
    );
    await session.run(
      "MATCH ()-[r:LIKED {isFavorite: true}]->() DELETE r",
    );
    await session.run(
      `MATCH (u:User)
       WHERE u.id IN $seedUserIds
       DETACH DELETE u`,
      { seedUserIds: ["user-1", "user-2", "user-3", "user-4", "user-5"] },
    );

    const userIds = [...new Set([
      ...favorites.map((favorite) => favorite.userId),
      ...watchedWorks.map((watched) => watched.userId),
    ])];
    if (userIds.length > 0) {
      await session.run(
        `UNWIND $userIds AS userId
         MERGE (:User {id: userId})`,
        { userIds },
      );
      for (const [interactions, relationship] of [
        [favorites, "FAVORITED"],
        [watchedWorks, "WATCHED"],
      ] as const) {
        if (interactions.length === 0) continue;
        const cypher = relationship === "FAVORITED"
          ? `UNWIND $interactions AS item
             MATCH (u:User {id: item.userId})
             MATCH (w:GL_Work {id: item.workId})
             MERGE (u)-[:FAVORITED]->(w)`
          : `UNWIND $interactions AS item
             MATCH (u:User {id: item.userId})
             MATCH (w:GL_Work {id: item.workId})
             MERGE (u)-[:WATCHED]->(w)`;
        await session.run(cypher, {
          interactions: interactions.map(({ userId, work }) => ({
            userId,
            workId: work.id,
          })),
        });
      }
    }

    await session.run(
      `MATCH (t:Tag)
       WHERE NOT (t)<-[:HAS_TAG]-(:GL_Work)
       DELETE t`,
    );

    return {
      workCount: works.length,
      userCount: userIds.length,
      favoriteCount: favorites.length,
    };
  } finally {
    await session.close();
  }
}
