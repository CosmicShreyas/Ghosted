// Company and legal pages. Before launch, appoint a grievance officer, publish their monitored
// contact address below, and have Indian counsel review the finished documents.
// Written against: Digital Personal Data Protection Act, 2023 and DPDP Rules, 2025;
// Information Technology Act, 2000; IT (Intermediary Guidelines and Digital Media Ethics Code) Rules, 2021;
// Bharatiya Nyaya Sanhita, 2023.

export const entity = {
  brand: "Ghosted",
  site: "the Ghosted website and related services",
  effective: "2 October 2026",
  github: "https://github.com/CosmicShreyas/Ghosted",
  email: {
    support: "ghosted.help+support@gmail.com",
    privacy: "ghosted.help+privacy@gmail.com",
    grievance: "ghosted.help+grievance@gmail.com",
  },
};

export type EmailBlock = { type: "email"; email: string; label: string; description?: string };
// Email blocks deliberately show a descriptive label instead of printing the address on the page.
export type Block = string | string[] | EmailBlock;
export type Section = { id: string; heading: string; blocks: Block[] };
export type Doc = { eyebrow: string; title: string; intro: string; updated: string; sections: Section[] };

const e = entity;

export type Founder = { name: string; role: string; seed: string; pastel: string; linkedin: string; bio: string };

export const founders: Founder[] = [
  { name: "Shreyas", role: "Founder", seed: "shreyas-founder", pastel: "bg-avatar-sky", linkedin: "in/shreyasbrilliant", bio: "Spent too many evenings reading friends' screenshots of “we'll get back to you” messages that never got a follow-up. Builds the product and keeps the platform honest." },
  { name: "Shreya", role: "Co-founder", seed: "shreya-cofounder", pastel: "bg-avatar-lilac", linkedin: "in/shreyabrilliant", bio: "Believes the best career advice comes from the person who interviewed there last month. Shapes the community, the rules and every word you read here." },
];

export const aboutDoc: Doc = {
  eyebrow: "About Ghosted",
  title: "We built the place we wished existed.",
  intro: "Ghosted is a free, anonymous platform where job seekers, employees and ex-employees in India share what really happens at work and in hiring, and rate companies on how they treat people. One honest story can save the next person weeks of silence, an unpaid assignment or a lowball offer.",
  updated: e.effective,
  sections: [
    { id: "story", heading: "Our story", blocks: [
      "It started with our group chats. Every week someone we knew had a new story: four interview rounds followed by total silence, an offer withdrawn a day after they resigned, a “two-hour” assignment that ate an entire weekend, a salary range that shrank at the final call.",
      "Then we noticed it was everywhere: in comment sections, in Reddit threads, in conversations with strangers at cafés. So many people were struggling to get hired, being ghosted, underpaid or burnt out, and almost none of them could say it publicly. Everyone was worried the same thing: what if my manager sees this? What if HR finds out? What if the next company I apply to thinks I'm difficult?",
      "So the stories stayed in private chats, the same companies kept doing the same things, and the next candidate walked into the same trap. We decided that had to change.",
    ] },
    { id: "why", heading: "Why we built Ghosted", blocks: [
      "We wanted a place where anyone can speak honestly about a company without being bothered by their HR, their manager or a future recruiter. That meant making anonymity the default, not an afterthought.",
      "On Ghosted you post under a random handle. Your name, email and employer are never shown, and companies can't pay to find out who you are. If you want credit for your story, you can choose to reveal your role, experience or LinkedIn, and only those details.",
      "At its heart, Ghosted is a place to share the pain of every candidate, employee and ex-employee, so that it turns into something useful: a warning, a benchmark, a reason for a company to do better.",
    ] },
    { id: "vs-linkedin", heading: "Why not just post on LinkedIn?", blocks: [
      "LinkedIn is where your boss, your colleagues and every future recruiter can see what you write. That's great for announcing a new job, and terrible for telling the truth about a bad one.",
      [
        "Your name is attached to everything. On LinkedIn, honesty can cost you your next offer. On Ghosted, you're anonymous unless you decide otherwise.",
        "Posts disappear into a feed. A LinkedIn post is gone in two days. On Ghosted, every story is attached to the company's page, where the next candidate will find it before their interview.",
        "Stories become data. Ratings roll up into a company's Flag Score, and salary reports build real pay ranges, so one experience adds to a bigger picture.",
        "Built for candidates, not employers. Review sites that sell recruiting services to companies have a conflict of interest. Companies can't pay us to hide, edit or boost reviews.",
        "Specific to hiring. We ask about the things that matter: number of rounds, time to hear back, whether the pay matched the posting. Not generic star ratings.",
      ],
      "Twitter threads, Reddit posts and WhatsApp forwards help too, but they're scattered, hard to search and easy to lose. Ghosted puts every experience in one place, organised by company.",
    ] },
    { id: "what", heading: "What you can do here", blocks: [[
      "Share your hiring experience anonymously: the rounds, the timelines, the pay and the outcome.",
      "Rate companies on what you actually saw: everyone rates the hiring process and communication, people who got an offer also rate pay transparency, and people who joined also rate work culture and growth.",
      "Read other candidates' experiences before you apply, interview or accept an offer.",
    ]] },
    { id: "flag-score", heading: "How the Flag Score works", blocks: [
      "Every company gets a Flag Score from 0 to 100, based on ratings from candidates who went through its hiring process. Each story counts only the areas it rated, and each area shows how many stories it's based on.",
      ["70 to 100: Green Flag. Candidates generally had a fair, respectful experience.", "40 to 69: Mixed Signals. Experiences vary; read the stories.", "0 to 39: Red Flag. Candidates consistently report serious problems."],
      "Scores reflect community opinion. They are not audits or certifications, and companies cannot pay to change them.",
    ] },
    { id: "principles", heading: "What we stand for", blocks: [[
      "Anonymous by default. You never have to reveal who you are. If you choose to share details, you decide which ones.",
      "Never for sale. Companies cannot buy, hide or edit reviews, and we do not sell your personal data.",
      `Open by design. Ghosted is open source (${e.github}), so anyone can check how your identity is protected instead of taking our word for it.`,
      "Fair to everyone. We remove content that is abusive, false or identifies private individuals, even when it targets a company we'd rather not defend.",
      "Useful over loud. The best posts are specific: what happened, when, and what the next candidate should know.",
    ]] },
    { id: "companies", heading: "For employers", blocks: [
      "Companies can take part publicly, free: a verified representative can post one clearly labelled reply per story and one on the company page, mark a story as heard, being looked into or fixed, post up to four \"You said, we did\" notes a month linked to the stories behind them, pledge how fast candidates hear back, and see aggregate-only insights. They can't edit, hide, rank or remove stories, can't see who wrote about them, and no one can pay for any of it. More at /for-hr.",
      "To ask for a removal or a correction, use \"Request a correction\" on the story or company page. We acknowledge within 24 hours and decide within 15 days. We do not remove honest reviews simply because they are negative.",
    ] },
    { id: "contact", heading: "Contact", blocks: [
      "Ghosted is currently an independent, pre-launch project and does not claim to be a private limited company or to maintain a registered office.",
      "For general questions or reports, use Feedback & Support in the app or contact us by email.",
      { type: "email", email: e.email.support, label: "Email Ghosted Support", description: "General questions, account help, and company enquiries" },
      { type: "email", email: e.email.privacy, label: "Email the Privacy team", description: "Access, correction, deletion, and other personal-data requests" },
      { type: "email", email: e.email.grievance, label: "Submit a grievance", description: "Content complaints, appeals, and legal notices" },
    ] },
  ],
};

