// Calls the real /v1/og routes in-process (needs backend/.env for the database) and checks each
// returns a PNG. Run: cd backend && npx tsx --env-file=.env scripts/og-route-check.ts
import { app } from "../src/app.js";
let failed = 0;
for (const path of ["/v1/og/site.png", "/v1/og/c/accenture.png", "/v1/og/s/383523823634090.png", "/v1/og/s/000000000000000.png"]) {
  const res = await app.request(path);
  const buf = Buffer.from(await res.arrayBuffer());
  const png = buf.subarray(1, 4).toString() === "PNG";
  console.log(`${png ? "pass" : "FAIL"}  ${path}  ${res.status} ${res.headers.get("content-type")} ${buf.length} bytes`);
  if (!png) failed++;
}
process.exit(failed ? 1 : 0);
