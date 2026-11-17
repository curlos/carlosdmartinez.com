import { ArrowRight, CircleCheck, FileText, Mail, Monitor, Server, Wrench } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { FaGithub, FaLinkedin } from "react-icons/fa6";
import motionpointLogo from "@/assets/logos/motionpoint.webp";
import qlinkWirelessLogo from "@/assets/logos/qlink-wireless.webp";
import { CopyEmailButton } from "@/components/CopyEmailButton";
import { ProjectCard } from "@/components/ProjectCard";
import { SectionHeading } from "@/components/SectionHeading";
import { featuredProjects } from "@/data/projects";
import {
  BASE_OPEN_GRAPH,
  EMAIL,
  GITHUB_URL,
  LINKEDIN_URL,
  SITE_DESCRIPTION,
  SITE_TITLE,
  SITE_URL,
} from "@/lib/site";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
  openGraph: { ...BASE_OPEN_GRAPH, title: SITE_TITLE, description: SITE_DESCRIPTION, url: "/" },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "ProfilePage",
  name: SITE_TITLE,
  url: SITE_URL,
  mainEntity: {
    "@type": "Person",
    name: "Carlos Martinez",
    jobTitle: "Full-Stack Software Engineer",
    url: SITE_URL,
    sameAs: [GITHUB_URL, LINKEDIN_URL],
  },
};

const OUTLINE_BUTTON =
  "inline-flex items-center gap-2 rounded-btn border border-border px-[22px] py-3 font-semibold text-text hover:border-accent hover:text-accent-hover";

const HERO_LINKS = [
  { href: GITHUB_URL, label: "GitHub", Icon: FaGithub, external: true },
  { href: LINKEDIN_URL, label: "LinkedIn", Icon: FaLinkedin, external: true },
  { href: `mailto:${EMAIL}`, label: "Email", Icon: Mail, external: false },
];

const QLINK_BULLETS = [
  "Built the shared React, TypeScript and Redux foundation for a framework migration as the first engineer on the new stack, unblocking 3+ engineers on a platform serving 40K+ customers.",
  "Replaced a slow, non-SSR framework with a Next.js landing page platform that 15+ campaign pages were built on.",
  "Redesigned browsing for a 200+ item catalog with multi-select filters, fuzzy search and a dedicated mobile UI.",
  "Shipped a safety-critical E911 address feature under a 3-day deadline.",
];

const SKILLS = [
  {
    group: "Frontend",
    Icon: Monitor,
    skills: "React, TypeScript, JavaScript, Next.js, Redux, Tailwind CSS, HTML/CSS, accessibility (WCAG, ARIA)",
  },
  {
    group: "Backend",
    Icon: Server,
    skills: "Node.js, Express, MongoDB, Python, FastAPI, GraphQL, SQL, PostgreSQL",
  },
  {
    group: "Testing & CI",
    Icon: CircleCheck,
    skills: "Vitest, Playwright, React Testing Library, GitHub Actions",
  },
  {
    group: "AI & tools",
    Icon: Wrench,
    skills: "LLM integration, multi-agent systems, Claude Code, Git, Vercel, Docker, AWS",
  },
];

