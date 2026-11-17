"use client";

import dynamic from "next/dynamic";

// The dialog only matters once someone clicks an image, so it loads after hydration.
export const LightboxLoader = dynamic(() => import("./Lightbox"), { ssr: false });
