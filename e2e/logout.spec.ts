// Logging out lands on the sign-in page without ever flashing the crash screen. Sample data only.
import { expect, test } from "@playwright/test";

test("logging out goes straight to sign-in, with no error screen", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => localStorage.setItem("ghosted.consent", JSON.stringify({ v: 1, choice: "necessary", at: new Date().toISOString() })));
  await page.goto("/dashboard");
  await page.locator("html[data-hydrated]").waitFor({ state: "attached", timeout: 30_000 });
  await page.getByRole("button", { name: "Account menu" }).click();
  // Desktop: a dropdown menu item. Phones: a row in the bottom sheet.
  await page.getByRole("menuitem", { name: /Log out/i }).or(page.getByRole("button", { name: /^Log out$/i })).first().click();
  await page.getByRole("alertdialog").or(page.getByRole("dialog")).getByRole("button", { name: /^Log out$/i }).last().click();
  // Watch the whole way: the crash screen must never appear.
  const crashed = await page.getByText("This page didn't load").waitFor({ timeout: 2500 }).then(() => true, () => false);
  expect(crashed).toBe(false);
  await expect(page).toHaveURL(/\/auth/);
  expect(errors).toEqual([]);
});
