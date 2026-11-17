"use client";

import { Trophy } from "lucide-react";
import { useEffect, useState } from "react";

const SEQUENCE = [
  "ArrowUp",
  "ArrowUp",
  "ArrowDown",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowLeft",
  "ArrowRight",
  "b",
  "a",
];

function isTyping(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  );
}

export default function KonamiToast() {
  // Counts matches, so a second match restarts the timer and re-announces.
  const [shown, setShown] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Rolling buffer of the last keys, so extra presses (e.g. a third ↑) don't break the match.
    let recent: string[] = [];
    const onKey = (event: KeyboardEvent) => {
      if (isTyping(event.target)) return;
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      recent = [...recent, key].slice(-SEQUENCE.length);
      if (recent.join() === SEQUENCE.join()) {
        recent = [];
        setShown((n) => n + 1);
        setVisible(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!shown) return;
    const timer = setTimeout(() => setVisible(false), 4000);
    return () => clearTimeout(timer);
  }, [shown]);

  return (
    <div role="status" className="fixed right-4 bottom-4 z-50">
      {visible && (
        <p
          key={shown}
          className="flex items-center gap-2 rounded-btn border border-accent bg-surface px-3.5 py-2.5 font-mono text-[13px] text-text shadow-lg motion-safe:animate-[toast-in_200ms_ease-out]"
        >
          <Trophy size={16} className="text-accent" aria-hidden="true" />
          Achievement unlocked: Secret found
        </p>
      )}
    </div>
  );
}
