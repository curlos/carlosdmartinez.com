import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { PAGES } from "./pages";

// WCAG 2.2 AA plus axe's best practices; runs at desktop and 375px (see playwright.config.ts).
for (const path of PAGES) {
  test(`no axe violations on ${path}`, async ({ page }) => {
    await page.goto(path);
    // The h1 streams in behind a Suspense fallback; axe must not run before it is there.
    await page.locator("h1").first().waitFor();
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"])
      .analyze();
    expect(results.violations).toEqual([]);
  });
}
