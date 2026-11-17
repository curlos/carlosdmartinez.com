import Link from "next/link";
import { MobileMenu } from "./MobileMenu";

const LINKS = ["projects", "experience", "skills", "about", "contact"];

export function Nav() {
  return (
    // Always sticky. Under 768px there isn't room for the links, so the bar keeps the name and a menu button (and is shorter).
    // Keep the offsets in globals.css ([id] scroll-margin-top) in step with this bar's height (about 56px, 69px from 768px).
    <header className="sticky top-0 z-40 border-b border-border bg-bg/90 backdrop-blur">
      <nav aria-label="Main" className="container-page flex flex-wrap items-center justify-between gap-4 py-3 md:py-5">
        <Link href="/#top" className="font-mono font-bold text-text hover:text-text">
          Carlos Martinez
        </Link>
        <ul className="hidden flex-wrap gap-x-6 gap-y-1 font-mono text-[15px] md:flex">
          {LINKS.map((id) => (
            <li key={id}>
              <Link href={`/#${id}`} className="inline-block py-0.5 text-muted hover:text-accent-hover">
                {id}
              </Link>
            </li>
          ))}
        </ul>
        <MobileMenu links={LINKS} />
      </nav>
    </header>
  );
}
