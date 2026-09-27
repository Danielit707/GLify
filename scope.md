# GLify — Product scope and technical context

## Product vision

GLify is a browser-accessible, community-first platform for Girls' Love (GL) and Yuri media. It brings manga, manhwa, light novels, and live-action series into one place, and helps fans discover stories and people with similar interests.

The product should feel welcoming, inclusive, safe, and easy to use on desktop and mobile browsers. Recommendations and match percentages must be explainable as estimates based on explicitly shared interests—not claims about identity or personal compatibility.

## Current status

The repository contains a responsive React and TypeScript discovery UI and a Fastify API. The API reads approved catalog records from Neon/Postgres using `GET /api/works`; public results must have "Yuri" or "Shoujo Ai" among their first six tags. `npm run db:setup` creates or upgrades the catalog, favorites, watched/read activity, and recommendation-preference tables and inserts demonstration titles. `npm run db:import-anilist` imports/upserts AniList media, and `db:curate-anilist` supports review of imports.

Clerk provides sign-in. Neon is the source of truth for the catalog, favorites, watched/read activity, and each member's activity-sharing choice. Neo4j is synchronized from Neon using pseudonymous Clerk IDs and `FAVORITED` / `WATCHED` relationships. The signed-in UI has catalog discovery, account-based favorites and activity, and personalized recommendations. Work-specific communities, discussion, chat, and media sharing are planned and not implemented.

## Intended architecture

```text
Browser
  └── Vercel: React + TypeScript + Vite + CSS
        └── HTTPS API requests
              └── Render: Node.js + TypeScript + Fastify
                    ├── Clerk: authentication and account identity
                    ├── Neon Postgres: catalog, favorites, watched/read activity, sharing preferences
                    ├── Neo4j AuraDB: synchronized graph of works, tags, and pseudonymous interactions
                    ├── Object storage: uploaded community media (provider TBD)
                    └── Upstash Redis: cache, rate limits, short-lived coordination
```

### Service choices

- **Frontend — Vercel:** static assets, browser delivery, preview deployments, and custom domains suit the React/Vite app. The UI remains accessible from any modern browser.
- **Backend — Render:** a separately deployed Node.js/TypeScript API keeps secrets and database access server-side. Fastify is the proposed lightweight HTTP framework.
- **Identity — Clerk:** authenticate members and provide stable account IDs. Do not copy passwords or unnecessary personal information into application databases.
- **Graph — Neo4j AuraDB:** hold the synchronized work/tag graph and the minimal, privacy-eligible interactions needed for recommendations and relationship queries.
- **Relational database — Neon Postgres:** source of truth for the work catalog, favorites, watched/completed activity, community posts, membership, moderation records, and relational constraints.
- **Media storage — provider TBD:** store uploaded image/video files outside Postgres and Neo4j; keep durable file metadata and ownership in Postgres.
- **Cache — Upstash Redis:** cache expensive reads and apply API rate limits using a managed Redis-compatible service.

Pricing and free-tier limits change. Re-check each provider's current limits, sleeping/cold-start behavior, backups, and data-retention policies before launch. Do not treat free tiers as a production availability commitment.

The catalog and account activity are stored in Neon/Postgres. Neo4j is a derived graph for recommendation queries, not a second catalog or activity store that members or maintainers update independently. Reconcile the graph from Neon after catalog or interaction changes. If graph synchronization is unavailable, Neon remains authoritative and the graph can be rebuilt.

## Product scope

### Discovery

- Browse GL works across manga, manhwa, light novels, and live-action series.
- Search works, creators, characters, users, tags, and discussion content.
- Filter by format, genre, and tropes such as slow burn, office romance, fantasy, music, and coming of age.
- Maintain an account-only favorites list and mark works watched/read. Favorite and watched/read activity are distinct actions.

### Recommendations and affinity

- Rank each recommendation with a transparent weighted score:
  - **35% tag fit:** how well a candidate work's tags match the member's demonstrated tag interests.
  - **65% similar-member activity:** candidate favorites and watched/read works from similar members, with each neighbor's contribution weighted by that neighbor's match score. Favorite evidence has weight 2; watched/read evidence has weight 1.
- The user's tag-fit profile also weights favorite works 2 and watched/read works 1. Tag fit is the share of the user's total weighted tag-interest mass represented by the candidate's tags.
- Member-to-member similarity is weighted Jaccard over work interactions: sum of minimum shared interaction weights divided by sum of maximum weights across the union. This normalization prevents prolific users from dominating by raw activity volume.
- For a candidate, the similar-member component is `100 × sum(matchScore × candidateActivityWeight) / sum(matchScore × 2)` across eligible neighbors. Each neighbor contributes at most once per candidate; a favorite has weight 2 and watched/read has weight 1. Both component scores are 0–100 and the final score is `0.35 × tagFit + 0.65 × similarMemberActivity`.
- Exclude a member's own favorites and watched/read works from recommendations. Favorites are an interest signal, not proof that the member consumed a work.
- Members explicitly opt in before their activity can inform recommendations for other members. Their own recommendations can still use their own activity when sharing is disabled. With no eligible similar-member evidence, clearly label a tag-fit-only cold-start ranking instead of inventing a collaborative score.
- Treat recommendations as optional discovery aids. Do not infer sensitive traits or present match percentages as objective compatibility. Account activity remains in Neon and recommendation-sharing preference can be changed at any time.

### Community

