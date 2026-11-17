"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

// Phone-width stand-in for the nav links: a button that drops the same links down under the bar.
// The panel is positioned against the sticky header, so it spans the full width just below it.
export function MobileMenu({ links }: { links: string[] }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      button.current?.focus();
    };
    // Tapping anywhere outside the button and the list closes it.
    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  const Icon = open ? X : Menu;

  return (
    <div ref={root} className="md:hidden">
      <button
        ref={button}
        type="button"
        aria-label="Menu"
        aria-expanded={open}
        aria-controls="mobile-menu"
        onClick={() => setOpen(!open)}
        // 44px tap target; the negative margins keep it from making the bar taller.
        className="-mr-2.5 -my-2.5 inline-flex size-11 cursor-pointer items-center justify-center rounded-btn text-text-2 hover:text-accent-hover"
      >
        <Icon size={22} aria-hidden="true" />
      </button>
      <div id="mobile-menu" hidden={!open} className="absolute inset-x-0 top-full border-b border-border bg-bg">
        <ul className="container-page py-2 font-mono text-[15px]">
          {links.map((id) => (
            <li key={id}>
              <Link
                href={`/#${id}`}
                onClick={() => setOpen(false)}
                className="flex min-h-11 items-center text-text-2 hover:text-accent-hover"
              >
                {id}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
