import { handleFromSeed } from "@/lib/handles";

export type Scores = {
  hiring: number;
  communication: number;
  culture: number;
  pay: number;
  growth: number;
};

export type Company = {
  id: string;
  name: string;
  initial: string;
  score: number;
  color: string;
  summary: string;
  badges: string[];
  scores: Scores;
  salary: [number, number];
  // Real listings (API) also carry these; sample companies don't.
  storyCount?: number;
  avgDaysWaited?: number | null;
  logoUrl?: string | null;
  website?: string | null;
  domain?: string | null;
  about?: string | null;
  industry?: string | null;
  size?: string | null;
  hqCity?: string | null;
  founded?: number | null;
  careersUrl?: string | null;
};

export type User = {
  id: string;
  handle: string;
  seed: string;
  pastel: string;
};

export type Story = {
  id: string;
  userId: string;
  companyId: string;
  stage: string;
  excerpt: string;
  relatable: number;
  flags: number;
  comments: number;
  time: string;
};

// Handles come from the generator in src/lib/handles.ts, seeded so they stay stable.
const mockUser = (id: string, seed: string, pastel: string): User => ({ id, seed, pastel, handle: handleFromSeed(seed) });

export const users: User[] = [
  mockUser("u1", "otter-noir", "bg-avatar-mint"),
  mockUser("u2", "falcon-fast", "bg-avatar-sky"),
  mockUser("u3", "panda-pixel", "bg-avatar-pink"),
  mockUser("u4", "lynx-late", "bg-avatar-amber"),
  mockUser("u5", "myna-memo", "bg-avatar-lilac"),
  mockUser("u6", "gecko-green", "bg-avatar-mint"),
  mockUser("u7", "yak-yikes", "bg-avatar-sky"),
  mockUser("u8", "koala-kind", "bg-avatar-pink"),
  mockUser("u9", "raven-real", "bg-avatar-amber"),
  mockUser("u10", "turtle-truth", "bg-avatar-lilac"),
];

export const companies: Company[] = [
  { id: "nimbus", name: "Nimbus Labs", initial: "N", score: 91, color: "bg-logo-violet", summary: "Replies fast, respects weekends. Revolutionary.", badges: ["Fast Replies", "Fair Pay"], scores: { hiring: 94, communication: 92, culture: 88, pay: 89, growth: 90 }, salary: [18, 42] },
  { id: "orbitwave", name: "Orbitwave", initial: "O", score: 86, color: "bg-logo-coral", summary: "Clear rounds, kinder humans, zero riddles.", badges: ["Fast Replies", "Fair Pay"], scores: { hiring: 89, communication: 84, culture: 88, pay: 82, growth: 87 }, salary: [16, 36] },
  { id: "bluepine", name: "Bluepine Systems", initial: "B", score: 78, color: "bg-logo-blue", summary: "A rare case of the JD matching the job.", badges: ["Fair Pay"], scores: { hiring: 76, communication: 80, culture: 83, pay: 74, growth: 77 }, salary: [14, 32] },
  { id: "kindred", name: "Kindred Stack", initial: "K", score: 73, color: "bg-logo-green", summary: "Thoughtful interviews, useful feedback.", badges: ["Fast Replies"], scores: { hiring: 78, communication: 76, culture: 75, pay: 67, growth: 70 }, salary: [12, 28] },
  { id: "pixelmint", name: "PixelMint", initial: "P", score: 64, color: "bg-logo-pink", summary: "Lovely people, mysterious compensation bands.", badges: ["Interview Marathon"], scores: { hiring: 68, communication: 61, culture: 75, pay: 45, growth: 70 }, salary: [10, 26] },
  { id: "quasar", name: "Quasar Works", initial: "Q", score: 55, color: "bg-logo-amber", summary: "Good intent. Calendar chaos. Five rounds.", badges: ["Interview Marathon"], scores: { hiring: 48, communication: 52, culture: 69, pay: 58, growth: 61 }, salary: [11, 30] },
  { id: "copperfox", name: "CopperFox", initial: "C", score: 47, color: "bg-logo-coral", summary: "The process has a process. Then another one.", badges: ["Interview Marathon"], scores: { hiring: 39, communication: 46, culture: 59, pay: 44, growth: 49 }, salary: [9, 24] },
  { id: "echoverse", name: "Echoverse", initial: "E", score: 42, color: "bg-logo-blue", summary: "You will hear echoes. Not recruiters.", badges: ["Ghosts Candidates"], scores: { hiring: 45, communication: 22, culture: 58, pay: 43, growth: 53 }, salary: [8, 22] },
  { id: "velvetbyte", name: "VelvetByte", initial: "V", score: 34, color: "bg-logo-pink", summary: "Soft name, sharp surprise assignments.", badges: ["Ghosts Candidates", "Interview Marathon"], scores: { hiring: 31, communication: 28, culture: 43, pay: 35, growth: 36 }, salary: [7, 20] },
  { id: "hushloop", name: "HushLoop", initial: "H", score: 27, color: "bg-logo-violet", summary: "The silence is, unfortunately, on brand.", badges: ["Ghosts Candidates", "Ghost Job"], scores: { hiring: 28, communication: 8, culture: 39, pay: 30, growth: 31 }, salary: [6, 18] },
  { id: "stacksprout", name: "StackSprout", initial: "S", score: 21, color: "bg-logo-green", summary: "Seven rounds and a take-home forest.", badges: ["Interview Marathon", "Offer Revoked Reports"], scores: { hiring: 14, communication: 24, culture: 32, pay: 19, growth: 27 }, salary: [8, 19] },
  { id: "redkite", name: "RedKite Digital", initial: "R", score: 15, color: "bg-logo-red", summary: "The offer vanished faster than the recruiter.", badges: ["Offer Revoked Reports", "Ghosts Candidates"], scores: { hiring: 17, communication: 9, culture: 22, pay: 12, growth: 19 }, salary: [5, 17] },
];

