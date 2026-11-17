import Image from "next/image";
import type { Project } from "@/data/projects";

// Stacked 1px drop-shadows trace a thin light edge around the icon's own shape.
const OUTLINE = "drop-shadow(0 0 1px #e6edf3) drop-shadow(0 0 1px #e6edf3)";

/** Decorative: the project name always sits right next to it. */
export function ProjectIcon({ icon, size }: { icon: Project["icon"]; size: number }) {
  return (
    <Image
      src={icon.image}
      alt=""
      width={size}
      height={size}
      className="shrink-0 object-contain"
      style={icon.outline ? { filter: OUTLINE } : undefined}
    />
  );
}
