import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { cacheLife } from "next/cache";

// TTFs vendored in src/assets/fonts (next/og can't read woff2), loaded at build time.
const font = (file: string) => readFile(join(process.cwd(), "src/assets/fonts", file));

// Cached so metadata image routes stay prerendered under Cache Components.
async function fontBytes() {
  "use cache";
  cacheLife("max");
  return Promise.all(
    ["Inter-400.ttf", "Inter-600.ttf", "Inter-700.ttf", "JetBrainsMono-700.ttf"].map(async (file) =>
      Uint8Array.from(await font(file)),
    ),
  );
}

export async function ogFonts() {
  // next/og needs ArrayBuffers; the cache hands back typed arrays.
  const [inter400, inter600, inter700, mono700] = (await fontBytes()).map((bytes) => Uint8Array.from(bytes).buffer);
  return [
    { name: "Inter", data: inter400, weight: 400 as const, style: "normal" as const },
    { name: "Inter", data: inter600, weight: 600 as const, style: "normal" as const },
    { name: "Inter", data: inter700, weight: 700 as const, style: "normal" as const },
    { name: "JetBrains Mono", data: mono700, weight: 700 as const, style: "normal" as const },
  ];
}

export const OG_SIZE = { width: 1200, height: 630 };

// 1200×630 share card: a mono kicker, a big mono title, a line of body text and an optional footer.
export function OgCard({
  kicker,
  title,
  subtitle,
  body,
  footer,
}: {
  kicker: string;
  title: string;
  subtitle?: string;
  body: string;
  footer?: string;
}) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: "#0d1117",
        color: "#e6edf3",
        padding: "72px 80px",
        fontFamily: "Inter",
        borderTop: "8px solid #3fb950",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <div style={{ fontFamily: "JetBrains Mono", fontSize: 28, color: "#3fb950" }}>{kicker}</div>
        <div style={{ fontFamily: "JetBrains Mono", fontWeight: 700, fontSize: 76, lineHeight: 1.05 }}>{title}</div>
        {subtitle && <div style={{ fontSize: 38, fontWeight: 600 }}>{subtitle}</div>}
        <div style={{ fontSize: 30, color: "#9aa4af", lineHeight: 1.4, maxWidth: 980 }}>{body}</div>
      </div>
      {footer && <div style={{ fontFamily: "JetBrains Mono", fontSize: 22, color: "#9aa4af" }}>{footer}</div>}
    </div>
  );
}

// "CM" monogram for the favicon and Apple touch icon.
export function Monogram({ size, radius }: { size: number; radius: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#0d1117",
        border: `${Math.max(1, Math.round(size / 32))}px solid #30363d`,
        borderRadius: radius,
        color: "#3fb950",
        fontFamily: "JetBrains Mono",
        fontWeight: 700,
        fontSize: size * 0.5,
        letterSpacing: -size * 0.03,
      }}
    >
      CM
    </div>
  );
}
