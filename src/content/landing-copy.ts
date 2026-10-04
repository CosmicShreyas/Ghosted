// Landing page copy in every interface language (see src/lib/i18n.ts for the shared strings).
//
// English is built from the existing copy in src/mock/data.ts plus the page's own headings. Each
// other language overrides only what it has translated; anything missing falls back to English,
// item by item (arrays merge by position, so a half-translated list still shows every entry).
// `{days}`, `{usual}` and similar placeholders are filled in by the page.
//
// Every Hindi, Kannada and Hinglish line here is machine translated until a native speaker checks it
// (tracked in src/content/i18n-review.md). The follow-up message the "polite poke" writes stays in
// English on purpose: it's meant to be emailed to recruiters, who mostly write in English.
import { usePrefs, type Lang } from "@/lib/prefs";
import { ghostStages, heroRotatingLines, landingObjection, landingPitch, landingProofs, landingSteps, marqueeItems, recruiterSlaps, whyGhosted } from "@/mock/data";

export type DeepPartial<T> = T extends readonly (infer U)[] ? readonly (DeepPartial<U> | undefined)[] : T extends object ? { [K in keyof T]?: DeepPartial<T[K]> } : T;
// Exact-text types (from `as const` copy) widened to plain strings, so translations fit.
type Widen<T> = T extends string ? string : T extends readonly (infer U)[] ? Widen<U>[] : T extends object ? { -readonly [K in keyof T]: Widen<T[K]> } : T;

const enRaw = {
  rotating: [...heroRotatingLines],
  marquee: [...marqueeItems],
  // Stat labels, keyed by their English text (they come from the live stats).
  stats: {
    "anonymous by default": "anonymous by default",
    "recruiters with admin access": "recruiters with admin access",
    "to join. Free, forever": "to join. Free, forever",
    "story needed to warn someone": "story needed to warn someone",
    "hiring story shared": "hiring story shared",
    "hiring stories shared": "hiring stories shared",
    "company on Ghosted": "company on Ghosted",
    "companies on Ghosted": "companies on Ghosted",
    "of candidates got any reply": "of candidates got any reply",
    "median wait for a reply": "median wait for a reply",
    "companies can pay to change a score": "companies can pay to change a score",
  } as Record<string, string>,
  how: { eyebrow: "No corporate speak", title: "The hiring lore, minus the HR filter.", steps: landingSteps.map(([, title, copy]) => ({ title, copy })) },
  meter: {
    eyebrow: "The Ghost-o-meter", title: "How ghosted are you, exactly?",
    aside: "Slide to how many days it's been since they said “we'll get back to you”. We'll tell you where you stand, and hand you a follow-up to send.",
    step1: "Step 1 · Days since their last reply", day: "day", days: "days", fewer: "One day fewer", more: "One day more",
    status: "Your status", step2: "Step 2 · Odds they reply on their own", fade: "The ghost fades as their interest does.",
    step3: "Step 3 · Send them this follow-up", copied: "Copied. Paste it into your email", copy: "Copy this message",
    stages: ghostStages.map((s) => ({ name: s.name as string, verdict: s.verdict as string, followUp: s.followUp as string })),
  },
  lookup: { title: "See what other candidates went through there", copy: "Look the company up. No account needed." },
  tools: {
    title: "Still on read? We've got you.",
    copy: "Find out if you're being impatient or being ghosted, then send the follow-up you've been drafting in your head for a week.",
    rounds: { application: "Applied", screening: "Recruiter call", technical: "Technical round", final: "Final round", offer: "Offer talks" },
    what: { application: "hearing back on an application", screening: "a reply after a recruiter call", technical: "a reply after a technical round", final: "a decision after a final round", offer: "a reply during offer talks" },
    checkTitle: "Am I overthinking this?", checkCopy: "Tell us where you're stuck and for how long. We'll tell you if it's patience or a ghost.",
    where: "Where did they leave you?", silence: "Days of radio silence", inboxOne: "day of staring at your inbox", inboxMany: "days of staring at your inbox",
    dot: "The dot is roughly how long {what} usually takes. The bar is you.", verdict: "The verdict", todo: "What to do: ",
    v0: { title: "The ink is still wet", copy: "They replied today. Close the tab, drink some water, live your life.", next: "Nothing to do yet." },
    v1: { title: "Calm down, it's normal", copy: "Replies at this round usually take about {usual} days. You're on day {days}. Refreshing your inbox won't make it faster (we checked).", next: "Check back after day {usual}." },
    v2: { title: "Okay, now it's slow", copy: "Day {days}, and the usual is about {usual}. Not a ghost yet, but definitely the sound of footsteps upstairs.", next: "Send one short, polite follow-up. The polite poke can draft it for you." },
    v3: { title: "Boo. You've been ghosted", copy: "Day {days}, more than twice the usual {usual}. At this point their silence is the answer, they're just too shy to say it.", next: "Follow up once for closure, then put that energy into the next application." },
    pokeTitle: "The polite poke", pokeCopy: "A follow-up that sounds keen, not desperate. Fill in the blanks, pick a mood, copy.",
    company: "Company", companyHint: "e.g. Acme", role: "Role", optional: "(optional)", roleHint: "e.g. Product designer",
    last: "Last thing that happened", ago: "How long ago?", mood: "Mood",
    moods: { warm: "Still hopeful", brief: "Short and sweet", firm: "Done waiting" },
    copyPoke: "Copy the poke", copiedPoke: "Copied. Go get your answer", englishNote: "The message stays in English, since most recruiters write in English.",
  },
  why: {
    ...whyGhosted,
    elsewhereHead: "Posting elsewhere", ghostedHead: "Posting on Ghosted", elsewhere: "Elsewhere", ghosted: "Ghosted", seeCode: "See the code",
  },
  objection: { ...landingObjection, compounds: "What one story does" },
  proofs: {
    eyebrow: "Tiny red flags, huge plot twists", title: "The things they conveniently forget to mention.",
    aside: "The job description said “fast-paced.” It omitted the part where nobody had a map.",
    items: landingProofs.map(([title, expected, reality]) => ({ title, expected, reality })),
  },
  flags: {
    eyebrow: "The Hall of Flags", title: "Receipts, ranked.", aside: "Community scores, not employer-sponsored vibes.",
    emptyTitle: "Put the first company on the board.",
    emptyCopy: "Every company's Flag Score comes from candidates' experiences. Yours takes about 30 seconds, and you could be one of Ghosted's first 50 voices.",
    decent: "Actually decent", snacks: "Proceed with snacks", nobody: "Nobody here yet.",
  },
  invite: {
    title: "Bring a voice, level up together.",
    copy: "Invite someone who's been through a hiring process. When they share their experience, you both reach Invite Level 1 and get a ring on your avatar. Levels 2 and 3 come at 3 and 10 friends. No money, no spam, nobody learns who you are.",
    cta: "How invites work",
  },
  pitch: landingPitch,
  mine: {
    eyebrow: "The interview gauntlet", title: "Can you survive a hiring process?",
    aside: "Every tile is a step in the process. Most are fine. Some are red flags, and a recruiter will hit you with their finest move. Clear the board to reach the offer. Three red flags and you're out, just like real life.",
    gauntlet: ["Applied", "Screening call", "Take-home", "Tech round", "Final round", "Offer"],
    won: "Offer in hand! Pending “final approvals”, obviously.", lost: "Three red flags. They've “moved forward with other candidates”.",
    idle: "Tap any tile to send your application. The first step is always safe.", playing: "Each number counts the red flags hiding next door. A green tick means every neighbour is safe.",
    patience: "Patience left", cleared: "Tiles cleared", log: "Slap log", slapOne: "slap", slapMany: "slaps",
    clean: "Clean record so far. Enjoy it while HR is on leave.", again: "Apply again (you will)", restart: "Start over",
    endWon: "Nice run. Real processes don't come with numbers on the tiles, though.", endLost: "Real candidates have already stepped on these. Check the map before you apply.",
    search: "Search a company", shareRun: "Share your real run",
    slaps: recruiterSlaps.map((s) => ({ title: s.title as string, line: s.line as string })),
  },
  wall: {
    eyebrow: "Fresh from the community", title: "The story wall.", add: "Add yours", loading: "Loading the latest stories…",
    firstTitle: "Be one of the first 50 voices.",
    firstCopy: "The first 50 people to share an experience are the ones who make Ghosted useful for everyone after them. Tap a few answers and you're done.",
    readMore: "Read more",
  },
  privacy: { title1: "Anonymous by default.", title2: "Specific by choice.", copy: "Every detail has its own switch. Show your role, experience or LinkedIn only if you want the spotlight; leave them all off and you're completely anonymous. We prefer the receipts anyway." },
  cta: { title: "Your story might be someone's warning sign.", copy: "About 30 seconds. Anonymous. Helps the next candidate dodge the same plot twist.", share: "Share my experience" },
};

const en = enRaw as unknown as Widen<typeof enRaw>;
export type LandingCopy = typeof en;
type Partial_ = DeepPartial<LandingCopy>;

