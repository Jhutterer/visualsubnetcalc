# Agent Guide: `/src` (Tooling, Tests, Build Assets)

This directory contains development tooling, end-to-end tests (Playwright), Sass sources for Bootstrap customization, and deployment infrastructure templates. It does not contain the primary application JavaScript — that lives in `/dist`.

## Purpose
- Provide the dev/test environment for the static app in `/dist`.
- Own the build step that generates `dist/css/bootstrap.min.css` and vendors `lz-string` into `dist/js/`.
- House Playwright tests that validate the UI and behavior from a user’s perspective.
- Include infrastructure-as-code for cloud deployment.

## Key Files and What They Do
- `src/package.json`
  - Scripts:
    - `postinstall`: `npm install -g sass@1.77.6` (installs Sass globally for local builds).
    - `build`: Compiles `scss/custom.scss` → `../dist/css/bootstrap.min.css` and copies `node_modules/lz-string/libs/lz-string.min.js` → `../dist/js/`.
    - `start`: Serves `../dist` via `http-server` (HTTP).
    - `local-secure-start`: Serves `../dist` via `http-server` with TLS on `https://localhost:8443` (target used by Playwright tests).
    - `setup:certs`: Generates local dev certs via `mkcert` (requires `mkcert` installed locally).
    - `test`: Runs Playwright e2e tests.
- `src/scss/custom.scss`
  - Bootstrap customization via Sass (breakpoints, tooltip variables, etc.).
  - Source of truth for Bootstrap CSS — do not edit `dist/css/bootstrap.min.css` directly.
- `src/tests/*.spec.ts`
  - Playwright e2e tests covering default rendering, subnet operations, UI behavior, import/export, error handling, and URL sharing.
  - Tests depend on accessible labels/roles in `dist/index.html`. Preserve or update those when changing the UI.
- `src/playwright.config.ts`
  - Points tests at `https://localhost:8443` with `ignoreHTTPSErrors: true`.
  - Starts a web server using `npm run build && npm run local-secure-start` before tests.
  - Runs Chromium and Firefox projects (viewport set to 1920x1080; clipboard permissions where needed).
- `src/cloudformation.yaml`
  - Infrastructure as code for deploying the static site with S3, CloudFront, Route53, and logging. Keep deploy-time tokens (e.g., `__DEPLOY_URL__` in `dist/index.html`) aligned with the chosen hosting setup.
- Other assets: `demo.gif`, `social_*.xcf`, `split_icon.png` used for marketing/branding and icon generation.

## Development Workflow
1) Install dependencies
   - From `src/`: `npm ci`
   - This will also run the `postinstall` to ensure `sass` is available globally. If it does not, install Sass manually: `npm i -g sass@1.77.6`.

2) Build and serve the app
   - Build: `npm run build` (generates `../dist/css/bootstrap.min.css` and copies `lz-string`)
   - Serve HTTP: `npm run start`
   - Serve HTTPS (preferred for tests):
     - One-time: `npm run setup:certs` (requires `mkcert`)
     - Then: `npm run local-secure-start` (serves `../dist` at `https://localhost:8443`)

3) Run tests
   - `npm run test` (Playwright)
   - On first run, Playwright may prompt to install browsers. If needed: `npx playwright install`.

## Conventions and Constraints
- Source of truth split:
  - UI and runtime logic live in `/dist` (HTML/JS/CSS); edit there when adding features.
  - Bootstrap overrides live here in `scss/custom.scss`; re-run `npm run build` after changes.
- Build output paths are relative to the repo root:
  - `scss/custom.scss` → `../dist/css/bootstrap.min.css`
  - `node_modules/lz-string/.../lz-string.min.js` → `../dist/js/lz-string.min.js`
  - Update `dist/index.html` references if you ever change these paths (not recommended).
- Cross-platform note: the `build` script uses the Windows `copy` command. If developing on non-Windows systems, replace this with a cross-platform copy (e.g., `cpy` via npm or `cp`) while keeping the target paths identical.
- Keep `index.html` deploy-time placeholders (`__DEPLOY_URL__`) intact; ensure your deployment process replaces them correctly.

## Testing Guidance
- Tests focus on visually verifiable behavior and accessibility labels. Do not remove `aria-*` attributes and label text without updating the corresponding tests.
- When adding features:
  - Create or extend tests in `src/tests/` that exercise the new UI/behavior end-to-end.
  - Prefer selectors by role/label/text over brittle CSS selectors.
  - Validate round-trip import/export and shareable URL stability if applicable.

## Typical Tasks and Where to Work
- Add a UI control → `dist/index.html` (ensure ARIA/labels and a stable identifier)
- Add behavior/logic → `dist/js/main.js` (follow existing jQuery patterns and state management)
- Tweak Bootstrap grid/breakpoints/variables → `src/scss/custom.scss` then `npm run build`
- Update app-specific styles → `dist/css/main.css`
- Add/adjust e2e tests → `src/tests/*.spec.ts`
- Serve locally / run tests → from `src/` via npm scripts

## Change Checklist (for `/src`-owned concerns)
- Bootstrap overrides updated in `scss/custom.scss`; ran `npm run build` and verified `dist/css/bootstrap.min.css`.
- Local server runs via `npm run local-secure-start` at `https://localhost:8443`.
- Playwright tests pass locally (`npm run test`).
- Any deployment-related assumptions (e.g., `__DEPLOY_URL__`) remain correct.

