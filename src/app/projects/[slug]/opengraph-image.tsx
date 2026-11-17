import { notFound } from "next/navigation";
import { ImageResponse } from "next/og";
import { getProject, projects } from "@/data/projects";
import { OG_SIZE, OgCard, ogFonts } from "@/lib/og";

export function generateStaticParams() {
  return projects.map(({ slug }) => ({ slug }));
}

// One image per project, so each gets its own alt text.
export function generateImageMetadata({ params }: { params: { slug: string } }) {
  const project = getProject(params.slug);
  if (!project) return [];
  return [
    {
      id: "card",
      alt: `${project.name}, a project by Carlos Martinez`,
      size: OG_SIZE,
      contentType: "image/png",
    },
  ];
}

export default async function OpenGraphImage({ params }: { params: Promise<{ slug: string }> }) {
  const project = getProject((await params).slug);
  if (!project) notFound();
  return new ImageResponse(
    <OgCard
      kicker="> Carlos Martinez · Full-Stack Software Engineer"
      title={project.name}
      body={project.page.summary}
      footer={project.page.stack.join(" · ")}
    />,
    { ...OG_SIZE, fonts: await ogFonts() },
  );
}
