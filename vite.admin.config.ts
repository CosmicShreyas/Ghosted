// The admin panel: a separate single-page app in admin/, built on its own (npm run admin:build →
// dist-admin/) and deployed as its own Vercel project. It reuses the site's styles and components
// through the @ alias, but nothing in admin/ is ever bundled into the public site.
import { fileURLToPath } from "node:url";
import { readFile, writeFile } from "node:fs/promises";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const src = fileURLToPath(new URL("./src", import.meta.url));
const adminRobotsPath = fileURLToPath(new URL("./admin/robots.txt", import.meta.url));
const adminRobotsOutput = fileURLToPath(new URL("./dist-admin/robots.txt", import.meta.url));
const adminRobots = await readFile(adminRobotsPath, "utf8");

const adminRobotsPlugin: Plugin = {
  name: "ghosted-admin-robots",
  configureServer(server) {
    server.middlewares.use("/robots.txt", (_request, response) => {
      response.setHeader("Content-Type", "text/plain; charset=utf-8");
      response.end(adminRobots);
    });
  },
  configurePreviewServer(server) {
    server.middlewares.use("/robots.txt", (_request, response) => {
      response.setHeader("Content-Type", "text/plain; charset=utf-8");
      response.end(adminRobots);
    });
  },
  async closeBundle() {
    // The admin reuses the site's public icons, whose robots.txt is intentionally permissive.
    // Replace only the admin build's copy so the private panel is never crawled.
    await writeFile(adminRobotsOutput, adminRobots, "utf8");
  },
};

const adminDevelopmentCspPlugin: Plugin = {
  name: "ghosted-admin-development-csp",
  transformIndexHtml: {
    order: "pre",
    handler(html, context) {
      if (!context.server) return html;

      return html
        .replace("img-src 'self' data: https:;", "img-src 'self' data: https: http:;")
        .replace("connect-src 'self' https:;", "connect-src 'self' https: http:;");
    },
  },
};

export default defineConfig({
  root: fileURLToPath(new URL("./admin", import.meta.url)),
  envDir: fileURLToPath(new URL(".", import.meta.url)), // VITE_API_URL from the repo's .env
  publicDir: fileURLToPath(new URL("./public", import.meta.url)), // the site's icons
  plugins: [adminRobotsPlugin, adminDevelopmentCspPlugin, react(), tailwindcss()],
  resolve: { alias: { "@": src } },
  server: { port: 5300, strictPort: true },
  preview: { port: 5300 },
  build: { outDir: fileURLToPath(new URL("./dist-admin", import.meta.url)), emptyOutDir: true },
});
