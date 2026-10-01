// The admin panel: a separate single-page app in admin/, built on its own (npm run admin:build →
// dist-admin/) and deployed as its own Vercel project. It reuses the site's styles and components
// through the @ alias, but nothing in admin/ is ever bundled into the public site.
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const src = fileURLToPath(new URL("./src", import.meta.url));

export default defineConfig({
  root: fileURLToPath(new URL("./admin", import.meta.url)),
  envDir: fileURLToPath(new URL(".", import.meta.url)), // VITE_API_URL from the repo's .env
  publicDir: fileURLToPath(new URL("./public", import.meta.url)), // the site's icons
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": src } },
  server: { port: 5300, strictPort: true },
  preview: { port: 5300 },
  build: { outDir: fileURLToPath(new URL("./dist-admin", import.meta.url)), emptyOutDir: true },
});
