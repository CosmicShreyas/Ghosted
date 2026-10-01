// Creates (or resets the password of) an admin account for the admin panel.
// Run on your own machine:   npm run admin:create
// It asks for the email, a name and a password (typed invisibly), hashes it with scrypt and saves
// only the hash. The very first admin becomes the owner; later ones are moderators unless you say so.
import { createInterface } from "node:readline";
import { Writable } from "node:stream";
import { hashPassword } from "../src/admin-auth.js";
import { admin } from "../src/supabase.js";

let muted = false;
const out = new Writable({ write(chunk, enc, cb) { if (!muted) process.stdout.write(chunk, enc as BufferEncoding); cb(); } });
const rl = createInterface({ input: process.stdin, output: out, terminal: true });
const ask = (q: string, hidden = false) => new Promise<string>((resolve) => {
  process.stdout.write(q);
  muted = hidden;
  rl.question("", (a) => { muted = false; if (hidden) process.stdout.write("\n"); resolve(a.trim()); });
});

const email = (await ask("Admin email: ")).toLowerCase();
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { console.error("That doesn't look like an email."); process.exit(1); }
const name = (await ask("Name shown in the audit log: ")) || email.split("@")[0]!;
const password = await ask("Password (at least 14 characters, hidden): ", true);
if (password.length < 14) { console.error("Use at least 14 characters. A passphrase of four or five words works well."); process.exit(1); }
const again = await ask("Same password again: ", true);
if (again !== password) { console.error("The passwords don't match."); process.exit(1); }

const { count } = await admin().from("admin_users").select("id", { count: "exact", head: true });
const role = (count ?? 0) === 0 ? "owner" : (await ask("Role (owner/moderator) [moderator]: ")) === "owner" ? "owner" : "moderator";
const { error } = await admin().from("admin_users").upsert({ email, name, role, password_hash: await hashPassword(password), active: true, failed_attempts: 0, locked_until: null }, { onConflict: "email" });
rl.close();
if (error) { console.error(`Couldn't save it (did you run supabase/init_database.sql?): ${error.message}`); process.exit(1); }
// Existing sessions for this account end, so a password reset logs out everywhere.
const { data: u } = await admin().from("admin_users").select("id").eq("email", email).single();
await admin().from("admin_sessions").update({ revoked_at: new Date().toISOString() }).eq("admin_id", (u as { id: string }).id).is("revoked_at", null);
console.log(`\nDone. ${name} <${email}> can sign in to the admin panel as ${role}.`);
process.exit(0);
