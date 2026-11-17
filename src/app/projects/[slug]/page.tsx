import { ArrowRight, Code, ExternalLink, Trophy } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { preload } from "react-dom";
import { ArchitectureDiagram } from "@/components/ArchitectureDiagram";
import { BackLink } from "@/components/BackLink";
import { DemoVideo } from "@/components/DemoVideo";
import { FeatureGrid } from "@/components/FeatureGrid";
import { ProjectIcon } from "@/components/ProjectIcon";
import { SectionHeading } from "@/components/SectionHeading";
import { getProject, projects, type Project } from "@/data/projects";
import { BASE_OPEN_GRAPH } from "@/lib/site";
import { versioned } from "@/lib/versioned";

export function generateStaticParams() {
  return projects.map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps<"/projects/[slug]">): Promise<Metadata> {
  const project = getProject((await params).slug);
  if (!project) return {};
  const url = `/projects/${project.slug}`;
  return {
    title: project.name,
    description: project.page.summary,
    alternates: { canonical: url },
    openGraph: {
      ...BASE_OPEN_GRAPH,
      title: `${project.name} · Carlos Martinez`,
      description: project.page.summary,
      url,
    },
  };
}

const BUTTON = "inline-flex items-center gap-2 rounded-btn px-[22px] py-3";

function TopMedia({ project }: { project: Project }) {
  const { video, top } = project.page;
  const frame = "overflow-hidden rounded-xl border border-border bg-surface-2";

  if (video) {
    const poster = versioned(video.poster);
    // The poster is the page's LCP image.
    preload(poster, { as: "image", fetchPriority: "high" });
    return (
      <div className={`${frame} [container-type:inline-size]`}>
        <DemoVideo
          mp4={versioned(video.mp4)}
          webm={versioned(video.webm)}
          poster={poster}
          width={video.width}
          height={video.height}
          label={top.alt}
        />
      </div>
    );
  }

  return (
    <div className={frame}>
      <Image
        src={top.image}
        alt={top.alt}
        sizes="(min-width: 1120px) 1056px, 100vw"
        loading="eager"
        fetchPriority="high"
        className="aspect-video w-full object-cover"
        style={{ objectPosition: top.position }}
      />
    </div>
  );
}

// `params` needs a Suspense boundary even with generateStaticParams: the route's shared App Shell
// can't hold one slug's content. Links here use prefetch={true}, so the fallback rarely shows.
export default function ProjectPage({ params }: PageProps<"/projects/[slug]">) {
  return (
    <Suspense
      fallback={
        <p className="pt-14">
          <BackLink href="/projects">all projects</BackLink>
        </p>
      }
    >
      <ProjectDetails params={params} />
    </Suspense>
  );
}

