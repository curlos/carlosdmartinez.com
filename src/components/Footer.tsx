import { ArrowUp } from "lucide-react";
import { REPO_URL } from "@/lib/site";
import { KonamiLoader } from "./KonamiLoader";

// One arrow SVG, rotated, so all four keycaps are identical in size.
const KEYS: (number | string)[] = [0, 0, 180, 180, -90, 90, -90, 90, "B", "A"];

export function Footer() {
  return (
    <footer className="border-t border-border">
      <div className="container-page flex flex-wrap justify-between gap-3 py-6 font-mono text-sm text-muted">
        <p>
          © 2026 Carlos Martinez · Built with Next.js &amp; Tailwind ·{" "}
          <a
            href={REPO_URL}
            target="_blank"
            rel="noopener"
            className="border-b border-underline-muted text-text-2 hover:border-accent hover:text-accent-hover"
          >
            View source
          </a>
        </p>
        {/* Keyboard only, so it's hidden under 768px, where there's rarely one. */}
        <p className="hidden flex-wrap items-center gap-1 md:flex">
          <span className="sr-only">Try the Konami code: up, up, down, down, left, right, left, right, B, A</span>
          <span aria-hidden="true" className="mr-1.5">
            try
          </span>
          {KEYS.map((key, i) => (
            <span
              key={i}
              aria-hidden="true"
              className="inline-flex size-[22px] items-center justify-center rounded border border-b-2 border-keycap text-xs font-bold text-text-2"
            >
              {typeof key === "number" ? (
                <ArrowUp size={12} strokeWidth={3} style={{ transform: `rotate(${key}deg)` }} />
              ) : (
                key
              )}
            </span>
          ))}
        </p>
      </div>
      <KonamiLoader />
    </footer>
  );
}