export const privacyDoc: Doc = {
  eyebrow: "Privacy Policy",
  title: "Your identity is the whole point. We protect it.",
  intro: `This policy explains what personal data ${e.brand} collects, why, and the rights you have over it under the Digital Personal Data Protection Act, 2023 ("DPDP Act") and the rules made under it. Ghosted ("we", "us") is the Data Fiduciary for your personal data.`,
  updated: e.effective,
  sections: [
    { id: "summary", heading: "The short version", blocks: [[
      "Your posts are anonymous by default. Other users and companies see a random handle, not your name or email.",
      "We collect only what we need to run the service and keep it safe.",
      "We never sell your personal data, and we never share your identity with employers.",
      "You can access, correct or delete your data, and withdraw consent, at any time.",
    ]] },
    { id: "collect", heading: "1. Data we collect", blocks: [
      "Data you give us:",
      ["Account details: your full name, email address and password. Passwords are stored only in hashed form, and your name is encrypted at rest and never shown unless you choose to reveal it.", "Profile choices: your generated handle, chosen avatar, and any optional details you decide to show publicly, such as name, role, experience, city or LinkedIn URL.", "Content: stories, ratings, salary ranges, comments and reactions you post.", "Messages you send us, such as support requests, reports and grievances."],
      "Data collected automatically:",
      ["Technical data: IP address, device and browser type, and log records of access, used for security and abuse prevention.", "Sign-in records: for each device you are signed in on, its type (phone, tablet or computer), browser, operating system, an approximate city-level location derived from your network's public IP address (looked up through our hosting provider or the geolocation service ipwho.is), a masked form of that IP address with its last half hidden (for example 49.36.x.x; the full address is never stored), a random device identifier kept in a cookie so one browser shows up once instead of once per sign-in (only a keyed hash of it is stored), and when it signed in and was last active. We show these to you in Settings → Security and in the security email sent for each new sign-in, and delete a record as soon as that device is signed out.", "Usage data: pages viewed and features used, in aggregated form, to improve the service.", "Feedback you send us: what you write, the part of the app it's about, an optional rating, and for bug reports, if you leave the box ticked, your browser, screen size, theme and the page you were on (never your IP address). Only the Ghosted team reads it."],
      "We do not ask for, and ask you not to post, sensitive information such as financial account details, health information, government ID numbers or caste, religion or other personal characteristics.",
      "If you verify as a company representative, we send a code to your work email and keep only its domain (never the address), the company, and when you were verified or revoked. We record which stories about that company you opened, to show authors a count (never who), and keep what you post as a representative. To protect candidates, representatives cannot see who wrote about their company.",
    ] },
    { id: "purpose", heading: "2. Why we use it", blocks: [
      "We process personal data only for the purposes described below, on the basis of your consent or for legitimate uses permitted under Section 7 of the DPDP Act:",
      ["To create and secure your account and let you log in.", "To publish your content under your anonymous handle, or with the details you choose to reveal.", "To calculate company Flag Scores and show aggregated salary and hiring data.", "To detect and prevent spam, fraud, abuse and fake reviews.", "To respond to your requests, reports and grievances.", "To comply with Indian law, court orders and lawful requests from government authorities."],
    ] },
    { id: "anonymity", heading: "3. How anonymity works", blocks: [
      "Your email address and any details you have not chosen to reveal are never shown to other users or to companies. Employers cannot pay us to learn who wrote a review.",
      "Anonymity has limits you should know about. What you write can identify you: a very specific timeline, team name or event may be recognisable to your interviewer. We may also be legally required to disclose information to law enforcement or a court under a valid order issued under Indian law. Where the law allows, we will tell you before we do.",
    ] },
    { id: "sharing", heading: "4. Who we share it with", blocks: [[
      "Service providers who process data on our behalf, such as cloud hosting, email delivery and security, under contracts that require them to protect it and use it only for our instructions.",
      "Razorpay, only if you choose to donate: it processes the payment (UPI, card, netbanking or wallet) directly, so we never see or store your card or bank details. We keep the amount, the date, the Razorpay order and payment references, your optional note, and whether you asked to appear on the thank-you wall.",
      "Authorities, where required by law, a court order or a lawful direction under the Information Technology Act, 2000 or other applicable law.",
      "A successor entity, if Ghosted is merged or acquired, subject to this policy.",
    ], "We do not sell personal data or share it with employers, recruiters or advertisers."] },
    { id: "retention", heading: "5. How long we keep it", blocks: [
      "We keep account data for as long as your account is active. If you delete your account, we erase your personal data within 30 days, except where we must keep it longer to meet a legal obligation, for example security logs and records we are required to retain under the DPDP Rules, 2025 and the Intermediary Rules, 2021.",
      "Posts you have published may remain on the platform in anonymised form after deletion, with no link back to you, unless you delete them first.",
    ] },
    { id: "rights", heading: "6. Your rights", blocks: [
      "As a Data Principal under the DPDP Act, you have the right to:",
      ["Access a summary of the personal data we hold about you and how we process it.", "Correct, complete or update inaccurate or incomplete data.", "Erase your personal data, subject to legal retention requirements.", "Withdraw your consent at any time. This will not affect processing already carried out, but we may no longer be able to provide the service.", "Nominate another person to exercise your rights in the event of your death or incapacity.", "Seek grievance redressal from us, and then complain to the Data Protection Board of India."],
      "Most of this can be done from your account settings. You can also use Feedback & Support in the app or contact the Privacy team. We may ask you to verify your identity before acting on a request.",
      { type: "email", email: e.email.privacy, label: "Contact the Privacy team" },
    ] },
    { id: "children", heading: "7. Children", blocks: [
      "Ghosted is only for people aged 18 and over. We do not knowingly process the personal data of children as defined by the DPDP Act. If we learn that an account belongs to someone under 18, we will delete it.",
    ] },
    { id: "security", heading: "8. Security and breaches", blocks: [
      `We use reasonable security safeguards to protect personal data, including encryption in transit, hashed passwords, AES-256 encryption of names and other identifying details at rest, strict access controls, rate limiting and monitoring. Our code is open source at ${e.github}, so these safeguards can be independently checked.`,
      "If a personal data breach occurs, we will inform affected users and the Data Protection Board of India as required by the DPDP Act and the DPDP Rules, 2025, explaining what happened, the likely impact and the steps we are taking.",
    ] },
    { id: "cookies", heading: "9. Cookies", blocks: [
      "We use essential cookies to keep you logged in and secure, and privacy-friendly analytics to understand overall usage. We do not use third-party advertising or cross-site tracking cookies.",
      "On your first visit we ask for your choice: Accept all (essential cookies plus analytics), Necessary only, or Decline (no optional cookies; essential ones remain, because signing in can't work without them). Your choice is remembered for one year in your browser and you can change it at any time from “Cookie settings” at the bottom of every page. Withdrawing consent is as easy as giving it, and doesn't affect anything you've already done on Ghosted.",
    ] },
    { id: "transfers", heading: "10. Where data is stored", blocks: [
      "Your data may be processed on servers located in or outside India. Any transfer outside India is made only in accordance with Section 16 of the DPDP Act and any restrictions notified by the Central Government.",
    ] },
    { id: "grievance", heading: "11. Grievances and privacy requests", blocks: [
      "Ghosted is currently in pre-launch testing. Before public launch, we will appoint a Grievance Officer and publish that person's name, monitored contact details, and the complaint mechanism here, as required by Rule 3(2) of the Information Technology (Intermediary Guidelines and Digital Media Ethics Code) Rules, 2021.",
      "During testing, use Feedback & Support in the app or the monitored contacts below for privacy requests, content complaints, or account concerns. These temporary routes do not replace the statutory grievance mechanism required for a public launch.",
      { type: "email", email: e.email.privacy, label: "Send a privacy request" },
      { type: "email", email: e.email.grievance, label: "Submit a grievance" },
      "Once launched, complaints will be acknowledged within 24 hours and resolved within the period required by applicable law. Eligible decisions may be appealed to the Grievance Appellate Committee. Rights under the DPDP Act may be pursued through the statutory process when that framework applies.",
    ] },
    { id: "changes", heading: "12. Changes to this policy", blocks: [
      "We may update this policy from time to time. If the changes are significant, we will notify you by email or on the site before they take effect. The date at the top shows when it was last updated.",
    ] },
  ],
};

