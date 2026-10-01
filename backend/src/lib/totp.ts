// Authenticator-app codes (TOTP, RFC 6238): HMAC-SHA1, 30-second steps, 6 digits. This is the exact
// algorithm Google Authenticator, Authy, 1Password etc. implement, so any of them works.
import { createHmac, randomBytes, randomInt, createHash, timingSafeEqual } from "node:crypto";

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const STEP = 30;

export function newSecret() {
  const bytes = randomBytes(20); // 160-bit secret, the RFC's recommended size
  let bits = "", out = "";
  for (const b of bytes) bits += b.toString(2).padStart(8, "0");
  for (let i = 0; i + 5 <= bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5), 2)];
  return out;
}

function decode(secret: string) {
  let bits = "";
  for (const ch of secret.replace(/=+$/, "").toUpperCase()) { const v = B32.indexOf(ch); if (v < 0) throw new Error("bad base32"); bits += v.toString(2).padStart(5, "0"); }
  const out = Buffer.alloc(Math.floor(bits.length / 8));
  for (let i = 0; i < out.length; i++) out[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2);
  return out;
}

function codeAt(secret: string, step: number) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(step));
  const h = createHmac("sha1", decode(secret)).update(msg).digest();
  const o = h[h.length - 1]! & 0x0f;
  const n = ((h[o]! & 0x7f) << 24) | (h[o + 1]! << 16) | (h[o + 2]! << 8) | h[o + 3]!;
  return String(n % 1_000_000).padStart(6, "0");
}

// Accepts the current step and one either side (clock drift). Returns the matched step, or null.
// Steps at or before `lastStep` are refused, so a code can't be replayed.
export function verifyTotp(secret: string, code: string, lastStep: number | null) {
  if (!/^\d{6}$/.test(code)) return null;
  const now = Math.floor(Date.now() / 1000 / STEP);
  for (const step of [now - 1, now, now + 1]) {
    if (lastStep !== null && step <= lastStep) continue;
    const expected = codeAt(secret, step);
    if (timingSafeEqual(Buffer.from(expected), Buffer.from(code))) return step;
  }
  return null;
}

export const otpauthUri = (secret: string, account: string) =>
  `otpauth://totp/${encodeURIComponent(`Ghosted:${account}`)}?secret=${secret}&issuer=Ghosted&algorithm=SHA1&digits=6&period=${STEP}`;

// Recovery codes: 8 one-time codes like "k7f2-9qxm". Only their hashes are stored.
export function newRecoveryCodes() {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const part = () => Array.from({ length: 4 }, () => alphabet[randomInt(alphabet.length)]).join("");
  return Array.from({ length: 8 }, () => `${part()}-${part()}`);
}
export const hashRecovery = (code: string) => createHash("sha256").update(`ghosted-recovery:${code.trim().toLowerCase()}`).digest("hex");
