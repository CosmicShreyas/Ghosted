import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    tanstackStart({ server: { entry: "server" } }),
    nitro({ preset: "vercel" }),
    react(),
    tailwindcss(),
  ],
  resolve: { tsconfigPaths: true },
  server: {
    port: 8080,
    warmup: {
      clientFiles: ["./src/routes/*.tsx", "./src/components/**/*.tsx", "./src/lib/*.ts"],
    },
  },
});
