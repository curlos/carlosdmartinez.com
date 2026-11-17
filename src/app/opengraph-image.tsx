import { ImageResponse } from "next/og";
import { OG_SIZE, OgCard, ogFonts } from "@/lib/og";
import { SITE_DESCRIPTION, SITE_TITLE } from "@/lib/site";

export const alt = SITE_TITLE;
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function OpenGraphImage() {
  return new ImageResponse(
    <OgCard
      kicker="> Miami, FL (open to relocation) · available now"
      title="Carlos Martinez"
      subtitle="Full-Stack Software Engineer"
      body={SITE_DESCRIPTION}
      footer="carlosdmartinez.com"
    />,
    { ...size, fonts: await ogFonts() },
  );
}
