// Smoke tests: the three things that must always work. Sample data only (see playwright.config.ts).
import { expect, test, type Page } from "@playwright/test";

// A cookie choice already made (so the banner isn't in the way), like a returning visitor.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("ghosted.consent", JSON.stringify({ v: 1, choice: "necessary", at: new Date().toISOString() })));
});

// The page is interactive once the app marks <html data-hydrated>; typing before that is lost.
async function open(page: Page, path: string) {
  await page.goto(path);
  await page.locator("html[data-hydrated]").waitFor({ state: "attached", timeout: 30_000 });
}

test("the home page loads", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await open(page, "/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Know what happened");
  await expect(page.getByPlaceholder(/Search a company/i).first()).toBeVisible();
  expect(errors, `page errors: ${errors.join(" | ")}`).toEqual([]);
});

test("company search finds a company and opens its page", async ({ page }) => {
  await open(page, "/");
  await page.getByPlaceholder(/Search a company/i).first().fill("Nimbus");
  const result = page.getByRole("button", { name: /Nimbus Labs/ }).first();
  await expect(result).toBeVisible();
  await result.click();
  await expect(page).toHaveURL(/\/c\/nimbus/);
  await expect(page.getByText("Nimbus Labs").first()).toBeVisible();
});

test("the story form opens from the dashboard", async ({ page }) => {
  await open(page, "/dashboard");
  await page.getByRole("button", { name: "Share a story" }).first().click();
  const dialog = page.getByRole("dialog", { name: /What happened/ });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("How did it end?")).toBeVisible();
  await expect(dialog.getByRole("button", { name: /Ghosted/ }).first()).toBeVisible();
});
