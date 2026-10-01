# Contributing to Ghosted

Thank you for helping improve Ghosted. Contributions may include bug fixes, accessibility improvements, tests, documentation, translations, and carefully scoped product work.

## Before you start

- Search existing issues before opening a new one.
- For substantial product or architecture changes, open a proposal first so effort is not duplicated.
- Never include real workplace stories, credentials, access tokens, private user data, or internal UUIDs in issues, fixtures, screenshots, or commits.
- Security vulnerabilities must be reported privately according to [SECURITY.md](SECURITY.md).

## Development workflow

1. Fork the repository and create a focused branch.
2. Install dependencies with `npm install` at the root and in `backend/` when API work is involved.
3. Use mock mode for UI-only changes, or follow the full-stack setup in [README.md](README.md).
4. Make the smallest cohesive change that solves the issue.
5. Add or update tests and documentation where behavior changes.
6. Run the relevant checks before opening a pull request.

```bash
npm run build
npm run admin:build
cd backend
npm run typecheck
```

Use `npm run lint` on files you touch. The repository is still converging on a fully clean historical formatting baseline, so unrelated legacy findings should be kept out of focused pull requests.

For user-facing flows, also perform relevant browser checks at desktop, tablet, and mobile sizes.

## Project conventions

- Keep the API in `backend/`; frontend code must never receive the Supabase service-role key.
- Route frontend requests through `src/lib/api.ts`.
- Use 15-digit `publicId` values in public URLs and responses, not internal UUIDs.
- Do not add direct messaging or private user-to-user communication.
- Use Lucide icons rather than emoji in the interface.
- Preserve mobile, tablet, keyboard, and reduced-motion behavior.
- Do not rewrite published Git history.
- Keep database setup reproducible through `backend/supabase/init_database.sql`.

## Pull requests

A good pull request has one purpose, explains the user impact, lists verification performed, and includes screenshots or recordings for visual changes. Link the related issue and call out schema, environment, privacy, or deployment implications.

Maintainers may ask for changes, close work that conflicts with the product direction, or split an oversized pull request. Submission of a contribution does not guarantee inclusion.

## Licensing contributions

By submitting a contribution, you represent that you have the right to submit it and agree that it may be distributed under the repository's [PolyForm Shield License 1.0.0](LICENSE.md). Do not submit code under incompatible terms.
