import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { BackLink } from "@/components/BackLink";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false },
};

export default function NotFound() {
  return (
    <section aria-labelledby="nf-h" className="flex flex-col items-start gap-5 pt-24 pb-24">
      <p className="font-mono text-sm text-accent">&gt; 404</p>
      <h1 id="nf-h" className="font-mono text-[clamp(34px,8vw,48px)] leading-[1.1] font-bold">
        Page not found
      </h1>
      <div className="mt-2 flex flex-wrap items-center gap-6">
        <Link
          href="/projects"
          className="inline-flex items-center gap-2 rounded-btn border border-border px-[22px] py-3 font-semibold text-text hover:border-accent hover:text-accent-hover"
        >
          View all projects
          <ArrowRight size={16} strokeWidth={2.75} aria-hidden="true" />
        </Link>
        <BackLink href="/">back to home</BackLink>
      </div>
    </section>
  );
}
