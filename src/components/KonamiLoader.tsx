"use client";

import dynamic from "next/dynamic";

// The listener isn't needed for first paint, so it loads after hydration.
export const KonamiLoader = dynamic(() => import("./KonamiToast"), { ssr: false });
