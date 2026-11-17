import { expect, test } from "@playwright/test";
import { PAGES } from "./pages";

// 320px is WCAG 1.4.10 Reflow (400% zoom); 768 and 1024 are portrait and landscape tablets.
const WIDTHS = [320, 768, 1024];

test.describe("no sideways scrolling", () => {
  // Widths are set per test, so one browser project is enough.
  test.skip(({ isMobile }) => isMobile, "covered by the desktop run");

  for (const width of WIDTHS) {
    test(`at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      for (const path of PAGES) {
        await page.goto(path);
        const { scroll, client } = await page.evaluate(() => ({
          scroll: document.documentElement.scrollWidth,
          client: document.documentElement.clientWidth,
        }));
        expect(scroll, `${path} is wider than the ${width}px viewport`).toBeLessThanOrEqual(client);
      }
    });
  }
});
