import "dotenv/config";
import { closePostgres, initPostgres } from "./postgres.js";
import { loadConfig } from "../config.js";

import { seedWorks } from "./seed-data.js";

async function setupDatabase(): Promise<void> {
  const db = initPostgres(loadConfig());
  try {
    await db.begin(async (transaction) => {
      await transaction`
        CREATE TABLE IF NOT EXISTS works (
          id text PRIMARY KEY,
          title text NOT NULL,
          creator text NOT NULL,
          format text NOT NULL CHECK (format IN ('Manga', 'Manhwa', 'Light novel', 'Live action', 'Anime', 'Webtoon')),
          genre text NOT NULL,
          description text NOT NULL,
          image text NOT NULL,
          image_alt text NOT NULL,
          rating numeric(2, 1) CHECK (rating >= 0 AND rating <= 5),
          chapters text NOT NULL,
          match_score integer CHECK (match_score >= 0 AND match_score <= 100),
          tags text[] NOT NULL DEFAULT '{}',
          curation_status text NOT NULL DEFAULT 'pending_review'
            CHECK (curation_status IN ('pending_review', 'approved', 'rejected')),
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now(),
          CONSTRAINT works_format_supported
            CHECK (format IN ('Manga', 'Manhwa', 'Light novel', 'Live action', 'Anime', 'Webtoon'))
        )
      `;
      await transaction`ALTER TABLE works ALTER COLUMN rating DROP NOT NULL`;
      await transaction`ALTER TABLE works ALTER COLUMN match_score DROP NOT NULL`;
      await transaction`
        ALTER TABLE works
        ADD COLUMN IF NOT EXISTS curation_status text NOT NULL DEFAULT 'pending_review'
      `;
      await transaction`
        UPDATE works
        SET curation_status = 'approved'
        WHERE id NOT LIKE 'anilist-%' AND curation_status = 'pending_review'
      `;
      await transaction`ALTER TABLE works DROP CONSTRAINT IF EXISTS works_format_check`;
      await transaction`ALTER TABLE works DROP CONSTRAINT IF EXISTS works_format_supported`;
      await transaction`ALTER TABLE works DROP CONSTRAINT IF EXISTS works_curation_status_check`;
      await transaction`ALTER TABLE works DROP CONSTRAINT IF EXISTS works_curation_status_supported`;
      await transaction`
        ALTER TABLE works
        ADD CONSTRAINT works_format_supported
        CHECK (format IN ('Manga', 'Manhwa', 'Light novel', 'Live action', 'Anime', 'Webtoon'))
      `;
      await transaction`
        ALTER TABLE works
        ADD CONSTRAINT works_curation_status_supported
        CHECK (curation_status IN ('pending_review', 'approved', 'rejected'))
      `;
      await transaction`
        CREATE TABLE IF NOT EXISTS favorites (
          user_id text NOT NULL,
          work_id text NOT NULL REFERENCES works(id) ON DELETE CASCADE,
          created_at timestamptz NOT NULL DEFAULT now(),
          PRIMARY KEY (user_id, work_id)
        )
      `;
      await transaction`
        CREATE TABLE IF NOT EXISTS watched_works (
          user_id text NOT NULL,
          work_id text NOT NULL REFERENCES works(id) ON DELETE CASCADE,
          created_at timestamptz NOT NULL DEFAULT now(),
          PRIMARY KEY (user_id, work_id)
        )
      `;
      await transaction`
        CREATE TABLE IF NOT EXISTS recommendation_preferences (
          user_id text PRIMARY KEY,
          share_activity boolean NOT NULL DEFAULT false,
          updated_at timestamptz NOT NULL DEFAULT now()
        )
      `;
      await transaction`
        CREATE TABLE IF NOT EXISTS communities (
          id text PRIMARY KEY,
          name text NOT NULL,
          description text NOT NULL,
          is_general boolean NOT NULL DEFAULT true,
          work_ids text[] NOT NULL DEFAULT '{}',
          image text,
          created_by text NOT NULL,
          member_count integer NOT NULL DEFAULT 1,
          created_at timestamptz NOT NULL DEFAULT now()
        )
      `;
      await transaction`
        CREATE TABLE IF NOT EXISTS community_members (
          community_id text NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
          user_id text NOT NULL,
          role text NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
          joined_at timestamptz NOT NULL DEFAULT now(),
          PRIMARY KEY (community_id, user_id)
        )
      `;
      await transaction`
        CREATE TABLE IF NOT EXISTS chat_messages (
          id text PRIMARY KEY,
          community_id text NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
          user_id text NOT NULL,
          username text NOT NULL,
          avatar_url text,
          text text NOT NULL,
          created_at timestamptz NOT NULL DEFAULT now()
        )
      `;
      await transaction`
        CREATE TABLE IF NOT EXISTS users (
          id text PRIMARY KEY,
          username text UNIQUE,
          nametag text,
          avatar_url text,
          created_at timestamptz NOT NULL DEFAULT now()
        )
      `;
      await transaction`ALTER TABLE users ADD COLUMN IF NOT EXISTS nametag text`;
      await transaction`ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url text`;
      await transaction`
        CREATE TABLE IF NOT EXISTS work_comments (
          id text PRIMARY KEY,
          work_id text NOT NULL REFERENCES works(id) ON DELETE CASCADE,
          user_id text NOT NULL,
          text text NOT NULL,
          created_at timestamptz NOT NULL DEFAULT now()
        )
      `;
      await transaction`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint WHERE conname = 'work_comments_unique'
          ) THEN
            ALTER TABLE work_comments ADD CONSTRAINT work_comments_unique UNIQUE (work_id, user_id);
          END IF;
        END $$;
      `;

      for (const work of seedWorks) {
        await transaction`
          INSERT INTO works (
            id, title, creator, format, genre, description, image, image_alt,
            rating, chapters, match_score, tags, curation_status
          )
          VALUES (
            ${work.id}, ${work.title}, ${work.creator}, ${work.format}, ${work.genre},
            ${work.description}, ${work.image}, ${work.imageAlt}, ${work.rating},
            ${work.chapters}, ${work.match}, ${work.tags}, 'approved'
          )
          ON CONFLICT (id) DO NOTHING
        `;
      }
    });
    console.info(`Catalog database ready; ensured ${seedWorks.length} sample works exist.`);
  } finally {
    await closePostgres();
  }
}

setupDatabase().catch((error: unknown) => {
  console.error("Database setup failed:", error);
  process.exitCode = 1;
});
