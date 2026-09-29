# GLify

**A dedicated space for Girls' Love stories and the people who love them.**

[![CI](https://github.com/Danielit707/GLify/actions/workflows/ci.yml/badge.svg)](https://github.com/Danielit707/GLify/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

GLify is a community-first discovery platform for Girls' Love (GL) and Yuri media: manga, manhwa, light novels, live-action series, anime, and webtoons. It helps fans find their next favorite story, connect with like-minded readers, and take part in welcoming, series-specific communities.

![GLify catalog showing searchable titles, format filters, and AniList-imported works](./images/catalog_showcase.png)

## Features

- **Discovery** — Browse GL works across manga, manhwa, webtoons, light novels, live-action series, and anime
- **Search & Filter** — Search by title, creator, genre, or tags; filter by format and genre
- **Personalized recommendations** — Rank unseen and non-favorited works with 35% tag fit and 65% activity from similar members; favorites count twice as much as watched/read activity
- **Personal library** — Save favorites and mark works watched/read while signed in; activity is stored per account
- **Communities** — Create or join spaces for specific works or general GL topics (coming soon)
- **Responsive** — Works on desktop and mobile browsers

## Recommendation behavior and communities

![Neo4j graph visualization showing users, works, and their relationships](./images/bloom-visualisation.png)

Personalized recommendations combine two explainable signals:

- **35% tag fit:** the proportion of a member's weighted tag interests present on a candidate work. Favorite works contribute weight 2; watched/read works contribute weight 1.
- **65% similar-member activity:** similar members' activity on each candidate, weighted by their match with the current member. A favorite contributes weight 2 and watched/read activity contributes weight 1.

The final score is `0.35 × tag fit + 0.65 × similar-member activity score`.
Member similarity uses weighted Jaccard overlap across favorites (2) and
watched/read works (1). Already-favorited and watched/read titles are excluded
from suggestions. When there are no similar members with matching activity,
the interface clearly falls back to tag-fit-only ranking. Users can separately
opt in to let their favorites and watched/read list inform recommendations for
other members; opting out does not disable their own recommendations.

Communities are spaces for members to discuss and connect. There are two types:

- **Work communities** — Each work has a community that groups all its formats. For example, a community for "Bloom Into You" includes its anime, manga, and light novel in one space. When you click on a work, you can see its community.
- **General communities** — Not tied to a specific work. These are for broader GL topics, genres, or interests.

In the communities section, you can filter to show only general communities, only work-focused communities, or search for a specific work's community. Members can create new communities.

Communities are not yet implemented. Before opening them publicly, GLify needs
community membership and moderation, reporting and spoiler controls, plus
secure media storage and upload rules.

## Technology Stack

| Area | Choice | Responsibility |
| --- | --- | --- |
| Web app | React, TypeScript, Vite, CSS | Responsive browser UI and discovery experience |
| Web hosting | Vercel | Global static hosting, preview deployments, and custom domain |
| API | Node.js, TypeScript, Fastify | Application API and business logic |
| API hosting | Render | Web service for the TypeScript API |
| Authentication | Clerk | Sign-in and account identity |
| Relational data | Neon Postgres | Catalog, favorites, watched/read activity, and recommendation-sharing preference |
| Graph | Neo4j AuraDB | Synchronized catalog and pseudonymous interactions for recommendations |
| Cache / rate limits | Upstash Redis | Short-lived cache, rate limiting, and ephemeral coordination |

Clerk owns account identities; this app does not copy account records into Neon.
Neon owns the catalog, favorites, watched/read activity, and recommendation
sharing preferences, while Neo4j is a synchronized graph used for
recommendations. If Neo4j is unavailable, library changes remain stored in
Neon and the graph can be synchronized again later. The web app and API are
separate deployable services. Managed-service credentials belong only in the
API environment and must never be exposed to browser code.

For Neo4j AuraDB, set `NEO4J_URI`, `NEO4J_USER`, and `NEO4J_PASSWORD` in
`server/.env` using the values from Aura's **Connect → Drivers** instructions.
`AURA_INSTANCENAME` (for example, `Instance01`) is just the instance's display
name; it is not a connection setting and the API does not use it.

For local development, `CORS_ORIGIN` can remain `http://localhost:5173`. In
Render, set it to the exact deployed frontend origin (no trailing slash) when
using a custom domain. The current Vercel production origin,
`https://glify-chi.vercel.app`, is also allowed by the API. If a browser origin
is not allowed, production shows a connection error instead of substituting
demo works.
When using a production Vercel deployment, set
`VITE_CLERK_PUBLISHABLE_KEY` to the Clerk **production** publishable key and
add the Vercel domain to Clerk's allowed domains.

## Quick Start

Requirements: **Node.js 20+** and **npm**.

### See the UI with sample stories

```bash
npm install
npm run dev
```

Open the local URL Vite prints (usually **http://localhost:5173**). The UI works without database credentials and shows a status message when it is using sample catalog data.

To enable sign-in and sign-up, create a Clerk application and set
`VITE_CLERK_PUBLISHABLE_KEY` in the repository-root `.env.local` file. This
frontend variable does not belong in `server/.env`. Restart Vite after changing
the key. To persist account favorites and watched/read activity, also set `CLERK_SECRET_KEY` in
`server/.env`; the server uses it to verify the user's session token.

### Run the API with Neon Postgres

1. Create a Neon project and copy its pooled or direct connection string.
2. From the repository root, install the API dependencies and create its local environment file:

   ```powershell
   npm --prefix server install
   Copy-Item server/.env.example server/.env
   ```

3. Set `DATABASE_URL` in `server/.env` to the full connection string from Neon Console → your project → **Connect**. Replace the entire example value; do not leave `<user>`, `<password>`, `<host>`, or any other placeholders in it. Set `CLERK_SECRET_KEY` to the secret key from your Clerk application.
4. Create or upgrade the catalog, favorites, watched/read activity, and recommendation-preference tables, then start both apps:

   ```bash
   npm run db:setup
   npm run dev:all
   ```

5. Open **http://localhost:5173**. The catalog API returns approved works (up to 200 per request). Favorites and watched/read activity are available only after signing in and are stored in Postgres per Clerk account. The API health check is at **http://localhost:3001/health** and the catalog endpoint is **http://localhost:3001/api/works**.

### Import real titles from AniList

After configuring `DATABASE_URL` in `server/.env` and running `npm run db:setup`:

```bash
npm run db:import-anilist                         # first page (up to 50 titles)
npm run db:import-anilist -- --page 2             # next page (up to 50 more)
```

The importer only includes titles with "yuri" in their first 6 AniList tags.
The public catalog also requires an approved title to have "yuri" or "shoujo ai"
in its first 6 tags. Re-running an import page updates records instead of
creating duplicates.

After importing titles while the API is already running, run
`npm run db:seed-graph` to reconcile the entire Neo4j catalog and account
favorites from Neon. The API also performs this reconciliation at startup.
When a signed-in user opens their list or changes a favorite, their Neo4j user
node and `FAVORITED` / `WATCHED` relationships are synchronized from Neon.
Clerk remains the identity provider; Neon is the source of truth for account
activity and Neo4j is the recommendation graph. Run `npm run db:setup` against
the production Neon database before deploying this version so the new tables
exist.

### Filter for yuri-tagged titles only

```bash
npm run db:filter-yuri
```

Removes works without "yuri" or "shoujo ai" in their first 6 tags from both Postgres and Neo4j.

## Available Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Vite frontend dev server |
| `npm run dev:server` | Start the Fastify API dev server |
| `npm run dev:all` | Start both frontend and API |
| `npm run build` | Build the frontend for production |
| `npm run build:server` | Build the API for production |
| `npm run typecheck:server` | Type-check the API |
| `npm --prefix server test` | Test personalized recommendation scoring |
| `npm run db:setup` | Create or upgrade catalog and account activity tables |
| `npm run db:import-anilist` | Import yuri-tagged titles from AniList |
| `npm run db:filter-yuri` | Remove works without yuri in first 6 tags |
| `npm run db:seed-graph` | Reconcile Neo4j works and account interactions from Neon |
| `npm run preview` | Preview the production frontend build |

## Project Structure

```
glify/
├── src/                    # React frontend (Vite)
│   ├── App.tsx             # Main application component
│   ├── catalog.ts          # Local sample catalog (fallback)
│   └── styles.css          # Global styles
├── server/                 # Fastify API (TypeScript)
│   ├── src/
│   │   ├── index.ts        # Server entry point
│   │   ├── app.ts          # App factory
│   │   ├── config.ts       # Environment configuration
│   │   ├── db/             # Database modules (Postgres, Neo4j)
│   │   ├── recommendations/# Weighted recommendation scoring
│   │   ├── plugins/        # Fastify plugins
│   │   └── routes/         # API route handlers, including library/activity
│   └── .env.example        # Environment template
├── images/                 # Screenshots and visual assets
├── scope.md                # Product scope and architecture
└── README.md               # This file
```

## Deployment

1. **Frontend → Vercel:** Import the repository, set the project root to the repository root. Use `npm run build` and `dist` as the output directory. Set `VITE_API_URL` to the Render API origin and `VITE_CLERK_PUBLISHABLE_KEY` to the Clerk publishable key.
2. **API → Render:** Deploy `server/` as a web service with the service root directory set to `server`. Use `npm install`, `npm run build`, and `npm start`. Configure `DATABASE_URL`, `CORS_ORIGIN`, `CLERK_SECRET_KEY`, and Neo4j credentials in Render's environment settings.
3. **Neon schema:** Before deploying this API version, run `npm run db:setup` locally with `server/.env` pointed at the production Neon database. This safely creates the watched/read and activity-sharing tables alongside existing catalog/favorites data.
4. **Neo4j AuraDB:** Configure the driver URI, username, and password in the API service's environment. The API synchronizes graph works from Neon at startup and updates user favorite/watched relationships as they change.
5. **Upstash Redis:** Configure managed Redis credentials only in the API service when cache/rate-limit features are implemented.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines on how to contribute to GLify.

## License

[MIT](./LICENSE)
