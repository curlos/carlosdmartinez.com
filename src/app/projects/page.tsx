import type { Metadata } from "next";
import { BackLink } from "@/components/BackLink";
import { ProjectCard } from "@/components/ProjectCard";
import { projects } from "@/data/projects";
import { BASE_OPEN_GRAPH } from "@/lib/site";

const DESCRIPTION = "Everything I've built, newest and strongest first.";

export const metadata: Metadata = {
  title: "All projects",
  description: DESCRIPTION,
  alternates: { canonical: "/projects" },
  openGraph: {
    ...BASE_OPEN_GRAPH,
    title: "All projects · Carlos Martinez",
    description: DESCRIPTION,
    url: "/projects",
  },
};

export default function ProjectsPage() {
  return (
    <section aria-labelledby="all-h" className="pt-16 pb-16">
      <p className="mb-4">
        <BackLink href="/#projects">back to home</BackLink>
      </p>
      <h1 id="all-h" className="mb-3 font-mono text-[clamp(32px,7vw,40px)] leading-tight font-bold">
        All projects
      </h1>
      <p className="mb-10 text-lg text-muted">{DESCRIPTION}</p>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] gap-6">
        {projects.map((project, i) => (
          <ProjectCard key={project.slug} project={project} as="h2" priority={i === 0} />
        ))}
      </div>
    </section>
  );
}
