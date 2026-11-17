"use client";

import { X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

type Shown = { src: string; alt: string; title: string; width: number; height: number };

// One dialog per page. Feature images are server-rendered links to the full-size image
// (<a data-lightbox-src>); this intercepts clicks on them, so the grid needs no client JavaScript.
export default function Lightbox() {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const [shown, setShown] = useState<Shown | null>(null);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      // Let Cmd/Ctrl/Shift-click open the image in a new tab as usual.
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = (event.target as Element).closest<HTMLElement>("[data-lightbox-src]");
      if (!link) return;
      event.preventDefault();
      const { lightboxSrc, lightboxAlt, lightboxTitle, lightboxWidth, lightboxHeight } = link.dataset;
      trigger.current = link;
      setShown({
        src: lightboxSrc!,
        alt: lightboxAlt ?? "",
        title: lightboxTitle ?? "",
        width: Number(lightboxWidth),
        height: Number(lightboxHeight),
      });
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  useEffect(() => {
    if (shown && !dialog.current?.open) dialog.current?.showModal();
  }, [shown]);

  // Next.js keeps the page you leave in the document, hidden; a modal left open would stay in the top layer
  // and block the next page. The cleanup runs when the page is hidden.
  useLayoutEffect(() => {
    const element = dialog.current;
    return () => element?.close();
  }, []);

  // Esc and the close button both end up here; focus goes back to the image that opened it.
  const onClose = () => {
    setShown(null);
    trigger.current?.focus();
  };

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      aria-label={shown?.alt}
      // Full size of the viewport minus the scrollbar (100vw would slide the close button under it).
      className="size-full max-h-none max-w-none bg-transparent p-0 backdrop:bg-bg/95"
    >
      {shown && (
        // Clicking the backdrop (anywhere but the image) closes it, like Esc.
        <div
          className="relative flex size-full flex-col items-center justify-center gap-3 p-4 sm:p-10"
          onClick={() => dialog.current?.close()}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- already an optimized WebP; skips another transformation */}
          <img
            src={shown.src}
            alt={shown.alt}
            width={shown.width}
            height={shown.height}
            onClick={(event) => event.stopPropagation()}
            // Leaves room for the one-line caption below.
            className="max-h-[calc(100%-2.25rem)] w-auto max-w-full rounded-btn border border-border object-contain"
          />
          {shown.title && <p className="font-mono text-sm text-text-2">{shown.title}</p>}
          <button
            type="button"
            autoFocus
            onClick={() => dialog.current?.close()}
            aria-label="Close"
            className="absolute top-3 right-3 inline-flex size-11 cursor-pointer items-center justify-center rounded-btn border border-border bg-surface text-text hover:border-accent hover:text-accent-hover"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>
      )}
    </dialog>
  );
}
