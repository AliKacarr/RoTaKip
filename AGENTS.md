# AGENTS.md

This file provides guidance to AI coding agents (Codex, Claude Code, etc.) when working with code in this repository. Keep it in sync with `CLAUDE.md`.

RoTaKip is a group reading-tracker web app: an Express 5 + MongoDB/Mongoose **modular monolith** with a Vanilla JS client (no framework, no bundler beyond a custom minify script). Node 22.x. User-facing text, routes, commit-adjacent docs and many test names are Turkish; code identifiers and file names are English. `docs/architecture.md` is the authoritative (Turkish) architecture/conventions doc.

## Commands

```bash
npm install            # postinstall also runs build:assets
npm run dev            # builds assets, then node --watch src/server/start.js
npm start              # production start (does NOT rebuild assets)
npm run build:assets   # regenerate public/*.min.{js,css} + public/assets-manifest.json
npm test               # node --test; auto-discovers tests/**/*.test.js
node --test tests/unit/server/reading-edit-policy.test.js   # single file
node --test --test-name-pattern="app.js" tests/unit/server/architecture.test.js  # single test
npm run lint           # eslint . (lint:fix to autofix)
```

Requires a `.env` (see `.env.example`): `MONGO_URI`, `DB_NAME`, `SESSION_SECRET` are essential; Dropbox, OneSignal and ERP (Google Sheets) keys are optional — uploads/push/ERP sync depend on them. `SITE_ACTIVITY_ADMIN_GROUP_ID` (default `catikati23`, must pass `isSafeGroupId`) selects the group whose `admin`-authority members can open the admin/log pages (`requireSiteActivityAdmin`). `TEFEKKUR_KURAN_RADYO_URL` / `TEFEKKUR_RISALET_RADYO_URL` are the live radio stream URLs (prefer `https://`; empty → that radio shows as unavailable).

## Language

- Always converse, explain and plan with the user in natural, fluent Turkish.
- Keep code identifiers (variables, functions, file names) in English; write user-facing UI text and error messages in Turkish.

## Server architecture (`src/server/`)

- `start.js` is the process entry: connects DB, creates indexes, starts Dropbox init, schedules jobs (`jobs/schedulers.js`), listens, and handles graceful shutdown.
- `app.js` is a thin **composition root**: it builds services/middleware and spreads them all into a single `routeDependencies` object passed to every `registerXRoutes(app, deps)` function. To expose a new service to routes, add it to that object rather than `require`-ing across modules.
- `tests/unit/server/architecture.test.js` enforces: `app.js` ≤ 250 lines, no direct `app.get/post/...` in `app.js`, route files must be named `*.routes.js`, and `package.json` `main`/`start`/`dev` must stay as they are.
- Feature modules live in `modules/<feature>/` split as `*.routes.js` (HTTP), `*.service.js` (business rules), `*.models.js` (Mongoose). Modules must not call another feature's routes file. External APIs only under `integrations/` (dropbox, erp, onesignal, geocoding). Framework-free helpers in `shared/`.
- Current modules: `activity` (site/access/login activity logs; allowed action names and Tefekkür/Videolar section values are validated in `activity.service.js`), `auth`, `content`, `groups`, `inspiration` (vecize/quotes + `tefekkur.routes.js`/`tefekkur.service.js`), `invitations`, `join-requests`, `pages`, `readings`, `system`, `tesbihat` (prayer times; uses `integrations/geocoding/reverse-geocoder.js`), `users`. Services such as `tefekkurService`/`tesbihatService` are created in `app.js` and spread into `routeDependencies`.
- **Per-group collections**: each group's users and reading statuses are stored in dynamically created collections `users_<groupId>` / `readingstatuses_<groupId>` via `getGroupCollections(groupId)` in `modules/groups/group.models.js`. Group metadata is in the shared `UserGroup` model. Always validate group ids with `isSafeGroupId` before using them in collection names.
- Route registration order in `app.js` matters: protected page routes are registered before static file serving.

## Client architecture

