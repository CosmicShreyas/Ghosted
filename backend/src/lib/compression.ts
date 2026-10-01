// Text compression for stored user content (story bodies, comments).
// Benchmarked in scripts/bench-compression.ts: Brotli q11 in text mode beat gzip, deflate and zstd
// (with and without a custom dictionary) on Ghosted-style text, thanks to its built-in English dictionary.
//
// Format: 1 codec byte + payload. Codec 0 = raw UTF-8 (used when compression wouldn't save space),
// codec 1 = Brotli. New codecs get new bytes, and old ones stay decodable forever.
import zlib from "node:zlib";

const RAW = 0;
const BROTLI = 1;
const { BROTLI_PARAM_QUALITY, BROTLI_PARAM_MODE, BROTLI_MODE_TEXT, BROTLI_PARAM_SIZE_HINT } = zlib.constants;

export function pack(text: string): Buffer {
  const raw = Buffer.from(text, "utf8");
  const compressed = zlib.brotliCompressSync(raw, { params: { [BROTLI_PARAM_QUALITY]: 11, [BROTLI_PARAM_MODE]: BROTLI_MODE_TEXT, [BROTLI_PARAM_SIZE_HINT]: raw.length } });
  return compressed.length < raw.length ? Buffer.concat([Buffer.of(BROTLI), compressed]) : Buffer.concat([Buffer.of(RAW), raw]);
}

export function unpack(data: Buffer): string {
  const codec = data[0];
  const payload = data.subarray(1);
  if (codec === RAW) return payload.toString("utf8");
  // Output is capped so a corrupted or malicious value can't expand into a memory bomb.
  if (codec === BROTLI) return zlib.brotliDecompressSync(payload, { maxOutputLength: 64 * 1024 }).toString("utf8");
  throw new Error(`Unknown compression codec ${codec}`);
}

// PostgREST sends and returns bytea as a "\x<hex>" string.
export const toBytea = (text: string) => `\\x${pack(text).toString("hex")}`;
export const fromBytea = (value: string) => unpack(Buffer.from(value.startsWith("\\x") ? value.slice(2) : value, "hex"));