- Provide one persistent community space for every catalog work, reachable from that work's details.
- Support real-time or near-real-time chat as well as durable threaded discussions, spoiler labels, and member reactions.
- Let members attach and share permitted media in a work community. Store files in object storage and metadata/permissions in Postgres, not as large database blobs or graph properties.
- Add membership/access controls, reporting, blocking, moderation queues, admin actions, and community guidelines before enabling public posting or uploads.
- Define upload size/type limits, malware/content scanning, abuse response, copyright handling, retention, and deletion behavior before accepting media.

### Identity and safety

- Use Clerk for account registration and sign-in; verify its session tokens on every protected API route.
- Enforce role-based authorization on the API for members, moderators, and administrators; hiding a UI control is not authorization.
- Validate and authorize every request server-side, rate-limit sensitive endpoints, and keep secrets out of browser bundles and source control.

## Initial graph model

```text
(:User {id, username})
  -[:FAVORITED {createdAt}]-> (:GL_Work {id, title, type})
  -[:WATCHED {status, startedAt, completedAt}]-> (:GL_Work)
  -[:LIKED {rating, createdAt}]-> (:GL_Work)
  -[:FAVORITED_CHARACTER {createdAt}]-> (:Character {id, name, role})
  -[:CREATED_THREAD {createdAt}]-> (:CommunityThread {id, title})

(:GL_Work)-[:HAS_CHARACTER]->(:Character)
(:GL_Work)-[:HAS_TAG]->(:Tag {name})
(:GL_Work)-[:HAS_COMMUNITY]->(:WorkCommunity {id})
(:WorkCommunity)-[:HAS_THREAD]->(:CommunityThread {id, title})
(:CommunityThread)-[:HAS_REPLY]->(:CommunityPost {id, body, createdAt})
(:CommunityPost)-[:ATTACHES]->(:MediaAsset {id, storageKey, mediaType})
(:CommunityThread)-[:BELONGS_TO]->(:GL_Work)
(:CommunityThread)-[:ABOUT_CHARACTER]->(:Character)
(:User)-[:FOLLOWS]->(:User)
```

Use stable IDs and uniqueness constraints for primary entities. Neon owns the durable community content, membership, moderation state, and media metadata; object storage owns media bytes. Neo4j may mirror only relationships needed for discovery and recommendations. Keep personally identifying account details out of the graph and use only minimal pseudonymous IDs and opted-in signals.

## Recommendation scoring and query sketch

The ranking contract is a 35% tag-fit component and a 65% collaborative activity component. Favorite interactions weigh twice as much as watched/read interactions (2 vs. 1). Let `tagFit(user, work)` be the share of the user's weighted tag-interest mass covered by the candidate's tags. Let `match(user, neighbor)` be weighted Jaccard overlap across favorite and watched/read work interactions. The collaborative score weights each eligible neighbor by this match, with a favorite candidate signal weighted 2 and a watched/read signal weighted 1:

```text
similarMemberActivity =
  100 × sum(match(user, neighbor) × candidateActivityWeight)
      / sum(match(user, neighbor) × 2)

recommendationScore =
  0.35 × tagFit(user, candidate)
  + 0.65 × similarMemberActivity(user, candidate)
```

Deduplicate each member's interaction per work, exclude already-favorited and watched/read works, and include other members' signals only when they have opted in. A missing collaborative signal uses a clearly labeled tag-only cold-start ranking. Add pagination, recency/quality safeguards, and query-plan checks before serving at scale.

The API implements this score in application code after retrieving the eligible
catalog and graph interactions. Only signed-in requests can access
`GET /api/recommendations`; its identity comes from the verified Clerk token.
The separate `GET /api/works/:workId/similar` endpoint remains a public,
tag-overlap utility and does not expose account data.

## Delivery milestones

1. **Foundation (implemented in part):** discovery UI, Fastify API, Neon catalog, AniList import/review, Clerk sign-in, persistent favorites, and Neon-to-Neo4j synchronization.
2. **Activity tracking (implemented):** authenticated watched/read toggles, durable Neon records, and per-member activity-sharing opt-in.
3. **Recommendation ranking (implemented):** tested tag-fit and weighted-Jaccard calculations; 35/65 score; favorites at 2× watched/read; score explanations; tag-only cold start; and opt-in neighbor eligibility.
4. **Work communities:** create a community for every work; implement durable threaded discussion and spoiler controls, then chat if realtime behavior is needed.
5. **Media and trust/safety:** choose object storage, add secure uploads, community membership, reports, moderation tooling, blocking, retention/deletion, and operating guidelines before broad launch.
6. **Production readiness:** observability, backups and restore exercises, security review, accessibility audit, load testing, and deployment automation.

## Repository conventions and safeguards

- Keep the UI and API independently deployable; only the API connects to databases or Redis.
- Validate input at service boundaries and use parameterized Cypher and SQL.
- Never commit connection strings, access tokens, signing keys, or production data.
- Keep activity-sharing opt-in explicit and provide a future account-deletion flow that removes Neon and Neo4j activity together.
- Use original artwork or properly licensed assets. Current remote Unsplash images are temporary visual placeholders, not GL work covers.
- Add automated tests with each backend capability; recommendation tests cover both score components, the 35/65 final score, no-neighbor cold starts, opt-in eligibility, duplicate activity, and exclusion of a member's own works.

## Open decisions before public launch

- Define account deletion so it removes Neon and Neo4j activity together; recommendation activity sharing is opt-in and may be disabled at any time.
- Select provider tiers after estimating monthly active users, API throughput, graph size, retention, backups, and service availability requirements.
- Expand the simple watched/read marker to format-specific progress statuses if the product needs currently-reading or completion tracking.
- Choose the media-storage provider and define upload types/limits, moderation coverage, community guidelines, and spoiler defaults.
- Define the first supported locales and accessibility target; the current prototype is English-language.