export const stories: Story[] = [
  { id: "s1", userId: "u1", companyId: "redkite", stage: "Offer revoked · Backend Engineer", excerpt: "Got the offer letter on Friday and resigned from my job on Monday. By Wednesday HR said the role was “recalibrated” and the offer was withdrawn. Get the joining date in writing before you resign.", relatable: 342, flags: 119, comments: 38, time: "12 min ago" },
  { id: "s2", userId: "u2", companyId: "nimbus", stage: "Rejected, with feedback · Product Designer", excerpt: "Didn't get it, but the rejection came in four days with three specific notes on my portfolio. I fixed two of them and cleared my next interview elsewhere. This is what good looks like.", relatable: 288, flags: 4, comments: 21, time: "28 min ago" },
  { id: "s3", userId: "u3", companyId: "hushloop", stage: "Ghosted after final round · Data Analyst", excerpt: "Four interviews, one take-home and two reference checks over six weeks. The recruiter said “expect news by Friday”. That was 40 days ago, and three follow-ups have gone unanswered.", relatable: 501, flags: 210, comments: 67, time: "1 hr ago" },
  { id: "s4", userId: "u4", companyId: "quasar", stage: "Surprise interview · SDE II", excerpt: "The invite said “20-minute intro chat with the team”. It turned out to be a 90-minute system design round. Ask for the interview format in writing; they had it and just didn't share it.", relatable: 196, flags: 72, comments: 18, time: "2 hr ago" },
  { id: "s5", userId: "u5", companyId: "orbitwave", stage: "Offer matched the range · QA Lead", excerpt: "The job post listed ₹24–30 LPA and the offer came in at ₹28. Nobody asked for my current salary, and I got a decision within two weeks. It's possible, companies.", relatable: 415, flags: 3, comments: 44, time: "3 hr ago" },
  { id: "s6", userId: "u6", companyId: "velvetbyte", stage: "Unpaid weekend take-home · Frontend Dev", excerpt: "The assignment was “about two hours”. The brief had 17 requirements, tests and a deployment. It took my whole weekend, and the only feedback was an auto-reply rejection.", relatable: 378, flags: 143, comments: 52, time: "4 hr ago" },
  { id: "s7", userId: "u7", companyId: "echoverse", stage: "Recruiter vanished · Marketing Manager", excerpt: "The recruiter rescheduled my round twice, then asked if I was “still interested”. I said yes. That was the last message. Their LinkedIn now says they've left the company.", relatable: 246, flags: 98, comments: 29, time: "Yesterday" },
  { id: "s8", userId: "u8", companyId: "bluepine", stage: "Smooth process · DevOps Engineer", excerpt: "Two rounds, both on time, with interviewers who had actually read my CV. I heard back in three days with a clear yes. Boring in the best way.", relatable: 332, flags: 6, comments: 31, time: "Yesterday" },
  { id: "s9", userId: "u9", companyId: "stacksprout", stage: "Free consulting · Product Manager", excerpt: "Round four asked for a go-to-market plan for their actual upcoming launch, with real numbers. I was rejected a week later, and a month later they announced almost exactly my plan.", relatable: 609, flags: 274, comments: 83, time: "2 days ago" },
  { id: "s10", userId: "u10", companyId: "copperfox", stage: "Lowballed at the offer · Sales Lead", excerpt: "The post said ₹18–24 LPA. After five rounds the offer was ₹14, because “the range includes variable pay”. The variable part wasn't mentioned once during the process.", relatable: 451, flags: 201, comments: 58, time: "2 days ago" },
  { id: "s11", userId: "u1", companyId: "kindred", stage: "Rejected, respectfully · Backend Engineer", excerpt: "The hiring manager called me personally, explained I was short on distributed systems experience, and told me to reapply in a year. It stung, but I knew exactly what to work on.", relatable: 230, flags: 2, comments: 16, time: "3 days ago" },
  { id: "s12", userId: "u3", companyId: "pixelmint", stage: "Confused panel · UX Researcher", excerpt: "Three panelists, three different ideas of the role: one wanted research, one wanted UI design, one wanted a project manager. Nobody had read my CV. Ask “what does success in 90 days look like?” early.", relatable: 319, flags: 88, comments: 41, time: "3 days ago" },
  { id: "s13", userId: "u6", companyId: "redkite", stage: "Ghost job · Frontend Dev", excerpt: "This exact role has been posted for 11 months. On a call, the recruiter admitted there's no budget for it yet; they're “building a pipeline”. Check how long a listing has been up before applying.", relatable: 711, flags: 302, comments: 96, time: "4 days ago" },
  { id: "s14", userId: "u9", companyId: "nimbus", stage: "Respectful interview · Product Manager", excerpt: "They sent the agenda a day early, the interviewers joined on time, and the call ended at the minute it was scheduled to. Small things, but they tell you how the team runs.", relatable: 184, flags: 1, comments: 12, time: "5 days ago" },
  { id: "s15", userId: "u2", companyId: "hushloop", stage: "Auto-rejected mid-interview · Product Designer", excerpt: "Halfway through my interview with the hiring manager, an automated rejection landed in my inbox. The manager had no idea why. Their system had already closed the role.", relatable: 538, flags: 249, comments: 75, time: "6 days ago" },
];