export const termsDoc: Doc = {
  eyebrow: "Terms & Conditions",
  title: "The ground rules for using Ghosted.",
  intro: `These Terms govern your use of ${e.site} ("Ghosted"). By creating an account or using Ghosted, you agree to these Terms, our Privacy Policy and our Community Rules. If you do not agree, please do not use the service.`,
  updated: e.effective,
  sections: [
    { id: "eligibility", heading: "1. Who can use Ghosted", blocks: [[
      "You must be at least 18 years old and able to enter into a binding contract under the Indian Contract Act, 1872.",
      "You must register with your real, full name as it appears on your government ID, and a working email address you control. Fake, borrowed or impersonated names are not allowed and may lead to the account being closed.",
      "You may hold only one account, and you are responsible for keeping your login details secure.",
      "You must not create an account on behalf of an employer to post reviews about that employer or its competitors.",
    ]] },
    { id: "identity", heading: "2. Your identity stays private", blocks: [
      "We ask for your real name so that every story comes from a real, accountable person. That's what keeps Ghosted trustworthy. It does not mean your name is shown to anyone.",
      [
        "Your name and email are never shown publicly unless you choose to reveal them in your settings. Otherwise others only see your anonymous handle and avatar. What you reveal applies to your whole account: it appears on all your stories and chitchats, including ones posted before, and hiding it again hides it everywhere.",
        "Your full name is stored encrypted, and we never sell, share or disclose your identity to any employer, recruiter, company or other organisation, and they cannot pay us to find out who you are.",
        "The only exception is a valid order from a court or a lawfully authorised government authority under Indian law. Where the law allows, we will tell you before complying.",
      ],
    ] },
    { id: "service", heading: "3. What Ghosted is", blocks: [
      "Ghosted is a platform for users to share their own experiences of hiring processes and to rate companies. We are an intermediary under the Information Technology Act, 2000: we host content posted by users, but we do not write, verify or endorse it.",
      "Flag Scores, ratings and salary figures are aggregated from user contributions. They are opinions, not facts certified by Ghosted, and should not be your only basis for career decisions.",
    ] },
    { id: "content", heading: "4. Your content", blocks: [
      "You keep ownership of what you post. By posting, you give Ghosted a worldwide, non-exclusive, royalty-free licence to host, display, reproduce, adapt (for example, for formatting or translation) and distribute your content on and in connection with the service. This licence ends when you delete the content, except for copies retained as required by law.",
      "You confirm that everything you post:",
      ["Describes your own genuine experience, and is honest and accurate to the best of your knowledge.", "Is your opinion, clearly expressed as such, and does not state falsehoods as fact.", "Does not identify private individuals by name or reveal anyone's personal data, including recruiters and interviewers.", "Does not disclose confidential information, trade secrets or material you are legally or contractually bound to keep private.", "Complies with our Community Rules and all applicable Indian laws."],
    ] },
    { id: "prohibited", heading: "5. What you must not do", blocks: [
      "In line with Rule 3(1)(b) of the Information Technology (Intermediary Guidelines and Digital Media Ethics Code) Rules, 2021, you must not post or share content that:",
      ["Is defamatory, obscene, invasive of another's privacy, harassing, hateful or discriminatory on the basis of religion, caste, gender, disability or any other characteristic.", "You know to be false or misleading, or that impersonates another person or organisation.", "Infringes any patent, trademark, copyright or other intellectual property right.", "Threatens the unity, integrity, defence, security or sovereignty of India, public order, or relations with foreign states.", "Contains software viruses or code designed to disrupt any computer resource.", "Is otherwise unlawful under any law for the time being in force."],
      "You also must not post fake reviews, pay or incentivise others to post reviews, scrape or copy the service at scale, attempt to discover the identity of other users, or interfere with the security of the platform.",
    ] },
    { id: "moderation", heading: "6. Moderation and removal", blocks: [
      "We may review, refuse, edit for formatting, hide or remove content, and suspend or terminate accounts, that we believe in good faith breach these Terms, our Community Rules or the law.",
      "We act on court orders and lawful government directions within the timelines prescribed by the Intermediary Rules, 2021. Complaints about content that exposes a person's private areas, shows nudity or impersonates an individual are acted on within 24 hours of receipt.",
      "If we remove your content or restrict your account, we will tell you why where the law allows, and you may ask us to reconsider through the grievance process below.",
    ] },
    { id: "employers", heading: "7. Employers and reported content", blocks: [
      "Companies may report content they believe is false, defamatory or unlawful through Feedback & Support in the app, including a link to the content and their reasons. We will review it against these Terms and applicable law, including the Bharatiya Nyaya Sanhita, 2023. We do not remove honest opinions simply because they are critical.",
      { type: "email", email: e.email.grievance, label: "Report content by email", description: "Include the content link and the reason for your complaint" },
      "We will not disclose a user's identity to an employer except under a valid order of a competent court or authority.",
      "Verified company representatives can respond to content about their company (official replies, progress steps, change notes and reply pledges) as set out in our Community Rules. Representatives cannot edit, hide, rank or remove content, cannot access the profile of any person who has written about their company, and cannot post candidate reviews about their own employer. Company insights we show them are aggregates only, with minimum group sizes so that no individual can be identified. Reply pledge badges are calculated from user content and are not verified by the company or by us. We may revoke a representative's access at any time; content they posted remains subject to these Terms.",
    ] },
    { id: "open-source", heading: "8. Open source and trademarks", blocks: [
      `Ghosted is open source. Anyone can read, audit and suggest improvements to the code that runs this platform, including exactly how we protect your identity, at ${e.github}. Use of the source code is governed by the licence published in that repository.`,
      "The open-source licence covers the code only. The Ghosted name and logo, and the content posted by users, are not licensed for reuse. You may not use our name or logo in a way that suggests a fork, copy or other service is operated or endorsed by us.",
    ] },
    { id: "disclaimer", heading: "9. Disclaimers", blocks: [
      "Ghosted is provided \"as is\" and \"as available\". We do not guarantee that content posted by users is accurate, complete or current, or that the service will be uninterrupted or error-free. Company names and trademarks belong to their respective owners, and their appearance on Ghosted does not imply any affiliation or endorsement.",
    ] },
    { id: "liability", heading: "10. Limitation of liability", blocks: [
      "To the fullest extent permitted by law, Ghosted and its officers, employees and partners are not liable for any indirect, incidental or consequential loss, or for any loss arising from content posted by users or decisions you make based on it. Our total liability to you for any claim relating to the service is limited to ₹1,000. Nothing in these Terms limits liability that cannot be limited under Indian law.",
    ] },
    { id: "indemnity", heading: "11. Indemnity", blocks: [
      "You agree to indemnify Ghosted against claims, damages and costs, including reasonable legal fees, arising from content you post or your breach of these Terms or the law.",
    ] },
    { id: "termination", heading: "12. Ending your account", blocks: [
      "You can delete your account at any time from your settings. We may suspend or terminate your access if you breach these Terms or if required by law. The sections on content licence (to the extent content is retained), disclaimers, liability, indemnity and governing law continue after termination.",
    ] },
    { id: "grievance", heading: "13. Grievances and appeals", blocks: [
      "Ghosted is currently in pre-launch testing. Before public launch, we will appoint a Grievance Officer and publish that person's name, monitored contact details, and the complaint mechanism here, as required by the Information Technology Act, 2000 and the Intermediary Rules, 2021.",
      "During testing, submit content complaints and requests for reconsideration through Feedback & Support in the app or the monitored grievance contact below. This temporary route does not replace the statutory grievance mechanism required for a public launch.",
      { type: "email", email: e.email.grievance, label: "Submit a grievance or appeal" },
      "Once launched, complaints will be acknowledged within 24 hours and resolved within the period required by applicable law. Eligible decisions may be appealed to the Grievance Appellate Committee within the applicable deadline.",
    ] },
    { id: "law", heading: "14. Governing law and disputes", blocks: [
      "These Terms are governed by the laws of India. Subject to the grievance process above, disputes are subject to the jurisdiction of the competent courts in India determined under applicable law.",
    ] },
    { id: "changes", heading: "15. Changes to these Terms", blocks: [
      "We may update these Terms. We will give notice of significant changes by email or on the site before they take effect. Continuing to use Ghosted after that means you accept the updated Terms.",
    ] },
  ],
};