// ---------- Hindi (machine translated, to verify) ----------
const hi: Partial_ = {
  rotating: ["अप्लाई करने से पहले।", "छठे राउंड से पहले।", "टेक-होम से पहले।", "घोस्ट होने से पहले।", "“हम कॉल करेंगे” से पहले।", "सीन पर छोड़े जाने से पहले।", "ऑफ़र पलटने से पहले।", "सैलरी “वाइब्स” बने उससे पहले।", "HR चुप हो उससे पहले।", "नकली जॉब से पहले।"],
  marquee: ["‘कॉम्पिटिटिव पे’ कोई नंबर नहीं है", "छह राउंड बंधक बनाने जैसा है", "आपका टेक-होम उनका रोडमैप नहीं है", "रिजेक्शन भी एक जवाब है", "अगर अर्जेंट है, तो घोस्ट क्यों कर रहे हो?", "वाइब्स कोई बेनिफ़िट पैकेज नहीं", "पिज़्ज़ा फ़्राइडे कोई रेज़ नहीं है", "“हम एक परिवार हैं”, तो परिवार जैसी सैलरी दो", "10:02 पर देखा। जवाब कभी नहीं।"],
  stats: {
    "anonymous by default": "डिफ़ॉल्ट रूप से गुमनाम", "recruiters with admin access": "रिक्रूटर जिनके पास एडमिन एक्सेस है", "to join. Free, forever": "जुड़ने के लिए। हमेशा मुफ़्त",
    "story needed to warn someone": "कहानी किसी को आगाह करने के लिए काफ़ी", "hiring story shared": "हायरिंग कहानी साझा हुई", "hiring stories shared": "हायरिंग कहानियाँ साझा हुईं",
    "company on Ghosted": "कंपनी Ghosted पर", "companies on Ghosted": "कंपनियाँ Ghosted पर", "of candidates got any reply": "उम्मीदवारों को कोई जवाब मिला",
    "median wait for a reply": "जवाब के लिए औसत इंतज़ार", "companies can pay to change a score": "कंपनियाँ स्कोर बदलवाने के लिए पैसे दे सकती हैं",
  },
  how: { eyebrow: "कोई कॉर्पोरेट भाषा नहीं", title: "हायरिंग की असली कहानी, HR फ़िल्टर के बिना।", steps: [
    { title: "पूरी कहानी बताइए", copy: "टाइमलाइन, सैलरी का पलटना, और वह ‘छोटी सी बात’ जिसने पूरी दोपहर खा ली।" },
    { title: "असलियत को रेट कीजिए", copy: "जवाब, सैलरी, कल्चर, और क्या किसी को आपका नाम याद था, सबको स्कोर दीजिए।" },
    { title: "किसी और को बचाइए", copy: "एक ईमानदार पोस्ट किसी को छह राउंड और एक सरप्राइज़ प्रेज़ेंटेशन से बचा सकती है।" },
  ] },
  meter: {
    eyebrow: "घोस्ट-ओ-मीटर", title: "आप ठीक-ठीक कितने घोस्ट हुए हैं?",
    aside: "स्लाइड करके बताइए कि “हम आपको बताएंगे” कहे हुए कितने दिन हो गए। हम बताएंगे आप कहाँ खड़े हैं, और भेजने के लिए एक फ़ॉलो-अप देंगे।",
    step1: "स्टेप 1 · उनके आख़िरी जवाब से दिन", day: "दिन", days: "दिन", fewer: "एक दिन कम", more: "एक दिन ज़्यादा",
    status: "आपकी स्थिति", step2: "स्टेप 2 · ख़ुद से जवाब देने की संभावना", fade: "जितनी उनकी दिलचस्पी घटती है, घोस्ट उतना धुंधला होता है।",
    step3: "स्टेप 3 · उन्हें यह फ़ॉलो-अप भेजिए", copied: "कॉपी हो गया। अपने ईमेल में पेस्ट करें", copy: "यह मैसेज कॉपी करें",
    stages: [
      { name: "अभी साँस चल रही है", verdict: "शायद बस शेड्यूल कर रहे हैं। शायद।" },
      { name: "हल्का भूतिया", verdict: "रीड रिसीट ऑन। जवाब ऑफ़। क्लासिक।" },
      { name: "पूरी तरह घोस्ट", verdict: "रोल ‘होल्ड’ पर है। उनका ज़मीर भी।" },
      { name: "नकली जॉब वाली फ़ीलिंग", verdict: "लिस्टिंग अब भी लाइव है। हेडकाउंट कभी था ही नहीं।" },
    ],
  },
  lookup: { title: "देखिए वहाँ दूसरे उम्मीदवारों के साथ क्या हुआ", copy: "कंपनी खोजिए। अकाउंट की ज़रूरत नहीं।" },
  tools: {
    title: "अब भी सीन पर? हम हैं ना।", copy: "पता कीजिए कि आप बेसब्र हैं या घोस्ट हो गए हैं, फिर वह फ़ॉलो-अप भेजिए जो हफ़्ते भर से दिमाग़ में लिख रहे हैं।",
    rounds: { application: "अप्लाई किया", screening: "रिक्रूटर कॉल", technical: "टेक्निकल राउंड", final: "फ़ाइनल राउंड", offer: "ऑफ़र की बात" },
    what: { application: "एप्लिकेशन पर जवाब आने", screening: "रिक्रूटर कॉल के बाद जवाब", technical: "टेक्निकल राउंड के बाद जवाब", final: "फ़ाइनल राउंड के बाद फ़ैसले", offer: "ऑफ़र की बात के दौरान जवाब" },
    checkTitle: "क्या मैं ज़्यादा सोच रहा हूँ?", checkCopy: "बताइए आप कहाँ अटके हैं और कब से। हम बताएंगे कि यह सब्र का मामला है या घोस्ट का।",
    where: "उन्होंने आपको कहाँ छोड़ा?", silence: "कितने दिन से सन्नाटा", inboxOne: "दिन से इनबॉक्स ताक रहे हैं", inboxMany: "दिन से इनबॉक्स ताक रहे हैं",
    dot: "डॉट बताता है कि {what} में आमतौर पर कितना समय लगता है। बार आप हैं।", verdict: "फ़ैसला", todo: "क्या करें: ",
    v0: { title: "स्याही अभी गीली है", copy: "उन्होंने आज ही जवाब दिया। टैब बंद कीजिए, पानी पीजिए, ज़िंदगी जीजिए।", next: "अभी कुछ करने की ज़रूरत नहीं।" },
    v1: { title: "शांत रहिए, यह नॉर्मल है", copy: "इस राउंड में जवाब आने में आमतौर पर लगभग {usual} दिन लगते हैं। आज दिन {days} है। इनबॉक्स रिफ़्रेश करने से जल्दी नहीं होगा (हमने देखा है)।", next: "दिन {usual} के बाद फिर देखिए।" },
    v2: { title: "अच्छा, अब देर हो रही है", copy: "दिन {days}, और आमतौर पर लगभग {usual}। अभी घोस्ट नहीं, पर ऊपर से क़दमों की आहट ज़रूर है।", next: "एक छोटा, विनम्र फ़ॉलो-अप भेजिए। पोलाइट पोक उसे लिख देगा।" },
    v3: { title: "भूत! आप घोस्ट हो गए", copy: "दिन {days}, आमतौर के {usual} से दोगुने से भी ज़्यादा। अब उनकी चुप्पी ही जवाब है, बस कहने में शर्मा रहे हैं।", next: "एक बार फ़ॉलो-अप कीजिए, फिर वह ऊर्जा अगली एप्लिकेशन में लगाइए।" },
    pokeTitle: "पोलाइट पोक", pokeCopy: "ऐसा फ़ॉलो-अप जो उत्सुक लगे, बेचैन नहीं। जगहें भरिए, मूड चुनिए, कॉपी कीजिए।",
    company: "कंपनी", companyHint: "जैसे Acme", role: "रोल", optional: "(वैकल्पिक)", roleHint: "जैसे Product designer",
    last: "आख़िरी बार क्या हुआ", ago: "कितने दिन पहले?", mood: "मूड",
    moods: { warm: "अब भी उम्मीद है", brief: "छोटा और सीधा", firm: "बहुत इंतज़ार हो गया" },
    copyPoke: "पोक कॉपी करें", copiedPoke: "कॉपी हो गया। जाइए, जवाब लीजिए", englishNote: "मैसेज अंग्रेज़ी में ही रहता है, क्योंकि ज़्यादातर रिक्रूटर अंग्रेज़ी में लिखते हैं।",
  },
  why: {
    eyebrow: "यहाँ क्यों पोस्ट करें, वहाँ क्यों नहीं", title: "आपकी कहानी किसी फ़ीड से बेहतर जगह की हक़दार है।",
    intro: "आप इसे उस प्रोफ़ेशनल नेटवर्क पर पोस्ट कर सकते हैं जहाँ आपके मैनेजर आपको फ़ॉलो करते हैं। या किसी बड़ी रिव्यू साइट पर जिसका एम्प्लॉयर डैशबोर्ड है। या किसी ग्रुप चैट में जो शुक्रवार तक भूल जाता है। फ़र्क़ यह है।",
    places: [
      { name: "प्रोफ़ेशनल नेटवर्क", quip: "जहाँ आपके बॉस, आपकी टीम और हर भविष्य का रिक्रूटर आपकी पोस्ट पढ़ता है। वहाँ ईमानदारी की क़ीमत है।" },
      { name: "बड़ी रिव्यू साइटें", quip: "जितनी आपके लिए, उतनी ही एम्प्लॉयर्स के लिए बनी हैं। प्रोफ़ाइल, डैशबोर्ड, चमकाए हुए जवाब।" },
      { name: "ग्रुप चैट", quip: "बढ़िया गपशप, शुक्रवार तक ग़ायब। इंटरव्यू से पहले कोई इसे ढूँढ नहीं पाता।" },
    ],
    rows: [
      { topic: "आपकी पहचान", elsewhere: "आमतौर पर आपका असली नाम और फ़ोटो, या ऐसा अकाउंट जो आप तक पहुँच सके।", ghosted: "डिफ़ॉल्ट रूप से गुमनाम। आपका नाम एन्क्रिप्टेड है, और तभी दिखता है जब आप पब्लिक होना चुनें।" },
      { topic: "आपके हाथ में क्या है", elsewhere: "अक्सर सब या कुछ नहीं: पब्लिक, या पोस्ट ही मत करो।", ghosted: "ठीक-ठीक चुनिए कौन सी जानकारी दिखे (नाम, रोल, शहर, LinkedIn), और कभी भी बदलिए।" },
      { topic: "पैसा कौन देता है", elsewhere: "अक्सर एम्प्लॉयर प्रोडक्ट्स से चलती हैं, जो आपके पक्ष में होने जैसा नहीं है।", ghosted: "कंपनियाँ हमें किसी कहानी को छुपाने, बदलने, दबाने या बढ़ाने के लिए पैसे नहीं दे सकतीं। कभी नहीं।" },
      { topic: "क्या आप जाँच सकते हैं?", elsewhere: "बंद कोड। आपको उनकी बात माननी पड़ती है कि आपका डेटा कैसे संभाला जाता है।", ghosted: "ओपन सोर्स। कोई भी पढ़ सकता है कि आपकी पहचान कैसे सुरक्षित रहती है।" },
      { topic: "यह किसलिए बना है", elsewhere: "आम तौर पर वर्कप्लेस के लिए सामान्य स्टार रेटिंग।", ghosted: "ख़ास तौर पर हायरिंग: राउंड, चुप्पी के दिन, पोस्टिंग बनाम सैलरी, रद्द हुए ऑफ़र।" },
      { topic: "कितने दिन टिकती है", elsewhere: "दो दिन में दब जाने वाली पोस्ट, या स्क्रॉल होकर खो जाने वाली चैट।", ghosted: "हर कहानी कंपनी से जुड़ी रहती है, ताकि अगला उम्मीदवार इंटरव्यू से पहले उसे पा सके।" },
      { topic: "क़ीमत", elsewhere: "पढ़ना मुफ़्त, पर सबसे अच्छी चीज़ें पेवॉल या साइन-अप के पीछे।", ghosted: "पढ़ना मुफ़्त, पोस्ट करना मुफ़्त, हमेशा मुफ़्त।" },
    ],
    footnote: "हम उन जगहों के प्रकार बता रहे हैं जहाँ लोग आमतौर पर पोस्ट करते हैं, किसी ख़ास कंपनी के बारे में नहीं। हर प्लेटफ़ॉर्म अलग है, और कुछ इनमें से कई चीज़ें अच्छी करते हैं।",
    elsewhereHead: "कहीं और पोस्ट करना", ghostedHead: "Ghosted पर पोस्ट करना", elsewhere: "कहीं और", ghosted: "Ghosted", seeCode: "कोड देखें",
  },
  objection: {
    eyebrow: "सीधा सवाल", quote: "“बड़ी साइटों पर पहले से करोड़ों लोग हैं। वहाँ पोस्ट क्यों करें जहाँ कोई नहीं है?”", answer: "बढ़िया। यही तो बात है।",
    intro: "करोड़ों यूज़र ही वह वजह हैं जिससे आपकी कहानी वहाँ खो जाती है। Ghosted पर उसे किसी से मुक़ाबला नहीं करना: वह कंपनी से जुड़ी रहती है, और उस एक पाठक का इंतज़ार करती है जिसे उसकी सबसे ज़्यादा ज़रूरत है, वह अगला उम्मीदवार जो उसी प्रोसेस में जाने वाला है।",
    reasons: [
      { title: "एक पाठक काफ़ी है", copy: "आपकी कहानी कोई वायरल होने वाली पोस्ट नहीं है। यह कंपनी के नाम के तहत रखी एक रसीद है, जो इंटरव्यू से पहले उन्हें खोजने वाले को मिलती है। यह एक पाठक के साथ भी काम करती है।", tag: "जुड़ी हुई, दबी हुई नहीं" },
      { title: "पहली रसीद बनिए", copy: "भीड़ भरी साइट पर आप 4,000वें रिव्यू हैं। यहाँ, आपकी कहानी उस कंपनी की हायरिंग के बारे में सबसे पहली चीज़ हो सकती है, और पहले दिन से उसका फ़्लैग स्कोर तय करती है।", tag: "पहली कहानियाँ सबसे ज़्यादा मायने रखती हैं" },
      { title: "किसी और के जुड़ने से पहले भी काम का", copy: "वेटिंग रूम आपकी हर उस एप्लिकेशन को ट्रैक करता है जिसका आप इंतज़ार कर रहे हैं, चुप्पी के दिन गिनता है और बताता है कब फ़ॉलो-अप ठीक है। यह तब भी काम करता है जब यहाँ सिर्फ़ आप हों।", tag: "पहले दिन से फ़ायदा" },
      { title: "वे कुछ और मापते हैं", copy: "बड़ी रिव्यू साइटें कंपनी में काम करने को रेट करती हैं, अंदर आने के बाद। चोट वाला हिस्सा कोई दर्ज नहीं करता: राउंड, बिना जवाब के दिन, पोस्टिंग बनाम सैलरी, रद्द ऑफ़र, कभी न रही नौकरियाँ।", tag: "ख़ास तौर पर हायरिंग" },
      { title: "कोई नुक़सान नहीं, कभी नहीं", copy: "प्रोफ़ेशनल नेटवर्क वह जगह है जहाँ आपके मैनेजर, आपकी टीम और हर भविष्य का रिक्रूटर आपकी पोस्ट पढ़ता है। यहाँ आप डिफ़ॉल्ट रूप से गुमनाम हैं, और आपकी कहानी आप तक नहीं पहुँचती।", tag: "बिना क़ीमत की ईमानदारी" },
      { title: "शुरू से साफ़-सुथरा", copy: "Goofy, हमारा AutoMod, कुछ भी पोस्ट होने से पहले गाली-गलौज हटाता है, लोगों के नाम छुपाता है और आरोपों को जाँचता है, ताकि यहाँ जो पढ़ें उस पर भरोसा कर सकें, शुरुआत में भी।", tag: "पहली पोस्ट से मॉडरेटेड" },
    ],
    timeline: [
      { when: "आज", what: "आप गुमनाम रहकर, लगभग तीन मिनट में बताते हैं कि क्या हुआ।" },
      { when: "अगले हफ़्ते", what: "उस कंपनी को खोजने वाला कोई अपने फ़ाइनल राउंड से पहले इसे पढ़ लेता है।" },
      { when: "अगले महीने", what: "कुछ और कहानियाँ आती हैं, और कंपनी का असली फ़्लैग स्कोर बनता है।" },
      { when: "अगले साल", what: "कोई भी उस प्रोसेस में अंधेरे में नहीं जाता।" },
    ],
    closer: { line: "करोड़ों यूज़र वाले हर प्लेटफ़ॉर्म की शुरुआत पहले हज़ार से हुई थी।", punch: "उन पहले हज़ार में शामिल होइए जो हायरिंग को ईमानदार बनाते हैं।", cta: "पहली रसीद साझा करें" },
    goal: {
      title: "हमारा लक्ष्य: बिना झुंझलाहट की हायरिंग",
      lead: "Ghosted आपको किसी नौकरी से डराने के लिए नहीं है। यह इसलिए है कि आप आँखें खोलकर अप्लाई करें, और लोगों का समय बर्बाद करने वाले प्रोसेस पर आख़िरकार बदलने का दबाव बने।",
      points: [
        { title: "भरोसे से अप्लाई कीजिए", copy: "शुरू करने से पहले राउंड, आमतौर का इंतज़ार और असली सैलरी जानिए, ताकि प्रोसेस में कुछ भी अचानक न लगे।" },
        { title: "ख़राब प्रोसेस का विरोध कीजिए", copy: "अंतहीन राउंड, बिना पैसे के ‘असाइनमेंट’, फ़ाइनल इंटरव्यू के बाद चुप्पी: जब यह सबके सामने लिखा हो, तो इसे जारी रखना मुश्किल हो जाता है।" },
        { title: "अच्छे एम्प्लॉयर्स को क्रेडिट दीजिए", copy: "जो कंपनियाँ जल्दी जवाब देती हैं और उम्मीदवारों से अच्छा बर्ताव करती हैं, वे ऊपर आती हैं। यहाँ ग्रीन फ़्लैग भी उतने ही ज़ोर से दिखते हैं जितने रेड।" },
        { title: "उम्मीदवारों का हौसला बनाए रखिए", copy: "रिजेक्शन या घोस्टिंग प्रोसेस के बारे में ज़्यादा बताता है, आपके बारे में कम। यह देखना कि दूसरों के साथ भी हुआ, अप्लाई करते रहना आसान बनाता है।" },
      ],
    },
    compounds: "एक कहानी क्या करती है",
  },
  proofs: {
    eyebrow: "छोटे रेड फ़्लैग, बड़े ट्विस्ट", title: "वे बातें जो वे बड़ी सुविधा से बताना भूल जाते हैं।", aside: "जॉब डिस्क्रिप्शन में लिखा था “फ़ास्ट-पेस्ड”। यह नहीं लिखा था कि किसी के पास नक़्शा नहीं था।",
    items: [
      { title: "सैलरी रेंज", expected: "पोस्ट किया: ₹18–24 LPA", reality: "ऑफ़र किया: ‘पहले देखते हैं आप कैसा परफ़ॉर्म करते हैं।’" },
      { title: "टेक-होम", expected: "अनुमान: 90 मिनट", reality: "शामिल: स्ट्रैटेजी, डिज़ाइन, कोड, डिप्लॉयमेंट, भावनात्मक नुक़सान।" },
      { title: "फ़ॉलो-अप", expected: "भेजा: मंगलवार", reality: "स्थिति: आध्यात्मिक रूप से डिलीवर।" },
    ],
  },
  flags: {
    eyebrow: "फ़्लैग्स का हॉल", title: "रसीदें, रैंक के साथ।", aside: "कम्युनिटी के स्कोर, एम्प्लॉयर-स्पॉन्सर्ड वाइब्स नहीं।",
    emptyTitle: "बोर्ड पर पहली कंपनी लाइए।", emptyCopy: "हर कंपनी का फ़्लैग स्कोर उम्मीदवारों के अनुभवों से बनता है। आपका अनुभव लगभग 30 सेकंड लेता है, और आप Ghosted की पहली 50 आवाज़ों में हो सकते हैं।",
    decent: "सच में ठीक-ठाक", snacks: "स्नैक्स लेकर जाइए", nobody: "अभी यहाँ कोई नहीं।",
  },
  invite: { title: "एक आवाज़ लाइए, साथ में लेवल बढ़ाइए।", copy: "किसी ऐसे को बुलाइए जो हायरिंग प्रोसेस से गुज़रा हो। जब वे अपना अनुभव साझा करते हैं, तो आप दोनों इनवाइट लेवल 1 पर पहुँचते हैं और अवतार पर एक रिंग मिलती है। लेवल 2 और 3, 3 और 10 दोस्तों पर। कोई पैसा नहीं, कोई स्पैम नहीं, किसी को पता नहीं चलता आप कौन हैं।", cta: "इनवाइट कैसे काम करते हैं" },
  pitch: {
    eyebrow: "हमारी बात", headline: ["हर कोई नौकरी को रेट करता है।", "हायरिंग को कोई नहीं।"],
    manifesto: ["आपने उन्हें छह राउंड दिए।", "पूरे वीकेंड का “दो घंटे का” असाइनमेंट।", "आपका नोटिस पीरियड, आपके रेफ़रेंस, आपकी उम्मीदें।", "उन्होंने आपको चुप्पी दी।", "Ghosted वह जगह है जहाँ उस चुप्पी को आख़िरकार स्कोर मिलता है।"],
    pillars: [
      { title: "रसीदें, रेटिंग नहीं", copy: "एक और फ़ाइव-स्टार वाइब चेक नहीं। राउंड, इंतज़ार के दिन, पोस्टिंग बनाम सैलरी, वापस लिए गए ऑफ़र। वही चीज़ें जो तय करती हैं कि आपको अप्लाई करना चाहिए या नहीं।", statLabel: "चीज़ें जिन्हें हम स्कोर करते हैं, 1 स्टार रेटिंग नहीं" },
      { title: "डिज़ाइन से गुमनाम", copy: "आपका नाम एन्क्रिप्टेड है, आपका हैंडल रैंडम है, और आपकी गुमनाम पोस्ट आप तक नहीं पहुँचतीं। क्रेडिट चाहिए तभी पब्लिक होइए।", statLabel: "नाम दिखते हैं, जब तक आप न चाहें" },
      { title: "कोई बिकाऊ नहीं", copy: "कोई एम्प्लॉयर डैशबोर्ड नहीं। कोई पेड प्रोफ़ाइल पॉलिश नहीं। बजट वाले किसी के लिए “यह रिव्यू हटाओ” बटन नहीं। और कोड खुला है, आप जाँच सकते हैं।", statLabel: "कंपनियाँ स्कोर बदलवाने के लिए दे सकती हैं" },
    ],
    closer: { line: "रिक्रूटर्स के पास ATS सॉफ़्टवेयर, हायरिंग मैनेजर और पूरी HR टीम है।", punch: "उम्मीदवारों के पास आख़िरकार Ghosted है।", cta: "रसीदों के क्लब में शामिल हों" },
  },
  mine: {
    eyebrow: "इंटरव्यू की चुनौती", title: "क्या आप एक हायरिंग प्रोसेस झेल पाएंगे?",
    aside: "हर टाइल प्रोसेस का एक क़दम है। ज़्यादातर ठीक हैं। कुछ रेड फ़्लैग हैं, और रिक्रूटर आप पर अपना सबसे बढ़िया दाँव चलेगा। ऑफ़र तक पहुँचने के लिए बोर्ड साफ़ कीजिए। तीन रेड फ़्लैग और आप बाहर, बिल्कुल असल ज़िंदगी की तरह।",
    gauntlet: ["अप्लाई किया", "स्क्रीनिंग कॉल", "टेक-होम", "टेक राउंड", "फ़ाइनल राउंड", "ऑफ़र"],
    won: "ऑफ़र हाथ में! “फ़ाइनल अप्रूवल” बाक़ी हैं, ज़ाहिर है।", lost: "तीन रेड फ़्लैग। उन्होंने “दूसरे उम्मीदवारों के साथ आगे बढ़ने” का फ़ैसला किया है।",
    idle: "अपनी एप्लिकेशन भेजने के लिए कोई भी टाइल दबाइए। पहला क़दम हमेशा सुरक्षित है।", playing: "हर नंबर बताता है कि बगल में कितने रेड फ़्लैग छुपे हैं। हरा टिक मतलब हर पड़ोसी सुरक्षित है।",
    patience: "बचा हुआ सब्र", cleared: "साफ़ टाइलें", log: "थप्पड़ों का लॉग", slapOne: "थप्पड़", slapMany: "थप्पड़",
    clean: "अब तक साफ़ रिकॉर्ड। जब तक HR छुट्टी पर है, मज़े लीजिए।", again: "फिर से अप्लाई करें (आप करेंगे ही)", restart: "फिर से शुरू करें",
    endWon: "बढ़िया खेला। पर असली प्रोसेस में टाइलों पर नंबर नहीं होते।", endLost: "असली उम्मीदवार इन पर पहले ही पैर रख चुके हैं। अप्लाई करने से पहले नक़्शा देखिए।",
    search: "कंपनी खोजें", shareRun: "अपना असली अनुभव बताएं",
  },
  wall: { eyebrow: "कम्युनिटी से ताज़ा", title: "कहानियों की दीवार।", add: "अपनी जोड़ें", loading: "ताज़ा कहानियाँ लोड हो रही हैं…", firstTitle: "पहली 50 आवाज़ों में शामिल होइए।", firstCopy: "अनुभव साझा करने वाले पहले 50 लोग ही Ghosted को बाद में आने वाले सबके लिए काम का बनाते हैं। कुछ जवाब चुनिए और हो गया।", readMore: "और पढ़ें" },
  privacy: { title1: "डिफ़ॉल्ट रूप से गुमनाम।", title2: "आपकी मर्ज़ी से ख़ास।", copy: "हर जानकारी का अपना स्विच है। अपना रोल, अनुभव या LinkedIn तभी दिखाइए जब आप चाहें; सब बंद रखिए और आप पूरी तरह गुमनाम हैं। हमें वैसे भी रसीदें ज़्यादा पसंद हैं।" },
  cta: { title: "आपकी कहानी किसी के लिए चेतावनी बन सकती है।", copy: "लगभग 30 सेकंड। गुमनाम। अगले उम्मीदवार को वही ट्विस्ट झेलने से बचाती है।", share: "अपना अनुभव बताएं" },
};

