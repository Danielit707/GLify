import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowRight,
  Bookmark,
  Check,
  ChevronDown,
  Compass,
  Eye,
  Flame,
  Heart,
  Menu,
  MessageCircle,
  Search,
  Sparkles,
  UsersRound,
  X,
} from "lucide-react";
import { ClerkLoaded, Show, SignInButton, SignUpButton, UserButton } from "@clerk/react";
import { formats, genres, isWork, works, type Work } from "./catalog";

type AccountStatus = "disabled" | "loading" | "signed-out" | "signed-in";

interface AppProps {
  accountStatus?: AccountStatus;
  savedIds?: string[];
  watchedIds?: string[];
  recommendations?: PersonalizedRecommendation[];
  recommendationsLoading?: boolean;
  recommendationsError?: string | null;
  recommendationsColdStart?: boolean;
  shareActivity?: boolean;
  participationPending?: boolean;
  favoritesLoading?: boolean;
  favoritesError?: string | null;
  graphSyncPending?: boolean;
  pendingFavoriteId?: string | null;
  pendingWatchedId?: string | null;
  onToggleFavorite?: (id: string) => void;
  onToggleWatched?: (id: string) => void;
  onSetRecommendationParticipation?: (enabled: boolean) => void;
}

export interface PersonalizedRecommendation {
  id: string;
  title: string;
  format: string;
  tagFitScore: number;
  similarMemberScore: number;
  recommendationScore: number;
  sharedTags: string[];
  similarMemberCount: number;
}

const communities = [
  {
    name: "Slow burn enjoyers",
    members: "2.4k",
    topic: "For the longing, the glances, and the almost-kisses.",
    color: "peach",
    icon: "♡",
  },
  {
    name: "The manhwa corner",
    members: "1.8k",
    topic: "Your next favorite panel is waiting here.",
    color: "sage",
    icon: "✿",
  },
  {
    name: "After the last chapter",
    members: "986",
    topic: "No spoilers? No problem. Come talk endings.",
    color: "lilac",
    icon: "☾",
  },
];

function AuthenticationControls() {
  if (!import.meta.env.VITE_CLERK_PUBLISHABLE_KEY) {
    return (
      <p className="auth-setup-notice" role="status">
        Add VITE_CLERK_PUBLISHABLE_KEY to .env.local to enable accounts.
      </p>
    );
  }

  return (
    <ClerkLoaded>
      <Show when="signed-out">
        <SignInButton mode="modal">
          <button className="sign-in-button" type="button">Sign in</button>
        </SignInButton>
        <SignUpButton mode="modal">
          <button className="join-button" type="button">
            Join GLify <ArrowRight size={15} />
          </button>
        </SignUpButton>
      </Show>
      <Show when="signed-in">
        <UserButton />
      </Show>
    </ClerkLoaded>
  );
}

