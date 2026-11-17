import Image from "next/image";
import type { Feature } from "@/data/projects";
import { LightboxLoader } from "./LightboxLoader";

type ShownFeature = Feature & Required<Pick<Feature, "image">>;

const FRAME = "aspect-[16/10] w-full border-b border-border bg-surface-2";

function Media({ feature }: { feature: ShownFeature }) {
  const { image, alt = "", fit, position } = feature;

  return (
    // Links to the full-size image, so it works before the Lightbox loads; once loaded,
    // the Lightbox intercepts the click and opens a dialog instead (see Lightbox.tsx).
    <a
      href={image.src}
      aria-haspopup="dialog"
      data-lightbox-src={image.src}
      data-lightbox-alt={alt}
      data-lightbox-title={feature.title}
      data-lightbox-width={image.width}
      data-lightbox-height={image.height}
      className={`${FRAME} block cursor-zoom-in overflow-hidden ${fit === "contain" ? "p-4" : ""}`}
    >
      <Image
        src={image}
        alt={alt}
        sizes="(min-width: 1120px) 339px, (min-width: 700px) 50vw, 100vw"
        className={
          fit === "contain"
            ? "mx-auto h-full w-auto max-w-full rounded-btn border border-border object-contain"
            : "size-full object-cover transition-transform duration-300 motion-safe:hover:scale-[1.02]"
        }
        style={fit === "contain" ? undefined : { objectPosition: position ?? "top left" }}
      />
    </a>
  );
}

const hasImage = (feature: Feature): feature is ShownFeature =>
  feature.image !== undefined;

export function FeatureGrid({ features }: { features: Feature[] }) {
  return (
    <>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,320px),1fr))] gap-5">
        {/* Features without a screenshot yet stay hidden. */}
        {features.filter(hasImage).map((feature) => (
          <figure
            key={feature.title}
            className="overflow-hidden rounded-card border border-border bg-surface"
          >
            <Media feature={feature} />
            <figcaption className="flex flex-col gap-1.5 px-[18px] py-4">
              <span className="font-bold text-text">{feature.title}</span>
              <span className="text-[15px] text-text-2">{feature.description}</span>
              <span className="font-mono text-xs text-muted">{feature.page}</span>
            </figcaption>
          </figure>
        ))}
      </div>
      <LightboxLoader />
    </>
  );
}