export const getCompany = (id: string): Company => {
  const company = companies.find((item) => item.id === id);
  if (company) return company;
  throw new Error(`Unknown mock company: ${id}`);
};
export const getUser = (id: string): User => {
  const user = users.find((item) => item.id === id);
  if (user) return user;
  throw new Error(`Unknown mock user: ${id}`);
};

// ---------- dashboard ----------

// Sidebar tagline under the logo: a random one on every page load.
export const sidebarTaglines = [
  "Recruiters hate this one simple app.",
  "Where “we'll get back to you” comes to die.",
  "Receipts, not vibes.",
  "Unlike HR, we actually load.",
  "The group chat, but organised.",
  "Your résumé's therapist.",
  "Ghost them back. Politely.",
  "Round 7? We've got stories.",
  "Seen. Replied. Revolutionary.",
  "Salary bands, unbanned.",
  "No thought leaders were harmed.",
  "The anti-LinkedIn.",
  "Now with 0% corporate jargon.",
  "Culture fit? Let's check the receipts.",
  "We don't do “quick syncs”.",
  "Where offer letters get fact-checked.",
  "Your CTC is none of their business.",
  "Take-homes are homework. We said it.",
  "Powered by unanswered follow-ups.",
  "Hiring's lost-and-found.",
  "Because “competitive salary” isn't a number.",
  "Spill it. Anonymously.",
  "Every ghost has a story.",
  "We circle back. Every time.",
  "The only feed without humblebrags.",
  "Pizza Friday is not a benefit.",
  "Red flags, sorted by colour.",
  "Where the “family” gets reviewed.",
  "Interview marathons, now with medals.",
  "Proudly unfollowed by HR.",
  "Your notice period's support group.",
  "Keeping hiring honest since today.",
  "Fewer rounds. More receipts.",
  "No ring lights required.",
  "We read the JD so you don't have to.",
  "Ghosted, but make it useful.",
  "Silence is data. We log it.",
  "The truth has entered the chat.",
  "Where ‘fast-paced’ gets translated.",
  "A support group with a Flag Score.",
  "Out-of-office: forever. Not us.",
  "Hope is not a hiring strategy.",
  "Your follow-up email's final form.",
  "Warning labels for job posts.",
  "Anonymous. Specific. Unbothered.",
  "The recruiter's worst Monday.",
  "Where “let's take this offline” goes online.",
  "Honest reviews. Zero headcount.",
  "Candidate experience, rated by candidates.",
  "Like Glassdoor, but with a spine.",
  "Bringing receipts to the final round.",
  "The HR department HR fears.",
  "Wear many hats? We rate the hats.",
  "Your 3 am job-hunt companion.",
  "Offer revoked? Story approved.",
  "Better feedback than your last interview.",
  "Your anonymity is non-negotiable. Unlike their offer.",
  "Hiring gossip, peer-reviewed.",
  "Where ghost jobs get exorcised.",
  "Now hiring: nobody. Now helping: everyone.",
  "Transparency, as a service.",
  "We put the “human” back in human resources.",
] as const;

