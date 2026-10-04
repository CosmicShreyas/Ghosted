// The story form ("Share a story") in every interface language. Same rules as landing-copy.ts:
// English is the base, each language overrides what it has, anything missing falls back to English.
// Pairs written { sassy, calm } follow the tone setting.
//
// Not translated on purpose: the automatic title and the quick-story text. They become the public
// story itself, so they stay in the language stories are read in (English) until quick stories exist
// per language. Prompt headings ARE translated: they're inserted into your own words, in your language.
//
// Every Hindi, Kannada and Hinglish line is machine translated until a native speaker checks it
// (tracked in src/content/i18n-review.md).
import { usePrefs, type Lang } from "@/lib/prefs";
import { merge, type DeepPartial } from "@/content/landing-copy";

type Pair = { sassy: string; calm: string };

const en = {
  steps: { what: "What happened", details: "The details", words: "In your words", post: "Review and post" },
  stepOf: "Step {n} of {total}", progress: "Progress",
  stages: { application: "Applied", screening: "Screening call", technical: "Technical round", final: "Final round", offer: "Offer stage" },
  outcomes: {
    ghosted: { label: "Ghosted", blurb: "They stopped replying" },
    rejected: { label: "Rejected", blurb: "A no, at least" },
    ghost_job: { label: "Ghost job", blurb: "The role never really existed" },
    offer_revoked: { label: "Offer revoked", blurb: "Offered, then un-offered" },
    offer: { label: "Got an offer", blurb: "The rare happy ending" },
  },
  ratings: {
    hiring: { label: "Hiring process", hint: "Clear, fair, well organised?" },
    communication: { label: "Communication", hint: "Did they reply, and on time?" },
    pay: { label: "Pay transparency", hint: "Was the salary discussed honestly?" },
    culture: { label: "Work culture", hint: "Respectful? Good to work in?" },
    growth: { label: "Growth", hint: "Is the role going somewhere?" },
  },
  stars: ["", "Awful", "Poor", "Okay", "Good", "Great"], starOf: "{n} of 5: {word}",
  waits: ["Under a week", "1 to 2 weeks", "2 to 4 weeks", "1 to 2 months", "2+ months"],
  titles: {
    what: { t: { sassy: "What happened?", calm: "What happened?" }, s: { sassy: "Start with how it ended. Everything after fits around it.", calm: "Choose how it ended, then the company." } },
    details: { t: { sassy: "The details", calm: "The details" }, never: { sassy: "A few taps. Only what fits what happened to you.", calm: "Only the questions that fit your experience." }, other: { sassy: "Rate what you actually saw. Nothing you didn't.", calm: "Only the questions that fit your experience." } },
    words: { t: { sassy: "In your words", calm: "In your words" }, s: { sassy: "Write as much or as little as you like. Or skip it.", calm: "Add your story, or post a quick one from your answers." } },
    edit: { t: { sassy: "Looking sharper?", calm: "Review your changes" }, s: { sassy: "Save it and your story gets a little Edited badge.", calm: "Saving marks the story as edited." } },
    post: { t: { sassy: "Looks good?", calm: "Review and post" }, s: { sassy: "One quick look, then it's out there helping people.", calm: "Check your story, then post it." } },
  },
  how: "How did it end?", joined: "Did you join?", joinedYes: "Yes, I joined", joinedNo: "No, I declined or didn't join",
  company: "Which company?", companyLocked: "Can't be changed on an existing story", notListed: "Not listed? List it", listQ: "List “{q}” on Ghosted", chooseCompany: "Choose the company",
  role: "Your role", optional: "Optional", roleHint: "e.g. Frontend Engineer",
  quiet: { rejected: "Where were you rejected?", ghost_job: "How far did you get?", other: "Where did they go quiet?" },
  waitQ: { rejected: "How long until they told you?", other: "How long did you wait?" }, exact: "Exact days", exactHint: "e.g. 18", exactLabel: "Exact days waited",
  atOffer: "{outcome} at the offer stage{company}.", withCo: " with {name}",
  rateAll: { sassy: "Rate {all} below and watch your Flag Score appear.", calm: "Rate {all} to see the Flag Score your story gives this company." },
  both: { sassy: "both", calm: "both areas" }, allN: { sassy: "all {n}", calm: "all {n} areas" },
  gives: "Your story gives {company} a {score}. It's averaged with everyone else's.", them: "them",
  payHint: "Optional, but it helps the next person a lot", payYours: "Your pay range", payOffered: "The offered pay", addYours: "Add your pay range", addOffered: "Add the offered pay",
  min: "Min (₹ LPA)", max: "Max (₹ LPA)",
  quick: { sassy: "Skip the writing, post as a quick story", calm: "Post as a quick story instead" }, quickNote: "We'll write a short, plain story from your answers. No names, nothing added.",
  title: "Title", tell: "Tell the story", moreToGo: "{n} more to go",
  prompts: {
    ghosted: ["What they said last", "How many rounds", "How you followed up", "What would have helped"],
    rejected: ["How many rounds", "What they asked", "The reason they gave", "What would have helped"],
    ghost_job: ["Where you saw the post", "Signs it wasn't real", "What would have helped"],
    offer_revoked: ["What the offer was", "How they took it back", "The reason they gave", "What would have helped"],
    offer: ["How many rounds", "What they asked", "What would have helped"],
    joined: ["How many rounds", "What it's like now", "Tip for the next candidate"],
  },
  placeholder: {
    ghosted: { sassy: "Where did it go quiet? What was the last thing they said, and how did you follow up? No names of individuals.", calm: "Where did it go quiet, what was the last message, and did you follow up? Please don't name individuals." },
    rejected: { sassy: "How many rounds, what did they ask, and did they give a reason? No names of individuals.", calm: "How many rounds, what they asked, and whether they gave a reason. Please don't name individuals." },
    ghost_job: { sassy: "Where did you see the post, and what made it feel fake? No names of individuals.", calm: "Where you saw the role, and what suggested it wasn't real. Please don't name individuals." },
    offer_revoked: { sassy: "What was offered, how did they take it back, and what reason did they give? No names of individuals.", calm: "What the offer was, how it was withdrawn, and the reason given. Please don't name individuals." },
    offer: { sassy: "How did the process go, and what should the next candidate know? No names of individuals.", calm: "How the process went and what the next candidate should know. Please don't name individuals." },
  },
  markdown: "Markdown works:", markdownTips: "# headings, **bold**, _italic_, - lists, > quotes", structure: "Give me a structure",
  write: "Write", preview: "Preview", nothingPreview: "Nothing to preview yet.",
  tools: { bold: "Bold", italic: "Italic", strike: "Strikethrough", heading: "Heading", bullets: "Bullet list", numbers: "Numbered list", quote: "Quote", code: "Inline code", block: "Code block" },
  review: { sassy: "Here's exactly how it'll look in the feed. Last chance to fix that typo.", calm: "This is how your story will appear in the feed." },
  about: "about", aCompany: "a company", justNow: "just now", reword: "Try different wording",
  scoreLine: "Flag Score from this story:", waited: "waited {wait}",
  postingAs: "Posting as {name}", publicNote: "Your public details show on all your stories.", anonNote: "You're anonymous: only your handle and avatar show.", changeNote: "Change it any time in Settings.",
  restored: { sassy: "Picked up where you left off. Your draft was waiting.", calm: "Your saved draft has been restored." }, startOver: "Start over",
  back: "Back", editingNote: "Editing your story", draftSaved: "Draft saved",
  save: "Save changes", saving: "Saving…", post: "Post story", posting: "Posting…", checking: "Checking you're human…",
  problems: {
    outcome: "Pick how it ended", joined: "Tell us whether you joined", company: "Pick the company", stage: "Pick how far you got", rate: "Rate the {what}",
    bothPay: "Add both pay numbers, or neither", maxMin: "The max should be at least the min", payOff: "That pay looks off (in LPA)", daysRange: "Days waited should be 0 to 730",
    title: "Give it a title (at least 5 characters)", body: "Tell the story ({n} more characters), or post a quick story",
  },
  done: {
    title: { sassy: "Receipts filed.", calm: "Story shared." },
    copy: { sassy: "Now get it in front of the next candidate. The card never shows who you are.", calm: "Thank you. Share the card below; it never shows who you are." },
    preview: "Preview mode: stories aren't saved here.", another: "Share another", feed: "Back to the feed",
  },
  toasts: {
    updated: { sassy: "Story updated. The record has been set straight.", calm: "Your changes have been saved." },
    previewSaved: "Changes saved. (Preview mode: they aren't stored.)", saveFail: "Couldn't save your changes. Try again.", postFail: "Couldn't share right now. Your draft is saved; try again.",
  },
};

