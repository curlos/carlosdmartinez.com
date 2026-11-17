import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 py-1 font-mono text-sm text-muted hover:text-accent-hover"
    >
      <ArrowLeft size={14} strokeWidth={2.5} aria-hidden="true" />
      {children}
    </Link>
  );
}