// How moderation works, in public. Every number here is the rule the code runs (backend/src/
// algorithms/moderation.ts, queue.ts, reports.ts, trust.ts and goofy/index.ts): change one, change both.
export const moderationDoc: Doc = {
  eyebrow: "How moderation works",
  title: "Every check, out in the open.",
  intro: "Everything posted on Ghosted goes through the same checks, whoever wrote it, companies included. This page explains exactly what those checks look for, what happens next, and how a human gets involved. The code that runs them is open source, so you can read it yourself.",
  updated: e.effective,
  sections: [
    { id: "overview", heading: "1. Three possible outcomes", blocks: [
      "Every story, chitchat, question, answer, company reply and change note is reviewed automatically the moment it's posted, before anyone else sees it. There are only three outcomes:",
      [
        "Published: it goes up straight away. This is what happens to the vast majority of posts.",
        "Held for a check: it's saved but not shown yet, and you're told why. Most held posts are decided automatically within hours (see section 5).",
        "Turned away: it isn't saved as a post, and you're told exactly what to change. You can edit and post again as many times as you need. A post turned away is never held against you.",
      ],
      "Every decision comes with a plain reason that says what was found. The same reason is shown to you and to our moderators.",
    ] },
    { id: "goofy", heading: "2. Goofy, our automatic moderator", blocks: [
      "The automatic checks run as Goofy, Ghosted's AutoMod. Goofy has a public profile page showing everything it does: what it held, released, removed and reported, and why. It never shows who wrote anything.",
      "Goofy only acts on the clearest cases on its own. Anything that needs judgement is held for a person, or reported to the moderation team with Goofy's reasons attached.",
    ] },
    { id: "checks", heading: "3. What the checks look for", blocks: [
      "Each check is a signal with its own weight. The weights combine into a risk score between 0 and 1, so several small concerns add up, while one small concern alone doesn't.",
      [
        "Personal information: phone numbers, email addresses, home addresses, Aadhaar and PAN numbers, UPI IDs, card and bank details. Numbers are checked properly (Aadhaar with its Verhoeff check digit, cards with the Luhn check), so random digits aren't flagged. Hard identifiers like these are always turned away, so nobody can be identified.",
        "Named individuals: a person's name, especially after a title or role (\"HR Mr. …\", \"the recruiter Priya …\"). The company's own name is never counted. A post whose only issue is a person's name is published with the name replaced by [name].",
        "Slurs, attacks on a group of people, and threats: always turned away.",
        "Graphic sexual language: held for a person to check.",
        "Accusations stated as fact (\"they are frauds\", \"they stole\"): held, and you're asked to phrase it as your experience (\"in my experience\", \"it felt like\"). Opinions are fine; unproven claims stated as fact are a legal risk for you and for us.",
        "Confidential material such as internal documents or credentials: held, or turned away if it contains passwords or keys.",
        "Spam: two or more links (one in a chitchat), promotional or off-platform lures, mostly capital letters, repeated characters or words, and posts nearly identical to something you posted recently.",
        "Self-harm language: never blocked. The post is held briefly, you're shown where to get help, and a human is told so someone can reach out.",
      ],
    ] },
    { id: "swearing", heading: "4. Swearing and venting", blocks: [
      "Venting about a bad hiring process is normal, and it's allowed. Everyday words like \"heck\", \"hell\", \"damn\", \"crap\", \"bloody\", \"shit\" and \"fuck\", and phrases like \"how on earth\" or \"what the hell\", don't count against a post at all.",
      [
        "Swearing aimed at a person (\"fuck you\", an insult right after \"the recruiter\") raises the risk score a little. It's an insult, not venting. On its own it doesn't block a post.",
        "A post that is almost nothing but swearing (at least five swear words making up more than 40% of it), or heavy graphic language, is turned away. Tell people what happened in plain words and it'll land harder.",
      ],
      "The word lists come from open, maintained sources (the dsojevic profanity list, LDNOOBW in English and romanised Hindi, and the obscenity library), refreshed daily. Identity words, body and health words, and everyday English are never imported, however a list labels them, so people describing discrimination or their own lives are never flagged for it.",
    ] },
    { id: "held", heading: "5. What happens to a held post", blocks: [
      "Held posts are re-checked with the latest word lists every 15 minutes after new posts and reports, and at least once a day. Each one is decided by fixed rules:",
      [
        "It now passes: published.",
        "Its only issue is a person's name: the name is replaced with [name] and it's published. You're told.",
        "Self-harm language and nothing else: published after 6 hours.",
        "An accusation stated as fact: you're asked to rephrase. If it's unchanged after 72 hours, it's removed.",
        "Insults aimed at a person, or graphic sexual language: removed after 24 hours.",
        "Spam, links, duplicates or gibberish: removed after 24 hours, unless you have a strong track record.",
        "Anything else that's low risk: published after 12 hours. Still unclear after 72 hours: removed.",
      ],
      "Whatever happens, Goofy tells you, in the tone you chose in Settings.",
    ] },
    { id: "learning", heading: "6. How the checks learn", blocks: [
      "Every day, the checks learn from what actually happens on Ghosted:",
      [
        "Words that are common in posts that stayed up become an allow-list, so they're never flagged.",
        "Wording that keeps showing up in posts moderators removed becomes a \"watch\" word. Watch words can only hold a post for a check. They can never block one on their own.",
        "New spellings people use to dodge the filters (\"f.u.c.k\", letters swapped for numbers) are learned too.",
        "Learned words that stop standing out for 30 days are retired.",
      ],
      "Posts turned away at the door aren't used for learning, so a few retries can't teach the checks that normal words are bad.",
    ] },
    { id: "reports", heading: "7. Reports", blocks: [
      "Anyone can report a story, chitchat or profile. Reports go to a queue ranked by how serious the reason is, how much evidence there is, and how risky the content itself looks.",
      [
        "Each reporter's weight comes from their track record: reports that turned out right count for more over time, reports that didn't count for less. New members start with a little trust. Signed-out reports carry a fixed, low weight.",
        "Several reports from the same person don't add up. Distinct, trusted reporters do, with diminishing returns.",
        "One angry report never takes a post down. A post is hidden for review automatically only when at least three trusted people report a serious problem and the content itself looks risky, or when the content now fails the checks outright.",
        "Hidden posts are re-checked: strong evidence means it's taken down; weak evidence means it's restored and the reports are dismissed. If it's in between, it waits up to 72 hours for more signal, then it's restored.",
        "Weak reports nobody acted on are closed after 14 days, and every unresolved report is closed after 60 days.",
      ],
      "A company's own representatives can't report its stories to get them taken down. They can send a correction request like anyone else, and a person decides.",
    ] },
    { id: "strikes", heading: "8. Strikes and pauses", blocks: [
      "A strike only happens when something that was published has to come down: Goofy removing a live post, or a report being upheld. A post turned away or held and never published is never a strike.",
      [
        "Second strike within 30 days: a friendly warning.",
        "Third strike within 30 days: posting is paused for 3 days. You can still read, react and follow.",
        "Strikes older than 30 days stop counting.",
      ],
      "Serious or repeated violations can still lead to a suspension or ban by our moderators, as set out in the Community Rules.",
    ] },
    { id: "humans", heading: "9. Where people come in", blocks: [
      "Automatic checks handle the routine. Our moderators handle judgement calls:",
      [
        "Posts Goofy reports, and reports that reach the top of the queue, are reviewed by a person, usually within 24 hours.",
        "Company replies, change notes and notes on progress steps can only be removed by a moderator. Companies can't edit, hide or remove anything.",
        "Removal and correction requests, from anyone, are acknowledged within 24 hours and decided within 15 days. Honest experiences aren't removed just because they're negative.",
        "Every moderator action is recorded in an internal audit log.",
      ],
    ] },
    { id: "privacy", heading: "10. What moderation never does", blocks: [[
      "It never tells anyone, including companies, who wrote a post.",
      "It never shows your full post to anyone outside the moderation team: reviews keep only short, masked excerpts (personal numbers appear as 98•••••210).",
      "It never uses a paid tier, a company relationship or a sponsor to change an outcome. Nothing here is for sale.",
      "It never quietly edits your words. The only automatic change is replacing a private person's name with [name], and you're told when it happens.",
    ]] },
    { id: "appeal", heading: "11. If we got it wrong", blocks: [
      "Automatic checks make mistakes. If a post was held, turned away or removed and you think that was wrong, reply to Goofy's notice or contact us through Feedback & Support. A person will look at it. See the Terms & Conditions for the full grievance process.",
      { type: "email", email: e.email.grievance, label: "Ask for a decision to be reviewed", description: "Include the link to the post and why you think the decision was wrong" },
      `The checks are open source at ${e.github}, so you can see exactly how they work and suggest improvements.`,
    ] },
  ],
};