- Express serves `public/app-shell.html` for group/content routes. `public/app/` contains native ESM modules loaded directly by the browser (not bundled): `shell-router.js` resolves the URL using `route-config.js` (`ROUTES` + `ROUTE_ASSETS`), loads the view HTML from `public/fragments/`, then lazy-loads the route's bundle via `assets-manifest.json`.
- Routes: `/grup/:groupId/` (okumalar — weekly table, stats, settings), `/gruplar` (group directory), `/tesbihat`, `/videolar`, `/tefekkur`, `/makaleler`. Legacy `/groupid=:groupId` redirects to the canonical group URL.
- Feature source lives in `src/client/features/<feature>/` (JS + CSS together), shared code in `src/client/shared/`, shell styles in `src/client/shell/`. These are classic (non-module) scripts concatenated into bundles sharing globals.
- `scripts/build-assets.js` defines the bundle → source file mapping (`shell`, `group-common`, `okumalar`, `statistics`, `management`, `videos`, `tefekkur`, `articles`, etc.). **Adding a new client file requires adding it to a bundle there** (and to `ROUTE_ASSETS` if it's a new route bundle). Bundles with an `html` list also get their `?v=<hash>` references rewritten in those HTML files — this is why commits touch `public/*.html` versions after CSS changes.
- Generated `public/*.min.js|css` and `assets-manifest.json` are gitignored; never edit them by hand. Edit sources in `src/client/`, then rebuild.
- `admin.html`, `access-logs.html`, `login-logs.html` are standalone entry documents (bundles from `features/site-activity-admin/` and `features/activity-logs/`); they are not part of shell routing/preloading.
- `/tefekkur` is a single route; sections and reading modes are chosen via query params (`?bolum=ayet|hadis|dua|risale|esma|zikirmatik|kuran-radyo|risalet-radyo`, `?bolum=risale&mod=metin|resim`). Client sources are `src/client/features/tefekkur/tefekkur-*.js|css` (order inside the `tefekkur` bundle in `build-assets.js` matters: `core` → `share` → `slider` → `zikirmatik` → `radio` → `tab`); API is `/api/tefekkur/*`; Esmaül Hüsna data is `public/esmaulhusna.json`. Section views are logged as `tefekkur_bölüm_görüntüleme`, and `shell-router.js` does not repeat the "tab opened" log on in-tab switches. See the Tefekkür section in `docs/architecture.md`.
- `/videolar` is a single route with four views chosen by query params: feed (default; channel filter is a combobox after the section tabs (default "Tümü"), muted autoplay preview with seek bar, Shorts shelf; leaving the watch page keeps the video in a bottom-right mini player), `?izle=<videoId>` watch page, `?bolum=shorts[&v=<id>]` vertical auto-playing Shorts, `?bolum=hesabim[&liste=gecmis|begenilenler|kaydedilenler|kanallar]` library. No modal. Data comes from the externally filled `videolar` / `video_channels` collections via `modules/content/video.service.js` (`/api/videos/home|feed|channels|:videoId`, cursor pagination). Likes, saves, watch history/progress and unfollowed channels live only in `localStorage` (`videos-store.js`). Client sources are `src/client/features/videos/videos-*.js|css` (bundle order `core` → `store` → `player` → `feed` → `watch` → `shorts` → `library` → `tab`); one reused YouTube IFrame player per section, disposed when the shell detaches the view. See the Videolar section in `docs/architecture.md`.
- `/makaleler` has a category-card home view and a per-category view (`?kategori=<slug>`; slugs/names live on the cards in `fragments/articles.html` and must match `articles.category` in Mongo). No "load more" button: `GET /api/articles/preview` prepares the first few articles of every category (and their images) when the tab opens/warms, the category view fades in once those are ready, and the rest loads on scroll via `GET /api/articles?category=&offset=&limit=` (`modules/content/article.service.js`). See the Makaleler section in `docs/architecture.md`.
- Route-specific markup belongs in its `public/fragments/<route>.html`; group login/profile overlays live in `common-overlays.html` (loaded only on group routes).

## Conventions enforced by tests/lint

- `tests/integration/client/app-shell.test.js` asserts concrete markup, CSS values, and structure of the shell/fragments (e.g. nav item count/order, unique DOM ids across fragments, specific colors). UI changes often require updating these assertions.
- CSS `@media (max-width: …)` breakpoints must be one of **1023, 768, 640, 480** px.
- Files/folders use `kebab-case` with descriptive names (no generic `script.js`, `style.css`, `index.js`).
- ESLint: `public/app/**` is ESM with `no-undef` as error; other client code is `script` mode with `no-undef` off; server code is CommonJS. Unused args prefixed with `_` are ignored.
- Terser strips `console.log/debug/info` from client bundles; use `console.warn/error` for anything that must survive in production.
