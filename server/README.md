# GLify Server

Fastify + TypeScript API service for GLify. Independently deployable from the Vite frontend.

## Quick start

```bash
# Install dependencies (from the repository root)
npm --prefix server install

# Copy the template to server/.env and set DATABASE_URL
Copy-Item server/.env.example server/.env

# Create the catalog table and insert starter records
npm run db:setup

# Start the API with auto-reload
npm run dev:server
```

The server listens on `http://localhost:3001` by default. Neo4j credentials are optional until graph features are enabled.

## Catalog database

The first persistent feature uses Neon Postgres. Copy the full connection string from Neon Console → project → **Connect** into `DATABASE_URL` in `server/.env`; replace the example's `<user>`, `<password>`, `<host>`, and `<dbname>` placeholders. Then run `npm run db:setup` from the repository root. The setup command creates or upgrades the `works` table and inserts the eight starter catalog entries without overwriting existing rows. Existing AniList imports become pending review; non-AniList starter entries remain approved. Re-import AniList pages to classify existing pending records with the first-six rule.

Import AniList entries with `npm run db:import-anilist`. This imports page 1 (up to 50 entries); run `npm run db:import-anilist -- --page 2` for the next page, then use page 3, 4, and so on. You do not need to rerun database setup between pages. Pages can safely be re-run and existing AniList IDs are updated rather than duplicated. The importer uses AniList's `tag_in: ["Yuri"]` filter because Yuri is a media tag, not a genre, and includes non-spoiler AniList tags in each work. A title is automatically approved only when Yuri appears among the first six tags AniList returns; other matches stay pending review rather than being discarded. Explicit approve/reject decisions are preserved during re-import. This is a heuristic, not definitive GL verification; manually curate pending titles before approval. AniList media with no score has no catalog rating or user-match score.

List and curate pending records from the repository root:

```powershell
npm run db:curate-anilist -- --list
npm run db:curate-anilist -- --approve anilist-10495
npm run db:curate-anilist -- --reject anilist-18679
```

These IDs are examples from the current imported page. Choose IDs that actually appear in your own `--list` output; the command does not treat sample IDs like `anilist-123` as placeholders. Verify titles against trusted sources before approval. Rejected records remain stored but are hidden from public catalog results. If any requested ID is missing, the command fails without changing any of the requested records.

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/works` | List catalog works; supports `q`, `genre`, `format`, and `limit` filters |
| `GET` | `/health` | Postgres and optional Neo4j dependency health check |

The UI calls `/api/works` and validates its response. If the API is unavailable, it keeps the local sample catalog visible and displays the connection error. Vite proxies `/api` to `http://localhost:3001` in development; set `VITE_API_URL` for a separately hosted API.

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `PORT` | No (default `3001`) | HTTP listen port |
| `HOST` | No (default `0.0.0.0`) | HTTP bind address |
| `CORS_ORIGIN` | No (default `http://localhost:5173`) | Comma-separated allowed origins |
| `DATABASE_URL` | Yes | Neon Postgres connection string |
| `NEO4J_URI` | No | Neo4j AuraDB URI; set with username and password |
| `NEO4J_USER` | No | Neo4j username |
| `NEO4J_PASSWORD` | No | Neo4j password |
| `ANILIST_API_URL` | No | AniList GraphQL endpoint override; defaults to `https://graphql.anilist.co` |
| `UPSTASH_REDIS_REST_URL` | No | Upstash Redis REST URL (when provisioned) |
| `UPSTASH_REDIS_REST_TOKEN` | No | Upstash Redis REST token (when provisioned) |

## Scripts

Run these from the repository root:

| Command | Description |
|---|---|
| `npm run dev:server` | Start with auto-reload (`tsx watch`) |
| `npm run build:server` | Compile the API TypeScript |
| `npm run typecheck:server` | Type-check without emitting |
| `npm run db:setup` | Create the catalog table and seed starter data |
| `npm run db:import-anilist` | Import or update AniList Yuri-tagged works (`-- --page N` to choose a page) |
| `npm run db:curate-anilist -- --list` | List imported works awaiting curation; also supports `--approve` and `--reject` |

For API production deployment, set the environment variables in Render, build with `npm run build:server`, and start with `npm --prefix server start`.

Never commit `.env` files. They are excluded by `.gitignore`.
