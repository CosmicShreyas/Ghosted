// Standard SHA-256 (FIPS 180-4), specialised for the human check's short inputs (salt + a number,
// always under 56 bytes, so exactly one 64-byte block). No allocation per hash, and results are
// compared as eight 32-bit words instead of hex strings: many times faster than calling
// crypto.subtle.digest once per guess, which is what made the check slow on phones.

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);
const H0 = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];

const W = new Uint32Array(64);
const block = new Uint8Array(64);

// Hashes `len` bytes of `msg` (len <= 55) into `out` (8 words).
export function sha256Short(msg: Uint8Array, len: number, out: Uint32Array) {
  block.fill(0);
  block.set(msg.subarray(0, len));
  block[len] = 0x80;
  const bits = len * 8;
  block[62] = (bits >>> 8) & 0xff;
  block[63] = bits & 0xff;
  for (let i = 0; i < 16; i++) W[i] = (block[i * 4]! << 24) | (block[i * 4 + 1]! << 16) | (block[i * 4 + 2]! << 8) | block[i * 4 + 3]!;
  for (let i = 16; i < 64; i++) {
    const w15 = W[i - 15]!, w2 = W[i - 2]!;
    const s0 = ((w15 >>> 7) | (w15 << 25)) ^ ((w15 >>> 18) | (w15 << 14)) ^ (w15 >>> 3);
    const s1 = ((w2 >>> 17) | (w2 << 15)) ^ ((w2 >>> 19) | (w2 << 13)) ^ (w2 >>> 10);
    W[i] = (W[i - 16]! + s0 + W[i - 7]! + s1) | 0;
  }
  let a = H0[0]!, b = H0[1]!, c = H0[2]!, d = H0[3]!, e = H0[4]!, f = H0[5]!, g = H0[6]!, h = H0[7]!;
  for (let i = 0; i < 64; i++) {
    const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
    const t1 = (h + S1 + ((e & f) ^ (~e & g)) + K[i]! + W[i]!) | 0;
    const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
    const t2 = (S0 + ((a & b) ^ (a & c) ^ (b & c))) | 0;
    h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
  }
  out[0] = (H0[0]! + a) | 0; out[1] = (H0[1]! + b) | 0; out[2] = (H0[2]! + c) | 0; out[3] = (H0[3]! + d) | 0;
  out[4] = (H0[4]! + e) | 0; out[5] = (H0[5]! + f) | 0; out[6] = (H0[6]! + g) | 0; out[7] = (H0[7]! + h) | 0;
}

export const hexToWords = (hex: string) => {
  const w = new Uint32Array(8);
  for (let i = 0; i < 8; i++) w[i] = parseInt(hex.slice(i * 8, i * 8 + 8), 16) | 0;
  return w;
};

// Searches numbers in [start, end) for the one whose SHA-256(salt + number) equals `target`.
// Checks `onTick` every 20k tries so a caller can stop early. Returns the number, or null.
export function searchRange(salt: string, target: Uint32Array, start: number, end: number, onTick?: () => boolean) {
  const enc = new TextEncoder();
  const saltBytes = enc.encode(salt);
  const msg = new Uint8Array(64);
  msg.set(saltBytes);
  const out = new Uint32Array(8);
  for (let n = start; n < end; n++) {
    // Write the decimal digits of n after the salt.
    let len = saltBytes.length, v = n, digits = 1;
    for (let t = v; t >= 10; t = Math.floor(t / 10)) digits++;
    for (let i = digits - 1; i >= 0; i--) { msg[len + i] = 48 + (v % 10); v = Math.floor(v / 10); }
    len += digits;
    sha256Short(msg, len, out);
    if (out[0] === target[0] && out[1] === target[1] && out[2] === target[2] && out[3] === target[3] && out[4] === target[4] && out[5] === target[5] && out[6] === target[6] && out[7] === target[7]) return n;
    if (onTick && (n - start) % 20000 === 0 && onTick()) return null;
  }
  return null;
}
