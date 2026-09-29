import { useEffect, useMemo, useRef, useState } from "react";
import {
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
import { ClerkLoaded, Show, SignInButton, SignUpButton, UserButton, useUser } from "@clerk/react";
import { formats, genres, isWork, works, type Work } from "./catalog";

type AccountStatus = "disabled" | "loading" | "signed-out" | "signed-in";
const CATALOG_SECTION_SIZE = 15;

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

interface Community {
  id: string;
  name: string;
  description: string;
  memberCount: number;
  isGeneral: boolean;
  image: string | null;
  workIds: string[];
  createdBy: string;
  createdAt: string;
}

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
  const [catalogSection, setCatalogSection] = useState(0);
  const catalogGridRef = useRef<HTMLDivElement>(null);
  const [communities, setCommunities] = useState<Community[]>([]);
  const [communityFilter, setCommunityFilter] = useState<"all" | "general" | "work">("all");
  const [showCreateCommunity, setShowCreateCommunity] = useState(false);
  const [newCommunityName, setNewCommunityName] = useState("");
  const [newCommunityDescription, setNewCommunityDescription] = useState("");
  const [newCommunityIsGeneral, setNewCommunityIsGeneral] = useState(true);
  const [newCommunityWorkId, setNewCommunityWorkId] = useState("");
  const [newCommunityImage, setNewCommunityImage] = useState("");
  const [creatingCommunity, setCreatingCommunity] = useState(false);
  const [selectedCommunity, setSelectedCommunity] = useState<Community | null>(null);
  const [chatMessage, setChatMessage] = useState("");
  const [chatMessages, setChatMessages] = useState<Array<{ id: string; author: string; text: string; timestamp: string }>>([]);
  const { user } = useUser();

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

  useEffect(() => {
    setCatalogSection(0);
  }, [activeNav, format, genre, query]);

  useEffect(() => {
    if (activeNav !== "Communities") return;
    const controller = new AbortController();
    const apiBase = import.meta.env.VITE_API_URL?.replace(/\/$/, "") ?? "";
    const params = new URLSearchParams({ filter: communityFilter });

    fetch(`${apiBase}/api/communities?${params}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Communities API returned HTTP ${response.status}.`);
        const payload = await response.json();
        setCommunities(payload.communities);
      })
      .catch(() => {
        setCommunities([]);
      });

    return () => controller.abort();
  }, [activeNav, communityFilter]);

  function getWorkGroupId(work: Work): string {
    // Group works by their base title (removing format-specific suffixes)
    // e.g., "Bloom Into You (Anime)" and "Bloom Into You (Manga)" both map to "bloom into you"
    const normalized = work.title
      .toLowerCase()
      .replace(/\s*\([^)]*\)\s*/g, "") // Remove parenthetical suffixes like "(Anime)"
      .replace(/\s*:\s*.*$/, "") // Remove subtitles after colon
      .trim();
    return normalized;
  }

  function getGroupedWorks(): Array<{ groupId: string; displayName: string; workIds: string[] }> {
    const groups = new Map<string, { displayName: string; workIds: string[] }>();

    for (const work of catalogWorks) {
      const groupId = getWorkGroupId(work);
      const existing = groups.get(groupId);
      if (existing) {
        existing.workIds.push(work.id);
      } else {
        groups.set(groupId, { displayName: work.title, workIds: [work.id] });
      }
    }

    return Array.from(groups.entries()).map(([groupId, { displayName, workIds }]) => ({
      groupId,
      displayName,
      workIds,
    }));
  }

  async function createCommunity() {
    if (!newCommunityName.trim() || !newCommunityDescription.trim()) return;
    if (!newCommunityIsGeneral && !newCommunityWorkId) return;

    setCreatingCommunity(true);
    try {
      const apiBase = import.meta.env.VITE_API_URL?.replace(/\/$/, "") ?? "";

      // If work-focused, find all works in the same group
      let workIds: string[] | undefined;
      if (!newCommunityIsGeneral) {
        const selectedWork = catalogWorks.find((w) => w.id === newCommunityWorkId);
        if (selectedWork) {
          const groupId = getWorkGroupId(selectedWork);
          workIds = catalogWorks
            .filter((w) => getWorkGroupId(w) === groupId)
            .map((w) => w.id);
        }
      }

      const response = await fetch(`${apiBase}/api/communities`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newCommunityName.trim(),
          description: newCommunityDescription.trim(),
          isGeneral: newCommunityIsGeneral,
          workIds,
          image: newCommunityImage.trim() || undefined,
        }),
      });
      if (!response.ok) throw new Error(`Failed to create community: ${response.status}`);
      const payload = await response.json();
      setCommunities((prev) => [payload.community, ...prev]);
      setNewCommunityName("");
      setNewCommunityDescription("");
      setNewCommunityIsGeneral(true);
      setNewCommunityWorkId("");
      setNewCommunityImage("");
      setShowCreateCommunity(false);
      setCommunityFilter("all");
    } catch (error) {
      console.error("Failed to create community:", error);
    } finally {
      setCreatingCommunity(false);
    }
  }

  const visibleWorks = activeNav === "My list" && accountStatus === "signed-in"
    ? favoritesLoading
      ? []
      : filteredWorks.filter((work) => savedIds.includes(work.id))
    : activeNav === "My list"
      ? []
      : filteredWorks;
  const catalogSectionCount = Math.ceil(visibleWorks.length / CATALOG_SECTION_SIZE);
  const displayedWorks = visibleWorks.slice(
    catalogSection * CATALOG_SECTION_SIZE,
    (catalogSection + 1) * CATALOG_SECTION_SIZE,
  );

  useEffect(() => {
    if (catalogSectionCount > 0 && catalogSection >= catalogSectionCount) {
      setCatalogSection(catalogSectionCount - 1);
    }
  }, [catalogSection, catalogSectionCount]);

  function goToCatalogSection(section: number) {
    setCatalogSection(section);
    catalogGridRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function chooseNav(name: string) {
    setActiveNav(name);
    setMobileMenuOpen(false);
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
            { name: "For You", icon: <Sparkles size={16} /> },
            { name: "Communities", icon: <UsersRound size={16} /> },
            { name: "My list", icon: <Bookmark size={16} /> },
            { name: "Users", icon: <UsersRound size={16} /> },
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
        {activeNav === "Discover" && (
        <section className="hero-section">
          <div className="hero-copy">
            <span className="eyebrow"><Sparkles size={14} /> A little corner of the internet, just for us</span>
            <h1>Find your kind<br />of <span>love story.</span></h1>
            <p className="hero-description">
              Manga, manhwa, novels, and series — find the stories that feel like yours, and the people who love them too.
            </p>
            <button className="hero-cta" type="button" onClick={() => chooseNav("For You")}>
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
        )}

        {(activeNav === "Discover" || activeNav === "My list") && (
        <section className="discovery-section content-width" id="discover">
          <div className="section-heading">
            <div>
              <span className="section-kicker"><Flame size={14} /> YOUR NEXT OBSESSION</span>
              <h2>{activeNav === "My list" ? "Your saved stories" : "Find your next favorite"}</h2>
              <p>Sample catalog; ratings, member counts, and match scores are illustrative.</p>
            </div>
            <button className="text-link" type="button" onClick={() => chooseNav("Communities")}>
              Explore communities <ArrowRight size={15} />
            </button>
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
            <div className="work-grid" ref={catalogGridRef}>
              {displayedWorks.map((work) => (
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
          {catalogSectionCount > 1 && (
            <nav className="catalog-pagination" aria-label="Catalog sections">
              <button
                type="button"
                disabled={catalogSection === 0}
                onClick={() => goToCatalogSection(catalogSection - 1)}
              >
                Previous 15
              </button>
              <span>
                Section {catalogSection + 1} of {catalogSectionCount}
                {" · "}Showing {catalogSection * CATALOG_SECTION_SIZE + 1}–
                {Math.min((catalogSection + 1) * CATALOG_SECTION_SIZE, visibleWorks.length)} of {visibleWorks.length}
              </span>
              <button
                type="button"
                disabled={catalogSection + 1 >= catalogSectionCount}
                onClick={() => goToCatalogSection(catalogSection + 1)}
              >
                Next 15 <ArrowRight size={14} />
              </button>
            </nav>
          )}
        </section>
        )}

        {activeNav === "For You" && (
          <section className="content-width" id="recommendations" style={{ padding: "40px 0 76px" }}>
            <PersonalizedRecommendations
              accountStatus={accountStatus}
              recommendations={recommendations.filter(
                (work) => !savedIds.includes(work.id) && !watchedIds.includes(work.id),
              )}
              loading={favoritesLoading || recommendationsLoading}
              error={recommendationsError}
              coldStart={recommendationsColdStart}
              shareActivity={shareActivity}
              participationPending={participationPending}
              onSetRecommendationParticipation={onSetRecommendationParticipation}
            />
          </section>
        )}

        {activeNav === "Communities" && (
          <section className="community-section" id="communities">
            <div className="content-width community-inner">
              <div className="community-heading">
                <div>
                  <span className="section-kicker"><MessageCircle size={14} /> FIND YOUR PEOPLE</span>
                  <h2>Good stories are<br />better <span>together.</span></h2>
                  <p>Create or join spaces for your favorite works or general GL topics.</p>
                </div>
                <button
                  className="create-community-button"
                  type="button"
                  onClick={() => setShowCreateCommunity(!showCreateCommunity)}
                >
                  <MessageCircle size={14} /> Create community
                </button>
              </div>

              {showCreateCommunity && (
                <div className="create-community-form">
                  <h3>Create a community</h3>
                  <label>
                    <span>Name</span>
                    <input
                      type="text"
                      value={newCommunityName}
                      onChange={(e) => setNewCommunityName(e.target.value)}
                      placeholder="Community name"
                      maxLength={100}
                    />
                  </label>
                  <label>
                    <span>Description</span>
                    <textarea
                      value={newCommunityDescription}
                      onChange={(e) => setNewCommunityDescription(e.target.value)}
                      placeholder="What is this community about?"
                      maxLength={500}
                      rows={3}
                    />
                  </label>
                  <label>
                    <span>Image URL (optional)</span>
                    <input
                      type="url"
                      value={newCommunityImage}
                      onChange={(e) => setNewCommunityImage(e.target.value)}
                      placeholder="https://example.com/image.jpg"
                    />
                  </label>
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={newCommunityIsGeneral}
                      onChange={(e) => setNewCommunityIsGeneral(e.target.checked)}
                    />
                    <span>General community (not tied to a specific work)</span>
                  </label>
                  {!newCommunityIsGeneral && (
                    <label>
                      <span>Work</span>
                      <select
                        value={newCommunityWorkId}
                        onChange={(e) => setNewCommunityWorkId(e.target.value)}
                      >
                        <option value="">Select a work</option>
                        {getGroupedWorks().map((group) => (
                          <option key={group.groupId} value={group.workIds[0]}>
                            {group.displayName}
                            {group.workIds.length > 1
                              ? ` (${group.workIds.length} formats)`
                              : ""}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <div className="form-actions">
                    <button
                      type="button"
                      className="submit-community"
                      onClick={createCommunity}
                      disabled={creatingCommunity || !newCommunityName.trim() || !newCommunityDescription.trim()}
                    >
                      {creatingCommunity ? "Creating..." : "Create community"}
                    </button>
                    <button
                      type="button"
                      className="cancel-community"
                      onClick={() => setShowCreateCommunity(false)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              <div className="community-filters">
                {(["all", "general", "work"] as const).map((filter) => (
                  <button
                    key={filter}
                    type="button"
                    className={`filter-button${communityFilter === filter ? " is-active" : ""}`}
                    onClick={() => setCommunityFilter(filter)}
                  >
                    {filter === "all" ? "All" : filter === "general" ? "General" : "Work-focused"}
                  </button>
                ))}
              </div>

              {communities.length > 0 ? (
                <div className="community-grid">
                  {communities.map((community) => {
                    const isOwner = user?.id === community.createdBy;
                    const workName = !community.isGeneral && community.workIds.length > 0
                      ? catalogWorks.find((w) => w.id === community.workIds[0])?.title ?? "Work community"
                      : null;

                    return (
                      <article className="community-card" key={community.id}>
                        {community.image && (
                          <div className="community-image">
                            <img src={community.image} alt={community.name} loading="lazy" />
                          </div>
                        )}
                        <div className="community-card-top">
                          <span className="community-symbol"><UsersRound size={14} /></span>
                          <span className="member-count"><UsersRound size={13} /> {community.memberCount} members</span>
                        </div>
                        <span className={`community-type ${community.isGeneral ? "is-general" : "is-work"}`}>
                          {community.isGeneral ? "General" : workName ?? "Work-focused"}
                        </span>
                        <h3>{community.name}</h3>
                        <p>{community.description}</p>
                        {isOwner ? (
                          <span className="owner-badge">Owner</span>
                        ) : (
                          <button type="button" onClick={() => window.alert("Joining communities is coming soon.")}>
                            Join community <ArrowRight size={15} />
                          </button>
                        )}
                        <button type="button" className="open-chat-button" onClick={() => setSelectedCommunity(community)}>
                          Open chat <MessageCircle size={14} />
                        </button>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="community-empty">
                  <span><MessageCircle size={28} /></span>
                  <h3>No communities yet</h3>
                  <p>Be the first to create a community for your favorite works or general GL topics.</p>
                </div>
              )}
            </div>
          </section>
        )}

        {selectedCommunity && (
          <div className="chat-overlay" onClick={() => setSelectedCommunity(null)}>
            <div className="chat-panel" onClick={(e) => e.stopPropagation()}>
              <div className="chat-header">
                <h3>{selectedCommunity.name}</h3>
                <button type="button" className="close-chat" onClick={() => setSelectedCommunity(null)}>
                  <X size={18} />
                </button>
              </div>
              <div className="chat-messages">
                {chatMessages.length === 0 ? (
                  <p className="chat-empty">No messages yet. Say hello!</p>
                ) : (
                  chatMessages.map((msg) => (
                    <div className="chat-message" key={msg.id}>
                      <span className="chat-author">{msg.author}</span>
                      <p>{msg.text}</p>
                    </div>
                  ))
                )}
              </div>
              <div className="chat-input">
                <input
                  type="text"
                  value={chatMessage}
                  onChange={(e) => setChatMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && chatMessage.trim()) {
                      setChatMessages((prev) => [
                        ...prev,
                        {
                          id: crypto.randomUUID(),
                          author: user?.username ?? "You",
                          text: chatMessage.trim(),
                          timestamp: new Date().toISOString(),
                        },
                      ]);
                      setChatMessage("");
                    }
                  }}
                  placeholder="Type a message..."
                />
                <button
                  type="button"
                  onClick={() => {
                    if (chatMessage.trim()) {
                      setChatMessages((prev) => [
                        ...prev,
                        {
                          id: crypto.randomUUID(),
                          author: user?.username ?? "You",
                          text: chatMessage.trim(),
                          timestamp: new Date().toISOString(),
                        },
                      ]);
                      setChatMessage("");
                    }
                  }}
                  disabled={!chatMessage.trim()}
                >
                  Send
                </button>
              </div>
            </div>
          </div>
        )}

        {activeNav === "Users" && (
          <section className="content-width" id="users" style={{ padding: "40px 0 76px" }}>
            <div className="section-heading">
              <div>
                <span className="section-kicker"><UsersRound size={14} /> MEMBERS</span>
                <h2>Find your people</h2>
                <p>Member profiles and discovery are coming soon.</p>
              </div>
            </div>
            <div className="community-empty">
              <span><UsersRound size={28} /></span>
              <h3>Users section coming soon</h3>
              <p>You'll be able to browse member profiles, see their favorites and watched lists, and connect with other GL fans.</p>
            </div>
          </section>
        )}
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
