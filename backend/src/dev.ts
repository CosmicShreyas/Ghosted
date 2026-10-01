// Local dev server: `npm run dev` (reads backend/.env).
import { serve } from "@hono/node-server";
import { app } from "./app.js";

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port }, () => console.log(`Ghosted API on http://localhost:${port}`));
