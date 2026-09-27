# GLify

**A softer space for Girls' Love stories and the people who love them.**

GLify is a community-first discovery platform for Girls' Love (GL) and Yuri media: manga, manhwa, light novels, and live-action series. It will help fans find their next favorite story, connect with like-minded readers, and take part in welcoming, series-specific communities.

## Project status

The repository currently contains the first responsive web prototype. Its catalog is local sample data; sign-in, recommendations, community discussions, and all database-backed functionality are not connected yet. See [`scope.md`](./scope.md) for the product plan, architecture, data model, and implementation boundaries.

## Technology choices

| Area | Choice | Responsibility |
| --- | --- | --- |
| Web app | React, TypeScript, Vite, CSS | Responsive browser UI and discovery experience |
| Web hosting | Vercel | Global static hosting, preview deployments, and custom domain |
| API | Node.js, TypeScript, Fastify | Authenticated application API and business logic |
| API hosting | Render | Web service for the TypeScript API |
| Graph | Neo4j AuraDB | Works, characters, user interactions, and recommendation traversals |
| Relational data | Neon Postgres | Accounts, roles, audit records, and transactional metadata |
| Cache / rate limits | Upstash Redis | Short-lived cache, rate limiting, and ephemeral coordination |

The web app and API are separate deployable services. Neo4j AuraDB, Neon, and Upstash are managed services and are accessed only by the API; their credentials must never be exposed to browser code.

## Run locally

Requirements: Node.js 20 or newer and npm.

```bash
npm install
npm run dev
```

Vite prints a local URL (typically `http://localhost:5173`). Create a production build with:

```bash
npm run build
npm run preview
```

The current prototype does not require environment variables or external services. Use the sample catalog to try search, genre/format filters, and the saved-stories list.

## Deployment outline

1. Import the repository into Vercel and set the project root to the repository root. Use `npm run build` and `dist` as the output directory.
2. Deploy the API as a separate Render web service once its app package is added; configure secrets in Render, not in source control or Vercel client variables.
3. Provision Neo4j AuraDB, Neon, and Upstash Redis. Configure their connection strings only in the API service's secret environment.
4. Set the web app's public API base URL when the API is available and configure allowed browser origins in the API.

See [`scope.md`](./scope.md) for architecture details, product milestones, and open decisions.

## GitHub repository description

> A graph-powered Girls' Love (GL) discovery and community platform for manga, manhwa, light novels, and live-action series.

## Suggested GitHub topics

`girls-love`, `yuri`, `gl`, `manga`, `manhwa`, `light-novels`, `community`, `recommendation-engine`, `neo4j`, `typescript`, `react`, `fastify`, `postgresql`, `redis`

## License

No license has been selected yet. Add one before accepting external contributions or distributing the project.