export type ComposerCopy = typeof en;
type P = DeepPartial<ComposerCopy>;

// ---------- Hindi (machine translated, to verify) ----------
const hi: P = {
  steps: { what: "क्या हुआ", details: "बारीकियाँ", words: "आपके शब्दों में", post: "देखें और पोस्ट करें" },
  stepOf: "स्टेप {n} / {total}", progress: "प्रगति",
  stages: { application: "अप्लाई किया", screening: "स्क्रीनिंग कॉल", technical: "टेक्निकल राउंड", final: "फ़ाइनल राउंड", offer: "ऑफ़र स्टेज" },
  outcomes: {
    ghosted: { label: "घोस्ट किया", blurb: "उन्होंने जवाब देना बंद कर दिया" }, rejected: { label: "रिजेक्ट", blurb: "कम से कम एक 'ना' तो मिला" },
    ghost_job: { label: "नकली जॉब", blurb: "रोल असल में कभी था ही नहीं" }, offer_revoked: { label: "ऑफ़र वापस लिया", blurb: "ऑफ़र दिया, फिर छीन लिया" },
    offer: { label: "ऑफ़र मिला", blurb: "दुर्लभ हैप्पी एंडिंग" },
  },
  ratings: {
    hiring: { label: "हायरिंग प्रोसेस", hint: "साफ़, निष्पक्ष, व्यवस्थित?" }, communication: { label: "बातचीत", hint: "क्या उन्होंने समय पर जवाब दिया?" },
    pay: { label: "सैलरी में पारदर्शिता", hint: "क्या सैलरी पर ईमानदारी से बात हुई?" }, culture: { label: "वर्क कल्चर", hint: "सम्मानजनक? काम करने लायक?" },
    growth: { label: "ग्रोथ", hint: "क्या रोल आगे बढ़ाता है?" },
  },
  stars: ["", "बहुत बुरा", "ख़राब", "ठीक", "अच्छा", "बढ़िया"], starOf: "5 में से {n}: {word}",
  waits: ["एक हफ़्ते से कम", "1 से 2 हफ़्ते", "2 से 4 हफ़्ते", "1 से 2 महीने", "2+ महीने"],
  titles: {
    what: { t: { sassy: "क्या हुआ?", calm: "क्या हुआ?" }, s: { sassy: "शुरुआत अंत से कीजिए। बाक़ी सब उसी के हिसाब से।", calm: "चुनिए कैसे ख़त्म हुआ, फिर कंपनी।" } },
    details: { t: { sassy: "बारीकियाँ", calm: "बारीकियाँ" }, never: { sassy: "बस कुछ टैप। सिर्फ़ वही जो आपके साथ हुआ।", calm: "सिर्फ़ वे सवाल जो आपके अनुभव पर लागू हैं।" }, other: { sassy: "जो देखा वही रेट कीजिए। जो नहीं देखा, वह नहीं।", calm: "सिर्फ़ वे सवाल जो आपके अनुभव पर लागू हैं।" } },
    words: { t: { sassy: "आपके शब्दों में", calm: "आपके शब्दों में" }, s: { sassy: "जितना चाहें उतना लिखिए। या छोड़ दीजिए।", calm: "अपनी कहानी लिखिए, या जवाबों से एक क्विक स्टोरी पोस्ट कीजिए।" } },
    edit: { t: { sassy: "अब बेहतर लग रहा है?", calm: "बदलाव देखें" }, s: { sassy: "सेव कीजिए, और कहानी पर छोटा सा 'एडिटेड' बैज लग जाएगा।", calm: "सेव करने पर कहानी 'एडिटेड' दिखेगी।" } },
    post: { t: { sassy: "ठीक लग रहा है?", calm: "देखें और पोस्ट करें" }, s: { sassy: "एक नज़र, फिर यह लोगों की मदद करने निकल पड़ेगी।", calm: "अपनी कहानी जाँचिए, फिर पोस्ट कीजिए।" } },
  },
  how: "यह कैसे ख़त्म हुआ?", joined: "क्या आपने जॉइन किया?", joinedYes: "हाँ, जॉइन किया", joinedNo: "नहीं, मना किया या जॉइन नहीं किया",
  company: "कौन सी कंपनी?", companyLocked: "मौजूदा कहानी पर बदला नहीं जा सकता", notListed: "लिस्ट में नहीं? जोड़िए", listQ: "“{q}” को Ghosted पर जोड़ें", chooseCompany: "कंपनी चुनें",
  role: "आपका रोल", optional: "वैकल्पिक", roleHint: "जैसे Frontend Engineer",
  quiet: { rejected: "किस स्टेज पर रिजेक्ट हुए?", ghost_job: "आप कितनी दूर तक पहुँचे?", other: "किस स्टेज पर वे चुप हो गए?" },
  waitQ: { rejected: "बताने में कितना समय लगा?", other: "आपने कितना इंतज़ार किया?" }, exact: "सटीक दिन", exactHint: "जैसे 18", exactLabel: "सटीक इंतज़ार के दिन",
  atOffer: "ऑफ़र स्टेज पर {outcome}{company}।", withCo: ", {name} के साथ",
  rateAll: { sassy: "नीचे {all} को रेट कीजिए और अपना फ़्लैग स्कोर देखिए।", calm: "{all} को रेट कीजिए और देखिए आपकी कहानी इस कंपनी को कौन सा फ़्लैग स्कोर देती है।" },
  both: { sassy: "दोनों", calm: "दोनों हिस्सों" }, allN: { sassy: "सभी {n}", calm: "सभी {n} हिस्सों" },
  gives: "आपकी कहानी {company} को {score} देती है। यह सबके स्कोर के साथ औसत होता है।", them: "उन्हें",
  payHint: "वैकल्पिक, पर अगले व्यक्ति की बहुत मदद करता है", payYours: "आपकी सैलरी रेंज", payOffered: "ऑफ़र की गई सैलरी", addYours: "अपनी सैलरी रेंज जोड़ें", addOffered: "ऑफ़र की गई सैलरी जोड़ें",
  min: "न्यूनतम (₹ LPA)", max: "अधिकतम (₹ LPA)",
  quick: { sassy: "लिखना छोड़िए, क्विक स्टोरी पोस्ट कीजिए", calm: "इसकी जगह क्विक स्टोरी पोस्ट करें" }, quickNote: "हम आपके जवाबों से एक छोटी, सीधी कहानी लिखेंगे (अंग्रेज़ी में)। कोई नाम नहीं, कुछ जोड़ा नहीं।",
  title: "शीर्षक", tell: "कहानी बताइए", moreToGo: "{n} और बाक़ी",
  prompts: {
    ghosted: ["उन्होंने आख़िर में क्या कहा", "कितने राउंड हुए", "आपने कैसे फ़ॉलो-अप किया", "क्या मदद करता"],
    rejected: ["कितने राउंड हुए", "उन्होंने क्या पूछा", "उन्होंने क्या वजह बताई", "क्या मदद करता"],
    ghost_job: ["पोस्ट कहाँ देखी", "नकली होने के संकेत", "क्या मदद करता"],
    offer_revoked: ["ऑफ़र क्या था", "उन्होंने कैसे वापस लिया", "उन्होंने क्या वजह बताई", "क्या मदद करता"],
    offer: ["कितने राउंड हुए", "उन्होंने क्या पूछा", "क्या मदद करता"],
    joined: ["कितने राउंड हुए", "अब कैसा है", "अगले उम्मीदवार के लिए टिप"],
  },
  placeholder: {
    ghosted: { sassy: "बात कहाँ रुक गई? उन्होंने आख़िरी बार क्या कहा, और आपने कैसे फ़ॉलो-अप किया? किसी व्यक्ति का नाम नहीं।", calm: "बात कहाँ रुकी, आख़िरी मैसेज क्या था, और क्या आपने फ़ॉलो-अप किया? कृपया किसी व्यक्ति का नाम न लें।" },
    rejected: { sassy: "कितने राउंड, क्या पूछा, और कोई वजह दी? किसी व्यक्ति का नाम नहीं।", calm: "कितने राउंड, क्या पूछा, और क्या वजह दी गई। कृपया किसी व्यक्ति का नाम न लें।" },
    ghost_job: { sassy: "पोस्ट कहाँ देखी, और क्या नकली लगा? किसी व्यक्ति का नाम नहीं।", calm: "रोल कहाँ देखा, और किस बात से लगा कि यह असली नहीं था। कृपया किसी व्यक्ति का नाम न लें।" },
    offer_revoked: { sassy: "क्या ऑफ़र हुआ, कैसे वापस लिया, और क्या वजह दी? किसी व्यक्ति का नाम नहीं।", calm: "ऑफ़र क्या था, कैसे वापस लिया गया, और क्या वजह दी गई। कृपया किसी व्यक्ति का नाम न लें।" },
    offer: { sassy: "प्रोसेस कैसा रहा, और अगले उम्मीदवार को क्या पता होना चाहिए? किसी व्यक्ति का नाम नहीं।", calm: "प्रोसेस कैसा रहा और अगले उम्मीदवार को क्या जानना चाहिए। कृपया किसी व्यक्ति का नाम न लें।" },
  },
  markdown: "Markdown चलता है:", structure: "मुझे एक ढाँचा दीजिए",
  write: "लिखें", preview: "प्रीव्यू", nothingPreview: "अभी दिखाने को कुछ नहीं।",
  tools: { bold: "बोल्ड", italic: "इटैलिक", strike: "स्ट्राइकथ्रू", heading: "हेडिंग", bullets: "बुलेट लिस्ट", numbers: "नंबर लिस्ट", quote: "कोट", code: "इनलाइन कोड", block: "कोड ब्लॉक" },
  review: { sassy: "फ़ीड में बिल्कुल ऐसी दिखेगी। टाइपो ठीक करने का आख़िरी मौक़ा।", calm: "फ़ीड में आपकी कहानी ऐसी दिखेगी।" },
  about: "के बारे में", aCompany: "एक कंपनी", justNow: "अभी", reword: "दूसरे शब्द आज़माएं",
  scoreLine: "इस कहानी से फ़्लैग स्कोर:",
  postingAs: "{name} के रूप में पोस्ट कर रहे हैं", publicNote: "आपकी पब्लिक जानकारी आपकी सभी कहानियों पर दिखती है।", anonNote: "आप गुमनाम हैं: सिर्फ़ आपका हैंडल और अवतार दिखता है।", changeNote: "सेटिंग्स में कभी भी बदलिए।",
  restored: { sassy: "जहाँ छोड़ा था वहीं से। आपका ड्राफ़्ट इंतज़ार कर रहा था।", calm: "आपका सेव किया हुआ ड्राफ़्ट वापस आ गया है।" }, startOver: "फिर से शुरू करें",
  back: "पीछे", editingNote: "आपकी कहानी एडिट हो रही है", draftSaved: "ड्राफ़्ट सेव हुआ",
  save: "बदलाव सेव करें", saving: "सेव हो रहा है…", post: "कहानी पोस्ट करें", posting: "पोस्ट हो रही है…", checking: "जाँच रहे हैं कि आप इंसान हैं…",
  problems: {
    outcome: "चुनिए कैसे ख़त्म हुआ", joined: "बताइए आपने जॉइन किया या नहीं", company: "कंपनी चुनिए", stage: "चुनिए आप कितनी दूर पहुँचे", rate: "{what} को रेट कीजिए",
    bothPay: "दोनों सैलरी नंबर डालिए, या कोई नहीं", maxMin: "अधिकतम कम से कम न्यूनतम जितना होना चाहिए", payOff: "यह सैलरी सही नहीं लगती (LPA में)", daysRange: "इंतज़ार के दिन 0 से 730 होने चाहिए",
    title: "शीर्षक दीजिए (कम से कम 5 अक्षर)", body: "कहानी बताइए ({n} और अक्षर), या क्विक स्टोरी पोस्ट कीजिए",
  },
  done: {
    title: { sassy: "रसीद दर्ज हो गई।", calm: "कहानी साझा हो गई।" },
    copy: { sassy: "अब इसे अगले उम्मीदवार तक पहुँचाइए। कार्ड कभी नहीं दिखाता कि आप कौन हैं।", calm: "धन्यवाद। नीचे का कार्ड साझा कीजिए; यह कभी नहीं दिखाता कि आप कौन हैं।" },
    preview: "प्रीव्यू मोड: यहाँ कहानियाँ सेव नहीं होतीं।", another: "एक और साझा करें", feed: "फ़ीड पर वापस",
  },
  toasts: {
    updated: { sassy: "कहानी अपडेट हो गई। रिकॉर्ड सुधार दिया गया।", calm: "आपके बदलाव सेव हो गए।" },
    previewSaved: "बदलाव सेव हुए। (प्रीव्यू मोड: स्टोर नहीं होते।)", saveFail: "बदलाव सेव नहीं हो पाए। फिर कोशिश करें।", postFail: "अभी साझा नहीं हो पाया। आपका ड्राफ़्ट सेव है; फिर कोशिश करें।",
  },
};