// ---------- Kannada (machine translated, to verify) ----------
const kn: Partial_ = {
  rotating: ["ಅರ್ಜಿ ಹಾಕುವ ಮುನ್ನ.", "ಆರನೇ ಸುತ್ತಿನ ಮುನ್ನ.", "ಟೇಕ್-ಹೋಮ್ ಮುನ್ನ.", "ಘೋಸ್ಟ್ ಆಗುವ ಮುನ್ನ.", "“ಕರೆ ಮಾಡ್ತೀವಿ” ಮುನ್ನ.", "ಸೀನ್‌ನಲ್ಲಿ ಬಿಡುವ ಮುನ್ನ.", "ಆಫರ್ ತಿರುಗುವ ಮುನ್ನ.", "ಸಂಬಳ “ವೈಬ್ಸ್” ಆಗುವ ಮುನ್ನ.", "HR ಮೌನವಾಗುವ ಮುನ್ನ.", "ನಕಲಿ ಕೆಲಸದ ಮುನ್ನ."],
  marquee: ["‘ಸ್ಪರ್ಧಾತ್ಮಕ ಸಂಬಳ’ ಒಂದು ಸಂಖ್ಯೆಯಲ್ಲ", "ಆರು ಸುತ್ತು ಒತ್ತೆಯಾಳು ಪರಿಸ್ಥಿತಿ", "ನಿಮ್ಮ ಟೇಕ್-ಹೋಮ್ ಅವರ ರೋಡ್‌ಮ್ಯಾಪ್ ಅಲ್ಲ", "ರಿಜೆಕ್ಷನ್ ಕೂಡ ಒಂದು ಉತ್ತರ", "ತುರ್ತು ಆಗಿದ್ದರೆ, ಘೋಸ್ಟ್ ಏಕೆ?", "ವೈಬ್ಸ್ ಸೌಲಭ್ಯ ಪ್ಯಾಕೇಜ್ ಅಲ್ಲ", "ಪಿಜ್ಜಾ ಫ್ರೈಡೇ ಸಂಬಳ ಏರಿಕೆ ಅಲ್ಲ", "“ನಾವು ಒಂದು ಕುಟುಂಬ”, ಹಾಗಾದರೆ ಕುಟುಂಬದಂತೆ ಸಂಬಳ ಕೊಡಿ", "10:02ಕ್ಕೆ ನೋಡಿದರು. ಉತ್ತರ ಎಂದೂ ಇಲ್ಲ."],
  stats: {
    "anonymous by default": "ಡೀಫಾಲ್ಟ್ ಆಗಿ ಅನಾಮಧೇಯ", "recruiters with admin access": "ಅಡ್ಮಿನ್ ಪ್ರವೇಶವಿರುವ ರಿಕ್ರೂಟರ್‌ಗಳು", "to join. Free, forever": "ಸೇರಲು. ಎಂದೆಂದಿಗೂ ಉಚಿತ",
    "story needed to warn someone": "ಯಾರನ್ನಾದರೂ ಎಚ್ಚರಿಸಲು ಬೇಕಾದ ಕಥೆ", "hiring story shared": "ನೇಮಕಾತಿ ಕಥೆ ಹಂಚಿಕೊಳ್ಳಲಾಗಿದೆ", "hiring stories shared": "ನೇಮಕಾತಿ ಕಥೆಗಳು ಹಂಚಿಕೊಳ್ಳಲಾಗಿದೆ",
    "company on Ghosted": "ಕಂಪನಿ Ghosted ನಲ್ಲಿ", "companies on Ghosted": "ಕಂಪನಿಗಳು Ghosted ನಲ್ಲಿ", "of candidates got any reply": "ಅಭ್ಯರ್ಥಿಗಳಿಗೆ ಯಾವುದಾದರೂ ಉತ್ತರ ಸಿಕ್ಕಿದೆ",
    "median wait for a reply": "ಉತ್ತರಕ್ಕಾಗಿ ಸರಾಸರಿ ಕಾಯುವಿಕೆ", "companies can pay to change a score": "ಸ್ಕೋರ್ ಬದಲಿಸಲು ಕಂಪನಿಗಳು ಪಾವತಿಸಬಹುದು",
  },
  how: { eyebrow: "ಕಾರ್ಪೊರೇಟ್ ಭಾಷೆ ಇಲ್ಲ", title: "ನೇಮಕಾತಿಯ ನಿಜ ಕಥೆ, HR ಫಿಲ್ಟರ್ ಇಲ್ಲದೆ.", steps: [
    { title: "ಪೂರ್ತಿ ಕಥೆ ಹೇಳಿ", copy: "ಟೈಮ್‌ಲೈನ್, ಸಂಬಳದ ತಿರುವು, ಮತ್ತು ಮಧ್ಯಾಹ್ನವನ್ನೇ ತಿಂದ ಆ ‘ಸಣ್ಣ ಮಾತುಕತೆ’." },
    { title: "ನಿಜಸ್ಥಿತಿಗೆ ರೇಟ್ ಮಾಡಿ", copy: "ಉತ್ತರಗಳು, ಸಂಬಳ, ಕಲ್ಚರ್, ಮತ್ತು ಯಾರಿಗಾದರೂ ನಿಮ್ಮ ಹೆಸರು ನೆನಪಿತ್ತೇ ಎಂಬುದಕ್ಕೆ ಸ್ಕೋರ್ ನೀಡಿ." },
    { title: "ಇನ್ನೊಬ್ಬರನ್ನು ಉಳಿಸಿ", copy: "ಒಂದು ಪ್ರಾಮಾಣಿಕ ಪೋಸ್ಟ್ ಯಾರನ್ನಾದರೂ ಆರು ಸುತ್ತು ಮತ್ತು ಅಚ್ಚರಿಯ ಪ್ರೆಸೆಂಟೇಶನ್‌ನಿಂದ ಉಳಿಸಬಹುದು." },
  ] },
  meter: {
    eyebrow: "ಘೋಸ್ಟ್-ಓ-ಮೀಟರ್", title: "ನೀವು ನಿಖರವಾಗಿ ಎಷ್ಟು ಘೋಸ್ಟ್ ಆಗಿದ್ದೀರಿ?",
    aside: "“ನಾವು ತಿಳಿಸುತ್ತೇವೆ” ಎಂದು ಹೇಳಿ ಎಷ್ಟು ದಿನ ಆಯಿತು ಎಂದು ಸ್ಲೈಡ್ ಮಾಡಿ. ನೀವು ಎಲ್ಲಿದ್ದೀರಿ ಎಂದು ಹೇಳುತ್ತೇವೆ, ಮತ್ತು ಕಳುಹಿಸಲು ಒಂದು ಫಾಲೋ-ಅಪ್ ಕೊಡುತ್ತೇವೆ.",
    step1: "ಹಂತ 1 · ಅವರ ಕೊನೆಯ ಉತ್ತರದಿಂದ ದಿನಗಳು", day: "ದಿನ", days: "ದಿನಗಳು", fewer: "ಒಂದು ದಿನ ಕಡಿಮೆ", more: "ಒಂದು ದಿನ ಹೆಚ್ಚು",
    status: "ನಿಮ್ಮ ಸ್ಥಿತಿ", step2: "ಹಂತ 2 · ಅವರೇ ಉತ್ತರಿಸುವ ಸಾಧ್ಯತೆ", fade: "ಅವರ ಆಸಕ್ತಿ ಕಡಿಮೆಯಾದಂತೆ ಘೋಸ್ಟ್ ಮಸುಕಾಗುತ್ತದೆ.",
    step3: "ಹಂತ 3 · ಅವರಿಗೆ ಈ ಫಾಲೋ-ಅಪ್ ಕಳುಹಿಸಿ", copied: "ಕಾಪಿ ಆಯಿತು. ನಿಮ್ಮ ಇಮೇಲ್‌ನಲ್ಲಿ ಪೇಸ್ಟ್ ಮಾಡಿ", copy: "ಈ ಸಂದೇಶ ಕಾಪಿ ಮಾಡಿ",
    stages: [
      { name: "ಇನ್ನೂ ಉಸಿರಾಡುತ್ತಿದೆ", verdict: "ಬಹುಶಃ ಶೆಡ್ಯೂಲ್ ಮಾಡುತ್ತಿದ್ದಾರೆ. ಬಹುಶಃ." },
      { name: "ಸ್ವಲ್ಪ ಭೂತದ ಕಾಟ", verdict: "ರೀಡ್ ರಿಸೀಟ್ ಆನ್. ಉತ್ತರ ಆಫ್. ಕ್ಲಾಸಿಕ್." },
      { name: "ಪೂರ್ತಿ ಘೋಸ್ಟ್", verdict: "ಹುದ್ದೆ ‘ಹೋಲ್ಡ್’ನಲ್ಲಿದೆ. ಅವರ ಆತ್ಮಸಾಕ್ಷಿಯೂ." },
      { name: "ನಕಲಿ ಕೆಲಸದ ವೈಬ್", verdict: "ಲಿಸ್ಟಿಂಗ್ ಇನ್ನೂ ಲೈವ್ ಆಗಿದೆ. ಹುದ್ದೆ ಎಂದೂ ಇರಲಿಲ್ಲ." },
    ],
  },
  lookup: { title: "ಅಲ್ಲಿ ಇತರ ಅಭ್ಯರ್ಥಿಗಳು ಏನು ಅನುಭವಿಸಿದರು ನೋಡಿ", copy: "ಕಂಪನಿಯನ್ನು ಹುಡುಕಿ. ಖಾತೆ ಬೇಕಿಲ್ಲ." },
  tools: {
    title: "ಇನ್ನೂ ಸೀನ್‌ನಲ್ಲೇ? ನಾವಿದ್ದೇವೆ.", copy: "ನೀವು ಅವಸರ ಮಾಡುತ್ತಿದ್ದೀರೋ ಅಥವಾ ಘೋಸ್ಟ್ ಆಗಿದ್ದೀರೋ ತಿಳಿಯಿರಿ, ನಂತರ ವಾರದಿಂದ ತಲೆಯಲ್ಲಿ ಬರೆಯುತ್ತಿರುವ ಫಾಲೋ-ಅಪ್ ಕಳುಹಿಸಿ.",
    rounds: { application: "ಅರ್ಜಿ ಹಾಕಿದೆ", screening: "ರಿಕ್ರೂಟರ್ ಕರೆ", technical: "ಟೆಕ್ನಿಕಲ್ ಸುತ್ತು", final: "ಅಂತಿಮ ಸುತ್ತು", offer: "ಆಫರ್ ಮಾತುಕತೆ" },
    what: { application: "ಅರ್ಜಿಗೆ ಉತ್ತರ ಬರಲು", screening: "ರಿಕ್ರೂಟರ್ ಕರೆಯ ನಂತರ ಉತ್ತರಕ್ಕೆ", technical: "ಟೆಕ್ನಿಕಲ್ ಸುತ್ತಿನ ನಂತರ ಉತ್ತರಕ್ಕೆ", final: "ಅಂತಿಮ ಸುತ್ತಿನ ನಂತರ ನಿರ್ಧಾರಕ್ಕೆ", offer: "ಆಫರ್ ಮಾತುಕತೆಯಲ್ಲಿ ಉತ್ತರಕ್ಕೆ" },
    checkTitle: "ನಾನು ಅತಿಯಾಗಿ ಯೋಚಿಸುತ್ತಿದ್ದೇನಾ?", checkCopy: "ನೀವು ಎಲ್ಲಿ ಸಿಲುಕಿದ್ದೀರಿ ಮತ್ತು ಎಷ್ಟು ಸಮಯದಿಂದ ಹೇಳಿ. ಇದು ತಾಳ್ಮೆಯ ವಿಷಯವೋ ಘೋಸ್ಟ್‌ನದೋ ಹೇಳುತ್ತೇವೆ.",
    where: "ಅವರು ನಿಮ್ಮನ್ನು ಎಲ್ಲಿ ಬಿಟ್ಟರು?", silence: "ಎಷ್ಟು ದಿನದ ಮೌನ", inboxOne: "ದಿನದಿಂದ ಇನ್‌ಬಾಕ್ಸ್ ನೋಡುತ್ತಿದ್ದೀರಿ", inboxMany: "ದಿನಗಳಿಂದ ಇನ್‌ಬಾಕ್ಸ್ ನೋಡುತ್ತಿದ್ದೀರಿ",
    dot: "{what} ಸಾಮಾನ್ಯವಾಗಿ ಎಷ್ಟು ಸಮಯ ಬೇಕು ಎಂಬುದನ್ನು ಚುಕ್ಕೆ ತೋರಿಸುತ್ತದೆ. ಬಾರ್ ನೀವು.", verdict: "ತೀರ್ಪು", todo: "ಏನು ಮಾಡಬೇಕು: ",
    v0: { title: "ಶಾಯಿ ಇನ್ನೂ ಒಣಗಿಲ್ಲ", copy: "ಅವರು ಇಂದೇ ಉತ್ತರಿಸಿದರು. ಟ್ಯಾಬ್ ಮುಚ್ಚಿ, ನೀರು ಕುಡಿಯಿರಿ, ಜೀವನ ನಡೆಸಿ.", next: "ಇನ್ನೂ ಏನೂ ಮಾಡಬೇಕಿಲ್ಲ." },
    v1: { title: "ಶಾಂತವಾಗಿರಿ, ಇದು ಸಾಮಾನ್ಯ", copy: "ಈ ಸುತ್ತಿನಲ್ಲಿ ಉತ್ತರಕ್ಕೆ ಸಾಮಾನ್ಯವಾಗಿ ಸುಮಾರು {usual} ದಿನ ಬೇಕು. ಇಂದು ದಿನ {days}. ಇನ್‌ಬಾಕ್ಸ್ ರಿಫ್ರೆಶ್ ಮಾಡಿದರೆ ಬೇಗ ಆಗುವುದಿಲ್ಲ (ನಾವು ನೋಡಿದ್ದೇವೆ).", next: "ದಿನ {usual} ನಂತರ ಮತ್ತೆ ನೋಡಿ." },
    v2: { title: "ಸರಿ, ಈಗ ತಡವಾಗುತ್ತಿದೆ", copy: "ದಿನ {days}, ಸಾಮಾನ್ಯವಾಗಿ ಸುಮಾರು {usual}. ಇನ್ನೂ ಘೋಸ್ಟ್ ಅಲ್ಲ, ಆದರೆ ಮೇಲಿನಿಂದ ಹೆಜ್ಜೆ ಸದ್ದು ಖಂಡಿತ ಕೇಳುತ್ತಿದೆ.", next: "ಒಂದು ಚಿಕ್ಕ, ವಿನಯದ ಫಾಲೋ-ಅಪ್ ಕಳುಹಿಸಿ. ಪೊಲೈಟ್ ಪೋಕ್ ಅದನ್ನು ಬರೆದುಕೊಡುತ್ತದೆ." },
    v3: { title: "ಭೂತ! ನೀವು ಘೋಸ್ಟ್ ಆಗಿದ್ದೀರಿ", copy: "ದಿನ {days}, ಸಾಮಾನ್ಯ {usual} ಕ್ಕಿಂತ ಎರಡು ಪಟ್ಟಿಗಿಂತ ಹೆಚ್ಚು. ಈಗ ಅವರ ಮೌನವೇ ಉತ್ತರ, ಹೇಳಲು ನಾಚಿಕೆ ಅಷ್ಟೇ.", next: "ಒಮ್ಮೆ ಫಾಲೋ-ಅಪ್ ಮಾಡಿ, ನಂತರ ಆ ಶಕ್ತಿಯನ್ನು ಮುಂದಿನ ಅರ್ಜಿಗೆ ಹಾಕಿ." },
    pokeTitle: "ಪೊಲೈಟ್ ಪೋಕ್", pokeCopy: "ಆಸಕ್ತಿ ತೋರುವ, ಹತಾಶೆ ತೋರದ ಫಾಲೋ-ಅಪ್. ಖಾಲಿ ತುಂಬಿ, ಮೂಡ್ ಆರಿಸಿ, ಕಾಪಿ ಮಾಡಿ.",
    company: "ಕಂಪನಿ", companyHint: "ಉದಾ. Acme", role: "ಹುದ್ದೆ", optional: "(ಐಚ್ಛಿಕ)", roleHint: "ಉದಾ. Product designer",
    last: "ಕೊನೆಯದಾಗಿ ಏನಾಯಿತು", ago: "ಎಷ್ಟು ದಿನದ ಹಿಂದೆ?", mood: "ಮೂಡ್",
    moods: { warm: "ಇನ್ನೂ ಭರವಸೆ ಇದೆ", brief: "ಚಿಕ್ಕ ಮತ್ತು ಚೊಕ್ಕ", firm: "ಕಾದದ್ದು ಸಾಕು" },
    copyPoke: "ಪೋಕ್ ಕಾಪಿ ಮಾಡಿ", copiedPoke: "ಕಾಪಿ ಆಯಿತು. ಹೋಗಿ ಉತ್ತರ ಪಡೆಯಿರಿ", englishNote: "ಹೆಚ್ಚಿನ ರಿಕ್ರೂಟರ್‌ಗಳು ಇಂಗ್ಲಿಷ್‌ನಲ್ಲಿ ಬರೆಯುವುದರಿಂದ ಸಂದೇಶ ಇಂಗ್ಲಿಷ್‌ನಲ್ಲೇ ಇರುತ್ತದೆ.",
  },
  why: {
    eyebrow: "ಅಲ್ಲಿ ಅಲ್ಲ, ಇಲ್ಲಿ ಏಕೆ ಪೋಸ್ಟ್ ಮಾಡಬೇಕು", title: "ನಿಮ್ಮ ಕಥೆಗೆ ಫೀಡ್‌ಗಿಂತ ಉತ್ತಮ ಜಾಗ ಬೇಕು.",
    intro: "ನಿಮ್ಮ ಮ್ಯಾನೇಜರ್ ಫಾಲೋ ಮಾಡುವ ಪ್ರೊಫೆಷನಲ್ ನೆಟ್‌ವರ್ಕ್‌ನಲ್ಲಿ ಪೋಸ್ಟ್ ಮಾಡಬಹುದು. ಅಥವಾ ಎಂಪ್ಲಾಯರ್ ಡ್ಯಾಶ್‌ಬೋರ್ಡ್ ಇರುವ ದೊಡ್ಡ ರಿವ್ಯೂ ಸೈಟ್‌ನಲ್ಲಿ. ಅಥವಾ ಶುಕ್ರವಾರದೊಳಗೆ ಮರೆಯುವ ಗ್ರೂಪ್ ಚಾಟ್‌ನಲ್ಲಿ. ವ್ಯತ್ಯಾಸ ಇಲ್ಲಿದೆ.",
    places: [
      { name: "ಪ್ರೊಫೆಷನಲ್ ನೆಟ್‌ವರ್ಕ್", quip: "ನಿಮ್ಮ ಬಾಸ್, ತಂಡ ಮತ್ತು ಮುಂದಿನ ಪ್ರತಿಯೊಬ್ಬ ರಿಕ್ರೂಟರ್ ನಿಮ್ಮ ಪೋಸ್ಟ್ ಓದುವ ಜಾಗ. ಅಲ್ಲಿ ಪ್ರಾಮಾಣಿಕತೆಗೆ ಬೆಲೆ ಇದೆ." },
      { name: "ದೊಡ್ಡ ರಿವ್ಯೂ ಸೈಟ್‌ಗಳು", quip: "ನಿಮಗೆಷ್ಟೋ ಅಷ್ಟೇ ಎಂಪ್ಲಾಯರ್‌ಗಳಿಗಾಗಿ ಮಾಡಲಾಗಿದೆ. ಪ್ರೊಫೈಲ್‌ಗಳು, ಡ್ಯಾಶ್‌ಬೋರ್ಡ್‌ಗಳು, ಪಾಲಿಶ್ ಮಾಡಿದ ಉತ್ತರಗಳು." },
      { name: "ಗ್ರೂಪ್ ಚಾಟ್", quip: "ಒಳ್ಳೆಯ ಗಾಸಿಪ್, ಶುಕ್ರವಾರಕ್ಕೆ ಮಾಯ. ಸಂದರ್ಶನದ ಮುನ್ನ ಯಾರಿಗೂ ಸಿಗುವುದಿಲ್ಲ." },
    ],
    rows: [
      { topic: "ನಿಮ್ಮ ಗುರುತು", elsewhere: "ಸಾಮಾನ್ಯವಾಗಿ ನಿಮ್ಮ ನಿಜ ಹೆಸರು ಮತ್ತು ಫೋಟೋ, ಅಥವಾ ನಿಮ್ಮವರೆಗೆ ತಲುಪಬಹುದಾದ ಖಾತೆ.", ghosted: "ಡೀಫಾಲ್ಟ್ ಆಗಿ ಅನಾಮಧೇಯ. ನಿಮ್ಮ ಹೆಸರು ಎನ್‌ಕ್ರಿಪ್ಟ್ ಆಗಿದೆ, ನೀವು ಸಾರ್ವಜನಿಕವಾಗಲು ಆರಿಸಿದರೆ ಮಾತ್ರ ಕಾಣುತ್ತದೆ." },
      { topic: "ನಿಮ್ಮ ನಿಯಂತ್ರಣದಲ್ಲಿ ಏನಿದೆ", elsewhere: "ಹೆಚ್ಚಾಗಿ ಎಲ್ಲವೂ ಅಥವಾ ಏನೂ ಇಲ್ಲ: ಸಾರ್ವಜನಿಕ, ಇಲ್ಲವೇ ಪೋಸ್ಟ್ ಮಾಡಬೇಡಿ.", ghosted: "ಯಾವ ವಿವರ ಕಾಣಬೇಕು ಎಂದು ನಿಖರವಾಗಿ ಆರಿಸಿ (ಹೆಸರು, ಹುದ್ದೆ, ನಗರ, LinkedIn), ಯಾವಾಗ ಬೇಕಾದರೂ ಬದಲಿಸಿ." },
      { topic: "ಯಾರು ಹಣ ಕೊಡುತ್ತಾರೆ", elsewhere: "ಹೆಚ್ಚಾಗಿ ಎಂಪ್ಲಾಯರ್ ಉತ್ಪನ್ನಗಳಿಂದ ನಡೆಯುತ್ತವೆ, ಅದು ನಿಮ್ಮ ಪರವಾಗಿರುವುದಕ್ಕೆ ಸಮವಲ್ಲ.", ghosted: "ಕಥೆಯನ್ನು ಮುಚ್ಚಿಡಲು, ಬದಲಿಸಲು, ಹೂತುಹಾಕಲು ಅಥವಾ ಮೇಲೆತ್ತಲು ಕಂಪನಿಗಳು ನಮಗೆ ಹಣ ಕೊಡಲು ಸಾಧ್ಯವಿಲ್ಲ. ಎಂದಿಗೂ." },
      { topic: "ನೀವು ಪರಿಶೀಲಿಸಬಹುದೇ?", elsewhere: "ಮುಚ್ಚಿದ ಕೋಡ್. ನಿಮ್ಮ ಡೇಟಾ ಹೇಗೆ ನಿರ್ವಹಿಸಲಾಗುತ್ತದೆ ಎಂದು ಅವರ ಮಾತು ನಂಬಬೇಕು.", ghosted: "ಓಪನ್ ಸೋರ್ಸ್. ನಿಮ್ಮ ಗುರುತು ಹೇಗೆ ಸುರಕ್ಷಿತವಾಗಿದೆ ಎಂದು ಯಾರು ಬೇಕಾದರೂ ಓದಬಹುದು." },
      { topic: "ಇದು ಯಾವುದಕ್ಕಾಗಿ", elsewhere: "ಕೆಲಸದ ಸ್ಥಳಗಳಿಗೆ ಸಾಮಾನ್ಯ ಸ್ಟಾರ್ ರೇಟಿಂಗ್.", ghosted: "ನಿರ್ದಿಷ್ಟವಾಗಿ ನೇಮಕಾತಿ: ಸುತ್ತುಗಳು, ಮೌನದ ದಿನಗಳು, ಪೋಸ್ಟಿಂಗ್ ವಿರುದ್ಧ ಸಂಬಳ, ರದ್ದಾದ ಆಫರ್‌ಗಳು." },
      { topic: "ಎಷ್ಟು ಕಾಲ ಉಳಿಯುತ್ತದೆ", elsewhere: "ಎರಡು ದಿನದಲ್ಲಿ ಹೂತುಹೋಗುವ ಪೋಸ್ಟ್, ಅಥವಾ ಸ್ಕ್ರೋಲ್ ಆಗಿ ಹೋಗುವ ಚಾಟ್.", ghosted: "ಪ್ರತಿ ಕಥೆ ಕಂಪನಿಗೆ ಜೋಡಿಸಲಾಗಿದೆ, ಮುಂದಿನ ಅಭ್ಯರ್ಥಿ ಸಂದರ್ಶನದ ಮುನ್ನ ಅದನ್ನು ಕಂಡುಕೊಳ್ಳಲು." },
      { topic: "ಬೆಲೆ", elsewhere: "ಓದಲು ಉಚಿತ, ಆದರೆ ಉತ್ತಮ ಭಾಗಗಳು ಪೇವಾಲ್ ಅಥವಾ ಸೈನ್-ಅಪ್ ಹಿಂದೆ.", ghosted: "ಓದಲು ಉಚಿತ, ಪೋಸ್ಟ್ ಮಾಡಲು ಉಚಿತ, ಎಂದೆಂದಿಗೂ ಉಚಿತ." },
    ],
    footnote: "ಜನರು ಸಾಮಾನ್ಯವಾಗಿ ಪೋಸ್ಟ್ ಮಾಡುವ ಜಾಗಗಳ ಪ್ರಕಾರಗಳನ್ನು ವಿವರಿಸುತ್ತಿದ್ದೇವೆ, ಯಾವುದೇ ನಿರ್ದಿಷ್ಟ ಕಂಪನಿಯನ್ನಲ್ಲ. ಪ್ರತಿ ವೇದಿಕೆ ಬೇರೆ, ಕೆಲವು ಇದರ ಭಾಗಗಳನ್ನು ಚೆನ್ನಾಗಿ ಮಾಡುತ್ತವೆ.",
    elsewhereHead: "ಬೇರೆಡೆ ಪೋಸ್ಟ್ ಮಾಡುವುದು", ghostedHead: "Ghosted ನಲ್ಲಿ ಪೋಸ್ಟ್ ಮಾಡುವುದು", elsewhere: "ಬೇರೆಡೆ", ghosted: "Ghosted", seeCode: "ಕೋಡ್ ನೋಡಿ",
  },
  objection: {
    eyebrow: "ಸ್ಪಷ್ಟ ಪ್ರಶ್ನೆ", quote: "“ದೊಡ್ಡ ಸೈಟ್‌ಗಳಲ್ಲಿ ಈಗಾಗಲೇ ಕೋಟ್ಯಂತರ ಜನರಿದ್ದಾರೆ. ಯಾರೂ ಇಲ್ಲದ ಕಡೆ ಏಕೆ ಪೋಸ್ಟ್ ಮಾಡಬೇಕು?”", answer: "ಒಳ್ಳೆಯದು. ಅದೇ ಮುಖ್ಯ ವಿಷಯ.",
    intro: "ಕೋಟ್ಯಂತರ ಬಳಕೆದಾರರೇ ನಿಮ್ಮ ಕಥೆ ಅಲ್ಲಿ ಕಳೆದುಹೋಗಲು ಕಾರಣ. Ghosted ನಲ್ಲಿ ಅದು ಯಾವುದರೊಂದಿಗೂ ಸ್ಪರ್ಧಿಸಬೇಕಿಲ್ಲ: ಅದು ಕಂಪನಿಗೆ ಜೋಡಿಸಲಾಗಿದೆ, ಮತ್ತು ಅದು ಹೆಚ್ಚು ಅಗತ್ಯವಿರುವ ಆ ಒಬ್ಬ ಓದುಗನಿಗಾಗಿ ಕಾಯುತ್ತಿದೆ, ಅದೇ ಪ್ರಕ್ರಿಯೆಗೆ ಹೋಗಲಿರುವ ಮುಂದಿನ ಅಭ್ಯರ್ಥಿ.",
    reasons: [
      { title: "ಒಬ್ಬ ಓದುಗ ಸಾಕು", copy: "ನಿಮ್ಮ ಕಥೆ ವೈರಲ್ ಆಗಬೇಕಾದ ಪೋಸ್ಟ್ ಅಲ್ಲ. ಅದು ಕಂಪನಿಯ ಹೆಸರಿನಡಿ ಇಟ್ಟ ರಸೀದಿ, ಸಂದರ್ಶನದ ಮುನ್ನ ಅವರನ್ನು ಹುಡುಕುವವರಿಗೆ ಸಿಗುತ್ತದೆ. ಒಬ್ಬ ಓದುಗನೊಂದಿಗೂ ಕೆಲಸ ಮಾಡುತ್ತದೆ.", tag: "ಜೋಡಿಸಿದ್ದು, ಹೂತಿದ್ದಲ್ಲ" },
      { title: "ಮೊದಲ ರಸೀದಿ ಆಗಿ", copy: "ಜನಸಂದಣಿಯ ಸೈಟ್‌ನಲ್ಲಿ ನೀವು 4,000ನೇ ರಿವ್ಯೂ. ಇಲ್ಲಿ, ಆ ಕಂಪನಿಯ ನೇಮಕಾತಿ ಬಗ್ಗೆ ಯಾರಾದರೂ ಓದುವ ಮೊದಲ ವಿಷಯ ನಿಮ್ಮ ಕಥೆ ಆಗಬಹುದು, ಮತ್ತು ಮೊದಲ ದಿನದಿಂದ ಅದರ ಫ್ಲ್ಯಾಗ್ ಸ್ಕೋರ್ ರೂಪಿಸುತ್ತದೆ.", tag: "ಮೊದಲ ಕಥೆಗಳು ಹೆಚ್ಚು ಮುಖ್ಯ" },
      { title: "ಬೇರೆ ಯಾರೂ ಸೇರುವ ಮುನ್ನವೂ ಉಪಯುಕ್ತ", copy: "ವೇಟಿಂಗ್ ರೂಮ್ ನೀವು ಕಾಯುತ್ತಿರುವ ಪ್ರತಿ ಅರ್ಜಿಯನ್ನು ಟ್ರ್ಯಾಕ್ ಮಾಡುತ್ತದೆ, ಮೌನದ ದಿನಗಳನ್ನು ಎಣಿಸುತ್ತದೆ ಮತ್ತು ಫಾಲೋ-ಅಪ್ ಯಾವಾಗ ಸರಿ ಎಂದು ಹೇಳುತ್ತದೆ. ಇಲ್ಲಿ ನೀವೊಬ್ಬರೇ ಇದ್ದರೂ ಕೆಲಸ ಮಾಡುತ್ತದೆ.", tag: "ಮೊದಲ ದಿನದಿಂದ ಮೌಲ್ಯ" },
      { title: "ಅವು ಬೇರೆಯದನ್ನು ಅಳೆಯುತ್ತವೆ", copy: "ದೊಡ್ಡ ರಿವ್ಯೂ ಸೈಟ್‌ಗಳು ಕಂಪನಿಯಲ್ಲಿ ಕೆಲಸ ಮಾಡುವುದನ್ನು ರೇಟ್ ಮಾಡುತ್ತವೆ, ನೀವು ಒಳಗೆ ಬಂದ ನಂತರ. ನೋವಾಗುವ ಭಾಗವನ್ನು ಯಾರೂ ದಾಖಲಿಸುವುದಿಲ್ಲ: ಸುತ್ತುಗಳು, ಉತ್ತರವಿಲ್ಲದ ದಿನಗಳು, ಪೋಸ್ಟಿಂಗ್ ವಿರುದ್ಧ ಸಂಬಳ, ರದ್ದಾದ ಆಫರ್‌ಗಳು, ಎಂದೂ ಇರದ ಕೆಲಸಗಳು.", tag: "ನಿರ್ದಿಷ್ಟವಾಗಿ ನೇಮಕಾತಿ" },
      { title: "ಯಾವುದೇ ಪರಿಣಾಮ ಇಲ್ಲ, ಎಂದಿಗೂ", copy: "ಪ್ರೊಫೆಷನಲ್ ನೆಟ್‌ವರ್ಕ್ ನಿಮ್ಮ ಮ್ಯಾನೇಜರ್, ತಂಡ ಮತ್ತು ಮುಂದಿನ ಪ್ರತಿ ರಿಕ್ರೂಟರ್ ನಿಮ್ಮ ಪೋಸ್ಟ್ ಓದುವ ಜಾಗ. ಇಲ್ಲಿ ನೀವು ಡೀಫಾಲ್ಟ್ ಆಗಿ ಅನಾಮಧೇಯ, ನಿಮ್ಮ ಕಥೆ ನಿಮ್ಮವರೆಗೆ ತಲುಪುವುದಿಲ್ಲ.", tag: "ಬೆಲೆ ಇಲ್ಲದ ಪ್ರಾಮಾಣಿಕತೆ" },
      { title: "ಮೊದಲಿನಿಂದಲೇ ಸ್ವಚ್ಛ", copy: "Goofy, ನಮ್ಮ AutoMod, ಏನೇ ಪೋಸ್ಟ್ ಆಗುವ ಮುನ್ನ ಅಶ್ಲೀಲತೆ ತೆಗೆಯುತ್ತದೆ, ಜನರ ಹೆಸರು ಮರೆಮಾಡುತ್ತದೆ ಮತ್ತು ಆರೋಪಗಳನ್ನು ಪರಿಶೀಲಿಸುತ್ತದೆ, ಆದ್ದರಿಂದ ಇಲ್ಲಿ ಓದುವುದು ನಂಬಲರ್ಹ, ಆರಂಭದಲ್ಲೂ.", tag: "ಮೊದಲ ಪೋಸ್ಟ್‌ನಿಂದ ಮಾಡರೇಟೆಡ್" },
    ],
    timeline: [
      { when: "ಇಂದು", what: "ನೀವು ಅನಾಮಧೇಯವಾಗಿ, ಸುಮಾರು ಮೂರು ನಿಮಿಷದಲ್ಲಿ ಏನಾಯಿತು ಹಂಚಿಕೊಳ್ಳುತ್ತೀರಿ." },
      { when: "ಮುಂದಿನ ವಾರ", what: "ಆ ಕಂಪನಿಯನ್ನು ಹುಡುಕುವ ಯಾರೋ ಅಂತಿಮ ಸುತ್ತಿನ ಮುನ್ನ ಅದನ್ನು ಓದುತ್ತಾರೆ." },
      { when: "ಮುಂದಿನ ತಿಂಗಳು", what: "ಇನ್ನೂ ಕೆಲವು ಕಥೆಗಳು ಬರುತ್ತವೆ, ಮತ್ತು ಕಂಪನಿಗೆ ನಿಜವಾದ ಫ್ಲ್ಯಾಗ್ ಸ್ಕೋರ್ ಸಿಗುತ್ತದೆ." },
      { when: "ಮುಂದಿನ ವರ್ಷ", what: "ಯಾರೂ ಆ ಪ್ರಕ್ರಿಯೆಗೆ ಕುರುಡಾಗಿ ಹೋಗುವುದಿಲ್ಲ." },
    ],
    closer: { line: "ಕೋಟ್ಯಂತರ ಬಳಕೆದಾರರಿರುವ ಪ್ರತಿ ವೇದಿಕೆ ಮೊದಲ ಸಾವಿರದಿಂದ ಶುರುವಾಯಿತು.", punch: "ನೇಮಕಾತಿಯನ್ನು ಪ್ರಾಮಾಣಿಕಗೊಳಿಸುವ ಮೊದಲ ಸಾವಿರದಲ್ಲಿ ಸೇರಿ.", cta: "ಮೊದಲ ರಸೀದಿ ಹಂಚಿಕೊಳ್ಳಿ" },
    goal: {
      title: "ನಮ್ಮ ಗುರಿ: ಕಿರಿಕಿರಿ ಇಲ್ಲದ ನೇಮಕಾತಿ",
      lead: "Ghosted ನಿಮ್ಮನ್ನು ಕೆಲಸದಿಂದ ಹೆದರಿಸಲು ಅಲ್ಲ. ನೀವು ಕಣ್ಣು ತೆರೆದು ಅರ್ಜಿ ಹಾಕಲು, ಮತ್ತು ಜನರ ಸಮಯ ವ್ಯರ್ಥ ಮಾಡುವ ಪ್ರಕ್ರಿಯೆಗಳು ಕೊನೆಗೂ ಬದಲಾಗುವ ಒತ್ತಡ ಅನುಭವಿಸಲು.",
      points: [
        { title: "ಆತ್ಮವಿಶ್ವಾಸದಿಂದ ಅರ್ಜಿ ಹಾಕಿ", copy: "ಶುರುಮಾಡುವ ಮುನ್ನ ಸುತ್ತುಗಳು, ಸಾಮಾನ್ಯ ಕಾಯುವಿಕೆ ಮತ್ತು ನಿಜವಾದ ಸಂಬಳ ತಿಳಿಯಿರಿ, ಪ್ರಕ್ರಿಯೆಯಲ್ಲಿ ಯಾವುದೂ ಅಚ್ಚರಿ ತರದಂತೆ." },
        { title: "ಕೆಟ್ಟ ಪ್ರಕ್ರಿಯೆಗಳನ್ನು ವಿರೋಧಿಸಿ", copy: "ಅಂತ್ಯವಿಲ್ಲದ ಸುತ್ತುಗಳು, ಸಂಬಳವಿಲ್ಲದ ‘ಅಸೈನ್‌ಮೆಂಟ್’, ಅಂತಿಮ ಸಂದರ್ಶನದ ನಂತರ ಮೌನ: ಎಲ್ಲರೂ ನೋಡುವಂತೆ ಬರೆದಿದ್ದರೆ, ಅದನ್ನು ಮುಂದುವರಿಸುವುದು ಕಷ್ಟ." },
        { title: "ಒಳ್ಳೆಯ ಎಂಪ್ಲಾಯರ್‌ಗಳಿಗೆ ಮನ್ನಣೆ ಕೊಡಿ", copy: "ಬೇಗ ಉತ್ತರಿಸಿ ಅಭ್ಯರ್ಥಿಗಳನ್ನು ಚೆನ್ನಾಗಿ ನಡೆಸಿಕೊಳ್ಳುವ ಕಂಪನಿಗಳು ಮೇಲೆ ಬರುತ್ತವೆ. ಇಲ್ಲಿ ಹಸಿರು ಧ್ವಜಗಳು ಕೆಂಪಿನಷ್ಟೇ ಜೋರಾಗಿ ಕಾಣುತ್ತವೆ." },
        { title: "ಅಭ್ಯರ್ಥಿಗಳ ಉತ್ಸಾಹ ಉಳಿಸಿ", copy: "ರಿಜೆಕ್ಷನ್ ಅಥವಾ ಘೋಸ್ಟಿಂಗ್ ನಿಮ್ಮ ಬಗ್ಗೆಗಿಂತ ಪ್ರಕ್ರಿಯೆಯ ಬಗ್ಗೆ ಹೆಚ್ಚು ಹೇಳುತ್ತದೆ. ಇತರರಿಗೂ ಹಾಗೇ ಆಯಿತು ಎಂದು ನೋಡಿದರೆ ಅರ್ಜಿ ಹಾಕುತ್ತಲೇ ಇರುವುದು ಸುಲಭ." },
      ],
    },
    compounds: "ಒಂದು ಕಥೆ ಏನು ಮಾಡುತ್ತದೆ",
  },
  proofs: {
    eyebrow: "ಸಣ್ಣ ಕೆಂಪು ಧ್ವಜಗಳು, ದೊಡ್ಡ ತಿರುವುಗಳು", title: "ಅವರು ಅನುಕೂಲವಾಗಿ ಹೇಳಲು ಮರೆಯುವ ವಿಷಯಗಳು.", aside: "ಜಾಬ್ ಡಿಸ್ಕ್ರಿಪ್ಶನ್‌ನಲ್ಲಿ “ಫಾಸ್ಟ್-ಪೇಸ್ಡ್” ಎಂದಿತ್ತು. ಯಾರ ಬಳಿಯೂ ನಕ್ಷೆ ಇರಲಿಲ್ಲ ಎಂಬುದನ್ನು ಬಿಟ್ಟಿತ್ತು.",
    items: [
      { title: "ಸಂಬಳದ ವ್ಯಾಪ್ತಿ", expected: "ಪೋಸ್ಟ್ ಮಾಡಿದ್ದು: ₹18–24 LPA", reality: "ಆಫರ್ ಮಾಡಿದ್ದು: ‘ಮೊದಲು ನೀವು ಹೇಗೆ ಮಾಡುತ್ತೀರಿ ನೋಡೋಣ.’" },
      { title: "ಟೇಕ್-ಹೋಮ್", expected: "ಅಂದಾಜು: 90 ನಿಮಿಷ", reality: "ಒಳಗೊಂಡಿದ್ದು: ಸ್ಟ್ರ್ಯಾಟಜಿ, ಡಿಸೈನ್, ಕೋಡ್, ಡಿಪ್ಲಾಯ್‌ಮೆಂಟ್, ಭಾವನಾತ್ಮಕ ಹಾನಿ." },
      { title: "ಫಾಲೋ-ಅಪ್", expected: "ಕಳುಹಿಸಿದ್ದು: ಮಂಗಳವಾರ", reality: "ಸ್ಥಿತಿ: ಆಧ್ಯಾತ್ಮಿಕವಾಗಿ ತಲುಪಿದೆ." },
    ],
  },
  flags: {
    eyebrow: "ಧ್ವಜಗಳ ಸಭಾಂಗಣ", title: "ರಸೀದಿಗಳು, ಶ್ರೇಣಿಯೊಂದಿಗೆ.", aside: "ಸಮುದಾಯದ ಸ್ಕೋರ್‌ಗಳು, ಎಂಪ್ಲಾಯರ್ ಪ್ರಾಯೋಜಿತ ವೈಬ್ಸ್ ಅಲ್ಲ.",
    emptyTitle: "ಬೋರ್ಡ್‌ಗೆ ಮೊದಲ ಕಂಪನಿ ತನ್ನಿ.", emptyCopy: "ಪ್ರತಿ ಕಂಪನಿಯ ಫ್ಲ್ಯಾಗ್ ಸ್ಕೋರ್ ಅಭ್ಯರ್ಥಿಗಳ ಅನುಭವದಿಂದ ಬರುತ್ತದೆ. ನಿಮ್ಮದು ಸುಮಾರು 30 ಸೆಕೆಂಡ್, ಮತ್ತು ನೀವು Ghosted ನ ಮೊದಲ 50 ಧ್ವನಿಗಳಲ್ಲಿ ಒಬ್ಬರಾಗಬಹುದು.",
    decent: "ನಿಜವಾಗಿಯೂ ಪರವಾಗಿಲ್ಲ", snacks: "ತಿಂಡಿ ಜೊತೆ ಹೋಗಿ", nobody: "ಇಲ್ಲಿ ಇನ್ನೂ ಯಾರೂ ಇಲ್ಲ.",
  },
  invite: { title: "ಒಂದು ಧ್ವನಿ ತನ್ನಿ, ಒಟ್ಟಿಗೆ ಲೆವೆಲ್ ಏರಿ.", copy: "ನೇಮಕಾತಿ ಪ್ರಕ್ರಿಯೆ ಅನುಭವಿಸಿದ ಯಾರನ್ನಾದರೂ ಆಹ್ವಾನಿಸಿ. ಅವರು ತಮ್ಮ ಅನುಭವ ಹಂಚಿಕೊಂಡಾಗ, ನೀವಿಬ್ಬರೂ ಇನ್ವೈಟ್ ಲೆವೆಲ್ 1 ತಲುಪುತ್ತೀರಿ ಮತ್ತು ಅವತಾರಕ್ಕೆ ಉಂಗುರ ಸಿಗುತ್ತದೆ. ಲೆವೆಲ್ 2 ಮತ್ತು 3, 3 ಮತ್ತು 10 ಸ್ನೇಹಿತರಿಗೆ. ಹಣವಿಲ್ಲ, ಸ್ಪ್ಯಾಮ್ ಇಲ್ಲ, ನೀವು ಯಾರು ಎಂದು ಯಾರಿಗೂ ತಿಳಿಯುವುದಿಲ್ಲ.", cta: "ಆಹ್ವಾನಗಳು ಹೇಗೆ ಕೆಲಸ ಮಾಡುತ್ತವೆ" },
  pitch: {
    eyebrow: "ನಮ್ಮ ಮಾತು", headline: ["ಎಲ್ಲರೂ ಕೆಲಸವನ್ನು ರೇಟ್ ಮಾಡುತ್ತಾರೆ.", "ನೇಮಕಾತಿಯನ್ನು ಯಾರೂ ಇಲ್ಲ."],
    manifesto: ["ನೀವು ಅವರಿಗೆ ಆರು ಸುತ್ತು ಕೊಟ್ಟಿರಿ.", "ವೀಕೆಂಡ್ ಪೂರ್ತಿಯ “ಎರಡು ಗಂಟೆಯ” ಅಸೈನ್‌ಮೆಂಟ್.", "ನಿಮ್ಮ ನೋಟೀಸ್ ಅವಧಿ, ರೆಫರೆನ್ಸ್‌ಗಳು, ನಿಮ್ಮ ಭರವಸೆಗಳು.", "ಅವರು ನಿಮಗೆ ಮೌನ ಕೊಟ್ಟರು.", "ಆ ಮೌನಕ್ಕೆ ಕೊನೆಗೂ ಸ್ಕೋರ್ ಸಿಗುವ ಜಾಗ Ghosted."],
    pillars: [
      { title: "ರಸೀದಿಗಳು, ರೇಟಿಂಗ್ ಅಲ್ಲ", copy: "ಇನ್ನೊಂದು ಫೈವ್-ಸ್ಟಾರ್ ವೈಬ್ ಚೆಕ್ ಅಲ್ಲ. ಸುತ್ತುಗಳು, ಕಾಯುವ ದಿನಗಳು, ಪೋಸ್ಟಿಂಗ್ ವಿರುದ್ಧ ಸಂಬಳ, ಹಿಂಪಡೆದ ಆಫರ್‌ಗಳು. ನೀವು ಅರ್ಜಿ ಹಾಕಬೇಕೇ ಎಂದು ನಿರ್ಧರಿಸುವ ವಿಷಯಗಳು.", statLabel: "ನಾವು ಸ್ಕೋರ್ ಮಾಡುವ ವಿಷಯಗಳು, 1 ಸ್ಟಾರ್ ರೇಟಿಂಗ್ ಅಲ್ಲ" },
      { title: "ವಿನ್ಯಾಸದಿಂದಲೇ ಅನಾಮಧೇಯ", copy: "ನಿಮ್ಮ ಹೆಸರು ಎನ್‌ಕ್ರಿಪ್ಟ್ ಆಗಿದೆ, ಹ್ಯಾಂಡಲ್ ಯಾದೃಚ್ಛಿಕ, ಮತ್ತು ನಿಮ್ಮ ಅನಾಮಧೇಯ ಪೋಸ್ಟ್‌ಗಳು ನಿಮ್ಮವರೆಗೆ ತಲುಪುವುದಿಲ್ಲ. ಕ್ರೆಡಿಟ್ ಬೇಕಿದ್ದರೆ ಮಾತ್ರ ಸಾರ್ವಜನಿಕವಾಗಿ.", statLabel: "ಹೆಸರುಗಳು ಕಾಣುತ್ತವೆ, ನೀವು ಹೇಳದ ಹೊರತು" },
      { title: "ಯಾರೂ ಮಾರಾಟಕ್ಕಿಲ್ಲ", copy: "ಎಂಪ್ಲಾಯರ್ ಡ್ಯಾಶ್‌ಬೋರ್ಡ್ ಇಲ್ಲ. ಪಾವತಿಸಿದ ಪ್ರೊಫೈಲ್ ಪಾಲಿಶ್ ಇಲ್ಲ. ಬಜೆಟ್ ಇರುವವರಿಗೆ “ಈ ರಿವ್ಯೂ ತೆಗೆಯಿರಿ” ಬಟನ್ ಇಲ್ಲ. ಮತ್ತು ಕೋಡ್ ತೆರೆದಿದೆ, ನೀವು ಪರಿಶೀಲಿಸಬಹುದು.", statLabel: "ಸ್ಕೋರ್ ಬದಲಿಸಲು ಕಂಪನಿಗಳು ಪಾವತಿಸಬಹುದು" },
    ],
    closer: { line: "ರಿಕ್ರೂಟರ್‌ಗಳ ಬಳಿ ATS ಸಾಫ್ಟ್‌ವೇರ್, ಹೈರಿಂಗ್ ಮ್ಯಾನೇಜರ್‌ಗಳು ಮತ್ತು ಪೂರ್ತಿ HR ತಂಡ ಇದೆ.", punch: "ಅಭ್ಯರ್ಥಿಗಳ ಬಳಿ ಕೊನೆಗೂ Ghosted ಇದೆ.", cta: "ರಸೀದಿಗಳ ಕ್ಲಬ್‌ಗೆ ಸೇರಿ" },
  },
  mine: {
    eyebrow: "ಸಂದರ್ಶನದ ಸವಾಲು", title: "ನೀವು ಒಂದು ನೇಮಕಾತಿ ಪ್ರಕ್ರಿಯೆ ಎದುರಿಸಬಲ್ಲಿರಾ?",
    aside: "ಪ್ರತಿ ಟೈಲ್ ಪ್ರಕ್ರಿಯೆಯ ಒಂದು ಹೆಜ್ಜೆ. ಹೆಚ್ಚಿನವು ಸರಿ. ಕೆಲವು ಕೆಂಪು ಧ್ವಜಗಳು, ಮತ್ತು ರಿಕ್ರೂಟರ್ ತಮ್ಮ ಅತ್ಯುತ್ತಮ ದಾಳ ಹಾಕುತ್ತಾರೆ. ಆಫರ್ ತಲುಪಲು ಬೋರ್ಡ್ ಸ್ವಚ್ಛಗೊಳಿಸಿ. ಮೂರು ಕೆಂಪು ಧ್ವಜ ಮತ್ತು ನೀವು ಹೊರಗೆ, ನಿಜ ಜೀವನದಂತೆಯೇ.",
    gauntlet: ["ಅರ್ಜಿ ಹಾಕಿದೆ", "ಸ್ಕ್ರೀನಿಂಗ್ ಕರೆ", "ಟೇಕ್-ಹೋಮ್", "ಟೆಕ್ ಸುತ್ತು", "ಅಂತಿಮ ಸುತ್ತು", "ಆಫರ್"],
    won: "ಆಫರ್ ಕೈಯಲ್ಲಿ! “ಅಂತಿಮ ಅನುಮೋದನೆ” ಬಾಕಿ, ಸಹಜವಾಗಿ.", lost: "ಮೂರು ಕೆಂಪು ಧ್ವಜ. ಅವರು “ಇತರ ಅಭ್ಯರ್ಥಿಗಳೊಂದಿಗೆ ಮುಂದುವರಿದಿದ್ದಾರೆ”.",
    idle: "ಅರ್ಜಿ ಕಳುಹಿಸಲು ಯಾವುದಾದರೂ ಟೈಲ್ ಒತ್ತಿ. ಮೊದಲ ಹೆಜ್ಜೆ ಯಾವಾಗಲೂ ಸುರಕ್ಷಿತ.", playing: "ಪ್ರತಿ ಸಂಖ್ಯೆ ಪಕ್ಕದಲ್ಲಿ ಎಷ್ಟು ಕೆಂಪು ಧ್ವಜ ಅಡಗಿದೆ ಎಂದು ಎಣಿಸುತ್ತದೆ. ಹಸಿರು ಟಿಕ್ ಎಂದರೆ ಎಲ್ಲಾ ನೆರೆಯವರೂ ಸುರಕ್ಷಿತ.",
    patience: "ಉಳಿದ ತಾಳ್ಮೆ", cleared: "ಸ್ವಚ್ಛ ಟೈಲ್‌ಗಳು", log: "ಏಟುಗಳ ಲಾಗ್", slapOne: "ಏಟು", slapMany: "ಏಟುಗಳು",
    clean: "ಇಲ್ಲಿಯವರೆಗೆ ಸ್ವಚ್ಛ ದಾಖಲೆ. HR ರಜೆಯಲ್ಲಿರುವಾಗ ಆನಂದಿಸಿ.", again: "ಮತ್ತೆ ಅರ್ಜಿ ಹಾಕಿ (ಹಾಕುತ್ತೀರಿ)", restart: "ಮತ್ತೆ ಶುರು ಮಾಡಿ",
    endWon: "ಚೆನ್ನಾಗಿ ಆಡಿದಿರಿ. ಆದರೆ ನಿಜ ಪ್ರಕ್ರಿಯೆಗಳಲ್ಲಿ ಟೈಲ್ ಮೇಲೆ ಸಂಖ್ಯೆ ಇರುವುದಿಲ್ಲ.", endLost: "ನಿಜ ಅಭ್ಯರ್ಥಿಗಳು ಈಗಾಗಲೇ ಇವುಗಳ ಮೇಲೆ ಕಾಲಿಟ್ಟಿದ್ದಾರೆ. ಅರ್ಜಿ ಹಾಕುವ ಮುನ್ನ ನಕ್ಷೆ ನೋಡಿ.",
    search: "ಕಂಪನಿ ಹುಡುಕಿ", shareRun: "ನಿಮ್ಮ ನಿಜ ಅನುಭವ ಹಂಚಿಕೊಳ್ಳಿ",
  },
  wall: { eyebrow: "ಸಮುದಾಯದಿಂದ ಹೊಸದು", title: "ಕಥೆಗಳ ಗೋಡೆ.", add: "ನಿಮ್ಮದು ಸೇರಿಸಿ", loading: "ಹೊಸ ಕಥೆಗಳು ಲೋಡ್ ಆಗುತ್ತಿವೆ…", firstTitle: "ಮೊದಲ 50 ಧ್ವನಿಗಳಲ್ಲಿ ಒಬ್ಬರಾಗಿ.", firstCopy: "ಅನುಭವ ಹಂಚಿಕೊಳ್ಳುವ ಮೊದಲ 50 ಜನರೇ Ghosted ಅನ್ನು ನಂತರದ ಎಲ್ಲರಿಗೂ ಉಪಯುಕ್ತವಾಗಿಸುತ್ತಾರೆ. ಕೆಲವು ಉತ್ತರ ಆರಿಸಿ, ಮುಗಿಯಿತು.", readMore: "ಇನ್ನಷ್ಟು ಓದಿ" },
  privacy: { title1: "ಡೀಫಾಲ್ಟ್ ಆಗಿ ಅನಾಮಧೇಯ.", title2: "ನಿಮ್ಮ ಆಯ್ಕೆಯಿಂದ ನಿರ್ದಿಷ್ಟ.", copy: "ಪ್ರತಿ ವಿವರಕ್ಕೂ ಅದರದೇ ಸ್ವಿಚ್. ನಿಮ್ಮ ಹುದ್ದೆ, ಅನುಭವ ಅಥವಾ LinkedIn ನೀವು ಬಯಸಿದರೆ ಮಾತ್ರ ತೋರಿಸಿ; ಎಲ್ಲವನ್ನೂ ಆಫ್ ಇಟ್ಟರೆ ನೀವು ಸಂಪೂರ್ಣ ಅನಾಮಧೇಯ. ನಮಗೆ ಹೇಗೂ ರಸೀದಿಗಳೇ ಇಷ್ಟ." },
  cta: { title: "ನಿಮ್ಮ ಕಥೆ ಯಾರಿಗಾದರೂ ಎಚ್ಚರಿಕೆಯ ಸಂಕೇತ ಆಗಬಹುದು.", copy: "ಸುಮಾರು 30 ಸೆಕೆಂಡ್. ಅನಾಮಧೇಯ. ಮುಂದಿನ ಅಭ್ಯರ್ಥಿ ಅದೇ ತಿರುವು ತಪ್ಪಿಸಲು ಸಹಾಯ ಮಾಡುತ್ತದೆ.", share: "ನನ್ನ ಅನುಭವ ಹಂಚಿಕೊಳ್ಳಿ" },
};