// Rotating lines on the loading screen while the session is checked.
export const loadingLines = [
  "Sneaking you in…",
  "Checking you're not a recruiter…",
  "Loading faster than an HR reply…",
  "Scheduling round 7 of 7… just kidding.",
  "Putting on your disguise…",
  "Dodging a surprise take-home…",
  "Reading the receipts…",
  "Circling back. Unlike some people.",
  "Negotiating your in-hand salary…",
  "Waiting on “final approvals”…",
  "Asking HR for an update. Don't hold your breath.",
  "Skipping the “quick sync”…",
] as const;

// "Today's prompt": one is picked per day (same all day, different tomorrow). See HomeView.
export const dashboardPrompts = [
  "Got ghosted after a final round? The next candidate deserves to know.",
  "Did an offer change at the last minute? Drop the receipts.",
  "Had a genuinely good interview? Green flags need love too.",
  "What's the longest you've waited for a reply? Spill it.",
  "Did a “quick chat” turn into a full interview? Tell us.",
  "Ever been asked your current CTC in the first five minutes?",
  "Did a take-home eat your whole weekend? Warn the next person.",
  "Did the job turn out nothing like the JD? Write it down.",
  "Got rejected with actually useful feedback? Shout them out.",
  "Were you interviewed by someone who hadn't read your CV?",
  "Did an offer get revoked after you resigned? People need to know.",
  "Found a job posting that's been open for months? Ghost job alert.",
  "How many rounds was too many? Count them for us.",
  "Did a recruiter vanish mid-process? Tell the tale.",
  "Did the salary on the offer match the posting? Receipts, please.",
  "Had an interview end right on time? Small green flags count.",
  "Did they ask for a bond or a notice buyout surprise? Share it.",
  "Got a “we'll get back to you” that never came back?",
  "Did a company treat you with genuine respect? Give them credit.",
  "What's one question you wish you'd asked in the interview?",
  "Did the panel all describe a different role? We believe you.",
  "Were you rescheduled more times than you can count?",
  "Did a hiring manager make your day, for once? Say so.",
  "Did your background check drag on forever? Tell us what happened.",
  "What red flag did you spot too late? Save someone else.",
  "Did the “family culture” come with unpaid weekends?",
  "Got an automated rejection within minutes of applying?",
  "Did your notice period become their problem? Share the saga.",
  "Were you lowballed with “it's a great learning opportunity”?",
  "What made you say yes to your best job ever?",
  "Did they promise remote and then say “hybrid, actually”?",
  "Had an interviewer who was clearly on their phone the whole time?",
  "Did a referral actually help, or just vanish too?",
  "Was the variable pay a surprise at the final stage?",
  "Did a company reply faster than expected? Let's celebrate that.",
  "What would you tell yourself before that interview?",
  "Did you get a counter-offer drama story? We're listening.",
  "Did they ghost you, then repost the same role? Receipts.",
  "What's the pettiest reason you were rejected?",
  "Did a recruiter actually go above and beyond? Tell us who (company, not person).",
] as const;

export const salaryPulse = [
  { role: "Backend Engineer", range: [14, 32], median: 22 },
  { role: "Product Designer", range: [10, 26], median: 17 },
  { role: "Data Analyst", range: [8, 20], median: 13 },
  { role: "Product Manager", range: [18, 42], median: 28 },
] as const;

