// What Goofy says. Each event has a sassy and a calm set; the person's tone setting (Settings →
// Appearance) picks the set, and Goofy picks a line at random so he never sounds like a form letter.
// {what} = "story" / "chitchat"; {company} = a company name; {reason} = why.
// The removal set alone has 100 lines (50 sassy, 50 calm), since it's the one people see most.

export type Tone = "sassy" | "calm";
export type GoofyEvent = "removed" | "held" | "released" | "redacted" | "asked_rephrase" | "warned" | "paused" | "welcome" | "ghost_job_alert" | "took_down" | "restored" | "report_ack" | "weekly";

const REMOVED_SASSY = [
  "Beep boop. I ate your {what}. It was 90% swear words and 10% vibes. Try again with the vibes.",
  "Your {what} had more bleeps than a censored rap album. I took it down. The story's still worth telling, minus the fireworks.",
  "I removed your {what}. Anger is valid. Spelling it with four-letter words is not a strategy.",
  "Goofy here. Your {what} went to the shredder ({reason}). Breathe in, breathe out, rewrite.",
  "That {what} was spicy enough to set off my smoke detector. Gone. Cooler heads write better receipts.",
  "I deleted your {what}. The HR who ghosted you doesn't read swear words, but future candidates read stories.",
  "Your {what} has been yeeted ({reason}). The facts were fine. The vocabulary needed a nap.",
  "Plot twist: your {what} got ghosted. By me. Rewrite it without the cussing and it's back in business.",
  "I took your {what} down. Rage-typing is cardio, but it isn't evidence.",
  "Removed. Your {what} read like a keyboard fell down the stairs swearing. Tell it straight and I'll stay out of it.",
  "Your {what} got the Goofy treatment: removed. Same story, fewer explosives, and it stays up.",
  "I had to bin your {what} ({reason}). You're right to be mad. Be mad in full sentences.",
  "Your {what} is gone. Even my circuits blushed. Try the clean edition.",
  "Deleted your {what}. Hot take: the company deserves your facts more than your curses.",
  "Your {what} was louder than a Monday stand-up. I muted it. Permanently. Rewrite and repost.",
  "Your {what} needed a swear jar, and it bankrupted it. Removed.",
  "Goofy has entered the chat and left with your {what}. Reason: {reason}.",
  "I removed your {what}. The ghosting was rude. So was that paragraph.",
  "Your {what} went poof. Facts survive, profanity doesn't. That's the deal here.",
  "Took your {what} down. You can be savage without being vulgar. It's an art. Try it.",
  "Your {what} got flagged by me, Goofy, professional fun-sponge. Clean it up and it's welcome back.",
  "Beep. Your {what} triggered my 'whoa there' sensor. Removed. Deep breath, then round two.",
  "I deleted your {what}. Somewhere, a recruiter is unbothered. Don't give them that satisfaction: rewrite it.",
  "Your {what} was removed for {reason}. Revenge is best served cold, and grammatically correct.",
  "Your {what} has left the building. Escorted by me. Reason: {reason}.",
  "Removed your {what}. I believe you. I just can't publish the swear-word symphony.",
  "Your {what} came in hot and left in a bin. Write the calm version; it'll hit harder, I promise.",
  "I shredded your {what}. Ghosted runs on receipts, not rants.",
  "Your {what} is now in the great recycle bin in the sky. Cleaner version, please.",
  "I removed your {what}. Swearing at a company doesn't make them reply. Facts make the next candidate wiser.",
  "Your {what} got moderated. Yes, by a robot. Yes, I have feelings. Mostly about vocabulary.",
  "That {what} was a little too 'unfiltered'. I filtered it. Into the trash.",
  "Your {what} has been removed. Channel the rage into details: dates, rounds, silence.",
  "Gone. Your {what} broke the 'no vulgarity' rule. The 'tell the truth' rule is still very much open.",
  "I deleted your {what}. Think of it as a draft that got too excited.",
  "Your {what} said things my mother board wouldn't approve of. Removed.",
  "Goofy took your {what} down ({reason}). Your experience matters. The cuss words don't.",
  "I removed your {what}. Pro tip: 'They never replied after the final round' is more brutal than any swear word.",
  "Your {what} got benched. Come back with the clean version and you're starting XI again.",
  "Your {what} was removed. I know, I know. Write it like you'd say it to a friend's mum.",
  "Deleted your {what}. Spicy language: 0. You: still welcome to tell the story.",
  "Your {what} hit my vulgarity limit. It's been retired. Rewrite it with receipts instead.",
  "Your {what} was taken down for {reason}. I'm a robot, but even I needed a moment.",
  "I bonked your {what} with the ban hammer (lightly). Clean it up and it's fine.",
  "Your {what} is gone. Ghosting is bad. Gutter language is also bad. Two wrongs, one rewrite.",
  "Removed your {what}. Let the facts be the roast.",
  "Your {what} went over the line, so I walked it back. Try again, nicer words, same truth.",
  "I removed your {what}. That HR isn't worth your swear words. Your next reader is worth your facts.",
  "Your {what} was removed ({reason}). I'll be here, judging vocabulary, forever.",
  "Your {what} got Goofy'd. Removed. Rewrite without the bad words and I'll leave it alone.",
];
const REMOVED_CALM = [
  "Your {what} was removed because it included {reason}. You're welcome to share it again in different words.",
  "I took down your {what} ({reason}). Your experience still matters; please post it again without that language.",
  "Your {what} has been removed for {reason}. When you're ready, the same story told plainly is very welcome.",
  "Hi, it's Goofy. I removed your {what} because of {reason}. Feeling angry after a hiring process is completely understandable.",
  "Your {what} didn't meet the community guidelines ({reason}), so it's been removed. Nothing else about your account has changed.",
  "I removed your {what}. Strong feelings are fine here; the wording needs to stay respectful.",
  "Your {what} was taken down for {reason}. Take a breath, and share it again whenever you like.",
  "Your {what} was removed because of its language. The facts you shared are valuable; they just need calmer words.",
  "I've removed your {what} ({reason}). If you rewrite it, it will go up as normal.",
  "Your {what} is no longer visible because it included {reason}. Your account is in good standing.",
  "Your {what} was removed. Many people feel the same frustration; describing what happened helps them most.",
  "I removed your {what} for {reason}. Thank you for understanding; it keeps Ghosted useful for everyone.",
  "Your {what} has been taken down. You can post a new version at any time.",
  "Your {what} was removed because of {reason}. Clear, factual stories carry the most weight with readers.",
  "Hi from Goofy. Your {what} was removed ({reason}). Please try again with gentler language.",
  "Your {what} was removed under the community guidelines ({reason}). We'd still love to hear your story.",
  "I took your {what} down. Writing it out can help; posting it works best without strong language.",
  "Your {what} was removed for {reason}. If something in this process hurt you, you're not alone.",
  "Your {what} has been removed. A calmer version will help future candidates just as much.",
  "I removed your {what} because of {reason}. Nothing has been shared about you.",
  "Your {what} was taken down for {reason}. Rounds, dates and how long you waited are what readers need most.",
  "Your {what} is removed. When you're ready, the story is still yours to tell.",
  "I've taken down your {what} ({reason}). Please keep sharing; just keep the words respectful.",
  "Your {what} was removed for its language. Thank you for helping keep the community kind.",
  "Your {what} has been removed ({reason}). You can rewrite and post it straight away.",
  "Hi, Goofy here. I removed your {what}. It's okay to be upset; the post just can't include {reason}.",
  "Your {what} was removed. The best stories here are calm, specific and honest. Yours can be too.",
  "I removed your {what} because it included {reason}. Your other posts are unaffected.",
  "Your {what} was taken down. If you'd like, try describing what happened step by step.",
  "Your {what} has been removed for {reason}. We appreciate you wanting to warn others.",
  "Your {what} was removed. Please share it again without the strong language and it will stay up.",
  "I've removed your {what} ({reason}). Take your time; you can post again whenever you're ready.",
  "Your {what} was removed because of {reason}. Respectful posts are what make Ghosted trustworthy.",
  "Your {what} is no longer public ({reason}). The rest of your profile is unchanged.",
  "I removed your {what}. Your frustration makes sense; the community just needs it in kinder words.",
  "Your {what} was removed for {reason}. A short, factual version is often the most powerful.",
  "Your {what} has been taken down. Thank you for sharing; please try once more in calmer words.",
  "Hi from Goofy. Your {what} was removed ({reason}). It's fine to post a new version.",
  "Your {what} was removed under our guidelines. You can always reach out through the Community page.",
  "I removed your {what} because it included {reason}. Thanks for helping keep Ghosted a safe place.",
  "Your {what} was taken down for {reason}. The details of your experience are welcome here.",
  "Your {what} has been removed. Consider what you'd want a friend applying there to know.",
  "I took down your {what} ({reason}). Nothing about this is visible to other people.",
  "Your {what} was removed. Feelings are welcome; insults and strong language aren't.",
  "Your {what} has been removed for {reason}. You're welcome to share it again in your own words.",
  "I've removed your {what}. Please take care of yourself; hiring processes can be really draining.",
  "Your {what} was removed because of {reason}. A calmer rewrite will go live right away.",
  "Your {what} is removed ({reason}). Your voice matters here; just keep it respectful.",
  "Hi, it's Goofy. Your {what} came down because of {reason}. Try again whenever you like.",
  "Your {what} was removed. Thank you for understanding why we keep the language clean.",
];