export default function Home() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />

      <section id="top" className="flex flex-col gap-5 pt-24 pb-[clamp(28px,5vw,40px)]">
        <p className="font-mono text-sm text-accent">
          &gt; Miami, FL (open to relocation) · available now
        </p>
        <h1 className="font-mono text-[clamp(40px,9vw,54px)] leading-[1.1] font-bold tracking-[-0.02em]">
          Carlos Martinez
        </h1>
        <p className="text-2xl font-semibold">Full-Stack Software Engineer</p>
        <p className="max-w-[640px] text-[19px] text-muted">{SITE_DESCRIPTION}</p>
        <div className="mt-2 flex flex-wrap gap-3">
          <a
            href="/resume.pdf"
            target="_blank"
            rel="noopener"
            className="inline-flex items-center gap-2 rounded-btn bg-accent px-[22px] py-3 font-bold text-bg hover:bg-accent-hover hover:text-bg"
          >
            <FileText size={18} aria-hidden="true" />
            Resume (PDF)
          </a>
          {HERO_LINKS.map(({ href, label, Icon, external }) => (
            <a
              key={label}
              href={href}
              className={OUTLINE_BUTTON}
              {...(external && { target: "_blank", rel: "noopener" })}
            >
              <Icon size={18} aria-hidden="true" />
              {label}
            </a>
          ))}
        </div>
      </section>

      <section id="projects" aria-labelledby="projects-h" className="section-y">
        <SectionHeading id="projects-h" number="01">
          Projects
        </SectionHeading>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] gap-6">
          {featuredProjects.map((project, i) => (
            // The first card image is the LCP element on phones and desktop.
            <ProjectCard key={project.slug} project={project} priority={i === 0} />
          ))}
        </div>
        <p className="mt-8 text-center">
          <Link href="/projects" className={OUTLINE_BUTTON}>
            View all projects
            <ArrowRight size={16} strokeWidth={2.75} aria-hidden="true" />
          </Link>
        </p>
      </section>

      <section id="experience" aria-labelledby="experience-h" className="section-y">
        <SectionHeading id="experience-h" number="02">
          Experience
        </SectionHeading>
        <div className="flex items-center gap-3.5">
          {/* Decorative: the company name is in the heading next to it. */}
          <Image src={qlinkWirelessLogo} alt="" width={40} height={40} className="shrink-0 rounded-lg" />
          <div className="flex flex-1 flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-xl font-bold">Frontend Developer · Q Link Wireless</h3>
            <p className="font-mono text-sm text-muted">Apr 2022 – Nov 2024</p>
          </div>
        </div>
        <div className="mt-2.5 flex flex-col gap-1 text-[15px] text-muted">
          <p>
            Lifeline provider with 1M+ subscribers, plus its prepaid sister brand Hello Mobile
            (40K+ customers)
          </p>
          <p className="font-mono text-[13px]">React · TypeScript · Redux · Next.js</p>
        </div>
        <ul className="mt-4 flex max-w-[820px] list-disc flex-col gap-2.5 pl-5 text-text-2">
          {QLINK_BULLETS.map((bullet) => (
            <li key={bullet}>{bullet}</li>
          ))}
        </ul>
        <div className="mt-9 border-t border-border pt-6">
          <div className="flex items-center gap-3.5">
            <Image src={motionpointLogo} alt="" width={40} height={40} className="shrink-0 rounded-lg" />
            <div className="flex flex-1 flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-lg font-bold">Software Engineer Intern · MotionPoint</h3>
              <p className="font-mono text-sm text-muted">May – Jul 2020</p>
            </div>
          </div>
          <p className="mt-2 max-w-[820px] text-text-2">
            Automated Jenkins environment setup with Python and shell scripts, cutting onboarding
            time for new developers.
          </p>
        </div>
      </section>

      <section id="skills" aria-labelledby="skills-h" className="section-y">
        <SectionHeading id="skills-h" number="03">
          Skills
        </SectionHeading>
        <dl className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,240px),1fr))] gap-6">
          {SKILLS.map(({ group, Icon, skills }) => (
            <div key={group}>
              <dt className="mb-1.5 flex items-center gap-2 font-bold">
                <Icon size={18} className="text-accent" aria-hidden="true" />
                {group}
              </dt>
              <dd className="text-text-2">{skills}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section id="about" aria-labelledby="about-h" className="section-y">
        <SectionHeading id="about-h" number="04" className="mb-5">
          About
        </SectionHeading>
        <p className="max-w-[720px] text-lg text-text-2">
          I build with AI the way a tech lead works with a team: I write the spec, direct Claude
          Code through implementation, then review every change with independent reviewers and
          hands-on testing before it ships. I own the decisions and the quality bar. Lifelong
          gamer (which is why Statly has streaks and medals) and NBA fan. Computer Science grad
          from FIU, bilingual in English and Spanish, based in Miami.
        </p>
      </section>

      <section id="contact" aria-labelledby="contact-h" className="pt-[clamp(28px,5vw,40px)] pb-16">
        <SectionHeading id="contact-h" number="05" className="mb-5">
          Contact
        </SectionHeading>
        <p className="mb-5 text-lg text-text-2">
          Open to full-stack, frontend and backend roles. The fastest way to reach me is email.
        </p>
        <div className="flex flex-wrap items-center gap-6 text-[17px] font-semibold">
          <span className="inline-flex flex-wrap items-center gap-2.5">
            <a href={`mailto:${EMAIL}`}>{EMAIL}</a>
            <CopyEmailButton email={EMAIL} />
          </span>
          <a href={LINKEDIN_URL} target="_blank" rel="noopener">
            LinkedIn
          </a>
          <a href={GITHUB_URL} target="_blank" rel="noopener">
            GitHub
          </a>
        </div>
      </section>
    </>
  );
}
