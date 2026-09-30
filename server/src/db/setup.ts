import "dotenv/config";
import { closePostgres, initPostgres } from "./postgres.js";
import { loadConfig } from "../config.js";

const seedWorks = [
  {
    id: "after-the-rain",
    title: "The Moon on a Rainy Night",
    creator: "Kuzushiro",
    format: "Manga",
    genre: "Coming of age",
    description: "Two girls find their own rhythm, together.",
    image: "https://images.unsplash.com/photo-1518837695005-2083093ee35b?auto=format&fit=crop&w=760&q=85",
    imageAlt: "Quiet blue ocean waves beneath a cloudy sky",
    rating: "4.9",
    chapters: "35 chapters",
    match: 98,
    tags: ["Slow burn", "Coming of age"],
  },
  {
    id: "whisper-me",
    title: "Whisper Me a Love Song",
    creator: "Eku Takeshima",
    format: "Manga",
    genre: "Music",
    description: "A first impression becomes something more.",
    image: "https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&w=760&q=85",
    imageAlt: "A singer performing into a microphone under warm lights",
    rating: "4.8",
    chapters: "52 chapters",
    match: 96,
    tags: ["Music", "First love"],
  },
  {
    id: "what-do-i-call",
    title: "What Does the Fox Say?",
    creator: "Team Gaji",
    format: "Manhwa",
    genre: "Office romance",
    description: "Complicated feelings after hours at the office.",
    image: "https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=760&q=85",
    imageAlt: "A modern office with a view of the city",
    rating: "4.8",
    chapters: "100 chapters",
    match: 93,
    tags: ["Office romance", "Slow burn"],
  },
  {
    id: "bloom-into-you",
    title: "Bloom Into You",
    creator: "Nio Nakatani",
    format: "Manga",
    genre: "Coming of age",
    description: "Learning what it means to fall in love.",
    image: "https://images.unsplash.com/photo-1470252649378-9c29740c9fa8?auto=format&fit=crop&w=760&q=85",
    imageAlt: "Golden sunlight spilling over a field at sunset",
    rating: "4.9",
    chapters: "45 chapters",
    match: 91,
    tags: ["Coming of age", "School life"],
  },
  {
    id: "gap",
    title: "GAP: The Series",
    creator: "Saint Suppapong",
    format: "Live action",
    genre: "Office romance",
    description: "A new job brings an unexpected crush.",
    image: "https://images.unsplash.com/photo-1519608487953-e999c86e7455?auto=format&fit=crop&w=760&q=85",
    imageAlt: "A romantic city skyline at twilight",
    rating: "4.7",
    chapters: "12 episodes",
    match: 89,
    tags: ["Office romance", "Opposites attract"],
  },
  {
    id: "adachi-shimamura",
    title: "Adachi and Shimamura",
    creator: "Hitoma Iruma",
    format: "Light novel",
    genre: "Slice of life",
    description: "A gentle story about a friendship in bloom.",
    image: "https://images.unsplash.com/photo-1470770841072-f978cf4d019e?auto=format&fit=crop&w=760&q=85",
    imageAlt: "A peaceful lake surrounded by mountains",
    rating: "4.7",
    chapters: "11 volumes",
    match: 87,
    tags: ["Slice of life", "Slow burn"],
  },
  {
    id: "bloom-into-you-anime",
    title: "Bloom Into You (Anime)",
    creator: "TROYCA",
    format: "Anime",
    genre: "Coming of age",
    description: "A thoughtful anime adaptation of the beloved manga.",
    image: "https://images.unsplash.com/photo-1536098561742-ca998e48cbcc?auto=format&fit=crop&w=760&q=85",
    imageAlt: "Soft pink and white flowers in gentle light",
    rating: "4.6",
    chapters: "13 episodes",
    match: 90,
    tags: ["Coming of age", "School life"],
  },
  {
    id: "her-name-is-zombie",
    title: "Her Name is Zombie",
    creator: "Kim So-yeon",
    format: "Webtoon",
    genre: "Supernatural romance",
    description: "A webtoon about love that defies the ordinary.",
    image: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=760&q=85",
    imageAlt: "Neon-lit city street at night",
    rating: "4.5",
    chapters: "80 episodes",
    match: 85,
    tags: ["Supernatural romance", "Comedy"],
  },
];

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
          username text,
          avatar_url text,
          created_at timestamptz NOT NULL DEFAULT now()
        )
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
