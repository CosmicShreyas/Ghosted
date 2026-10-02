# Changelog

Notable changes to Ghosted will be documented here.

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning will begin with the first public release.

## [Unreleased]

### Added

- Public repository documentation, contribution guidance, security policy, issue templates, and continuous integration.
- Quiet repository maintenance automation: CodeQL security analysis and pull-request dependency vulnerability review.

### Changed

- Replaced the hosted-editor-specific build integration with the standard TanStack Start and Vite configuration.
- Upgraded the frontend to Zod 4, ESLint 10, React Hooks ESLint 7, Vite React plugin 6, and compatible TanStack Router packages.
- Upgraded the API to Zod 4, TypeScript 7, Node.js 26 types, Hono Node Server 2, and Hono Zod Validator 0.9.
- Updated GitHub Actions to the current checkout and setup-node major versions.

### Removed

- Automatic Dependabot pull requests; dependency upgrades are now reviewed and tested as deliberate maintenance changes.