function WorkCard({
  work,
  saved,
  accountStatus,
  pending,
  watched,
  watchPending,
  onToggleFavorite,
  onToggleWatched,
}: {
  work: Work;
  saved: boolean;
  accountStatus: AccountStatus;
  pending: boolean;
  watched: boolean;
  watchPending: boolean;
  onToggleFavorite: (id: string) => void;
  onToggleWatched: (id: string) => void;
}) {
  const saveButton = (
    <button
      className={`save-button${saved ? " is-saved" : ""}`}
      type="button"
      aria-label={
        accountStatus === "signed-out"
          ? `Sign in to save ${work.title}`
          : `${saved ? "Remove" : "Save"} ${work.title} ${saved ? "from" : "to"} your list`
      }
      aria-pressed={saved}
      disabled={
        (accountStatus !== "signed-in" && accountStatus !== "signed-out") ||
        pending
      }
      title={accountStatus === "disabled" ? "Account favorites are not configured." : undefined}
      onClick={() => onToggleFavorite(work.id)}
    >
      {saved ? <Check size={17} /> : <Bookmark size={17} />}
    </button>
  );

  return (
    <article className="work-card">
      <div className="cover-wrap">
        <img className="cover" src={work.image} alt={work.imageAlt} loading="lazy" />
        <span className="format-pill">{work.format}</span>
        {accountStatus === "signed-out" ? (
          <SignInButton mode="modal">{saveButton}</SignInButton>
        ) : saveButton}
        {work.match !== undefined && (
          <span className="match-pill">
            <Sparkles size={12} /> {work.match}% match
          </span>
        )}
      </div>
      <div className="work-details">
        <div className="work-title-row">
          <h3>{work.title}</h3>
          {work.rating !== undefined && <span className="rating">★ {work.rating}</span>}
        </div>
        <p className="work-creator">{work.creator} <span>·</span> {work.chapters}</p>
        <p className="work-description">{work.description}</p>
        <div className="tag-row">
          {work.tags.map((tag) => <span className="tag" key={tag}>{tag}</span>)}
        </div>
        <div className="work-actions">
          {accountStatus === "signed-out" ? (
            <SignInButton mode="modal">
              <button
                className={`watched-button${watched ? " is-watched" : ""}`}
                type="button"
                aria-label={`Sign in to mark ${work.title} watched or read`}
                disabled={watchPending}
              >
                <Eye size={14} /> Mark watched / read
              </button>
            </SignInButton>
          ) : (
            <button
              className={`watched-button${watched ? " is-watched" : ""}`}
              type="button"
              aria-label={`${watched ? "Remove" : "Mark"} ${work.title} ${watched ? "from" : "as"} watched or read`}
              aria-pressed={watched}
              disabled={accountStatus !== "signed-in" || watchPending}
              onClick={() => onToggleWatched(work.id)}
            >
              {watched ? <Check size={14} /> : <Eye size={14} />}
              {watched ? "Watched / read" : "Mark watched / read"}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

function PersonalizedRecommendations({
  accountStatus,
  recommendations,
  loading,
  error,
  coldStart,
  shareActivity,
  participationPending,
  onSetRecommendationParticipation,
}: {
  accountStatus: AccountStatus;
  recommendations: PersonalizedRecommendation[];
  loading: boolean;
  error: string | null;
  coldStart: boolean;
  shareActivity: boolean;
  participationPending: boolean;
  onSetRecommendationParticipation: (enabled: boolean) => void;
}) {
  if (accountStatus === "disabled") return null;

  return (
    <section className="similar-works" aria-labelledby="recommendations-title">
      <h3 id="recommendations-title">Picked for you</h3>
      <p className="recommendation-intro">
        Recommendations combine 35% tag fit and 65% activity from members with similar interests.
      </p>
      {accountStatus === "signed-in" && (
        <label className="recommendation-sharing">
          <input
            type="checkbox"
            checked={shareActivity}
            disabled={participationPending}
            onChange={(event) => onSetRecommendationParticipation(event.target.checked)}
          />
          <span>
            Let my favorites and watched/read list help recommend stories to similar members.
            You can change this any time; it does not affect your own recommendations.
          </span>
        </label>
      )}
      {accountStatus === "signed-out" ? (
        <p className="favorites-prompt">Sign in to build personalized recommendations from your favorites and watched/read list.</p>
      ) : loading ? (
        <p className="favorites-prompt" role="status">Finding stories for you…</p>
      ) : error ? (
        <p className="favorites-error" role="alert">{error}</p>
      ) : recommendations.length === 0 ? (
        <p className="favorites-prompt">
          Add favorites or mark stories watched/read to start building your recommendations.
        </p>
      ) : (
        <>
          {coldStart && (
            <p className="favorites-prompt">
              There are not enough similar-member signals yet, so these are ranked by tag fit for now.
            </p>
          )}
          <div className="similar-grid">
            {recommendations.map((work) => (
              <article className="similar-card" key={work.id}>
                <span className="similar-format">{work.format}</span>
                <h4>{work.title}</h4>
                <p className="similar-match">
                  <Sparkles size={11} /> {work.recommendationScore.toFixed(1)}% overall match
                </p>
                <p className="recommendation-components">
                  35% tags: {work.tagFitScore.toFixed(1)}% · 65% similar-member activity: {work.similarMemberScore.toFixed(1)}%
                </p>
                {!coldStart && (
                  <p className="recommendation-components">
                    Informed by {work.similarMemberCount} similar member{work.similarMemberCount === 1 ? "" : "s"}
                  </p>
                )}
                {work.sharedTags.length > 0 && (
                  <div className="tag-row">
                    {work.sharedTags.slice(0, 3).map((tag) => (
                      <span className="tag" key={tag}>{tag}</span>
                    ))}
                  </div>
                )}
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function App({
  accountStatus = "disabled",
  savedIds = [],
  watchedIds = [],
  recommendations = [],
  recommendationsLoading = false,
  recommendationsError = null,
  recommendationsColdStart = false,
  shareActivity = false,
  participationPending = false,
  favoritesLoading = false,
  favoritesError = null,
  graphSyncPending = false,
  pendingFavoriteId = null,
  pendingWatchedId = null,
  onToggleFavorite = () => {},
  onToggleWatched = () => {},
  onSetRecommendationParticipation = () => {},
}: AppProps) {
  const [catalogWorks, setCatalogWorks] = useState<Work[]>(import.meta.env.PROD ? [] : works);
  const [catalogState, setCatalogState] = useState<"loading" | "live" | "sample" | "unavailable">("loading");
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [catalogRetry, setCatalogRetry] = useState(0);
  const [query, setQuery] = useState("");
  const [genre, setGenre] = useState("All stories");
  const [format, setFormat] = useState("All formats");
  const [activeNav, setActiveNav] = useState("Discover");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const apiBase = import.meta.env.VITE_API_URL?.replace(/\/$/, "") ?? "";
    const params = new URLSearchParams({ limit: "200" });
    if (query.trim()) params.set("q", query.trim());
    if (genre !== "All stories") params.set("genre", genre);
    if (format !== "All formats") params.set("format", format);
    setCatalogState("loading");

    const timeout = window.setTimeout(() => {
      fetch(`${apiBase}/api/works?${params}`, { signal: controller.signal })
        .then(async (response) => {
          if (!response.ok) {
            throw new Error(`Catalog API returned HTTP ${response.status}.`);
          }
          const payload: unknown = await response.json();
          if (
            payload === null ||
            typeof payload !== "object" ||
            !("works" in payload) ||
            !Array.isArray(payload.works) ||
            !payload.works.every(isWork)
          ) {
            throw new Error("Catalog API returned an unexpected response.");
          }
          setCatalogWorks(payload.works);
          setCatalogError(null);
          setCatalogState("live");
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          setCatalogWorks(import.meta.env.PROD ? [] : works);
          setCatalogError(error instanceof Error ? error.message : "Could not load the catalog API.");
          setCatalogState(import.meta.env.PROD ? "unavailable" : "sample");
        });
    }, 180);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [catalogRetry, format, genre, query]);

  const filteredWorks = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return catalogWorks.filter((work) => {
      const matchesQuery =
        normalizedQuery.length === 0 ||
        [work.title, work.creator, work.format, work.genre, ...work.tags]
          .some((value) => value.toLowerCase().includes(normalizedQuery));
      const matchesGenre =
        genre === "All stories" ||
        work.tags.some((tag) => tag.toLowerCase() === genre.toLowerCase());
      const matchesFormat = format === "All formats" || work.format === format;
      return matchesQuery && matchesGenre && matchesFormat;
    });
  }, [catalogWorks, format, genre, query]);

  const visibleWorks = activeNav === "My list" && accountStatus === "signed-in"
    ? favoritesLoading
      ? []
      : filteredWorks.filter((work) => savedIds.includes(work.id))
    : activeNav === "My list"
      ? []
      : filteredWorks;

  function chooseNav(name: string) {
    setActiveNav(name);
    setMobileMenuOpen(false);
    if (name === "Communities") {
      document.getElementById("communities")?.scrollIntoView({ behavior: "smooth" });
    } else {
      document.getElementById("discover")?.scrollIntoView({ behavior: "smooth" });
    }
  }

  return (
    <div className="app-shell">
      <header className="site-header">
        <a className="brand" href="#discover" aria-label="GLify home" onClick={() => chooseNav("Discover")}>
          <span className="brand-mark"><Heart size={19} fill="currentColor" /></span>
          <span>glify<span className="brand-period">.</span></span>
        </a>
        <button
          className="mobile-menu-button"
          type="button"
          aria-label={mobileMenuOpen ? "Close navigation" : "Open navigation"}
          aria-expanded={mobileMenuOpen}
          onClick={() => setMobileMenuOpen((open) => !open)}
        >
          {mobileMenuOpen ? <X size={21} /> : <Menu size={21} />}
        </button>
        <nav className={`main-nav${mobileMenuOpen ? " is-open" : ""}`} aria-label="Main navigation">
          {[
            { name: "Discover", icon: <Compass size={16} /> },
            { name: "Communities", icon: <UsersRound size={16} /> },
            { name: "My list", icon: <Bookmark size={16} /> },
          ].map((item) => (
            <button
              className={`nav-link${activeNav === item.name ? " is-active" : ""}`}
              type="button"
              key={item.name}
              onClick={() => chooseNav(item.name)}
            >
              {item.icon}{item.name}
            </button>
          ))}
        </nav>
        <div className="header-actions">
          <AuthenticationControls />
        </div>
      </header>

      <main>
        <section className="hero-section">
          <div className="hero-copy">
            <span className="eyebrow"><Sparkles size={14} /> A little corner of the internet, just for us</span>
            <h1>Find your kind<br />of <span>love story.</span></h1>
            <p className="hero-description">
              Manga, manhwa, novels, and series — find the stories that feel like yours, and the people who love them too.
            </p>
            <button className="hero-cta" type="button" onClick={() => chooseNav("Discover")}>
              Find your next favorite <ArrowRight size={17} />
            </button>
            <div className="community-proof">
              <div className="avatar-stack" aria-hidden="true">
                <span>m</span><span>y</span><span>a</span><span>♡</span>
              </div>
              <p><strong>A softer space for GL fans.</strong><br />Come as you are; stay for the stories.</p>
            </div>
          </div>
          <div className="hero-art" aria-label="Illustration of two women sharing a quiet moment" role="img">
            <div className="art-orbit orbit-one" />
            <div className="art-orbit orbit-two" />
            <div className="art-sun" />
            <div className="art-leaf leaf-one">✿</div>
            <div className="art-leaf leaf-two">✿</div>
            <div className="art-caption"><Heart size={13} fill="currentColor" /> Your story, your pace</div>
            <div className="art-person person-back"><span className="person-hair" /><span className="person-face" /><span className="person-body" /></div>
            <div className="art-person person-front"><span className="person-hair" /><span className="person-face" /><span className="person-body" /></div>
            <div className="art-sparkle sparkle-one">✦</div>
            <div className="art-sparkle sparkle-two">✧</div>
          </div>
          <div className="hero-bottom-note"><span /> GOOD STORIES. GOOD COMPANY. ALWAYS.</div>
        </section>

        <section className="discovery-section content-width" id="discover">
          <div className="section-heading">
            <div>
              <span className="section-kicker"><Flame size={14} /> YOUR NEXT OBSESSION</span>
              <h2>{activeNav === "My list" ? "Your saved stories" : "Find your next favorite"}</h2>
              <p>Sample catalog; ratings, member counts, and match scores are illustrative.</p>
            </div>
            <a className="text-link" href="#communities">Explore the community <ArrowRight size={15} /></a>
          </div>

          <div className={`catalog-status ${catalogState}`} role="status" aria-live="polite">
            <span>
              {catalogState === "live"
                ? "Connected to the live catalog. Only approved titles with Yuri or Shoujo Ai in their first six tags are shown."
                : catalogState === "loading"
                  ? "Loading catalog results. Previous stories remain visible in the meantime."
                  : catalogState === "sample"
                    ? `Showing local sample stories. ${catalogError ?? "The live catalog is unavailable."}`
                    : `The live catalog is unavailable. ${catalogError ?? "Please try again."}`}
            </span>
            {catalogState !== "live" && (
              <button type="button" onClick={() => setCatalogRetry((attempt) => attempt + 1)}>
                Retry connection
              </button>
            )}
          </div>
          {favoritesError && (
            <p className="favorites-error" role="alert">{favoritesError}</p>
          )}
          {graphSyncPending && accountStatus === "signed-in" && (
            <p className="favorites-prompt" role="status">
              Your favorites and watched/read activity are saved; Neo4j is pending synchronization.
            </p>
          )}
          {activeNav === "My list" && accountStatus === "signed-out" && (
            <p className="favorites-prompt">Sign in to see and save your favorite stories.</p>
          )}
          {activeNav === "My list" && accountStatus === "disabled" && (
            <p className="favorites-prompt">Configure account sign-in to use your favorites.</p>
          )}
          {activeNav === "My list" && favoritesLoading && (
            <p className="favorites-prompt" role="status">Loading your saved stories…</p>
          )}

          <div className="discovery-tools">
            <label className="search-box">
              <Search size={17} aria-hidden="true" />
              <input
                aria-label="Search titles, creators, genres, and tags"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search stories, creators, tropes..."
              />
              {query && (
                <button type="button" className="clear-search" aria-label="Clear search" onClick={() => setQuery("")}>
                  <X size={15} />
                </button>
              )}
            </label>
            <label className="select-wrap">
              <span className="sr-only">Filter by genre</span>
              <select value={genre} onChange={(event) => setGenre(event.target.value)}>
                {genres.map((item) => <option key={item}>{item}</option>)}
              </select>
              <ChevronDown size={15} aria-hidden="true" />
            </label>
            <label className="select-wrap format-select">
              <span className="sr-only">Filter by format</span>
              <select value={format} onChange={(event) => setFormat(event.target.value)}>
                {formats.map((item) => <option key={item}>{item}</option>)}
              </select>
              <ChevronDown size={15} aria-hidden="true" />
            </label>
            <span className="result-count">{visibleWorks.length} stories</span>
          </div>

          {visibleWorks.length > 0 ? (
            <div className="work-grid">
              {visibleWorks.map((work) => (
                <WorkCard
                  key={work.id}
                  work={work}
                  saved={savedIds.includes(work.id)}
                  accountStatus={accountStatus}
                  pending={favoritesLoading || pendingFavoriteId === work.id}
                  watched={watchedIds.includes(work.id)}
                  watchPending={favoritesLoading || pendingWatchedId === work.id}
                  onToggleFavorite={onToggleFavorite}
                  onToggleWatched={onToggleWatched}
                />
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <span><Search size={21} /></span>
              <h3>
                {catalogState === "unavailable"
                  ? "The live catalog could not be loaded."
                  : activeNav === "My list" && !query
                    ? "Your list is waiting for a story."
                    : "No stories found just yet."}
              </h3>
              <p>
                {catalogState === "unavailable"
                  ? "Check the API connection and CORS settings, then retry."
                  : "Try another search or loosen up your filters."}
              </p>
              {catalogState === "unavailable" ? (
                <button type="button" onClick={() => setCatalogRetry((attempt) => attempt + 1)}>
                  Retry catalog connection <ArrowRight size={15} />
                </button>
              ) : (
                <button type="button" onClick={() => { setQuery(""); setGenre("All stories"); setFormat("All formats"); setActiveNav("Discover"); }}>
                  Show all stories <ArrowRight size={15} />
                </button>
              )}
            </div>
          )}
          {activeNav === "Discover" && (
            <PersonalizedRecommendations
              accountStatus={accountStatus}
              recommendations={recommendations}
              loading={favoritesLoading || recommendationsLoading}
              error={recommendationsError}
              coldStart={recommendationsColdStart}
              shareActivity={shareActivity}
              participationPending={participationPending}
              onSetRecommendationParticipation={onSetRecommendationParticipation}
            />
          )}

          <button className="more-button" type="button" onClick={() => window.alert("More recommendations are coming soon.")}>
            More stories are on their way <ArrowDown size={15} />
          </button>
        </section>

        <section className="community-section" id="communities">
          <div className="content-width community-inner">
            <div className="community-heading">
              <div>
                <span className="section-kicker"><MessageCircle size={14} /> FIND YOUR PEOPLE</span>
                <h2>Good stories are<br />better <span>together.</span></h2>
                <p>A preview of the community spaces taking shape around favorite tropes and series.</p>
              </div>
              <a className="text-link" href="#discover">See all communities <ArrowRight size={15} /></a>
            </div>
            <div className="community-grid">
              {communities.map((community) => (
                <article className={`community-card ${community.color}`} key={community.name}>
                  <div className="community-card-top">
                    <span className="community-symbol">{community.icon}</span>
                    <span className="member-count"><UsersRound size={13} /> {community.members}</span>
                  </div>
                  <h3>{community.name}</h3>
                  <p>{community.topic}</p>
                  <button type="button" onClick={() => window.alert("Community discussions are coming soon.")}>
                    Find your people <ArrowRight size={15} />
                  </button>
                </article>
              ))}
            </div>
          </div>
        </section>
      </main>
      <footer className="site-footer">
        <a className="brand footer-brand" href="#discover" onClick={() => chooseNav("Discover")}>
          <span className="brand-mark"><Heart size={17} fill="currentColor" /></span>
          <span>glify<span className="brand-period">.</span></span>
        </a>
        <p>A soft place to land for GL fans, everywhere.</p>
        <span className="footer-note">MADE WITH <Heart size={11} fill="currentColor" /> FOR THE STORIES WE LOVE</span>
      </footer>
    </div>
  );
}

export default App;
