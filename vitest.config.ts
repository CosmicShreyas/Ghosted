// Unit tests (Vitest) for the site and the API's pure logic. No database, no network, no browser.
// Run: npm test. The Playwright smoke tests live in e2e/ and run separately.
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
  },
});