export const notifications = [
  { id: "n1", text: "Your RedKite story is helping people: 42 new relatable reactions.", time: "8 min ago", unread: true },
  { id: "n2", text: "HushLoop dropped to 27. Three new ghosting reports this week.", time: "2 hr ago", unread: true },
  { id: "n3", text: "Someone replied to your chitchat on the Nimbus Labs story.", time: "Yesterday", unread: false },
] as const;

export const insightOutcomes = [
  { outcome: "Ghosted", count: 412, tone: "var(--flag-red)" },
  { outcome: "Rejected", count: 268, tone: "var(--flag-amber)" },
  { outcome: "Offer revoked", count: 96, tone: "var(--flag-red)" },
  { outcome: "Ghost job", count: 74, tone: "var(--flag-red)" },
  { outcome: "Offer", count: 231, tone: "var(--flag-green)" },
] as const;

export const insightWeekly = [
  { week: "W1", ghosted: 38, offers: 21 }, { week: "W2", ghosted: 44, offers: 19 }, { week: "W3", ghosted: 51, offers: 24 },
  { week: "W4", ghosted: 47, offers: 27 }, { week: "W5", ghosted: 58, offers: 22 }, { week: "W6", ghosted: 63, offers: 25 },
] as const;

export const topRedFlags = [
  { label: "No reply after the final round", share: 41 },
  { label: "Asked for current CTC first", share: 33 },
  { label: "Unpaid multi-day take-home", share: 27 },
  { label: "Salary below the posted range", share: 22 },
  { label: "Offer withdrawn after resigning", share: 9 },
] as const;

// Average days until a first reply, slowest companies first (sample data).
export const replyTimes = [
  { company: "HushLoop", days: 34 },
  { company: "RedKite", days: 29 },
  { company: "Echoverse", days: 23 },
  { company: "VelvetByte", days: 19 },
  { company: "StackSprout", days: 16 },
];

// Ghosting reports per day this week (sample data).
export const ghostingThisWeek = [
  { day: "Mon", reports: 18 }, { day: "Tue", reports: 24 }, { day: "Wed", reports: 21 }, { day: "Thu", reports: 27 },
  { day: "Fri", reports: 31 }, { day: "Sat", reports: 12 }, { day: "Sun", reports: 13 },
];

// Median days to hear back after each round (sample data).
export const daysByRound = [
  { round: "Application", days: 9 }, { round: "Screening", days: 5 }, { round: "Technical", days: 7 },
  { round: "Final round", days: 12 }, { round: "Offer", days: 4 },
];

export const timelineData = [
  { round: "Applied", days: 0 },
  { round: "Screen", days: 4 },
  { round: "Skills", days: 9 },
  { round: "Panel", days: 15 },
  { round: "Decision", days: 22 },
];

export const landingHero = {
  eyebrow: "The truth has entered the chat.",
  title: "Hiring is broken.",
  emphasis: "The receipts are not.",
  description:
    "Anonymous stories, unfiltered company ratings, and the details recruiters would rather leave on read.",
  primaryCta: "Share your story",
  secondaryCta: "Explore companies",
  privacyNote: "No name. No company email. No performative LinkedIn thread required.",
};

export const heroRotatingLines = [
  "Tell the real story.",
  "Rate the red flags.",
  "Your closure is overdue.",
  "Ghost them back with receipts.",
  "Silence is still an answer.",
  "Six rounds is a red flag.",
  "Your time is not free labor.",
  "The job post needs receipts.",
  "Take-homes should pay.",
  "The plot twist was unpaid work.",
];

export const heroScene = {
  status: "Final round | HushLoop",
  headline: "Six interviews later, the only thing moving was my follow-up email.",
  score: 27,
  scoreLabel: "Flag score | “we’ll circle back”",
  receiptLabel: "The candidate timeline",
  receipt: "Applied in May. Finished the assignment in June. Got “great news soon” in July. It is now emotionally September.",
  activity: "Last recruiter activity",
  activityValue: "34 days ago",
  footer: "A timeline is not a hiring strategy.",
};

export const marqueeItems = [
  "‘Competitive pay’ is not a number",
  "Six rounds is a hostage situation",
  "Your take-home is not their roadmap",
  "A rejection is still a reply",
  "If it’s urgent, why are you ghosting?",
  "Vibes are not a benefits package",
  "Pizza Friday is not a raise",
  "“We’re a family” — then pay me like one",
  "Seen at 10:02. Replied never.",
];