// ---------- Kannada (machine translated, to verify) ----------
const kn: P = {
  steps: { what: "ಏನಾಯಿತು", details: "ವಿವರಗಳು", words: "ನಿಮ್ಮ ಮಾತಿನಲ್ಲಿ", post: "ಪರಿಶೀಲಿಸಿ ಮತ್ತು ಪೋಸ್ಟ್ ಮಾಡಿ" },
  stepOf: "ಹಂತ {n} / {total}", progress: "ಪ್ರಗತಿ",
  stages: { application: "ಅರ್ಜಿ ಹಾಕಿದೆ", screening: "ಸ್ಕ್ರೀನಿಂಗ್ ಕರೆ", technical: "ಟೆಕ್ನಿಕಲ್ ಸುತ್ತು", final: "ಅಂತಿಮ ಸುತ್ತು", offer: "ಆಫರ್ ಹಂತ" },
  outcomes: {
    ghosted: { label: "ಘೋಸ್ಟ್ ಮಾಡಿದರು", blurb: "ಉತ್ತರಿಸುವುದನ್ನು ನಿಲ್ಲಿಸಿದರು" }, rejected: { label: "ರಿಜೆಕ್ಟ್", blurb: "ಕನಿಷ್ಠ ಒಂದು 'ಇಲ್ಲ' ಸಿಕ್ಕಿತು" },
    ghost_job: { label: "ನಕಲಿ ಕೆಲಸ", blurb: "ಹುದ್ದೆ ನಿಜವಾಗಿ ಇರಲೇ ಇಲ್ಲ" }, offer_revoked: { label: "ಆಫರ್ ಹಿಂಪಡೆದರು", blurb: "ಆಫರ್ ಕೊಟ್ಟು, ನಂತರ ಹಿಂತೆಗೆದರು" },
    offer: { label: "ಆಫರ್ ಸಿಕ್ಕಿತು", blurb: "ಅಪರೂಪದ ಸುಖಾಂತ್ಯ" },
  },
  ratings: {
    hiring: { label: "ನೇಮಕಾತಿ ಪ್ರಕ್ರಿಯೆ", hint: "ಸ್ಪಷ್ಟ, ನ್ಯಾಯಯುತ, ವ್ಯವಸ್ಥಿತ?" }, communication: { label: "ಸಂವಹನ", hint: "ಸಮಯಕ್ಕೆ ಉತ್ತರಿಸಿದರೇ?" },
    pay: { label: "ಸಂಬಳದ ಪಾರದರ್ಶಕತೆ", hint: "ಸಂಬಳದ ಬಗ್ಗೆ ಪ್ರಾಮಾಣಿಕವಾಗಿ ಮಾತಾಡಿದರೇ?" }, culture: { label: "ಕೆಲಸದ ಸಂಸ್ಕೃತಿ", hint: "ಗೌರವಯುತ? ಕೆಲಸ ಮಾಡಲು ಒಳ್ಳೆಯದೇ?" },
    growth: { label: "ಬೆಳವಣಿಗೆ", hint: "ಹುದ್ದೆ ಮುಂದೆ ಕರೆದೊಯ್ಯುತ್ತದೆಯೇ?" },
  },
  stars: ["", "ತುಂಬಾ ಕೆಟ್ಟದು", "ಕಳಪೆ", "ಪರವಾಗಿಲ್ಲ", "ಒಳ್ಳೆಯದು", "ಅತ್ಯುತ್ತಮ"], starOf: "5 ರಲ್ಲಿ {n}: {word}",
  waits: ["ಒಂದು ವಾರಕ್ಕಿಂತ ಕಡಿಮೆ", "1 ರಿಂದ 2 ವಾರ", "2 ರಿಂದ 4 ವಾರ", "1 ರಿಂದ 2 ತಿಂಗಳು", "2+ ತಿಂಗಳು"],
  titles: {
    what: { t: { sassy: "ಏನಾಯಿತು?", calm: "ಏನಾಯಿತು?" }, s: { sassy: "ಹೇಗೆ ಮುಗಿಯಿತು ಎಂದು ಶುರು ಮಾಡಿ. ಉಳಿದದ್ದೆಲ್ಲಾ ಅದರ ಸುತ್ತ.", calm: "ಹೇಗೆ ಮುಗಿಯಿತು ಆರಿಸಿ, ನಂತರ ಕಂಪನಿ." } },
    details: { t: { sassy: "ವಿವರಗಳು", calm: "ವಿವರಗಳು" }, never: { sassy: "ಕೆಲವೇ ಟ್ಯಾಪ್. ನಿಮಗಾದದ್ದಕ್ಕೆ ಹೊಂದುವುದು ಮಾತ್ರ.", calm: "ನಿಮ್ಮ ಅನುಭವಕ್ಕೆ ಹೊಂದುವ ಪ್ರಶ್ನೆಗಳು ಮಾತ್ರ." }, other: { sassy: "ನೀವು ನೋಡಿದ್ದನ್ನು ಮಾತ್ರ ರೇಟ್ ಮಾಡಿ.", calm: "ನಿಮ್ಮ ಅನುಭವಕ್ಕೆ ಹೊಂದುವ ಪ್ರಶ್ನೆಗಳು ಮಾತ್ರ." } },
    words: { t: { sassy: "ನಿಮ್ಮ ಮಾತಿನಲ್ಲಿ", calm: "ನಿಮ್ಮ ಮಾತಿನಲ್ಲಿ" }, s: { sassy: "ಬೇಕಾದಷ್ಟು ಬರೆಯಿರಿ. ಅಥವಾ ಬಿಟ್ಟುಬಿಡಿ.", calm: "ನಿಮ್ಮ ಕಥೆ ಸೇರಿಸಿ, ಅಥವಾ ಉತ್ತರಗಳಿಂದ ಕ್ವಿಕ್ ಸ್ಟೋರಿ ಪೋಸ್ಟ್ ಮಾಡಿ." } },
    edit: { t: { sassy: "ಈಗ ಚೆನ್ನಾಗಿದೆಯಾ?", calm: "ಬದಲಾವಣೆಗಳನ್ನು ಪರಿಶೀಲಿಸಿ" }, s: { sassy: "ಸೇವ್ ಮಾಡಿ, ಕಥೆಗೆ ಚಿಕ್ಕ 'ಎಡಿಟೆಡ್' ಬ್ಯಾಡ್ಜ್ ಸಿಗುತ್ತದೆ.", calm: "ಸೇವ್ ಮಾಡಿದರೆ ಕಥೆ 'ಎಡಿಟೆಡ್' ಎಂದು ಕಾಣುತ್ತದೆ." } },
    post: { t: { sassy: "ಸರಿ ಅನಿಸುತ್ತಿದೆಯಾ?", calm: "ಪರಿಶೀಲಿಸಿ ಮತ್ತು ಪೋಸ್ಟ್ ಮಾಡಿ" }, s: { sassy: "ಒಮ್ಮೆ ನೋಡಿ, ನಂತರ ಅದು ಜನರಿಗೆ ಸಹಾಯ ಮಾಡಲು ಹೊರಡುತ್ತದೆ.", calm: "ನಿಮ್ಮ ಕಥೆ ಪರಿಶೀಲಿಸಿ, ನಂತರ ಪೋಸ್ಟ್ ಮಾಡಿ." } },
  },
  how: "ಇದು ಹೇಗೆ ಮುಗಿಯಿತು?", joined: "ನೀವು ಸೇರಿದಿರಾ?", joinedYes: "ಹೌದು, ಸೇರಿದೆ", joinedNo: "ಇಲ್ಲ, ನಿರಾಕರಿಸಿದೆ ಅಥವಾ ಸೇರಲಿಲ್ಲ",
  company: "ಯಾವ ಕಂಪನಿ?", companyLocked: "ಈಗಿರುವ ಕಥೆಯಲ್ಲಿ ಬದಲಿಸಲು ಸಾಧ್ಯವಿಲ್ಲ", notListed: "ಪಟ್ಟಿಯಲ್ಲಿಲ್ಲವೇ? ಸೇರಿಸಿ", listQ: "“{q}” ಅನ್ನು Ghosted ಗೆ ಸೇರಿಸಿ", chooseCompany: "ಕಂಪನಿ ಆರಿಸಿ",
  role: "ನಿಮ್ಮ ಹುದ್ದೆ", optional: "ಐಚ್ಛಿಕ", roleHint: "ಉದಾ. Frontend Engineer",
  quiet: { rejected: "ಯಾವ ಹಂತದಲ್ಲಿ ರಿಜೆಕ್ಟ್ ಆದಿರಿ?", ghost_job: "ಎಷ್ಟು ದೂರ ತಲುಪಿದಿರಿ?", other: "ಯಾವ ಹಂತದಲ್ಲಿ ಮೌನವಾದರು?" },
  waitQ: { rejected: "ತಿಳಿಸಲು ಎಷ್ಟು ಸಮಯ ತೆಗೆದುಕೊಂಡರು?", other: "ನೀವು ಎಷ್ಟು ಕಾದಿರಿ?" }, exact: "ನಿಖರ ದಿನಗಳು", exactHint: "ಉದಾ. 18", exactLabel: "ಕಾದ ನಿಖರ ದಿನಗಳು",
  atOffer: "ಆಫರ್ ಹಂತದಲ್ಲಿ {outcome}{company}.", withCo: ", {name} ಜೊತೆ",
  rateAll: { sassy: "ಕೆಳಗೆ {all} ರೇಟ್ ಮಾಡಿ, ನಿಮ್ಮ ಫ್ಲ್ಯಾಗ್ ಸ್ಕೋರ್ ಕಾಣಿಸುತ್ತದೆ.", calm: "ನಿಮ್ಮ ಕಥೆ ಈ ಕಂಪನಿಗೆ ಕೊಡುವ ಫ್ಲ್ಯಾಗ್ ಸ್ಕೋರ್ ನೋಡಲು {all} ರೇಟ್ ಮಾಡಿ." },
  both: { sassy: "ಎರಡನ್ನೂ", calm: "ಎರಡೂ ವಿಭಾಗಗಳನ್ನು" }, allN: { sassy: "ಎಲ್ಲಾ {n}", calm: "ಎಲ್ಲಾ {n} ವಿಭಾಗಗಳನ್ನು" },
  gives: "ನಿಮ್ಮ ಕಥೆ {company} ಗೆ {score} ಕೊಡುತ್ತದೆ. ಇದನ್ನು ಎಲ್ಲರ ಸ್ಕೋರ್ ಜೊತೆ ಸರಾಸರಿ ಮಾಡಲಾಗುತ್ತದೆ.", them: "ಅವರಿಗೆ",
  payHint: "ಐಚ್ಛಿಕ, ಆದರೆ ಮುಂದಿನವರಿಗೆ ತುಂಬಾ ಸಹಾಯ ಮಾಡುತ್ತದೆ", payYours: "ನಿಮ್ಮ ಸಂಬಳ ವ್ಯಾಪ್ತಿ", payOffered: "ಆಫರ್ ಮಾಡಿದ ಸಂಬಳ", addYours: "ನಿಮ್ಮ ಸಂಬಳ ವ್ಯಾಪ್ತಿ ಸೇರಿಸಿ", addOffered: "ಆಫರ್ ಮಾಡಿದ ಸಂಬಳ ಸೇರಿಸಿ",
  min: "ಕನಿಷ್ಠ (₹ LPA)", max: "ಗರಿಷ್ಠ (₹ LPA)",
  quick: { sassy: "ಬರೆಯುವುದು ಬೇಡ, ಕ್ವಿಕ್ ಸ್ಟೋರಿ ಪೋಸ್ಟ್ ಮಾಡಿ", calm: "ಬದಲಿಗೆ ಕ್ವಿಕ್ ಸ್ಟೋರಿ ಪೋಸ್ಟ್ ಮಾಡಿ" }, quickNote: "ನಿಮ್ಮ ಉತ್ತರಗಳಿಂದ ಚಿಕ್ಕ, ಸರಳ ಕಥೆ ಬರೆಯುತ್ತೇವೆ (ಇಂಗ್ಲಿಷ್‌ನಲ್ಲಿ). ಹೆಸರುಗಳಿಲ್ಲ, ಏನೂ ಸೇರಿಸಿಲ್ಲ.",
  title: "ಶೀರ್ಷಿಕೆ", tell: "ಕಥೆ ಹೇಳಿ", moreToGo: "ಇನ್ನೂ {n} ಬೇಕು",
  prompts: {
    ghosted: ["ಕೊನೆಯದಾಗಿ ಅವರು ಏನು ಹೇಳಿದರು", "ಎಷ್ಟು ಸುತ್ತುಗಳು", "ನೀವು ಹೇಗೆ ಫಾಲೋ-ಅಪ್ ಮಾಡಿದಿರಿ", "ಏನು ಸಹಾಯ ಮಾಡುತ್ತಿತ್ತು"],
    rejected: ["ಎಷ್ಟು ಸುತ್ತುಗಳು", "ಅವರು ಏನು ಕೇಳಿದರು", "ಅವರು ಕೊಟ್ಟ ಕಾರಣ", "ಏನು ಸಹಾಯ ಮಾಡುತ್ತಿತ್ತು"],
    ghost_job: ["ಪೋಸ್ಟ್ ಎಲ್ಲಿ ನೋಡಿದಿರಿ", "ನಕಲಿ ಎಂಬ ಸೂಚನೆಗಳು", "ಏನು ಸಹಾಯ ಮಾಡುತ್ತಿತ್ತು"],
    offer_revoked: ["ಆಫರ್ ಏನಾಗಿತ್ತು", "ಅವರು ಹೇಗೆ ಹಿಂಪಡೆದರು", "ಅವರು ಕೊಟ್ಟ ಕಾರಣ", "ಏನು ಸಹಾಯ ಮಾಡುತ್ತಿತ್ತು"],
    offer: ["ಎಷ್ಟು ಸುತ್ತುಗಳು", "ಅವರು ಏನು ಕೇಳಿದರು", "ಏನು ಸಹಾಯ ಮಾಡುತ್ತಿತ್ತು"],
    joined: ["ಎಷ್ಟು ಸುತ್ತುಗಳು", "ಈಗ ಹೇಗಿದೆ", "ಮುಂದಿನ ಅಭ್ಯರ್ಥಿಗೆ ಸಲಹೆ"],
  },
  placeholder: {
    ghosted: { sassy: "ಎಲ್ಲಿ ಮೌನವಾಯಿತು? ಅವರು ಕೊನೆಯದಾಗಿ ಏನು ಹೇಳಿದರು, ನೀವು ಹೇಗೆ ಫಾಲೋ-ಅಪ್ ಮಾಡಿದಿರಿ? ಯಾರ ಹೆಸರೂ ಬೇಡ.", calm: "ಎಲ್ಲಿ ಮೌನವಾಯಿತು, ಕೊನೆಯ ಸಂದೇಶ ಏನು, ನೀವು ಫಾಲೋ-ಅಪ್ ಮಾಡಿದಿರಾ? ದಯವಿಟ್ಟು ಯಾರ ಹೆಸರೂ ಹೇಳಬೇಡಿ." },
    rejected: { sassy: "ಎಷ್ಟು ಸುತ್ತು, ಏನು ಕೇಳಿದರು, ಕಾರಣ ಕೊಟ್ಟರೇ? ಯಾರ ಹೆಸರೂ ಬೇಡ.", calm: "ಎಷ್ಟು ಸುತ್ತು, ಏನು ಕೇಳಿದರು, ಮತ್ತು ಕಾರಣ ಕೊಟ್ಟರೇ. ದಯವಿಟ್ಟು ಯಾರ ಹೆಸರೂ ಹೇಳಬೇಡಿ." },
    ghost_job: { sassy: "ಪೋಸ್ಟ್ ಎಲ್ಲಿ ನೋಡಿದಿರಿ, ಏಕೆ ನಕಲಿ ಅನಿಸಿತು? ಯಾರ ಹೆಸರೂ ಬೇಡ.", calm: "ಹುದ್ದೆ ಎಲ್ಲಿ ನೋಡಿದಿರಿ, ಅದು ನಿಜವಲ್ಲ ಎಂದು ಏಕೆ ಅನಿಸಿತು. ದಯವಿಟ್ಟು ಯಾರ ಹೆಸರೂ ಹೇಳಬೇಡಿ." },
    offer_revoked: { sassy: "ಏನು ಆಫರ್ ಆಯಿತು, ಹೇಗೆ ಹಿಂಪಡೆದರು, ಯಾವ ಕಾರಣ ಕೊಟ್ಟರು? ಯಾರ ಹೆಸರೂ ಬೇಡ.", calm: "ಆಫರ್ ಏನಾಗಿತ್ತು, ಹೇಗೆ ಹಿಂಪಡೆಯಲಾಯಿತು, ಮತ್ತು ಕೊಟ್ಟ ಕಾರಣ. ದಯವಿಟ್ಟು ಯಾರ ಹೆಸರೂ ಹೇಳಬೇಡಿ." },
    offer: { sassy: "ಪ್ರಕ್ರಿಯೆ ಹೇಗಿತ್ತು, ಮುಂದಿನ ಅಭ್ಯರ್ಥಿ ಏನು ತಿಳಿಯಬೇಕು? ಯಾರ ಹೆಸರೂ ಬೇಡ.", calm: "ಪ್ರಕ್ರಿಯೆ ಹೇಗಿತ್ತು ಮತ್ತು ಮುಂದಿನ ಅಭ್ಯರ್ಥಿ ಏನು ತಿಳಿಯಬೇಕು. ದಯವಿಟ್ಟು ಯಾರ ಹೆಸರೂ ಹೇಳಬೇಡಿ." },
  },
  markdown: "Markdown ಕೆಲಸ ಮಾಡುತ್ತದೆ:", structure: "ನನಗೆ ಒಂದು ರಚನೆ ಕೊಡಿ",
  write: "ಬರೆಯಿರಿ", preview: "ಪೂರ್ವವೀಕ್ಷಣೆ", nothingPreview: "ಇನ್ನೂ ತೋರಿಸಲು ಏನೂ ಇಲ್ಲ.",
  tools: { bold: "ದಪ್ಪ", italic: "ಓರೆ", strike: "ಹೊಡೆದ ಗೆರೆ", heading: "ಶೀರ್ಷಿಕೆ", bullets: "ಬುಲೆಟ್ ಪಟ್ಟಿ", numbers: "ಸಂಖ್ಯೆ ಪಟ್ಟಿ", quote: "ಉಲ್ಲೇಖ", code: "ಇನ್‌ಲೈನ್ ಕೋಡ್", block: "ಕೋಡ್ ಬ್ಲಾಕ್" },
  review: { sassy: "ಫೀಡ್‌ನಲ್ಲಿ ಇದು ಹೀಗೆಯೇ ಕಾಣುತ್ತದೆ. ಟೈಪೋ ಸರಿಪಡಿಸಲು ಕೊನೆಯ ಅವಕಾಶ.", calm: "ಫೀಡ್‌ನಲ್ಲಿ ನಿಮ್ಮ ಕಥೆ ಹೀಗೆ ಕಾಣುತ್ತದೆ." },
  about: "ಬಗ್ಗೆ", aCompany: "ಒಂದು ಕಂಪನಿ", justNow: "ಈಗ ತಾನೇ", reword: "ಬೇರೆ ಪದಗಳು ಪ್ರಯತ್ನಿಸಿ",
  scoreLine: "ಈ ಕಥೆಯಿಂದ ಫ್ಲ್ಯಾಗ್ ಸ್ಕೋರ್:",
  postingAs: "{name} ಆಗಿ ಪೋಸ್ಟ್ ಮಾಡುತ್ತಿದ್ದೀರಿ", publicNote: "ನಿಮ್ಮ ಸಾರ್ವಜನಿಕ ವಿವರಗಳು ನಿಮ್ಮ ಎಲ್ಲಾ ಕಥೆಗಳಲ್ಲಿ ಕಾಣುತ್ತವೆ.", anonNote: "ನೀವು ಅನಾಮಧೇಯ: ನಿಮ್ಮ ಹ್ಯಾಂಡಲ್ ಮತ್ತು ಅವತಾರ ಮಾತ್ರ ಕಾಣುತ್ತವೆ.", changeNote: "ಸೆಟ್ಟಿಂಗ್ಸ್‌ನಲ್ಲಿ ಯಾವಾಗ ಬೇಕಾದರೂ ಬದಲಿಸಿ.",
  restored: { sassy: "ಬಿಟ್ಟಲ್ಲಿಂದಲೇ ಮುಂದುವರಿಸುತ್ತಿದ್ದೀರಿ. ನಿಮ್ಮ ಡ್ರಾಫ್ಟ್ ಕಾಯುತ್ತಿತ್ತು.", calm: "ನಿಮ್ಮ ಉಳಿಸಿದ ಡ್ರಾಫ್ಟ್ ಮರಳಿ ಬಂದಿದೆ." }, startOver: "ಮತ್ತೆ ಶುರು ಮಾಡಿ",
  back: "ಹಿಂದೆ", editingNote: "ನಿಮ್ಮ ಕಥೆ ಎಡಿಟ್ ಆಗುತ್ತಿದೆ", draftSaved: "ಡ್ರಾಫ್ಟ್ ಉಳಿಸಲಾಗಿದೆ",
  save: "ಬದಲಾವಣೆ ಉಳಿಸಿ", saving: "ಉಳಿಸಲಾಗುತ್ತಿದೆ…", post: "ಕಥೆ ಪೋಸ್ಟ್ ಮಾಡಿ", posting: "ಪೋಸ್ಟ್ ಆಗುತ್ತಿದೆ…", checking: "ನೀವು ಮನುಷ್ಯರೇ ಎಂದು ಪರಿಶೀಲಿಸುತ್ತಿದ್ದೇವೆ…",
  problems: {
    outcome: "ಹೇಗೆ ಮುಗಿಯಿತು ಆರಿಸಿ", joined: "ನೀವು ಸೇರಿದಿರೋ ಇಲ್ಲವೋ ತಿಳಿಸಿ", company: "ಕಂಪನಿ ಆರಿಸಿ", stage: "ಎಷ್ಟು ದೂರ ತಲುಪಿದಿರಿ ಆರಿಸಿ", rate: "{what} ರೇಟ್ ಮಾಡಿ",
    bothPay: "ಎರಡೂ ಸಂಬಳ ಸಂಖ್ಯೆ ಸೇರಿಸಿ, ಅಥವಾ ಯಾವುದೂ ಬೇಡ", maxMin: "ಗರಿಷ್ಠ ಕನಿಷ್ಠಕ್ಕಿಂತ ಕಡಿಮೆ ಇರಬಾರದು", payOff: "ಈ ಸಂಬಳ ಸರಿ ಅನಿಸುತ್ತಿಲ್ಲ (LPA ನಲ್ಲಿ)", daysRange: "ಕಾದ ದಿನಗಳು 0 ರಿಂದ 730 ಇರಬೇಕು",
    title: "ಶೀರ್ಷಿಕೆ ಕೊಡಿ (ಕನಿಷ್ಠ 5 ಅಕ್ಷರ)", body: "ಕಥೆ ಹೇಳಿ (ಇನ್ನೂ {n} ಅಕ್ಷರ), ಅಥವಾ ಕ್ವಿಕ್ ಸ್ಟೋರಿ ಪೋಸ್ಟ್ ಮಾಡಿ",
  },
  done: {
    title: { sassy: "ರಸೀದಿ ದಾಖಲಾಯಿತು.", calm: "ಕಥೆ ಹಂಚಿಕೊಳ್ಳಲಾಗಿದೆ." },
    copy: { sassy: "ಈಗ ಇದನ್ನು ಮುಂದಿನ ಅಭ್ಯರ್ಥಿಗೆ ತಲುಪಿಸಿ. ಕಾರ್ಡ್ ನೀವು ಯಾರು ಎಂದು ಎಂದಿಗೂ ತೋರಿಸುವುದಿಲ್ಲ.", calm: "ಧನ್ಯವಾದ. ಕೆಳಗಿನ ಕಾರ್ಡ್ ಹಂಚಿಕೊಳ್ಳಿ; ಅದು ನೀವು ಯಾರು ಎಂದು ಎಂದಿಗೂ ತೋರಿಸುವುದಿಲ್ಲ." },
    preview: "ಪೂರ್ವವೀಕ್ಷಣೆ ಮೋಡ್: ಇಲ್ಲಿ ಕಥೆಗಳು ಉಳಿಯುವುದಿಲ್ಲ.", another: "ಇನ್ನೊಂದು ಹಂಚಿಕೊಳ್ಳಿ", feed: "ಫೀಡ್‌ಗೆ ಹಿಂತಿರುಗಿ",
  },
  toasts: {
    updated: { sassy: "ಕಥೆ ಅಪ್‌ಡೇಟ್ ಆಯಿತು. ದಾಖಲೆ ಸರಿಪಡಿಸಲಾಗಿದೆ.", calm: "ನಿಮ್ಮ ಬದಲಾವಣೆಗಳನ್ನು ಉಳಿಸಲಾಗಿದೆ." },
    previewSaved: "ಬದಲಾವಣೆ ಉಳಿಸಲಾಗಿದೆ. (ಪೂರ್ವವೀಕ್ಷಣೆ ಮೋಡ್: ಸಂಗ್ರಹವಾಗುವುದಿಲ್ಲ.)", saveFail: "ಬದಲಾವಣೆ ಉಳಿಸಲಾಗಲಿಲ್ಲ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.", postFail: "ಈಗ ಹಂಚಿಕೊಳ್ಳಲಾಗಲಿಲ್ಲ. ನಿಮ್ಮ ಡ್ರಾಫ್ಟ್ ಉಳಿದಿದೆ; ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.",
  },
};