const SETS: Record<GoofyEvent, Record<Tone, string[]>> = {
  removed: { sassy: REMOVED_SASSY, calm: REMOVED_CALM },
  held: {
    sassy: ["Holding your {what} for a quick look ({reason}). Not in trouble, just in the waiting room. Ironic, I know.", "Your {what} is in my inbox ({reason}). I read fast. Hang tight.", "Paused your {what} for a sec ({reason}). Robots double-check things. It's our whole personality."],
    calm: ["Your {what} is saved and waiting for a quick check ({reason}). This usually takes a few hours.", "I'm holding your {what} for a short review ({reason}). You don't need to do anything.", "Your {what} will go up after a quick check ({reason}). Thanks for your patience."],
  },
  released: {
    sassy: ["Your {what} passed inspection. Go forth and inform.", "Cleared! Your {what} is live. I found nothing but truth and decent spelling.", "Your {what} is up. Goofy approves. Rare, but it happens."],
    calm: ["Your {what} passed the check and is live now.", "Good news: your {what} is published.", "Your {what} is now visible to everyone. Thank you for sharing."],
  },
  redacted: {
    sassy: ["Your {what} is live, but I swapped a person's name for [name]. We roast companies, not individuals.", "Published your {what} with one tiny edit: a name became [name]. Anonymous both ways, that's the rule.", "Your {what} is up. I gave someone in it a witness-protection name: [name]."],
    calm: ["Your {what} is live. I replaced a person's name with [name] so nobody can be identified.", "Your {what} has been published with a name hidden as [name], to keep everyone anonymous.", "Your {what} is up. One name was replaced with [name] to protect privacy."],
  },
  asked_rephrase: {
    sassy: ["Your {what} says something serious as fact. Lawyers love that. Rephrase it as your experience ('it felt like…', 'I was told…') and it's live.", "Your {what} is one 'allegedly' away from publishing. Tell it as what happened to you, and you're good.", "Spicy claim in your {what}! Rephrase it as your experience within 3 days or I'll have to remove it."],
    calm: ["Your {what} states a serious accusation as fact. Please edit it to describe your experience (for example 'it felt like…', 'I was told…'). Otherwise it's removed in 3 days.", "To publish your {what}, please rephrase the accusation as your own experience. You have 3 days.", "Your {what} needs a small edit: describe what happened to you rather than stating a crime as fact."],
  },
  warned: {
    sassy: ["That's two removals this month. One more and I'll put your posting on a short timeout. Let's not.", "Goofy's keeping score, and you're close to a timeout. Clean words, please.", "Friendly robot warning: one more vulgar post and you'll get a cooldown."],
    calm: ["This is your second removal this month. A third would pause posting for a few days.", "A gentle heads-up: another removal soon would mean a short posting pause.", "Please keep posts respectful. Another removal would pause posting briefly."],
  },
  paused: {
    sassy: ["Timeout! Three removals in a month earns a 3-day posting break. Read, react, relax. I'll see you soon.", "You've unlocked: cooldown. Posting is paused for 3 days. Use the time to draft the calm version.", "Three strikes, short timeout. Posting's back in 3 days, champ."],
    calm: ["Posting is paused for 3 days after three removals this month. You can still read and react.", "Your posting is on a short 3-day pause. Everything else works as usual.", "After three removals this month, posting is paused for 3 days. Thank you for understanding."],
  },
  welcome: {
    sassy: ["Hi, I'm Goofy, the AutoMod. I keep Ghosted honest and swear-free. Roast companies, protect people, and we'll get along great.", "Welcome! I'm Goofy. I eat vulgar posts and hide people's names. Everything else? Go wild (truthfully).", "Goofy here, your friendly neighbourhood AutoMod. Tell the truth, skip the slurs, never name individuals."],
    calm: ["Welcome to Ghosted. I'm Goofy, the automatic moderator. Share honestly, keep it respectful, and never name individuals.", "Hi, I'm Goofy. I help keep Ghosted safe and anonymous for everyone. Thanks for joining.", "Welcome! I'm Goofy, the AutoMod. The community guidelines are on the Community page whenever you need them."],
  },
  ghost_job_alert: {
    sassy: ["Psst. {company} has picked up several 'ghost job' stories this month. Apply with one eyebrow raised.", "Goofy alert: {company}'s postings are smelling a little haunted lately. Check before you apply.", "Heads up: multiple people say {company}'s roles never existed. Spooky."],
    calm: ["Heads up: {company} has received several 'ghost job' stories this month. You may want to read them before applying.", "{company}, which you follow, has had multiple reports of roles that may not exist.", "Several people recently said {company}'s openings didn't lead anywhere. Worth a look before applying."],
  },
  took_down: {
    sassy: ["Your {what} got reported by enough trusted folks, and the evidence held up. It's down.", "The community spoke, I checked, and your {what} is out ({reason}).", "Your {what} was taken down after reports ({reason}). The jury was mostly robots and they agreed."],
    calm: ["Your {what} was taken down after reports from the community ({reason}).", "After review, your {what} was removed ({reason}).", "Your {what} is no longer visible following community reports ({reason})."],
  },
  restored: {
    sassy: ["False alarm! Your {what} is back up. The reports didn't hold.", "Your {what} survived the reports. Restored. Haters gonna hate, facts gonna stay.", "Back from the dead: your {what} is live again."],
    calm: ["Your {what} has been restored. The reports didn't show a problem.", "Good news: your {what} is visible again after review.", "Your {what} is back up. Thank you for your patience."],
  },
  report_ack: {
    sassy: ["Got your report. I've already had a look and moved it up the queue.", "Report received. I'm on it like a recruiter on a 'quick call'. Faster, though."],
    calm: ["Thanks for your report. I've reviewed it and it's in the queue.", "Your report has been received and checked automatically."],
  },
  weekly: {
    sassy: ["My week: {reason}. Ghosted stayed honest and mostly swear-free. You're welcome.", "Weekly report from your favourite robot: {reason}."],
    calm: ["This week on Ghosted: {reason}.", "Goofy's weekly summary: {reason}."],
  },
};

export function line(event: GoofyEvent, tone: Tone, vars: { what?: string; reason?: string; company?: string } = {}) {
  const set = SETS[event][tone];
  const pick = set[Math.floor(Math.random() * set.length)]!;
  return pick.replace(/\{what\}/g, vars.what ?? "post").replace(/\{reason\}/g, vars.reason ?? "a guideline issue").replace(/\{company\}/g, vars.company ?? "a company");
}

export const LINE_COUNTS = Object.fromEntries(Object.entries(SETS).map(([k, v]) => [k, v.sassy.length + v.calm.length]));
