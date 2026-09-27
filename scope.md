# GLify — Product scope and technical context

## Product vision

GLify is a browser-accessible, community-first platform for Girls' Love (GL) and Yuri media. It brings manga, manhwa, light novels, and live-action series into one place, and helps fans discover stories and people with similar interests.

The product should feel welcoming, inclusive, safe, and easy to use on desktop and mobile browsers. Recommendations and match percentages must be explainable as estimates based on explicitly shared interests—not claims about identity or personal compatibility.

## Current status

The repository starts with a responsive React and TypeScript prototype. The home page presents sample titles and communities; search, tag/genre filtering, format filtering, save-to-list state, and mobile navigation work locally in the browser. There is no account system, API, persistence, graph database, or real community content connected yet. The catalog and community labels are demonstration content.

## Intended architecture

```text
Browser
  └── Vercel: React + TypeScript + Vite + CSS
        └── HTTPS API requests
              └── Render: Node.js + TypeScript + Fastify
                    ├── Neo4j AuraDB: works, characters, tags, interactions, graph recommendations
                    ├── Neon Postgres: account metadata, RBAC, audit and transactional records
                    └── Upstash Redis: cache, rate limits, short-lived coordination
```

### Service choices

- **Frontend — Vercel:** static assets, browser delivery, preview deployments, and custom domains suit the React/Vite app. The UI remains accessible from any modern browser.
- **Backend — Render:** a separately deployed Node.js/TypeScript API keeps secrets and database access server-side. Fastify is the proposed lightweight HTTP framework.
- **Graph — Neo4j AuraDB:** model recommendation and community relationships and execute Cypher traversals. Select a plan based on availability, data retention, and expected workload before production.
- **Relational database — Neon Postgres:** store account and role metadata, audit events, and records requiring relational constraints and transactions.
- **Cache — Upstash Redis:** cache expensive reads and apply API rate limits using a managed Redis-compatible service.

Pricing and free-tier limits change. Re-check each provider's current limits, sleeping/cold-start behavior, backups, and data-retention policies before launch. Do not treat free tiers as a production availability commitment.

## Product scope

### Discovery

- Browse GL works across manga, manhwa, light novels, and live-action series.
- Search works, creators, characters, users, tags, and discussion content.
- Filter by format, genre, and tropes such as slow burn, office romance, fantasy, music, and coming of age.
- Maintain a personal list and record interactions such as liking, rating, favoriting, or completing a work.

### Recommendations and affinity

- Recommend not-yet-interacted-with works using shared-interest signals and graph paths.
- Calculate user affinity from overlapping favorite works, characters, and tags, with transparent factor weights and a minimum-overlap safeguard.
- Treat affinity as an optional community discovery aid. Do not infer sensitive traits or present a percentage as objective compatibility.
- Apply privacy controls so users decide whether their profile and interaction signals can be used for matching.

### Community

- Provide work- and character-specific community spaces.
- Support threaded discussions, spoiler labeling, reporting, moderation, and administrative actions.
- Establish community guidelines, moderation workflows, and abuse-report handling before opening public posting.

### Identity and safety

- Support account registration, sign-in, and revocation/rotation for short-lived access and refresh credentials.
- Enforce role-based authorization on the API for members, moderators, and administrators; hiding a UI control is not authorization.
- Hash passwords with a well-maintained password-hashing library if password-based registration is enabled; prefer a vetted identity provider if the project does not want to operate password security itself.
- Validate and authorize every request server-side, rate-limit sensitive endpoints, and keep secrets out of browser bundles and source control.

## Initial graph model

```text
(:User {id, username})
  -[:LIKED {rating, createdAt}]-> (:GL_Work {id, title, type})
  -[:COMPLETED {completedAt}]-> (:GL_Work)
  -[:FAVORITED_CHARACTER {createdAt}]-> (:Character {id, name, role})
  -[:CREATED_THREAD {createdAt}]-> (:CommunityThread {id, title})

(:GL_Work)-[:HAS_CHARACTER]->(:Character)
(:GL_Work)-[:HAS_TAG]->(:Tag {name})
(:CommunityThread)-[:BELONGS_TO]->(:GL_Work)
(:CommunityThread)-[:ABOUT_CHARACTER]->(:Character)
(:User)-[:FOLLOWS]->(:User)
```

Use stable IDs and uniqueness constraints for primary entities. Store dates and interaction metadata on relationships where the event itself is the relationship; consider event nodes if interaction history, provenance, or moderation/audit needs outgrow relationship properties. Keep personally identifying account details in Postgres and only put the minimal pseudonymous graph identity and opted-in recommendation signals in Neo4j.

## Recommendation query sketch

This is an illustrative first-pass query, not production-ready ranking. Add privacy eligibility, minimum interaction thresholds, de-duplication, recency/quality signals, pagination, and query-plan checks before serving it at scale.

```cypher
MATCH (u1:User {id: $currentUserId})-[:LIKED]->(shared:GL_Work)<-[:LIKED]-(u2:User)
WHERE u1 <> u2
WITH u1, u2, count(DISTINCT shared) AS commonLikes
ORDER BY commonLikes DESC
LIMIT 5
MATCH (u2)-[:LIKED]->(candidate:GL_Work)
WHERE NOT (u1)-[:LIKED|COMPLETED]->(candidate)
WITH candidate, sum(commonLikes) AS neighborScore
RETURN candidate, neighborScore
ORDER BY neighborScore DESC
LIMIT 10
```

For a more meaningful similarity ranking, normalize shared interactions using a Jaccard score (`intersection / union`) or cosine similarity; do not rank solely by raw shared-like counts, which favor highly active users. Apply genre/tag filters in the graph query and verify indexes and query plans with representative data.

## Delivery milestones

1. **Foundation (current):** responsive discovery prototype, sample catalog, local search/filter/save interactions, product scope, and repository README.
2. **API and persistence:** create the Fastify TypeScript service, define validated API contracts, provision Neon and Neo4j, and add catalog/user data access.
3. **Accounts and controls:** authentication, session/refresh-token lifecycle, RBAC, profile privacy settings, request validation, and rate limiting.
4. **Graph discovery:** write and test graph queries for search, filtering, recommendations, and explainable match scores.
5. **Community:** threads, nested comments, spoiler controls, reporting, moderation, and community guidelines.
6. **Production readiness:** observability, backups and restore exercises, security review, accessibility audit, load testing, and deployment automation.

## Repository conventions and safeguards

- Keep the UI and API independently deployable; only the API connects to databases or Redis.
- Validate input at service boundaries and use parameterized Cypher and SQL.
- Never commit connection strings, access tokens, signing keys, or production data.
- Establish consent, privacy, deletion, and retention behavior before using member activity for recommendations.
- Use original artwork or properly licensed assets. Current remote Unsplash images are temporary visual placeholders, not GL work covers.
- Add automated tests with each backend capability; test recommendation edge cases with fixtures before trusting the ranking.

## Open decisions before public launch

- Choose a trusted identity provider or define the owned password, email verification, recovery, and credential-rotation flow.
- Decide whether community profiles and recommendation signals are private by default, and how opt-out/deletion propagates across databases and caches.
- Select provider tiers after estimating monthly active users, API throughput, graph size, retention, backups, and service availability requirements.
- Confirm content data sources, attribution/licensing, moderation coverage, community guidelines, and spoiler defaults.
- Define the first supported locales and accessibility target; the current prototype is English-language.
