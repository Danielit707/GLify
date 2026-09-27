import { useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowRight,
  Bookmark,
  Check,
  ChevronDown,
  Compass,
  Flame,
  Heart,
  Menu,
  MessageCircle,
  Search,
  Sparkles,
  UsersRound,
  X,
} from "lucide-react";
import { formats, genres, works, type Work } from "./catalog";

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

function WorkCard({
  work,
  saved,
  onToggleSave,
}: {
  work: Work;
  saved: boolean;
  onToggleSave: (id: string) => void;
}) {
  return (
    <article className="work-card">
      <div className="cover-wrap">
        <img className="cover" src={work.image} alt={work.imageAlt} loading="lazy" />
        <span className="format-pill">{work.format}</span>
        <button
          className={`save-button${saved ? " is-saved" : ""}`}
          type="button"
          aria-label={`${saved ? "Remove" : "Save"} ${work.title} ${saved ? "from" : "to"} your list`}
          aria-pressed={saved}
          onClick={() => onToggleSave(work.id)}
        >
          {saved ? <Check size={17} /> : <Bookmark size={17} />}
        </button>
        <span className="match-pill">
          <Sparkles size={12} /> {work.match}% match
        </span>
      </div>
      <div className="work-details">
        <div className="work-title-row">
          <h3>{work.title}</h3>
          <span className="rating">★ {work.rating}</span>
        </div>
        <p className="work-creator">{work.creator} <span>·</span> {work.chapters}</p>
        <p className="work-description">{work.description}</p>
        <div className="tag-row">
          {work.tags.map((tag) => <span className="tag" key={tag}>{tag}</span>)}
        </div>
      </div>
    </article>
  );
}

function App() {
  const [query, setQuery] = useState("");
  const [genre, setGenre] = useState("All stories");
  const [format, setFormat] = useState("All formats");
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [activeNav, setActiveNav] = useState("Discover");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const filteredWorks = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return works.filter((work) => {
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
  }, [format, genre, query]);

  const visibleWorks = activeNav === "My list"
    ? filteredWorks.filter((work) => savedIds.includes(work.id))
    : filteredWorks;

  function toggleSaved(id: string) {
    setSavedIds((current) =>
      current.includes(id) ? current.filter((savedId) => savedId !== id) : [...current, id],
    );
  }

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
          <button className="sign-in-button" type="button" onClick={() => window.alert("Account sign-in is coming soon.")}>
            Sign in
          </button>
          <button className="join-button" type="button" onClick={() => window.alert("GLify accounts are coming soon.")}>
            Join GLify <ArrowRight size={15} />
          </button>
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
                  onToggleSave={toggleSaved}
                />
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <span><Search size={21} /></span>
              <h3>{activeNav === "My list" && !query ? "Your list is waiting for a story." : "No stories found just yet."}</h3>
              <p>Try another search or loosen up your filters.</p>
              <button type="button" onClick={() => { setQuery(""); setGenre("All stories"); setFormat("All formats"); setActiveNav("Discover"); }}>
                Show all stories <ArrowRight size={15} />
              </button>
            </div>
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
