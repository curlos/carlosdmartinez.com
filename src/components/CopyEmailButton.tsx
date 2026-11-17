"use client";

import { Copy } from "lucide-react";
import { useEffect, useState } from "react";

export function CopyEmailButton({ email }: { email: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(email);
      setCopied(true);
    } catch {
      // Clipboard blocked (e.g. insecure context): the email link is right next to the button.
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={copy}
        aria-label="Copy email address"
        className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-btn border border-border px-2.5 py-1.5 font-mono text-[13px] font-medium text-text-2 hover:border-accent hover:text-accent-hover"
      >
        <Copy size={14} aria-hidden="true" />
        {copied ? "Copied!" : "Copy"}
      </button>
      <span aria-live="polite" className="sr-only">
        {copied ? "Copied!" : ""}
      </span>
    </>
  );
}