// The takedown process, step by step (backend/src/takedown.ts runs it; the form is the "Request a
// correction" dialog on every story and company page).
export const takedownDoc: Doc = {
  eyebrow: "Takedown requests",
  title: "How to ask us to correct or remove content.",
  intro: "Companies, people mentioned in a story, authors and anyone else can ask us to correct or remove something on Ghosted. Every request is reviewed by a person, follows the same steps, and gets a written decision. We don't remove honest experiences just because they're negative, and nobody, including companies, can pay to change an outcome.",
  updated: e.effective,
  sections: [
    { id: "who", heading: "1. Who can ask", blocks: [[
      "A company, through someone authorised to act for it. You don't need to be a verified representative.",
      "A person a story or chitchat is about, or who can be identified from it.",
      "The author of the content.",
      "Anyone who believes content breaks our Community Rules or the law.",
    ]] },
    { id: "grounds", heading: "2. What we act on", blocks: [
      "We correct or remove content that breaks the Community Rules or Indian law, including content that:",
      [
        "States something untrue as fact that damages a reputation (defamation), as opposed to an honest opinion or experience.",
        "Contains a factual error that can be shown to be wrong.",
        "Identifies a private individual or shares personal data, under the DPDP Act 2023.",
        "Shares confidential or trade-secret material, or copyrighted material without permission.",
        "Harasses or threatens someone, impersonates a person, or shares intimate images.",
      ],
      "We don't act on content just because it's critical, unflattering or bad for business. A one-star experience told honestly stays up.",
    ] },
    { id: "include", heading: "3. What to include", blocks: [
      "Use \"Request a correction\" on the story or company page (or the button below). Include:",
      [
        "The link to the exact story, chitchat or page.",
        "Whether you want a correction or a removal, and the reason (the ground from section 2).",
        "What's wrong and, for a correction, what's actually true. Evidence helps: dates, documents, policies.",
        "An email address for our reply.",
        "Companies asking for a removal also confirm they're authorised to act for the company and are asking in good faith.",
      ],
    ] },
    { id: "steps", heading: "4. What happens next", blocks: [[
      "Straight away: you get a reference number and an email receipt.",
      "Within 24 hours: a moderator acknowledges it and starts the review. You're emailed.",
      "The author is told: if it's about a story, its author is told a request was made (never by whom) and has 72 hours to edit it or give their side. Many requests are settled here: the author fixes the detail themselves.",
      "Urgent unlawful content, such as intimate images or impersonation, is acted on within 24 hours of the request, as the Intermediary Rules, 2021 require, without waiting for the author.",
      "Within 15 days: a decision, emailed to you with the reasons. The author is told the outcome too.",
    ]] },
    { id: "outcomes", heading: "5. Possible outcomes", blocks: [[
      "No action: the content stays up as it is, with our reasons.",
      "Corrected by the author: they edited it during the review.",
      "Redacted: only the problem part is removed or replaced (for example a person's name becomes [name]).",
      "Removed: the whole story or chitchat comes down, and the author is told why.",
    ],
      "While a request is being reviewed, the content usually stays up. We hide it in the meantime only when it's likely unlawful or puts someone at risk.",
    ] },
    { id: "status", heading: "6. Check where a request stands", blocks: [
      "Enter your reference number and the email you used. We show the same message for a wrong reference and a wrong email, so nobody can look up someone else's request.",
    ] },
    { id: "appeal", heading: "7. If you disagree", blocks: [
      "Reply to the decision email with your reasons. A different moderator reviews it. Authors can do the same through Feedback & Support. Eligible decisions can also be taken to the Grievance Appellate Committee under the Intermediary Rules, 2021. See the Terms & Conditions for the grievance process.",
      { type: "email", email: e.email.grievance, label: "Contact the grievance team", description: "For legal notices, or to appeal a decision" },
    ] },
    { id: "never", heading: "8. What we never do", blocks: [[
      "Tell the requester, a company or anyone else who wrote the content, except under a valid order of a competent court or authority.",
      "Tell the author who made the request.",
      "Remove content because a company asked, paid, or threatened to. Every decision is made on the rules and the law.",
      "Let companies edit, hide or rank anything themselves. Only our moderators act, and every action is logged.",
    ]] },
  ],
};

