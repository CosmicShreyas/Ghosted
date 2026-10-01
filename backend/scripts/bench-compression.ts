// Compression benchmark on Ghosted-style text. Run: npx tsx scripts/bench-compression.ts
// The test messages below are deliberately NOT part of the dictionary, so results aren't inflated.
import zlib from "node:zlib";
import { DICTIONARY_V1 } from "./dictionary.js";

const chats = [
  "hey did they ever reply to you?", "nope, 3 weeks now. total silence", "same with me at that fintech in Pune",
  "they asked my current CTC in the first call itself", "did you get the offer letter in writing?",
  "yes but joining date keeps getting pushed", "that's a red flag honestly", "HR said the role is on hold now",
  "I had 5 rounds and then they said the budget got cut", "lol classic", "which company?", "can't say here, DM",
  "the take-home took me the whole weekend", "did they at least give feedback", "no feedback, just an automated email",
  "my notice period is 90 days and they want me in 15", "ask them to buy out the notice", "they refused",
  "got 18 LPA offer after they posted 24-30", "negotiate, show them the job post", "thanks will try",
  "recruiter rescheduled me 3 times today", "the panel didn't even read my resume", "I'm so tired of this",
  "you'll find something better, hang in there", "anyone interviewed at a startup in Gurugram recently?",
  "offer revoked after BGV, they said a mismatch in dates", "wow that's brutal", "post it on ghosted",
  "the manager was really nice actually, clear process", "decision in 3 days, first time ever", "congrats!!",
  "they want 2 years bond now", "run", "is 40% hike normal for switching?", "depends, 30-40% is common",
  "ok update: they finally replied, rejected", "at least you got closure", "true, better than waiting",
  "morning all, day 21 of waiting",
];

const comments = [
  "This exact thing happened to me last year. They made me do a full system design round and then went silent for two months.",
  "Thanks for sharing. I have an interview there next week, now I know to ask for the salary band upfront.",
  "Honestly the worst part is the assignment. Nobody should have to build a full app for free just to get a call back.",
  "Same company, different team, same story. The recruiter told me they'd confirm by Friday and never did.",
  "Good to see a positive one for once. Clear timelines and they actually respected my notice period.",
];

const stories = [
  "I applied for a backend role through a referral. The first call was fine, the recruiter asked about my notice period and expected CTC. Then came a two hour coding round and a system design round the same week. The hiring manager said they were very happy and that the offer would come by Monday. Monday passed, then another week. I followed up three times. Finally HR replied that the position had been put on hold due to budget reasons. Nobody told me in between, and I had already declined another offer because they asked me to.",
  "Very smooth process. Two rounds over one week, both interviewers joined on time and had read my resume. The salary they offered was inside the range they shared on the first call, and when I asked about the variable pay they explained it clearly. I got the offer letter within three days of the final round.",
];

type Codec = { name: string; enc: (b: Buffer) => Buffer };
const Z = zlib.constants;
const zstdParams = (level: number, lean: boolean) => ({
  [Z.ZSTD_c_compressionLevel]: level,
  ...(lean ? { [Z.ZSTD_c_checksumFlag]: 0, [Z.ZSTD_c_contentSizeFlag]: 0, [Z.ZSTD_c_dictIDFlag]: 0 } : {}),
});
const dict = Buffer.from(DICTIONARY_V1);

const codecs: Codec[] = [
  { name: "none (UTF-8)", enc: (b) => b },
  { name: "gzip -9", enc: (b) => zlib.gzipSync(b, { level: 9 }) },
  { name: "deflate raw -9", enc: (b) => zlib.deflateRawSync(b, { level: 9 }) },
  { name: "brotli q11 (built-in dict)", enc: (b) => zlib.brotliCompressSync(b, { params: { [Z.BROTLI_PARAM_QUALITY]: 11, [Z.BROTLI_PARAM_MODE]: Z.BROTLI_MODE_TEXT, [Z.BROTLI_PARAM_SIZE_HINT]: b.length } }) },
  { name: "zstd -19", enc: (b) => zlib.zstdCompressSync(b, { params: zstdParams(19, false) }) },
  { name: "zstd -19 + Ghosted dict", enc: (b) => zlib.zstdCompressSync(b, { params: zstdParams(19, false), dictionary: dict } as zlib.ZstdOptions) },
  { name: "zstd -19 + dict, lean frame", enc: (b) => zlib.zstdCompressSync(b, { params: zstdParams(19, true), dictionary: dict } as zlib.ZstdOptions) },
];

function bench(label: string, texts: string[]) {
  const raw = texts.reduce((n, t) => n + Buffer.byteLength(t), 0);
  console.log(`\n${label}: ${texts.length} items, avg ${(raw / texts.length).toFixed(0)} bytes raw`);
  for (const c of codecs) {
    // Real storage can't go below raw, so a codec that expands a value falls back to storing it raw.
    const total = texts.reduce((n, t) => { const b = Buffer.from(t); return n + Math.min(b.length, c.enc(b).length); }, 0);
    console.log(`  ${c.name.padEnd(30)} avg ${(total / texts.length).toFixed(1).padStart(6)} B   ratio ${(raw / total).toFixed(2)}x`);
  }
}

bench("Chat messages (compressed one by one)", chats);
bench("Comments", comments);
bench("Story bodies", stories);

// Batching: compress many messages from one conversation together.
const lean = (b: Buffer) => zlib.zstdCompressSync(b, { params: zstdParams(19, true), dictionary: dict } as zlib.ZstdOptions);
const batch = Buffer.from(JSON.stringify(chats));
const br = (b: Buffer) => zlib.brotliCompressSync(b, { params: { [Z.BROTLI_PARAM_QUALITY]: 11, [Z.BROTLI_PARAM_MODE]: Z.BROTLI_MODE_TEXT } });
const joined = Buffer.from(chats.join("\n"));
console.log(`\nChat messages, batched ${chats.length} per block:`);
console.log(`  zstd -19 + dict, JSON array   avg ${(lean(batch).length / chats.length).toFixed(1)} B per message`);
console.log(`  zstd -19 + dict, newline      avg ${(lean(joined).length / chats.length).toFixed(1)} B per message`);
console.log(`  brotli q11, newline           avg ${(br(joined).length / chats.length).toFixed(1)} B per message`);
