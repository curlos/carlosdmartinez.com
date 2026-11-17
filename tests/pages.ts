// Mirrors src/data/projects.ts (which imports images, so Playwright can't load it).
export const PROJECTS = [
  { slug: "statly", name: "Statly" },
  { slug: "player-lens", name: "Player Lens" },
  { slug: "sneaker-palace", name: "Sneaker Palace" },
  { slug: "panelyze", name: "Panelyze" },
  { slug: "markback", name: "Markback" },
  { slug: "murmur", name: "Murmur" },
  { slug: "reelhouse", name: "ReelHouse" },
];

export const PAGES = ["/", "/projects", ...PROJECTS.map(({ slug }) => `/projects/${slug}`), "/not-a-page"];