// ---------- Hinglish (machine translated, to verify) ----------
const hinglish: Partial_ = {
  rotating: ["apply karne se pehle.", "round six se pehle.", "take-home se pehle.", "ghost hone se pehle.", "“call karenge” se pehle.", "seen pe chhodne se pehle.", "offer palatne se pehle.", "salary “vibes” bane usse pehle.", "HR chup ho usse pehle.", "fake job se pehle."],
  marquee: ["‘Competitive pay’ koi number nahi hai", "Chhe rounds matlab hostage situation", "Tumhara take-home unka roadmap nahi hai", "Rejection bhi ek reply hai", "Urgent hai toh ghost kyun kar rahe ho?", "Vibes koi benefits package nahi", "Pizza Friday raise nahi hai", "“Hum ek family hain”, toh family jaisi salary do", "10:02 pe seen. Reply kabhi nahi."],
  stats: {
    "anonymous by default": "by default anonymous", "recruiters with admin access": "recruiters jinke paas admin access hai", "to join. Free, forever": "join karne ke liye. Hamesha free",
    "story needed to warn someone": "story kaafi hai kisi ko warn karne ke liye", "hiring story shared": "hiring story share hui", "hiring stories shared": "hiring stories share hui",
    "company on Ghosted": "company Ghosted pe", "companies on Ghosted": "companies Ghosted pe", "of candidates got any reply": "candidates ko koi reply mila",
    "median wait for a reply": "reply ka median wait", "companies can pay to change a score": "companies score badalne ke liye pay kar sakti hain",
  },
  how: { eyebrow: "No corporate bakwaas", title: "Hiring ki asli kahani, bina HR filter ke.", steps: [
    { title: "Poori kahani batao", copy: "Timeline, salary ka palatna, aur woh ‘quick chat’ jo poori dopahar kha gayi." },
    { title: "Reality ko rate karo", copy: "Replies, pay, culture, aur kya kisi ko tumhara naam yaad tha, sabko score do." },
    { title: "Kisi aur ko bachao", copy: "Ek honest post kisi ko chhe rounds aur ek surprise deck se bacha sakti hai." },
  ] },
  meter: {
    eyebrow: "Ghost-o-meter", title: "Tum exactly kitne ghost hue ho?",
    aside: "Slide karke batao “we'll get back to you” bole kitne din ho gaye. Hum batayenge tum kahan khade ho, aur bhejne ke liye ek follow-up denge.",
    step1: "Step 1 · Unke last reply se din", day: "din", days: "din", fewer: "Ek din kam", more: "Ek din zyada",
    status: "Tumhara status", step2: "Step 2 · Khud se reply karne ke chances", fade: "Jitna unka interest kam, utna ghost dhundhla.",
    step3: "Step 3 · Unhe yeh follow-up bhejo", copied: "Copy ho gaya. Email mein paste karo", copy: "Yeh message copy karo",
    stages: [
      { name: "Abhi saans chal rahi hai", verdict: "Shayad bas schedule kar rahe hain. Shayad." },
      { name: "Thoda bhootiya", verdict: "Read receipts on. Replies off. Classic." },
      { name: "Poora ghost", verdict: "Role ‘on hold’ hai. Unka zameer bhi." },
      { name: "Fake job wali vibe", verdict: "Listing abhi bhi live hai. Headcount kabhi tha hi nahi." },
    ],
  },
  lookup: { title: "Dekho wahan baaki candidates ke saath kya hua", copy: "Company search karo. Account ki zaroorat nahi." },
  tools: {
    title: "Abhi bhi seen pe? Hum hain na.", copy: "Pata karo tum impatient ho ya ghost ho gaye, phir woh follow-up bhejo jo hafte bhar se dimaag mein likh rahe ho.",
    rounds: { application: "Apply kiya", screening: "Recruiter call", technical: "Technical round", final: "Final round", offer: "Offer ki baat" },
    what: { application: "application pe reply aane", screening: "recruiter call ke baad reply", technical: "technical round ke baad reply", final: "final round ke baad decision", offer: "offer ki baat ke dauraan reply" },
    checkTitle: "Kya main overthink kar raha hoon?", checkCopy: "Batao kahan atke ho aur kab se. Hum batayenge yeh patience ka scene hai ya ghost ka.",
    where: "Unhone tumhe kahan chhoda?", silence: "Kitne din se sannata", inboxOne: "din se inbox ghoor rahe ho", inboxMany: "din se inbox ghoor rahe ho",
    dot: "Dot batata hai {what} mein usually kitna time lagta hai. Bar tum ho.", verdict: "Faisla", todo: "Kya karna hai: ",
    v0: { title: "Syahi abhi geeli hai", copy: "Unhone aaj hi reply kiya. Tab band karo, paani piyo, life jiyo.", next: "Abhi kuch karne ki zaroorat nahi." },
    v1: { title: "Chill karo, yeh normal hai", copy: "Is round mein reply aane mein usually around {usual} din lagte hain. Aaj din {days} hai. Inbox refresh karne se jaldi nahi hoga (humne check kiya).", next: "Din {usual} ke baad phir dekhna." },
    v2: { title: "Achha, ab slow ho raha hai", copy: "Din {days}, aur usually around {usual}. Abhi ghost nahi, par upar se kadmon ki awaaz zaroor aa rahi hai.", next: "Ek chhota, polite follow-up bhejo. Polite poke likh dega." },
    v3: { title: "Boo! Tum ghost ho gaye", copy: "Din {days}, usual {usual} se double se bhi zyada. Ab unki chuppi hi jawab hai, bas bolne mein sharma rahe hain.", next: "Closure ke liye ek baar follow-up karo, phir woh energy agli application mein lagao." },
    pokeTitle: "Polite poke", pokeCopy: "Aisa follow-up jo keen lage, desperate nahi. Blanks bharo, mood chuno, copy karo.",
    company: "Company", companyHint: "jaise Acme", role: "Role", optional: "(optional)", roleHint: "jaise Product designer",
    last: "Last kya hua tha", ago: "Kitne din pehle?", mood: "Mood",
    moods: { warm: "Abhi bhi umeed hai", brief: "Short and sweet", firm: "Bas, bahut wait ho gaya" },
    copyPoke: "Poke copy karo", copiedPoke: "Copy ho gaya. Jao, jawab lo", englishNote: "Message English mein hi rehta hai, kyunki zyadatar recruiters English mein likhte hain.",
  },
  why: {
    eyebrow: "Yahan kyun post karein, wahan kyun nahi", title: "Tumhari story ek feed se behtar jagah deserve karti hai.",
    intro: "Tum ise us professional network pe post kar sakte ho jahan tumhara manager tumhe follow karta hai. Ya kisi badi review site pe jiska employer dashboard hai. Ya group chat mein jo Friday tak bhool jaata hai. Farak yeh hai.",
    places: [
      { name: "Professional network", quip: "Jahan tumhara boss, team aur har future recruiter tumhari posts padhta hai. Wahan honesty ki keemat hai." },
      { name: "Badi review sites", quip: "Jitni tumhare liye, utni hi employers ke liye bani hain. Profiles, dashboards, polished replies." },
      { name: "Group chat", quip: "Mast chai-gossip, Friday tak gayab. Interview se pehle koi dhoondh nahi paata." },
    ],
    rows: [
      { topic: "Tumhari identity", elsewhere: "Usually tumhara asli naam aur photo, ya aisa account jo tum tak trace ho sake.", ghosted: "By default anonymous. Tumhara naam encrypted hai, aur tabhi dikhta hai jab tum public hona chuno." },
      { topic: "Control kiske haath", elsewhere: "Aksar sab ya kuch nahi: public, ya post hi mat karo.", ghosted: "Exactly chuno kaunsi details dikhein (naam, role, city, LinkedIn), aur kabhi bhi wapas switch karo." },
      { topic: "Paisa kaun deta hai", elsewhere: "Aksar employer products se chalti hain, jo tumhari side hone jaisa nahi hai.", ghosted: "Companies humein kisi story ko chhupane, edit karne, dabane ya boost karne ke paise nahi de sakti. Kabhi nahi." },
      { topic: "Kya tum check kar sakte ho?", elsewhere: "Closed code. Tumhara data kaise handle hota hai, unki baat maanni padti hai.", ghosted: "Open source. Koi bhi padh sakta hai ki tumhari identity kaise protect hoti hai." },
      { topic: "Kis cheez ke liye bana hai", elsewhere: "Workplaces ke liye generic star ratings.", ghosted: "Specifically hiring: rounds, chuppi ke din, posting vs pay, cancel hue offers." },
      { topic: "Shelf life", elsewhere: "Do din mein dab jaane wali post, ya scroll ho jaane wali chat.", ghosted: "Har story company se pinned rehti hai, taaki agla candidate interview se pehle use dhoondh le." },
      { topic: "Cost", elsewhere: "Padhna free, par best cheezein paywall ya sign-up wall ke peeche.", ghosted: "Padhna free, post karna free, hamesha free." },
    ],
    footnote: "Hum un jagahon ke types bata rahe hain jahan log usually post karte hain, kisi particular company ke baare mein nahi. Har platform alag hai, aur kuch inme se kaafi cheezein achhi karte hain.",
    elsewhereHead: "Kahin aur post karna", ghostedHead: "Ghosted pe post karna", elsewhere: "Kahin aur", ghosted: "Ghosted", seeCode: "Code dekho",
  },
  objection: {
    eyebrow: "Seedha sawaal", quote: "“Badi sites pe pehle se crores log hain. Wahan post kyun karein jahan koi nahi hai?”", answer: "Badhiya. Yahi toh point hai.",
    intro: "Crores users hi wajah hai ki tumhari story wahan kho jaati hai. Ghosted pe use kisi se compete nahi karna: woh company se pinned hai, aur us ek reader ka wait kar rahi hai jise uski sabse zyada zaroorat hai, woh agla candidate jo usi process mein jaane wala hai.",
    reasons: [
      { title: "Ek reader kaafi hai", copy: "Tumhari story viral hone wali post nahi hai. Yeh company ke naam ke neeche rakhi ek receipt hai, jo interview se pehle unhe search karne wale ko milti hai. Ek reader ke saath bhi kaam karti hai.", tag: "Pinned, dabi nahi" },
      { title: "Pehli receipt bano", copy: "Bheed wali site pe tum 4,000th review ho. Yahan tumhari story us company ki hiring ke baare mein sabse pehli cheez ho sakti hai, aur pehle din se uska Flag Score shape karti hai.", tag: "Pehli stories sabse zyada count" },
      { title: "Kisi aur ke join karne se pehle bhi kaam ka", copy: "Waiting Room tumhari har application track karta hai jiska wait hai, chuppi ke din ginta hai aur batata hai kab follow-up fair hai. Yeh tab bhi kaam karta hai jab yahan sirf tum ho.", tag: "Day one se value" },
      { title: "Woh kuch aur measure karte hain", copy: "Badi review sites company mein kaam karne ko rate karti hain, andar aane ke baad. Dard wala hissa koi record nahi karta: rounds, bina reply ke din, posting vs pay, cancel offers, kabhi na rahi jobs.", tag: "Specifically hiring" },
      { title: "Koi blowback nahi, kabhi nahi", copy: "Professional network woh jagah hai jahan tumhara manager, team aur har future recruiter tumhari posts padhta hai. Yahan tum by default anonymous ho, aur tumhari story tum tak nahi pahunchti.", tag: "Bina keemat ki honesty" },
      { title: "Shuru se clean", copy: "Goofy, hamara AutoMod, kuch bhi post hone se pehle gaali-galoch hatata hai, logon ke naam chhupata hai aur allegations check karta hai, taaki yahan jo padho us pe bharosa kar sako, shuruaat mein bhi.", tag: "Pehli post se moderated" },
    ],
    timeline: [
      { when: "Aaj", what: "Tum anonymously, lagbhag teen minute mein batate ho kya hua." },
      { when: "Agle hafte", what: "Us company ko search karne wala koi apne final round se pehle ise padh leta hai." },
      { when: "Agle mahine", what: "Kuch aur stories aati hain, aur company ka asli Flag Score banta hai." },
      { when: "Agle saal", what: "Koi bhi us process mein andhere mein nahi jaata." },
    ],
    closer: { line: "Crores users wale har platform ki shuruaat pehle hazaar se hui thi.", punch: "Un pehle hazaar mein aao jo hiring ko honest banate hain.", cta: "Pehli receipt share karo" },
    goal: {
      title: "Hamara goal: bina frustration ki hiring",
      lead: "Ghosted tumhe kisi job se darane ke liye nahi hai. Yeh isliye hai ki tum aankhein khol ke apply karo, aur logon ka time waste karne wale processes pe finally badalne ka pressure aaye.",
      points: [
        { title: "Confidence se apply karo", copy: "Shuru karne se pehle rounds, usual wait aur asli pay jaano, taaki process mein kuch bhi surprise na lage." },
        { title: "Bure processes ko push back karo", copy: "Endless rounds, bina paise ke ‘assignments’, final interview ke baad chuppi: jab sabke saamne likha ho, toh ise continue karna mushkil ho jaata hai." },
        { title: "Achhe employers ko credit do", copy: "Jo companies jaldi reply karti hain aur candidates ke saath achha behave karti hain, woh upar aati hain. Yahan green flags bhi utne hi loud hain jitne red." },
        { title: "Candidates ka josh bana rahe", copy: "Rejection ya ghosting process ke baare mein zyada batata hai, tumhare baare mein kam. Yeh dekhna ki baakiyon ke saath bhi hua, apply karte rehna aasaan banata hai." },
      ],
    },
    compounds: "Ek story kya karti hai",
  },
  proofs: {
    eyebrow: "Chhote red flags, bade plot twists", title: "Woh baatein jo woh bade aaram se batana bhool jaate hain.", aside: "JD mein likha tha “fast-paced”. Yeh nahi likha tha ki kisi ke paas map nahi tha.",
    items: [
      { title: "Salary range", expected: "Posted: ₹18–24 LPA", reality: "Offered: ‘Pehle dekhte hain tum kaisa perform karte ho.’" },
      { title: "Take-home", expected: "Estimated: 90 minute", reality: "Included: strategy, design, code, deployment, emotional damage." },
      { title: "Follow-up", expected: "Bheja: Tuesday", reality: "Status: spiritually delivered." },
    ],
  },
  flags: {
    eyebrow: "Hall of Flags", title: "Receipts, rank ke saath.", aside: "Community scores, employer-sponsored vibes nahi.",
    emptyTitle: "Board pe pehli company lao.", emptyCopy: "Har company ka Flag Score candidates ke experiences se banta hai. Tumhara bas 30 second leta hai, aur tum Ghosted ki pehli 50 awaazon mein ho sakte ho.",
    decent: "Sach mein theek-thaak", snacks: "Snacks leke jaana", nobody: "Abhi yahan koi nahi.",
  },
  invite: { title: "Ek awaaz lao, saath mein level up karo.", copy: "Kisi aise ko invite karo jo hiring process se guzra ho. Jab woh apna experience share karte hain, tum dono Invite Level 1 pe pahunchte ho aur avatar pe ek ring milti hai. Level 2 aur 3, 3 aur 10 friends pe. Na paisa, na spam, kisi ko pata nahi chalta tum kaun ho.", cta: "Invites kaise kaam karte hain" },
  pitch: {
    eyebrow: "Hamari baat", headline: ["Sab job ko rate karte hain.", "Hiring ko koi nahi."],
    manifesto: ["Tumne unhe chhe rounds diye.", "Poore weekend ka “do ghante ka” assignment.", "Tumhara notice period, references, tumhari umeedein.", "Unhone tumhe chuppi di.", "Ghosted woh jagah hai jahan us chuppi ko finally score milta hai."],
    pillars: [
      { title: "Receipts, ratings nahi", copy: "Ek aur five-star vibe check nahi. Rounds, wait ke din, posting vs pay, wapas liye offers. Wahi cheezein jo decide karti hain ki tumhe apply karna chahiye ya nahi.", statLabel: "cheezein jo hum score karte hain, 1 star rating nahi" },
      { title: "Design se anonymous", copy: "Tumhara naam encrypted hai, handle random hai, aur tumhari anonymous posts tum tak nahi pahunchti. Credit chahiye tabhi public bano.", statLabel: "naam dikhte hain jab tak tum na bolo" },
      { title: "Koi bikau nahi", copy: "Koi employer dashboard nahi. Koi paid profile polish nahi. Budget wale ke liye “yeh review hatao” button nahi. Aur code open hai, check kar sakte ho.", statLabel: "companies score badalne ke liye pay kar sakti hain" },
    ],
    closer: { line: "Recruiters ke paas ATS software, hiring managers aur poori HR team hai.", punch: "Candidates ke paas finally Ghosted hai.", cta: "Receipts club join karo" },
  },
  mine: {
    eyebrow: "Interview gauntlet", title: "Kya tum ek hiring process survive kar paoge?",
    aside: "Har tile process ka ek step hai. Zyadatar theek hain. Kuch red flags hain, aur recruiter tum pe apna best move chalayega. Offer tak pahunchne ke liye board clear karo. Teen red flags aur tum out, bilkul real life jaise.",
    gauntlet: ["Apply kiya", "Screening call", "Take-home", "Tech round", "Final round", "Offer"],
    won: "Offer haath mein! “Final approvals” pending hain, obviously.", lost: "Teen red flags. Woh “other candidates ke saath aage badh gaye”.",
    idle: "Application bhejne ke liye koi bhi tile tap karo. Pehla step hamesha safe hai.", playing: "Har number batata hai bagal mein kitne red flags chhupe hain. Green tick matlab har padosi safe hai.",
    patience: "Bacha hua patience", cleared: "Clear tiles", log: "Thappad log", slapOne: "thappad", slapMany: "thappad",
    clean: "Ab tak clean record. Jab tak HR chhutti pe hai, enjoy karo.", again: "Phir se apply karo (karoge hi)", restart: "Phir se shuru karo",
    endWon: "Badhiya khela. Par real processes mein tiles pe number nahi hote.", endLost: "Real candidates in pe pehle hi pair rakh chuke hain. Apply karne se pehle map dekho.",
    search: "Company search karo", shareRun: "Apna real run share karo",
  },
  wall: { eyebrow: "Community se fresh", title: "Story wall.", add: "Apni add karo", loading: "Latest stories load ho rahi hain…", firstTitle: "Pehli 50 awaazon mein aao.", firstCopy: "Experience share karne wale pehle 50 log hi Ghosted ko baad mein aane wale sabke liye useful banate hain. Kuch answers tap karo aur ho gaya.", readMore: "Aur padho" },
  privacy: { title1: "By default anonymous.", title2: "Specific tumhari marzi se.", copy: "Har detail ka apna switch hai. Apna role, experience ya LinkedIn tabhi dikhao jab spotlight chahiye; sab off rakho aur tum poore anonymous ho. Humein waise bhi receipts zyada pasand hain." },
  cta: { title: "Tumhari story kisi ke liye warning sign ban sakti hai.", copy: "Lagbhag 30 second. Anonymous. Agle candidate ko wahi plot twist se bachati hai.", share: "Apna experience share karo" },
};

const DICTS: Record<Lang, Partial_ | null> = { en: null, hi, kn, hinglish };

// Deep merge with English as the base: objects by key, arrays by position, strings replaced.
export function merge<T>(base: T, over: unknown): T {
  if (over === undefined || over === null) return base;
  if (Array.isArray(base)) return base.map((b, i) => merge(b, (over as unknown[])[i])) as T;
  if (typeof base === "object" && base !== null) {
    const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
    for (const k of Object.keys(over as object)) out[k] = k in out ? merge(out[k], (over as Record<string, unknown>)[k]) : (over as Record<string, unknown>)[k];
    return out as T;
  }
  return (typeof over === typeof base ? over : base) as T;
}

const cache = new Map<Lang, LandingCopy>();
export function landingCopy(lang: Lang): LandingCopy {
  if (!cache.has(lang)) cache.set(lang, DICTS[lang] ? merge(en, DICTS[lang]) : en);
  return cache.get(lang)!;
}

export const fill = (s: string, vars: Record<string, string | number>) => Object.entries(vars).reduce((acc, [k, v]) => acc.replaceAll(`{${k}}`, String(v)), s);

export function useLanding() { return landingCopy(usePrefs().lang); }