export type Stat = { value: number; label: string; prefix?: string; suffix?: string };

// Shown until the stats API exists (see src/lib/stats.ts). Every number here is true today.
export const prelaunchStats: Stat[] = [
  { value: 100, suffix: "%", label: "anonymous by default" },
  { value: 0, label: "recruiters with admin access" },
  { value: 0, prefix: "₹", label: "to join. Free, forever" },
  { value: 1, label: "story needed to warn someone" },
];


// Ghost-o-meter: stages by days since "we'll get back to you". Sorted by `from`.
export const ghostStages = [
  { from: 0, name: "Still breathing", tone: "text-flag-green", verdict: "They're probably just scheduling. Probably.", followUp: "Hi! Just checking in on next steps. Excited to hear back." },
  { from: 5, name: "Mild haunting", tone: "text-flag-amber", verdict: "Read receipts on. Replies off. Classic.", followUp: "Hi again, wanted to follow up on my interview from last week. Any update on timelines?" },
  { from: 12, name: "Fully ghosted", tone: "text-flag-red", verdict: "The role is 'on hold'. So is their conscience.", followUp: "Hello. I'm still interested, but I'm also still alive. A yes, no or maybe would be lovely." },
  { from: 25, name: "Ghost job energy", tone: "text-flag-red", verdict: "The listing is still live. The headcount never was.", followUp: "Closing the loop on my side. Wishing you luck filling a role that may not exist." },
] as const;

// Recruiter "slaps" dealt when you hit a mine in the hiring minefield.
export const recruiterSlaps = [
  { title: "The CTC question", line: "“What's your current CTC?” Your ceiling is now our budget." },
  { title: "Surprise take-home", line: "Due Monday. It looks suspiciously like our Q4 roadmap." },
  { title: "One more round", line: "Round seven, with the founder's cousin." },
  { title: "Aspirational range", line: "The posted range was a vibe. Here's 30% less." },
  { title: "Left on read", line: "Seen at 10:02. Replied never." },
  { title: "Offer revoked", line: "The role got ‘recalibrated’. Your rent didn't." },
  { title: "The family speech", line: "“We're a family here.” Unpaid weekends are tradition." },
  { title: "Urgent hiring", line: "Urgent enough to repost daily. Not urgent enough to reply." },
  { title: "Budget alignment", line: "They loved your profile. Finance loved saving money more." },
  { title: "Culture fit", line: "You passed every round but didn't laugh hard enough at the founder's joke." },
  { title: "Calendar Tetris", line: "Rescheduled four times. Somehow you're the one who must be flexible." },
  { title: "The vanishing panel", line: "You joined on time. The interviewers joined another dimension." },
  { title: "Shape-shifting JD", line: "You applied for frontend. Surprise, they need DevOps, sales and a little magic." },
  { title: "Exposure package", line: "The salary is confidential. The workload will be very public." },
  { title: "Internal candidate", line: "The role was filled before your first round. Thanks for the free rehearsal." },
  { title: "Instant rejection", line: "Rejected at 2:03 a.m. Even the bot keeps better hours than HR." },
  { title: "Reference marathon", line: "Three references, two managers and your class teacher. Still pending approval." },
  { title: "Notice-period maths", line: "They need you tomorrow, after making you wait six weeks." },
  { title: "Competitive pay", line: "Competitive with your electricity bill, perhaps." },
  { title: "Tiny assignment", line: "Just build the product. Branding and deployment are optional." },
  { title: "Position on hold", line: "The job is meditating. Please wait without asking questions." },
  { title: "Feedback soon", line: "Soon is a flexible unit of time measured in financial quarters." },
] as const;

// Auth page showcase: recruiter messages and what they actually mean.
export const authInbox = [
  { from: "Talent Team", text: "We'll get back to you shortly!", status: "Seen · 34 days ago", truth: "They will not get back to you shortly." },
  { from: "HR, Hiring", text: "What's your current CTC?", status: "Delivered · just now", truth: "Your old salary is about to become your new ceiling." },
  { from: "Recruiter", text: "Just one more quick round!", status: "Round 6 of ∞", truth: "The founder's cousin would like a system design." },
  { from: "People Ops", text: "The role is on hold for now.", status: "Seen · 2 hrs after your resignation", truth: "There was never a headcount." },
  { from: "Hiring Manager", text: "Small take-home, max 2 hours.", status: "17 requirements attached", truth: "Your weekend is now their Q4 roadmap." },
] as const;