// ---------- Hinglish (machine translated, to verify) ----------
const hinglish: P = {
  steps: { what: "Kya hua", details: "Details", words: "Apne shabdon mein", post: "Check karo aur post karo" },
  stepOf: "Step {n} of {total}", progress: "Progress",
  stages: { application: "Apply kiya", screening: "Screening call", technical: "Technical round", final: "Final round", offer: "Offer stage" },
  outcomes: {
    ghosted: { label: "Ghost kiya", blurb: "Unhone reply karna band kar diya" }, rejected: { label: "Reject", blurb: "Kam se kam ek 'na' toh mila" },
    ghost_job: { label: "Fake job", blurb: "Role kabhi tha hi nahi" }, offer_revoked: { label: "Offer wapas liya", blurb: "Offer diya, phir cheen liya" },
    offer: { label: "Offer mila", blurb: "Rare happy ending" },
  },
  ratings: {
    hiring: { label: "Hiring process", hint: "Clear, fair, organised?" }, communication: { label: "Communication", hint: "Time pe reply kiya?" },
    pay: { label: "Pay transparency", hint: "Salary pe honestly baat hui?" }, culture: { label: "Work culture", hint: "Respectful? Kaam karne layak?" },
    growth: { label: "Growth", hint: "Role kahin le jaata hai?" },
  },
  stars: ["", "Bekaar", "Kharab", "Theek", "Achha", "Zabardast"], starOf: "5 mein se {n}: {word}",
  waits: ["Ek hafte se kam", "1 se 2 hafte", "2 se 4 hafte", "1 se 2 mahine", "2+ mahine"],
  titles: {
    what: { t: { sassy: "Kya hua?", calm: "Kya hua?" }, s: { sassy: "End se shuru karo. Baaki sab usi ke hisaab se.", calm: "Chuno kaise khatam hua, phir company." } },
    details: { t: { sassy: "Details", calm: "Details" }, never: { sassy: "Bas kuch taps. Sirf wahi jo tumhare saath hua.", calm: "Sirf woh sawaal jo tumhare experience pe fit hote hain." }, other: { sassy: "Jo dekha wahi rate karo. Jo nahi dekha, woh nahi.", calm: "Sirf woh sawaal jo tumhare experience pe fit hote hain." } },
    words: { t: { sassy: "Apne shabdon mein", calm: "Apne shabdon mein" }, s: { sassy: "Jitna chaho utna likho. Ya skip karo.", calm: "Apni story likho, ya answers se quick story post karo." } },
    edit: { t: { sassy: "Ab sharp lag raha hai?", calm: "Changes check karo" }, s: { sassy: "Save karo aur story pe chhota sa Edited badge lag jayega.", calm: "Save karne pe story edited dikhegi." } },
    post: { t: { sassy: "Sahi lag raha hai?", calm: "Check karo aur post karo" }, s: { sassy: "Ek nazar, phir yeh logon ki help karne nikal padegi.", calm: "Apni story check karo, phir post karo." } },
  },
  how: "Yeh kaise khatam hua?", joined: "Kya tumne join kiya?", joinedYes: "Haan, join kiya", joinedNo: "Nahi, mana kiya ya join nahi kiya",
  company: "Kaunsi company?", companyLocked: "Existing story pe change nahi ho sakta", notListed: "List mein nahi? Add karo", listQ: "“{q}” ko Ghosted pe list karo", chooseCompany: "Company chuno",
  role: "Tumhara role", optional: "Optional", roleHint: "jaise Frontend Engineer",
  quiet: { rejected: "Kahan reject hue?", ghost_job: "Kitna aage pahunche?", other: "Kahan pe chup ho gaye?" },
  waitQ: { rejected: "Batane mein kitna time laga?", other: "Kitna wait kiya?" }, exact: "Exact din", exactHint: "jaise 18", exactLabel: "Exact wait ke din",
  atOffer: "Offer stage pe {outcome}{company}.", withCo: ", {name} ke saath",
  rateAll: { sassy: "Neeche {all} ko rate karo aur apna Flag Score dekho.", calm: "{all} ko rate karo aur dekho tumhari story is company ko kya Flag Score deti hai." },
  both: { sassy: "dono", calm: "dono areas" }, allN: { sassy: "saare {n}", calm: "saare {n} areas" },
  gives: "Tumhari story {company} ko {score} deti hai. Yeh sabke scores ke saath average hota hai.", them: "unhe",
  payHint: "Optional, par agle insaan ki bahut help karta hai", payYours: "Tumhari pay range", payOffered: "Offered pay", addYours: "Apni pay range add karo", addOffered: "Offered pay add karo",
  min: "Min (₹ LPA)", max: "Max (₹ LPA)",
  quick: { sassy: "Likhna skip karo, quick story post karo", calm: "Iske bajaye quick story post karo" }, quickNote: "Hum tumhare answers se ek chhoti, simple story likhenge (English mein). Na naam, na kuch extra.",
  title: "Title", tell: "Story batao", moreToGo: "{n} aur baaki",
  prompts: {
    ghosted: ["Unhone last kya kaha", "Kitne rounds hue", "Tumne kaise follow up kiya", "Kya help karta"],
    rejected: ["Kitne rounds hue", "Unhone kya poocha", "Unhone kya reason diya", "Kya help karta"],
    ghost_job: ["Post kahan dekhi", "Fake hone ke signs", "Kya help karta"],
    offer_revoked: ["Offer kya tha", "Kaise wapas liya", "Unhone kya reason diya", "Kya help karta"],
    offer: ["Kitne rounds hue", "Unhone kya poocha", "Kya help karta"],
    joined: ["Kitne rounds hue", "Ab kaisa hai", "Agle candidate ke liye tip"],
  },
  placeholder: {
    ghosted: { sassy: "Baat kahan ruki? Unhone last kya kaha, aur tumne kaise follow up kiya? Kisi ka naam nahi.", calm: "Baat kahan ruki, last message kya tha, aur kya tumne follow up kiya? Please kisi ka naam mat lo." },
    rejected: { sassy: "Kitne rounds, kya poocha, aur koi reason diya? Kisi ka naam nahi.", calm: "Kitne rounds, kya poocha, aur kya reason diya. Please kisi ka naam mat lo." },
    ghost_job: { sassy: "Post kahan dekhi, aur kya fake laga? Kisi ka naam nahi.", calm: "Role kahan dekha, aur kis baat se laga ki yeh real nahi tha. Please kisi ka naam mat lo." },
    offer_revoked: { sassy: "Kya offer hua, kaise wapas liya, aur kya reason diya? Kisi ka naam nahi.", calm: "Offer kya tha, kaise wapas liya gaya, aur kya reason diya. Please kisi ka naam mat lo." },
    offer: { sassy: "Process kaisa raha, aur agle candidate ko kya pata hona chahiye? Kisi ka naam nahi.", calm: "Process kaisa raha aur agle candidate ko kya jaanna chahiye. Please kisi ka naam mat lo." },
  },
  markdown: "Markdown chalta hai:", structure: "Mujhe ek structure do",
  write: "Likho", preview: "Preview", nothingPreview: "Abhi preview karne ko kuch nahi.",
  review: { sassy: "Feed mein exactly aisi dikhegi. Typo theek karne ka last chance.", calm: "Feed mein tumhari story aisi dikhegi." },
  about: "ke baare mein", aCompany: "ek company", justNow: "abhi", reword: "Alag wording try karo",
  scoreLine: "Is story se Flag Score:",
  postingAs: "{name} ke roop mein post kar rahe ho", publicNote: "Tumhari public details tumhari saari stories pe dikhti hain.", anonNote: "Tum anonymous ho: sirf handle aur avatar dikhta hai.", changeNote: "Settings mein kabhi bhi badlo.",
  restored: { sassy: "Jahan chhoda tha wahin se. Tumhara draft wait kar raha tha.", calm: "Tumhara saved draft wapas aa gaya hai." }, startOver: "Phir se shuru karo",
  back: "Peeche", editingNote: "Tumhari story edit ho rahi hai", draftSaved: "Draft saved",
  save: "Changes save karo", saving: "Save ho raha hai…", post: "Story post karo", posting: "Post ho rahi hai…", checking: "Check kar rahe hain ki tum insaan ho…",
  problems: {
    outcome: "Chuno kaise khatam hua", joined: "Batao join kiya ya nahi", company: "Company chuno", stage: "Chuno kitna aage pahunche", rate: "{what} ko rate karo",
    bothPay: "Dono pay numbers daalo, ya koi nahi", maxMin: "Max kam se kam min jitna hona chahiye", payOff: "Yeh pay sahi nahi lag raha (LPA mein)", daysRange: "Wait ke din 0 se 730 hone chahiye",
    title: "Title do (kam se kam 5 characters)", body: "Story batao ({n} aur characters), ya quick story post karo",
  },
  done: {
    title: { sassy: "Receipts file ho gayi.", calm: "Story share ho gayi." },
    copy: { sassy: "Ab ise agle candidate tak pahunchao. Card kabhi nahi dikhata ki tum kaun ho.", calm: "Thank you. Neeche wala card share karo; yeh kabhi nahi dikhata ki tum kaun ho." },
    preview: "Preview mode: yahan stories save nahi hoti.", another: "Ek aur share karo", feed: "Feed pe wapas",
  },
  toasts: {
    updated: { sassy: "Story update ho gayi. Record seedha kar diya.", calm: "Tumhare changes save ho gaye." },
    previewSaved: "Changes save hue. (Preview mode: store nahi hote.)", saveFail: "Changes save nahi hue. Phir try karo.", postFail: "Abhi share nahi ho paya. Draft saved hai; phir try karo.",
  },
};

const DICTS: Record<Lang, P | null> = { en: null, hi, kn, hinglish };
const cache = new Map<Lang, ComposerCopy>();
export function composerCopy(lang: Lang): ComposerCopy {
  if (!cache.has(lang)) cache.set(lang, DICTS[lang] ? merge(en, DICTS[lang]) : en);
  return cache.get(lang)!;
}
export function useComposer() { return composerCopy(usePrefs().lang); }
