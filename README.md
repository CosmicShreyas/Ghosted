# Ghosted

Ghosted is a privacy-first workplace storytelling platform. People can share work experiences, discuss them publicly through chitchats, follow companies, and understand workplace patterns without turning the product into a direct-messaging network.

> **Licensing:** Ghosted welcomes contributions, but it is **source-available**, not OSI-defined open source. The [PolyForm Shield License 1.0.0](LICENSE.md) allows inspection, modification, and contribution while restricting use that competes with the project provider.

## What is in this repository?

| Area | Location | Purpose |
| --- | --- | --- |
| Main app | `src/` | Public site and signed-in product |
| Admin panel | `admin/` | Separately deployed administration app |
| API | `backend/` | Hono API, Supabase schema, scheduled jobs, and email delivery |

The frontend and admin panel use React, TanStack Start/Router, TypeScript, Tailwind CSS, and Motion. The API uses Hono and Supabase and is deployed independently to Vercel.

## Product principles

- Privacy comes before growth mechanics.
- Public stories, chitchats, reactions, follows, and story alerts are the only user-to-user interactions; there are no direct messages.
- Public URLs use 15-digit public IDs, never internal UUIDs.
- The public app never links to the separately deployed admin panel.
- The frontend accesses backend data only through `src/lib/api.ts`.

## Local development

### Requirements

- Node.js 20 or newer
- npm 10 or newer
- A Supabase project for full-stack development (optional for mock mode)

### Main app in mock mode

```bash
npm install
copy env.example .env
npm run dev
```

When `VITE_API_URL` is empty, the app uses the sample content in `src/mock/data.ts`. This is the quickest way to work on the interface without configuring external services.

### Full-stack setup

1. Run `backend/supabase/init_database.sql` once in the Supabase SQL editor.
2. Copy `backend/env.example` to `backend/.env` and fill in the required values.
3. Set `VITE_API_URL` in the root `.env` to the local API URL.
4. Start the API and the desired frontend in separate terminals:

```bash
cd backend
npm install
npm run dev
```

```bash
npm run dev
```

For the admin panel:

```bash
npm run admin:dev
```

Never place a Supabase service-role key in a frontend environment file or any variable prefixed with `VITE_`.

## Useful commands

| Command | Description |
| --- | --- |
| `npm run dev` | Start the main app on port 8080 |
| `npm run build` | Build the main app |
| `npm run admin:dev` | Start the admin panel |
| `npm run admin:build` | Build the admin panel into `dist-admin/` |
| `npm run lint` | Run the configured code checks |
API-specific commands and configuration are documented in [backend/README.md](backend/README.md). Admin deployment and authentication details are in [admin/README.md](admin/README.md).

## Deployment

Deploy each surface as its own project:

| Project | Build/root settings |
| --- | --- |
| Main app | Repository root; `npm run build`; set `VITE_API_URL=/api` so `vercel.json` proxies member sessions to the API |
| Admin panel | Repository root; `npm run admin:build`; output `dist-admin` |
| API | Root directory `backend`; Vercel reads `backend/vercel.json` |

Set production secrets in the corresponding hosting project. Do not commit `.env` files.

## Contributing and support

Please read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. By participating, you agree to the [Code of Conduct](CODE_OF_CONDUCT.md). Use [SECURITY.md](SECURITY.md) for private vulnerability reports and [SUPPORT.md](SUPPORT.md) for usage questions.

Pull requests are checked by CI and Dependency Review. CodeQL analyzes JavaScript and TypeScript changes and also runs weekly. These checks report or block security risks without opening automated dependency-update pull requests.

## License and branding

Code in this repository is available under the [PolyForm Shield License 1.0.0](LICENSE.md). This is not an OSI-approved open-source license because it restricts competitive use. The Ghosted name, logo, and brand assets are governed separately by [TRADEMARKS.md](TRADEMARKS.md).
