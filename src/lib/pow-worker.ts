// Web Worker for Ghosted Shield: solves a slice of the proof-of-work off the main thread, so the page
// never freezes (important on phones). A small pool is kept warm and reused; each job carries an id
// so a late answer from an older puzzle is never mistaken for the current one.
import { hexToWords, searchRange } from "./sha256";

type Job = { id: number; salt: string; challenge: string; start: number; end: number };

self.onmessage = (e: MessageEvent<Job>) => {
  const { id, salt, challenge, start, end } = e.data;
  const found = searchRange(salt, hexToWords(challenge), start, end);
  (self as unknown as Worker).postMessage({ id, found });
};
