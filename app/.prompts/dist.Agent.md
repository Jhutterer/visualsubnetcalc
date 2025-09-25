# Agent Guide: `/dist` (Runtime App)

This directory contains the production-ready static website for Visual Subnet Calculator. Unlike typical projects where `/dist` is purely a build artifact, here `/dist` is the living source of truth for the user interface and runtime JavaScript logic. When adding features or fixing bugs in the app UI/logic, you will almost always modify files inside `/dist`.

## Work Through Orchestrator
- Coordination: Operate as a sub-agent managed by the Orchestrator in `app/.prompts/orchestrator.Agent.md`.
- No direct commits/tests: Do not commit, push, or run the full test suite yourself. Provide minimal patch proposals (file paths and diffs). The Orchestrator builds, tests, stages, and commits on a feature branch.
- Scope: Limit edits to `dist/**`. If a change requires `src/**` updates (e.g., tests, build scripts, or Sass), note "Requires src change" and describe exactly what is needed; the Orchestrator will coordinate with the `src` agent.
- Build/Test signals: For changes that affect styling or dependencies, include a short "Validation" note indicating which orchestrator commands to run (e.g., `cd src && npm run build`, `npm test`).
- Auto-fix loop: If tests are expected to fail, propose up to two targeted fixes with clear rationale; the Orchestrator will apply and re-run.

## Purpose
- Hosts the complete static site assets that are deployed (HTML, CSS, JS, icons, robots/sitemap).
- Contains the canonical UI and behavior implemented in plain JavaScript with jQuery and Bootstrap.
- Must remain self-contained and deployable as a static site (no bundlers or server-side code required).

## Key Files and What They Do
- `dist/index.html` - Main HTML entrypoint that wires styles and scripts (Bootstrap via CDN, jQuery, jQuery Validation, local `lz-string`, local `main.js`). Contains the full UI layout, accessible labels/roles used by tests, and the modal dialogs (FAQ, About, Import/Export). Includes deploy-time placeholders `__DEPLOY_URL__` in meta tags that are replaced by the deployment process.
- `dist/js/main.js` - Primary application logic (jQuery-based). Manages global state (e.g., `subnetMap`, `subnetNotes`, `operatingMode`, `inflightColor`, `urlVersion`, `configVersion`), attaches event handlers, renders the subnet table, and implements split/join, notes, color tagging, and import/export.
- `dist/js/lz-string.min.js` - Compression library used for shareable URLs (copied here by the `/src` build script). Treat as a vendored dependency.
- `dist/css/bootstrap.min.css` - The only Bootstrap CSS served to users. This file is generated from `/src/scss/custom.scss` (do not edit directly; see Build Rules below).
- `dist/css/main.css` - App-specific styles (safe to edit directly; keep focused on app styling, not Bootstrap variable overrides).
- `dist/icon/*` - Favicons, webmanifest, and social images used by the site.
- `dist/404.html`, `dist/robots.txt`, `dist/sitemap.xml`, `dist/ads.txt` - Static metadata and auxiliary files for hosting/SEO.

## Development Model
- No bundler/module system. Scripts are loaded via `<script>` tags. Do not introduce ESM/CommonJS imports or a bundler.
- Dependencies:
  - Bootstrap JS is loaded from CDN (bundle variant).
  - jQuery and jQuery Validation are loaded from CDN.
  - `lz-string` is served locally from `dist/js/lz-string.min.js` (populated by the `/src` build step).
- Accessibility is first-class. ARIA roles/labels in `index.html` are used by Playwright tests. Preserve and extend them when modifying the UI.

## How to Run Locally
All local tooling lives in `/src`:
- From `src/`, run `npm ci` (installs dev deps and globally installs `sass` via `postinstall`).
- Build CSS and vendor copy: `npm run build` (compiles `/src/scss/custom.scss` to `../dist/css/bootstrap.min.css` and copies `lz-string.min.js` into `../dist/js/`).
- Start a local server:
  - `npm run start` (HTTP) or
  - `npm run local-secure-start` (HTTPS on `https://localhost:8443`, which is what Playwright tests use).

