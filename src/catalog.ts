export type Format = "Manga" | "Manhwa" | "Light novel" | "Live action" | "Anime" | "Webtoon";

export interface Work {
  id: string;
  title: string;
  creator: string;
  format: Format;
  genre: string;
  description: string;
  image: string;
  imageAlt: string;
  rating?: string;
  chapters: string;
  match?: number;
  tags: string[];
}

const workFormats = new Set<string>(["Manga", "Manhwa", "Light novel", "Live action", "Anime", "Webtoon"]);

export function isWork(value: unknown): value is Work {
  if (value === null || typeof value !== "object") return false;
  const work = value as Record<string, unknown>;
  return (
    typeof work.id === "string" &&
    typeof work.title === "string" &&
    typeof work.creator === "string" &&
    typeof work.format === "string" &&
    workFormats.has(work.format) &&
    typeof work.genre === "string" &&
    typeof work.description === "string" &&
    typeof work.image === "string" &&
    typeof work.imageAlt === "string" &&
    typeof work.chapters === "string" &&
    (work.rating === undefined || typeof work.rating === "string") &&
    (work.match === undefined ||
      (typeof work.match === "number" && Number.isFinite(work.match) && work.match >= 0 && work.match <= 100)) &&
    Array.isArray(work.tags) &&
    work.tags.every((tag) => typeof tag === "string")
  );
}

export const works: Work[] = [
  {
    id: "after-the-rain",
    title: "The Moon on a Rainy Night",
    creator: "Kuzushiro",
    format: "Manga",
    genre: "Coming of age",
    description: "Two girls find their own rhythm, together.",
    image:
      "https://images.unsplash.com/photo-1518837695005-2083093ee35b?auto=format&fit=crop&w=760&q=85",
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
    image:
      "https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&w=760&q=85",
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
    image:
      "https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=760&q=85",
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
    image:
      "https://images.unsplash.com/photo-1470252649378-9c29740c9fa8?auto=format&fit=crop&w=760&q=85",
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
    image:
      "https://images.unsplash.com/photo-1519608487953-e999c86e7455?auto=format&fit=crop&w=760&q=85",
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
    image:
      "https://images.unsplash.com/photo-1470770841072-f978cf4d019e?auto=format&fit=crop&w=760&q=85",
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
    image:
      "https://images.unsplash.com/photo-1536098561742-ca998e48cbcc?auto=format&fit=crop&w=760&q=85",
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
    image:
      "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=760&q=85",
    imageAlt: "Neon-lit city street at night",
    rating: "4.5",
    chapters: "80 episodes",
    match: 85,
    tags: ["Supernatural romance", "Comedy"],
  },
];

export const genres = [
  "All stories",
  "Slow burn",
  "Office romance",
  "Coming of age",
  "Music",
  "Slice of life",
];

export const formats: Array<"All formats" | Format> = [
  "All formats",
  "Manga",
  "Manhwa",
  "Webtoon",
  "Light novel",
  "Live action",
  "Anime",
];
