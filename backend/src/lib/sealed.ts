// Personal details (full name, role, experience, city, LinkedIn) are stored as ONE sealed value:
// JSON → Brotli-packed (compression.ts) → AES-256-GCM encrypted. Five columns become one short blob,
// and a database leak exposes no names. Layout: 1 version byte | 12-byte IV | 16-byte tag | ciphertext.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "../env.js";
import { pack, unpack } from "./compression.js";

export type Details = { name?: string | null; role?: string | null; experience?: string | null; city?: string | null; linkedin?: string | null };

const VERSION = 1;
const key = () => Buffer.from(env().PII_ENCRYPTION_KEY, "hex");

export function seal(details: Details): Buffer {
  const compact = Object.fromEntries(Object.entries(details).filter(([, v]) => v != null && v !== ""));
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([cipher.update(pack(JSON.stringify(compact))), cipher.final()]);
  return Buffer.concat([Buffer.of(VERSION), iv, cipher.getAuthTag(), body]);
}

export function unseal(data: Buffer | null): Details {
  if (!data || data.length < 29) return {};
  if (data[0] !== VERSION) throw new Error(`Unknown sealed version ${data[0]}`);
  const decipher = createDecipheriv("aes-256-gcm", key(), data.subarray(1, 13));
  decipher.setAuthTag(data.subarray(13, 29));
  const plain = Buffer.concat([decipher.update(data.subarray(29)), decipher.final()]);
  return JSON.parse(unpack(plain)) as Details;
}

// PostgREST bytea helpers ("\x<hex>").
export const sealToBytea = (d: Details) => `\\x${seal(d).toString("hex")}`;
export const unsealBytea = (v: string | null) => unseal(v ? Buffer.from(v.startsWith("\\x") ? v.slice(2) : v, "hex") : null);

// Same encryption for any JSON value (authenticator secrets, recovery-code hashes).
function sealAny(value: unknown): Buffer {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([cipher.update(pack(JSON.stringify(value))), cipher.final()]);
  return Buffer.concat([Buffer.of(VERSION), iv, cipher.getAuthTag(), body]);
}

function openAny<T>(data: Buffer): T | null {
  if (data.length < 29 || data[0] !== VERSION) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key(), data.subarray(1, 13));
    decipher.setAuthTag(data.subarray(13, 29));
    return JSON.parse(unpack(Buffer.concat([decipher.update(data.subarray(29)), decipher.final()]))) as T;
  } catch { return null; }
}

export const sealJson = (value: unknown) => `\\x${sealAny(value).toString("hex")}`;
export const unsealJson = <T>(v: string | null): T | null => (v ? openAny<T>(Buffer.from(v.startsWith("\\x") ? v.slice(2) : v, "hex")) : null);
