import { expect, test } from "@playwright/test";
import { PROJECTS } from "./pages";

test("home page renders", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Carlos Martinez" })).toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(3);
  for (const id of ["projects", "experience", "skills", "about", "contact"]) {
    await expect(page.locator(`section#${id}`)).toBeVisible();
  }
});

test("nav stays at the top while scrolling, with links only on wider screens", async ({ page, isMobile }) => {
  const nav = page.getByRole("navigation", { name: "Main" });
  const skills = page.getByRole("link", { name: "skills", exact: true });

  // A section opened by its link ends up below the sticky nav, not under it.
  await page.goto("/#skills");
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(500);
  await expect(nav).toBeInViewport();
  const navBox = (await nav.boundingBox())!;
  const headingBox = (await page.locator("section#skills h2").boundingBox())!;
  expect(headingBox.y).toBeGreaterThan(navBox.y + navBox.height);

  // Phones keep the links behind the menu button; wider screens show them in the bar.
  if (isMobile) await expect(skills).toBeHidden();
  else await expect(skills).toBeVisible();

  await page.getByRole("link", { name: "Carlos Martinez", exact: true }).click();
  await expect.poll(() => page.evaluate(() => scrollY)).toBeLessThan(5);

  if (!isMobile) {
    await skills.click();
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(500);
  }
});

test.describe("menu button", () => {
  test("opens the section links, closes with Esc, and closes after picking one", async ({ page, isMobile }) => {
    await page.goto("/");
    const menu = page.getByRole("button", { name: "Menu" });
    const skills = page.getByRole("link", { name: "skills", exact: true });
    if (!isMobile) {
      await expect(menu).toBeHidden();
      return;
    }

    await menu.click();
    await expect(menu).toHaveAttribute("aria-expanded", "true");
    await expect(skills).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(skills).toBeHidden();
    await expect(menu).toBeFocused();

    await menu.click();
    await skills.click();
    await expect(menu).toHaveAttribute("aria-expanded", "false");
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(500);
    const navBox = (await page.getByRole("navigation", { name: "Main" }).boundingBox())!;
    const headingBox = (await page.locator("section#skills h2").boundingBox())!;
    expect(headingBox.y).toBeGreaterThan(navBox.y + navBox.height);
  });
});

test("every card opens its project page", async ({ page }) => {
  for (const { slug, name } of PROJECTS) {
    await page.goto("/projects");
    await page.getByRole("article").filter({ hasText: name }).getByRole("link", { name }).click();
    await expect(page).toHaveURL(`/projects/${slug}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);
  }
});

test("no broken internal links", async ({ page, request }) => {
  const toVisit = ["/"];
  const checked = new Set<string>();

  while (toVisit.length) {
    const path = toVisit.shift()!;
    await page.goto(path);
    const hrefs = await page
      .locator('a[href^="/"]')
      .evaluateAll((links) => links.map((a) => a.getAttribute("href")!.split("#")[0] || "/"));
    for (const href of hrefs) {
      if (checked.has(href)) continue;
      checked.add(href);
      const response = await request.get(href);
      expect(response.status(), `${href} (linked from ${path})`).toBe(200);
      if (response.headers()["content-type"]?.includes("text/html")) toVisit.push(href);
    }
  }
  expect(checked.size).toBeGreaterThanOrEqual(9);
});

test.describe("copy button", () => {
  test.use({ permissions: ["clipboard-read", "clipboard-write"] });

  test("copies the email address", async ({ page }) => {
    await page.goto("/#contact");
    const button = page.getByRole("button", { name: "Copy email address" });
    await button.click();
    await expect(button).toHaveText("Copied!");
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("carlosdmartinez.dev@gmail.com");
    await expect(button).toHaveText("Copy", { timeout: 3000 });
  });
});

test("lightbox opens, closes with Esc and returns focus", async ({ page }) => {
  await page.goto("/projects/statly");
  // The Lightbox loads after hydration; until then the link opens the image itself.
  await expect(page.locator("dialog")).toBeAttached();
  const trigger = page.getByRole("link", { name: /Stats page with focus totals/ });
  await trigger.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("Konami code shows the achievement toast", async ({ page, isMobile }) => {
  test.skip(isMobile, "needs a keyboard");
  await page.goto("/");
  await expect(page.getByRole("status")).toBeAttached();
  for (const key of [
    "ArrowUp",
    "ArrowUp",
    "ArrowDown",
    "ArrowDown",
    "ArrowLeft",
    "ArrowRight",
    "ArrowLeft",
    "ArrowRight",
    "b",
    "a",
  ]) {
    await page.keyboard.press(key);
  }
  await expect(page.getByRole("status")).toHaveText("Achievement unlocked: Secret found");
});
