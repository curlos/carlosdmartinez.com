import { ArrowRight, Code, ExternalLink, Trophy } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { Project } from "@/data/projects";
import { ProjectIcon } from "./ProjectIcon";

const SECONDARY_LINK =
  "relative z-10 inline-flex items-center gap-[5px] border-b border-underline-muted pb-px text-text-2 hover:border-accent hover:text-accent-hover";

type Props = {
  project: Project;
  /** Heading level, so cards nest correctly under h2 (home) or h1 (/projects): h3 on home, h2 on /projects. */
  as?: "h2" | "h3";
  /** Only the page's LCP image loads eagerly. */
  priority?: boolean;
};

// The title link stretches over the whole card (no nested links); Live demo and Code sit above it.
// Each card spans 6 rows of the parent grid as a subgrid, so the title, description, badge, stack
// and links rows line up across cards in the same row.
export function ProjectCard({ project, as: Heading = "h3", priority = false }: Props) {
  const { slug, name, card, liveUrl, codeUrl } = project;
  // The heading level tells home (h3) and /projects (h2) apart, which can both be in the document.
  const titleId = `${slug}-${Heading}-title`;

  return (
    <article className="group relative row-span-6 grid grid-rows-subgrid gap-y-3 overflow-hidden rounded-card border border-border bg-surface px-5 pb-5 transition-[border-color,translate] duration-200 hover:border-accent has-[.card-link:focus-visible]:border-accent has-[.card-link:focus-visible]:outline-2 has-[.card-link:focus-visible]:outline-offset-2 has-[.card-link:focus-visible]:outline-accent motion-safe:hover:-translate-y-0.5 motion-safe:has-[.card-link:focus-visible]:-translate-y-0.5">
      <Image
        src={card.image}
        alt={card.alt}
        sizes="(min-width: 1120px) 336px, (min-width: 700px) 50vw, 100vw"
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : undefined}
        className="-mx-5 aspect-[16/10] w-[calc(100%+2.5rem)] max-w-none object-cover"
        style={{
          objectPosition: card.position ?? "top left",
          background: card.background ?? "var(--color-surface-2)",
        }}
      />
      <Heading id={titleId} className="mt-2 flex items-center gap-2.5 text-[22px] leading-snug font-bold">
        <ProjectIcon icon={project.icon} size={28} />
        <Link
          href={`/projects/${slug}`}
          prefetch={true}
          className="card-link text-text outline-none after:absolute after:inset-0 hover:text-text"
        >
          {name}
        </Link>
      </Heading>
      <p className="text-text-2">{card.description}</p>
      {/* Spec asks for nowrap, but some badges are wider than a 375px card; they wrap only when they don't fit. */}
      <p className="flex max-w-full items-start gap-2 self-start justify-self-start rounded-btn border border-accent px-2.5 py-1 font-mono text-[13px] text-text">
        <Trophy size={16} className="mt-[3px] shrink-0 text-accent" aria-hidden="true" />
        {/* Non-breaking hyphens, so "5-agent" never splits across lines. */}
        {card.badge.replaceAll("-", "‑")}
      </p>
      <p className="font-mono text-[13px] text-muted">{card.stack.join(" · ")}</p>
      <div className="flex flex-wrap items-center justify-between gap-3 self-end text-[15px]">
        {/* Visual cue only: the stretched title link already covers the card. */}
        <span
          aria-hidden="true"
          className="inline-flex items-center gap-[5px] border-b border-accent pb-px font-bold text-accent group-hover:border-accent-hover group-hover:text-accent-hover"
        >
          View project
          <ArrowRight size={16} strokeWidth={2.75} />
        </span>
        <div className="flex gap-4">
          {liveUrl && (
            <a href={liveUrl} target="_blank" rel="noopener" aria-describedby={titleId} className={SECONDARY_LINK}>
              Live demo
              <ExternalLink size={14} aria-hidden="true" />
            </a>
          )}
          <a href={codeUrl} target="_blank" rel="noopener" aria-describedby={titleId} className={SECONDARY_LINK}>
            Code
            <Code size={14} aria-hidden="true" />
          </a>
        </div>
      </div>
    </article>
  );
}
