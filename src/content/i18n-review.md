# Translations to verify

Every Hindi, Kannada and Hinglish string in `src/lib/i18n.ts` is a machine translation until a
native speaker confirms it. Tick a key once it reads naturally and fits the tone (sassy or calm).
If you change wording, edit it in `src/lib/i18n.ts` and tick it here.

Check for: natural phrasing (not word-for-word), the sassy and calm versions actually differing in
tone, company names left in English, and nothing that wraps badly on a phone.

| Key | Hindi | Kannada | Hinglish |
|---|---|---|---|
| hero.badge | [ ] | [ ] | [ ] |
| hero.title | [ ] | [ ] | [ ] |
| hero.lede | [ ] | [ ] | [ ] |
| hero.share | [ ] | [ ] | [ ] |
| hero.waiting | [ ] | [ ] | [ ] |
| hero.trust | [ ] | [ ] | [ ] |
| search.label | [ ] | [ ] | [ ] |
| search.placeholder | [ ] | [ ] | [ ] |
| search.button | [ ] | [ ] | [ ] |
| search.try | [ ] | [ ] | [ ] |
| footer.tagline (sassy) | [ ] | [ ] | [ ] |
| footer.tagline (calm) | [ ] | [ ] | [ ] |
| footer.language | [ ] | [ ] | [ ] |

## Landing page (`src/content/landing-copy.ts`)

Each row is one block of the landing page. Read it on the page in that language, then tick it.

| Block | Hindi | Kannada | Hinglish |
|---|---|---|---|
| rotating (hero's second line, 10 lines) | [ ] | [ ] | [ ] |
| marquee (9 lines) | [ ] | [ ] | [ ] |
| stats (strip under the hero) | [ ] | [ ] | [ ] |
| how (3 steps) | [ ] | [ ] | [ ] |
| meter (Ghost-o-meter labels and 4 stages) | [ ] | [ ] | [ ] |
| lookup (search box under the meter) | [ ] | [ ] | [ ] |
| tools (timeline checker and polite poke) | [ ] | [ ] | [ ] |
| why (comparison table) | [ ] | [ ] | [ ] |
| objection (the obvious question, goal, reasons, timeline) | [ ] | [ ] | [ ] |
| proofs (3 cards) | [ ] | [ ] | [ ] |
| flags (Hall of Flags) | [ ] | [ ] | [ ] |
| invite (invite strip) | [ ] | [ ] | [ ] |
| pitch (dark manifesto section) | [ ] | [ ] | [ ] |
| mine (minefield game labels) | [ ] | [ ] | [ ] |
| wall (story wall) | [ ] | [ ] | [ ] |
| privacy and cta (last two sections) | [ ] | [ ] | [ ] |

## Story form (`src/content/composer-copy.ts`)

| Block | Hindi | Kannada | Hinglish |
|---|---|---|---|
| steps, step titles and subtitles (sassy and calm) | [ ] | [ ] | [ ] |
| outcomes (5 cards) and stages (5 buttons) | [ ] | [ ] | [ ] |
| ratings (5 labels and hints) and star words | [ ] | [ ] | [ ] |
| wait chips, labels, pay fields | [ ] | [ ] | [ ] |
| writing prompts (inserted as headings into the story) | [ ] | [ ] | [ ] |
| placeholders (sassy and calm) | [ ] | [ ] | [ ] |
| editor toolbar, review step, buttons | [ ] | [ ] | [ ] |
| error messages (problems) and toasts | [ ] | [ ] | [ ] |
| done screen | [ ] | [ ] | [ ] |

In the story form, these stay English on purpose: the automatic title, the quick-story text, and the
outcome and stage labels on the preview card. They're the posted story itself, which everyone reads.

Not translated on purpose on the landing page, shown in English in every language:
- The Ghost-o-meter follow-up lines and the polite poke's message: they're meant to be pasted into an email to a recruiter.
- The 22 recruiter "slaps" in the minefield game: wordplay that needs a writer, not a translation. Add them under `mine.slaps` when ready; each falls back to English until then.
- The decorative hero collage cards (sample text in an illustration).
