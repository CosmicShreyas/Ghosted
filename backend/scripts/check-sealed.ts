// Diagnostic: shows whether each profile has sealed personal details stored, without revealing them.
// Prints only the public id, whether details_z is present, its length, and which fields it holds.
// Run: npx tsx --env-file=.env scripts/check-sealed.ts
import { admin } from "../src/supabase.js";
import { unsealBytea } from "../src/lib/sealed.js";

const { data, error } = await admin().from("profiles").select("public_id, details_z, show_real, shared_fields").limit(20);
if (error) { console.error(error.message); process.exit(1); }
for (const p of data ?? []) {
  const raw = p.details_z as string | null;
  const fields = raw ? Object.entries(unsealBytea(raw)).filter(([, v]) => v).map(([k]) => k) : [];
  console.log(`${p.public_id}  details_z: ${raw ? `present (${raw.length} chars, starts ${raw.slice(0, 4)}…)` : "EMPTY"}  fields: [${fields.join(", ")}]  public: ${p.show_real}  shown: [${(p.shared_fields as string[]).join(", ")}]`);
}