export const authTestimonials = [
  { quote: "I finally found out the five-round process wasn't just me.", who: "Backend engineer, Pune" },
  { quote: "The salary receipts saved me from a heroic lowball.", who: "Product designer, Bengaluru" },
  { quote: "Anonymous, honest, and oddly therapeutic.", who: "Data analyst, Hyderabad" },
  { quote: "Read three stories, skipped one interview, saved my whole weekend.", who: "Frontend dev, Gurugram" },
] as const;

export const authPromises = ["We never tell your HR", "Companies can't buy your name", "No surprise take-homes", "Open source, so check us", "Free, forever"] as const;

// Fictional profile used by the landing page's "reveal your details" demo.
export const revealDemo = {
  name: "Riya Menon",
  fields: [
    { key: "name", label: "Name", value: "Riya Menon" },
    { key: "role", label: "Role", value: "Backend Engineer" },
    { key: "experience", label: "Experience", value: "5 yrs exp" },
    { key: "city", label: "City", value: "Bengaluru" },
    { key: "linkedin", label: "LinkedIn", value: "in/riya-menon" },
  ],
} as const;

// Landing-page marketing pitch. The positioning: review sites rate the *workplace* once you're in;
// Ghosted rates the *hiring*, the part where candidates actually get hurt. No competitor is named.
export const landingPitch = {
  eyebrow: "The pitch",
  headline: ["Everyone rates the job.", "Nobody rates the hiring."],
  manifesto: [
    "You gave them six rounds.",
    "A weekend-long “two-hour” assignment.",
    "Your notice period, your references, your hopes.",
    "They gave you silence.",
    "Ghosted is where that silence finally gets a score.",
  ],
  pillars: [
    { title: "Receipts, not ratings", copy: "Not another five-star vibe check. Rounds, days waited, pay vs the posting, offers pulled. The stuff that actually decides whether you should apply.", stat: "5", statLabel: "things we score, not 1 star rating" },
    { title: "Anonymous by design", copy: "Your name is encrypted, your handle is random, and nothing links your anonymous posts to you. Go public only if you want the credit.", stat: "0", statLabel: "names shown unless you say so" },
    { title: "Nobody's for sale", copy: "No employer dashboards. No paid profile polishing. No “remove this review” button for anyone with a budget. And the code is open, so you can check.", stat: "₹0", statLabel: "companies can pay to change a score" },
  ],
  closer: { line: "Recruiters have ATS software, hiring managers and a whole HR team.", punch: "Candidates finally have Ghosted.", cta: "Join the receipts club" },
} as const;

// "Why Ghosted" comparison. Other platforms are described by type, never named, and claims about
// them stay general ("often", "usually"); claims about Ghosted describe what the product really does.
export const whyGhosted = {
  eyebrow: "Why post here, not there",
  title: "Your story deserves better than a feed.",
  intro: "You could post it on the professional network where your manager follows you. Or on a big review site with an employer dashboard. Or in a group chat that forgets it by Friday. Here's the difference.",
  places: [
    { name: "The professional network", quip: "Where your boss, your team and every future recruiter read your posts. Honesty there has a price." },
    { name: "The big review sites", quip: "Built as much for employers as for you. Profiles, dashboards, polished responses." },
    { name: "The group chat", quip: "Great tea, gone by Friday. Nobody can find it before their interview." },
  ],
  rows: [
    { topic: "Your identity", elsewhere: "Usually your real name and photo, or an account that can be traced back to you.", ghosted: "Anonymous by default. Your name is encrypted, and it's only shown if you choose to go public." },
    { topic: "What you control", elsewhere: "Often all or nothing: public, or don't post.", ghosted: "Pick exactly which details appear (name, role, city, LinkedIn), and switch back anytime." },
    { topic: "Who pays", elsewhere: "Often funded by employer products, which isn't the same as being on your side.", ghosted: "Companies can't pay us to hide, edit, bury or boost a story. Ever." },
    { topic: "Can you check?", elsewhere: "Closed code. You take their word for how your data is handled.", ghosted: "Open source. Anyone can read exactly how your identity is protected." },
    { topic: "What it's built for", elsewhere: "Generic star ratings for workplaces in general.", ghosted: "Hiring specifically: rounds, days of silence, pay vs the posting, offers revoked." },
    { topic: "Shelf life", elsewhere: "A post that's buried in two days, or a chat that scrolls away.", ghosted: "Every story is pinned to the company, so the next candidate finds it before their interview." },
    { topic: "Cost", elsewhere: "Free to read, with the best bits behind a paywall or a sign-up wall.", ghosted: "Free to read, free to post, free forever." },
  ],
  footnote: "We describe the kinds of places people usually post, not any particular company. Every platform is different, and some do parts of this well.",
} as const;