export const communityDoc: Doc = {
  eyebrow: "Community Rules",
  title: "Be honest. Be specific. Be decent.",
  intro: "Ghosted only works if people can trust what they read here. These rules keep stories useful for candidates and fair to everyone involved. Breaking them can lead to posts being removed and accounts being suspended.",
  updated: e.effective,
  sections: [
    { id: "real", heading: "1. Share your own real experience", blocks: [
      "Post only about hiring processes you personally went through. Second-hand stories, rumours and \"a friend told me\" posts are removed.",
      "One company, one experience, one review. Don't post the same story multiple times or from multiple accounts.",
    ] },
    { id: "specific", heading: "2. Be specific and factual", blocks: [
      "The most helpful stories say what happened, when, and what the next candidate should know.",
      [
        "Good: \"Four rounds over six weeks. After the final round the recruiter said we'd hear by Friday. It's been 40 days and three follow-ups.\"",
        "Not helpful: \"Worst company ever, total scam, avoid.\"",
      ],
      "Present opinions as opinions (\"I felt\", \"in my experience\"). Don't state as fact things you can't back up.",
    ] },
    { id: "people", heading: "3. Talk about companies, not people", blocks: [
      "Criticise processes and decisions, not individuals. Don't name or describe recruiters, interviewers or employees in a way that identifies them, and never share anyone's photos, phone numbers, emails or social profiles.",
      "Posts that target or harass an individual are removed, and repeat offenders are banned.",
    ] },
    { id: "respect", heading: "4. No hate, harassment or threats", blocks: [
      "We remove content that attacks people based on religion, caste, gender, sexual orientation, disability, region, language or any other characteristic, along with threats, slurs and sexually explicit material.",
    ] },
    { id: "confidential", heading: "5. Keep confidential things confidential", blocks: [
      "Don't post interview questions or assignments you agreed not to share, internal documents, client names or trade secrets. Describe the experience instead: \"a 17-requirement take-home estimated at two hours\" tells people everything they need.",
    ] },
    { id: "safe", heading: "6. Protect your own anonymity", blocks: [[
      "Leave out details only you would know, such as exact dates, team names or unusual events, if you want to stay anonymous.",
      "Don't include your own phone number, email or documents in posts.",
      "Remember you can choose exactly which details to reveal, and switch back to anonymous at any time.",
    ]] },
    { id: "integrity", heading: "7. No fake reviews or manipulation", blocks: [
      "Employers, recruiters and agencies must not post reviews about themselves or competitors, or offer anything in return for reviews. Coordinated campaigns to raise or lower a Flag Score are removed and can lead to a company being marked on its page.",
    ] },
    { id: "company-replies", heading: "8. Companies on Ghosted (Right of Reply)", blocks: [
      "A company's representative can respond to stories about it, free. To do that they verify a work email on the company's own website domain. We keep only the domain, never the address. Everything a representative posts is labelled \"Verified company representative\" and is checked like every other post.",
      [
        "Official replies: one per story, plus one on the company page.",
        "Progress steps: a representative can mark a story heard, being looked into, or fixed. Steps only move forward, each is set once, and none can be edited or undone. \"Fixed\" is shown as the company's own claim. The author is told at each step, and sees how many people at the company read their story, never who.",
        "\"You said, we did\": up to four public notes a month about what the company changed, each linked to one to five stories about it. Cited authors are told.",
        "Reply pledges: a company can pledge that candidates hear back within 7, 14 or 30 days. The badge (made, holding, mixed, slipping or withdrawn) is calculated only from candidate stories posted after the pledge, labelled \"Based on N candidate stories, not verified by the company\". A withdrawn pledge says so; it never quietly disappears.",
        "Company Pulse: private insights for representatives, aggregates only. A number appears only when it's based on at least 5 stories, and any group of fewer than 3 is hidden.",
        "Candidates can ask a company to respond. The count is shown only once at least 3 people have asked.",
      ],
      "What representatives can never do:",
      [
        "Edit or delete their own replies, steps, notes or change notes. Only our moderators can remove them.",
        "Hide, rank, edit or remove stories, or report their own company's stories to get them taken down. They can send a removal or correction request like anyone else, and a moderator decides.",
        "Find out who wrote a story. Anyone who has ever been a representative of a company, even after their access is revoked, can't open the profile of, follow, or search for anyone who has written about that company; those authors appear to them only as \"A candidate\".",
        "Post a candidate story about their own company.",
        "Identify, threaten or pressure an author or anyone else. That gets their access revoked.",
      ],
      "None of this is for sale. There is no paid tier and no way to pay for a different outcome, a badge or a better score. We can revoke a representative at any time; what they posted stays on record.",
    ] },
    { id: "requests", heading: "9. Asking for a removal or correction", blocks: [
      "Anyone, including companies and the people a story is about, can ask us to remove content or correct a factual error, using \"Request a correction\" on any story or company page. We acknowledge every request within 24 hours and give a decision within 15 days.",
      "We remove content that breaks these rules or the law. We don't remove honest experiences just because they're negative or unflattering.",
    ] },
    { id: "enforcement", heading: "10. How we enforce these rules", blocks: [
      "Our moderators review reported posts and use automated checks to spot spam and abuse. Depending on how serious a violation is, we may:",
      ["Ask you to edit a post.", "Hide or remove the post.", "Temporarily suspend your account.", "Permanently ban accounts for serious or repeated violations."],
      "If you think we got it wrong, reply to the notice we send you or use Feedback & Support during pre-launch testing. See our Terms & Conditions for the full process and the statutory contact that will be published before public launch.",
      { type: "email", email: e.email.grievance, label: "Ask us to reconsider a decision" },
    ] },
    { id: "report", heading: "11. Report a post", blocks: [
      "Use the report option on any post, or use Feedback & Support with a link and a short explanation. Reports are confidential; we don't tell the author who reported them.",
      { type: "email", email: e.email.grievance, label: "Report content by email" },
    ] },
  ],
};