async function ProjectDetails({ params }: Pick<PageProps<"/projects/[slug]">, "params">) {
  const project = getProject((await params).slug);
  if (!project) notFound();

  const { name, page } = project;
  const index = projects.indexOf(project);
  const next = projects[(index + 1) % projects.length];

  return (
    <article>
      <section aria-labelledby={`${project.slug}-title-h`} className="flex flex-col gap-[18px] pt-14 pb-6">
        <p>
          <BackLink href="/projects">all projects</BackLink>
        </p>
        <h1
          id={`${project.slug}-title-h`}
          className="flex items-center gap-3.5 font-mono text-[clamp(34px,8vw,48px)] leading-[1.1] font-bold"
        >
          <ProjectIcon icon={project.icon} size={44} />
          {name}
        </h1>
        <p className="max-w-[760px] text-xl text-text-2">{page.summary}</p>
        <div className="flex flex-wrap gap-3">
          {page.buttons.map(({ label, href }, i) => {
            const primary = i === 0 && (label === "Live demo" || label === "Add to Chrome");
            const Icon = primary ? ExternalLink : Code;
            return (
              <a
                key={href}
                href={href}
                target="_blank"
                rel="noopener"
                className={
                  primary
                    ? `${BUTTON} bg-accent font-bold text-bg hover:bg-accent-hover hover:text-bg`
                    : `${BUTTON} border border-border font-semibold text-text hover:border-accent hover:text-accent-hover`
                }
              >
                {label}
                <Icon size={16} aria-hidden="true" />
              </a>
            );
          })}
        </div>
        {page.note && <p className="text-sm text-muted">{page.note}</p>}
      </section>

      <section aria-label="Demo" className="pb-6">
        <TopMedia project={project} />
      </section>

      <div className="flex flex-col gap-[18px] pb-[clamp(28px,5vw,40px)]">
        <p className="font-mono text-[13px] text-muted">{page.stack.join(" · ")}</p>
        {page.stats.length > 0 && (
          <ul className="mt-2 grid grid-cols-[repeat(auto-fit,minmax(min(100%,260px),1fr))] gap-4">
            {page.stats.map(({ value, label }) => (
              <li
                key={value}
                className="flex flex-col gap-1 rounded-card border border-border bg-surface px-5 py-[18px]"
              >
                <p className="flex items-center gap-2 font-mono text-[22px] font-bold text-text">
                  <Trophy size={16} className="shrink-0 text-accent" aria-hidden="true" />
                  {value}
                </p>
                <p className="text-sm text-muted">{label}</p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <section aria-labelledby={`${project.slug}-overview-h`} className="section-y">
        <SectionHeading id={`${project.slug}-overview-h`} number="01" className="mb-6" small>
          Overview
        </SectionHeading>
        <p className="max-w-[820px] text-lg text-text-2">{page.overview}</p>
      </section>

      <section aria-labelledby={`${project.slug}-features-h`} className="section-y">
        <SectionHeading id={`${project.slug}-features-h`} number="02" className="mb-6" small>
          Key features
        </SectionHeading>
        <FeatureGrid features={page.features} />
      </section>

      <section aria-labelledby={`${project.slug}-built-h`} className="section-y">
        <SectionHeading id={`${project.slug}-built-h`} number="03" className="mb-6" small>
          How it&apos;s built
        </SectionHeading>
        <ArchitectureDiagram architecture={page.architecture} slug={project.slug} />
        <div className="flex flex-col gap-5">
          {page.stories.map((story) => (
            <article
              key={story.title}
              className="rounded-card border border-border bg-surface p-6 max-sm:p-5"
            >
              <h3 className="mb-4 text-xl font-bold">{story.title}</h3>
              <dl className="flex flex-col gap-3">
                {(
                  [
                    ["Problem", story.problem],
                    ["What I did", story.whatIDid],
                    ["Result", story.result],
                  ] as const
                ).map(([term, text]) => (
                  <div key={term} className="grid gap-x-3 gap-y-1 sm:grid-cols-[110px_minmax(0,1fr)]">
                    <dt className="pt-[3px] font-mono text-[13px] text-accent">{term}</dt>
                    <dd className="text-text-2">{text}</dd>
                  </div>
                ))}
              </dl>
            </article>
          ))}
        </div>
      </section>

      <section aria-labelledby={`${project.slug}-role-h`} className="section-y">
        <SectionHeading id={`${project.slug}-role-h`} number="04" className="mb-6" small>
          My role
        </SectionHeading>
        <p className="max-w-[820px] text-lg text-text-2">{page.role}</p>
      </section>

      <nav
        aria-label="Next project"
        className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-border pt-[clamp(28px,5vw,40px)] pb-16"
      >
        <BackLink href="/projects">all projects</BackLink>
        <Link href={`/projects/${next.slug}`} prefetch={true} className="group ml-auto inline-flex flex-col items-end gap-1">
          <span className="font-mono text-[13px] text-muted">next project</span>
          <span className="inline-flex items-center gap-2 text-right text-[22px] leading-tight font-bold text-accent group-hover:text-accent-hover">
            {next.name}
            <ArrowRight size={16} strokeWidth={2.75} className="shrink-0" aria-hidden="true" />
          </span>
        </Link>
      </nav>
    </article>
  );
}
