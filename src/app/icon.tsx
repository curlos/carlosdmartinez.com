import { ImageResponse } from "next/og";
import { Monogram, ogFonts } from "@/lib/og";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default async function Icon() {
  return new ImageResponse(<Monogram size={64} radius={12} />, {
    ...size,
    fonts: await ogFonts(),
  });
}
