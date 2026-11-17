"use client";

import { useLayoutEffect, useRef } from "react";

type Props = {
  mp4: string;
  webm: string;
  poster: string;
  width: number;
  height: number;
  label: string;
};

// The control bar is drawn over the bottom of the element, so the element is 16:9 plus a 56px strip below the
// picture (100cqw is the width of the frame that holds it) to keep the bar off the captions burned into the video.
export function DemoVideo({ mp4, webm, poster, width, height, label }: Props) {
  const ref = useRef<HTMLVideoElement>(null);

  // Next.js keeps the page you leave in the document, hidden, so a playing video would keep playing its sound.
  // The cleanup runs when the page is hidden; coming back leaves the video paused where it was.
  useLayoutEffect(() => {
    const video = ref.current;
    return () => video?.pause();
  }, []);

  return (
    <video
      ref={ref}
      // Not muted: it only plays when pressed, and the Player Lens demo has voiced commentary.
      controls
      playsInline
      preload="none"
      poster={poster}
      width={width}
      height={height}
      aria-label={label}
      className="block h-[calc(100cqw*9/16_+_56px)] w-full bg-black object-contain object-top"
    >
      <source src={webm} type="video/webm" />
      <source src={mp4} type="video/mp4" />
    </video>
  );
}
