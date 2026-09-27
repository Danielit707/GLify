# GLify

**A dedicated space for Girls' Love stories and the people who love them.**

[![CI](https://github.com/Danielit707/GLify/actions/workflows/ci.yml/badge.svg)](https://github.com/Danielit707/GLify/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

GLify is a community-first discovery platform for Girls' Love (GL) and Yuri media: manga, manhwa, light novels, live-action series, anime, and webtoons. It helps fans find their next favorite story, connect with like-minded readers, and take part in welcoming, series-specific communities.

![GLify catalog showing searchable titles, format filters, and AniList-imported works](./images/catalog_showcase.png)

## Features

- **Discovery** — Browse GL works across manga, manhwa, webtoons, light novels, live-action series, and anime
- **Search & Filter** — Search by title, creator, genre, or tags; filter by format and genre
- **Recommendations** — Graph-powered similar works and collaborative filtering (Neo4j)
- **Community** — Series-specific community spaces (coming soon)
- **Responsive** — Works on desktop and mobile browsers

## Technology Stack

| Area | Choice | Responsibility |
| --- | --- | --- |
| Web app | React, TypeScript, Vite, CSS | Responsive browser UI and discovery experience |
| Web hosting | Vercel | Global static hosting, preview deployments, and custom domain |
| API | Node.js, TypeScript, Fastify | Application API and business logic |
| API hosting | Render | Web service for the TypeScript API |
| Graph | Neo4j AuraDB | Works, characters, user interactions, and recommendation traversals |
| Relational data | Neon Postgres | Accounts, roles, audit records, and transactional metadata |
| Cache / rate limits | Upstash Redis | Short-lived cache, rate limiting, and ephemeral coordination |

The web app and API are separate deployable services. Neo4j AuraDB, Neon, and Upstash are managed services and are accessed only by the API; their credentials must never be exposed to browser code.

## Quick Start

Requirements: **Node.js 20+** and **npm**.

### See the UI with sample stories

```bash
npm install
npm run dev
```

Open the local URL Vite prints (usually **http://localhost:5173**). The UI works without database credentials and shows a status message when it is using sample catalog data.

### Run the API with Neon Postgres

1. Create a Neon project and copy its pooled or direct connection string.
2. From the repository root, install the API dependencies and create its local environment file:

   ```powershell
   npm --prefix server install
   Copy-Item server/.env.example server/.env
   ```

3. Set `DATABASE_URL` in `server/.env` to the full connection string from Neon Console → your project → **Connect**. Replace the entire example value; do not leave `<user>`, `<password>`, `<host>`, or any other placeholders in it.
4. Create the catalog table and insert the starter titles, then start both apps:

   ```bash
   npm run db:setup
   npm run dev:all
   ```

5. Open **http://localhost:5173**. The API health check is at **http://localhost:3001/health** and the catalog endpoint is **http://localhost:3001/api/works**.

### Import real titles from AniList

After configuring `DATABASE_URL` in `server/.env` and running `npm run db:setup`:

```bash
npm run db:import-anilist                         # first page (up to 50 titles)
npm run db:import-anilist -- --page 2             # next page (up to 50 more)
```

The importer only includes titles with "yuri" in their first 6 AniList tags. Re-running a page updates those records instead of creating duplicates.

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
| `npm run db:setup` | Create the catalog table and seed sample works |
| `npm run db:import-anilist` | Import yuri-tagged titles from AniList |
| `npm run db:filter-yuri` | Remove works without yuri in first 6 tags |
| `npm run db:seed-graph` | Seed Neo4j graph with works, tags, users, and likes |
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
│   │   ├── plugins/        # Fastify plugins
│   │   └── routes/         # API route handlers
│   └── .env.example        # Environment template
├── images/                 # Screenshots and visual assets
├── scope.md                # Product scope and architecture
└── README.md               # This file
```

## Deployment

1. **Frontend → Vercel:** Import the repository, set the project root to the repository root. Use `npm run build` and `dist` as the output directory. Set `VITE_API_URL` to the Render API origin.
2. **API → Render:** Deploy `server/` as a web service with the service root directory set to `server`. Use `npm install`, `npm run build`, and `npm start`. Configure `DATABASE_URL`, `CORS_ORIGIN`, and Neo4j credentials in Render's environment settings.
3. **Neo4j AuraDB:** Provision when graph-backed recommendation features are ready; configure credentials only in the API service's environment.
4. **Upstash Redis:** Configure managed Redis credentials only in the API service when cache/rate-limit features are implemented.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines on how to contribute to GLify.

## License

[MIT](./LICENSE)