## Editing Guidelines (Adding Features)
- HTML (`dist/index.html`):
  - Add UI elements here. Maintain semantic tags and ARIA attributes used by existing tests (e.g., accessible names/labels for table headers and controls).
  - Keep `__DEPLOY_URL__` placeholders intact for deploy-time replacement in meta tags.

- JavaScript (`dist/js/main.js`):
  - Use jQuery for DOM access and event delegation. Follow existing patterns like `$('#calcbody').on('click', '.row_address', handler)` for dynamic rows.
  - Maintain and mutate the centralized state (`subnetMap`, `subnetNotes`, etc.) through existing helpers (e.g., `mutate_subnet_map(...)`) and re-render when appropriate. Favor small, pure utility functions where possible.
  - Operating modes: honor `Standard`, `AWS`, `AZURE`, `OCI`. Respect `minSubnetSizes`, `netsizePatterns`, and reserved-address rules for each mode.
  - Import/Export and URLs: when changing the serialized format or parameters, bump `urlVersion` and/or `configVersion` and maintain backward compatibility where feasible. Keep payloads compact - `lz-string` is used to compress shareable state.
  - Performance: minimize full-table re-renders. Prefer targeted DOM updates when only color or a note changes.
  - Do not introduce module systems or build steps for JS. Keep to a single `main.js` (or add additional plain-script files referenced from `index.html`).

- CSS:
  - App styles go in `dist/css/main.css`.
  - Bootstrap variable overrides or Sass-level customizations belong in `/src/scss/custom.scss`, then run `npm run build` to regenerate `dist/css/bootstrap.min.css`.

## Testing Expectations
- End-to-end tests reside in `/src/tests` (Playwright) and run against `https://localhost:8443`.
- Keep or update accessible labels/roles to match tests. If you change visible text or structure, request corresponding test updates via the `src` agent.
- Typical test commands (executed by the Orchestrator) from `src/`:
  - `npm run build && npm run local-secure-start` to serve the site
  - `npm run test` to execute Playwright tests (Chromium/Firefox configured)

## Dependency and Loading Order
- `index.html` loads:
  1) CSS: `css/bootstrap.min.css`, then `css/main.css`
  2) JS (bottom of body): Bootstrap bundle (CDN), jQuery (CDN), jQuery Validation (CDN), `js/lz-string.min.js` (local), `js/main.js` (local)
- Preserve this order unless you know a dependency can be safely moved. New third-party libraries should be added via CDN or as vendored static files inside `dist` (no new package/bundler step).

## Do / Don't
- Do:
  - Keep `/dist` deployable as a static site.
  - Maintain ARIA labels and roles for accessibility and test stability.
  - Use delegated event handlers for dynamic table rows.
  - Keep serialized URL/config versions accurate; test import/export round trips.
  - Ensure the Orchestrator runs `/src` build before committing changes that affect Bootstrap styling.
- Don't:
  - Edit `dist/css/bootstrap.min.css` directly (regenerate via `/src/scss/custom.scss`).
  - Introduce module systems, bundlers, or Node-only runtime features.
  - Break shareable URL compatibility without a clear version bump and migration path.

## Change Checklist (for `/dist` edits)
- UI changes reflected in `index.html` with correct ARIA roles/labels.
- JS logic added to `main.js` following existing patterns and state management.
- Styling added/adjusted in `dist/css/main.css` or (for Bootstrap overrides) via `/src/scss/custom.scss` + build.
- Request updates to tests in `/src/tests` if UI text/structure or behaviors changed.
- Validate local run, import/export URLs, and all operating modes (Standard/AWS/Azure/OCI). Provide a short "Validation" note for the Orchestrator.