// The "empty room" objection: why post on a new platform when bigger ones already have millions of
// users? Answered honestly, with what's true from day one. Competitors are described by type only.
export const landingObjection = {
  eyebrow: "The obvious question",
  quote: "“The big sites already have millions of people. Why post where nobody is?”",
  answer: "Good. That's the point.",
  intro: "Millions of users is exactly why your story disappears there. On Ghosted it doesn't have to compete with anything: it's pinned to the company, and it's waiting for the one reader who needs it most, the next candidate about to walk into the same process.",
  reasons: [
    { title: "One reader is enough", copy: "Your story isn't a post that has to go viral. It's a receipt filed under the company's name, found by whoever looks them up before their interview. It works with an audience of one.", tag: "Pinned, not buried" },
    { title: "Be the first receipt", copy: "On a crowded site you're review number 4,000. Here, your story can be the first thing anyone reads about that company's hiring, and it shapes its Flag Score from day one.", tag: "First stories count most" },
    { title: "Useful before anyone else joins", copy: "The Waiting Room tracks every application you're waiting on, counts the days of silence and tells you when a follow-up is fair. That works if you're the only person here.", tag: "Value on day one" },
    { title: "They measure something else", copy: "The big review sites rate working at a company, after you got in. Nobody records the part that hurts: rounds, days without a reply, pay vs the posting, offers pulled, jobs that never existed.", tag: "Hiring, specifically" },
    { title: "No blowback, ever", copy: "The professional network is where your manager, your team and every future recruiter read your posts. Here you're anonymous by default, and nothing links your story to you.", tag: "Honesty without a price" },
    { title: "Clean by design", copy: "Goofy, our AutoMod, removes vulgarity, hides people's names and checks accusations before anything goes up, so what you read here is worth trusting, even early.", tag: "Moderated from post one" },
  ],
  timeline: [
    { when: "Today", what: "You share what happened, in about three minutes, anonymously." },
    { when: "Next week", what: "Someone searching that company finds it before their final round." },
    { when: "Next month", what: "A few more stories land, and the company has a real Flag Score." },
    { when: "Next year", what: "Nobody walks into that process blind again." },
  ],
  closer: { line: "Every platform with millions of users started with a first thousand.", punch: "Be in the first thousand that make hiring honest.", cta: "Share the first receipt" },
  // What we're for. Ghosted exists to make hiring better, never to talk people out of applying.
  goal: {
    title: "Our goal: hiring without the frustration",
    lead: "Ghosted isn't here to scare you off a job. It's here so you can apply with your eyes open, and so the processes that waste people's time finally feel some pressure to change.",
    points: [
      { title: "Apply with confidence", copy: "Know the rounds, the usual wait and the real pay before you start, so nothing about the process catches you off guard." },
      { title: "Push back on bad processes", copy: "Endless rounds, unpaid ‘assignments’, silence after the final interview: when it's written down where everyone can see it, it gets harder to keep doing." },
      { title: "Give good employers credit", copy: "Companies that reply fast and treat candidates well rise to the top. Green flags are as loud as red ones here." },
      { title: "Keep candidates going", copy: "A rejection or a ghosting says more about the process than about you. Seeing that it happened to others too makes it easier to keep applying." },
    ],
  },
} as const;

export const landingSteps = [
  ["01", "Tell the whole plot", "Drop the timeline, the salary switch-up, and the ‘quick chat’ that ate your afternoon."],
  ["02", "Rate the reality", "Score the replies, pay, culture, and whether anyone remembered your name."],
  ["03", "Save a fellow human", "One honest post can rescue someone from six rounds and a surprise deck."],
] as const;

export const landingProofs = [
  ["The salary range", "Posted: ₹18–24 LPA", "Offered: ‘Let’s first see how you perform.’"],
  ["The take-home", "Estimated: 90 minutes", "Included: strategy, design, code, deployment, emotional damage."],
  ["The follow-up", "Sent: Tuesday", "Status: spiritually delivered."],
] as const;
