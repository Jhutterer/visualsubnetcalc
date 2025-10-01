# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Visual Subnet Calculator is a web-based tool for network administrators to design and visualize subnet layouts. It's a modernized version of davidc's original subnet calculator, focusing on simplicity, visual design, and collaboration.

The project is evolving to include a "Planner" feature that adds SQLite-based database management for tracking network infrastructure (buildings, floors, devices, subnets) alongside the existing visual subnet calculator.

## Build and Development Commands

All commands are run from the `src/` directory:

```bash
# Install dependencies (also installs sass globally)
cd src
npm install

# Build Bootstrap CSS and copy dependencies
npm run build

# Start local development server (port 8080)
npm start

# Start with HTTPS (port 8443, requires certs)
npm run setup:certs      # Generate self-signed certificates (first time only)
npm run local-secure-start

# Run tests
npm test                 # Run all Playwright tests with summary
npm run test:ci          # Same as npm test (CI-compatible)

# Run specific test file
npx playwright test src/tests/subnet-basic.spec.ts

# Run tests in headed mode (with browser UI)
npx playwright test --headed
```

The built application is in `../dist/` and can be opened directly in a browser via `../dist/index.html`.

## Architecture

### Core Application Structure

The application consists of two main parts:

1. **Visual Subnet Calculator** (original feature):
   - Pure client-side JavaScript application
   - Main logic in `dist/js/main.js`
   - State management via `subnetMap` and `subnetNotes` objects
   - URL-based state persistence using compressed JSON (lz-string)
   - Supports multiple operating modes: Standard, AWS, Azure, OCI (different reserved IP rules)

2. **Planner Database** (in progress):
   - SQLite database running via SQLite WASM in the browser
   - Database logic in `dist/js/planner-db.js`
   - Schema at version 3: `planner_state`, `planner_subnet`, `planner_vrf` tables
   - Persists calculator state (subnetMap) to SQLite with VLAN/gateway/VRF metadata
   - File-based persistence via File System Access API (with OPFS and download fallbacks)
   - **Note:** Original hierarchical schema (`tbl_building`, `tbl_device`, etc.) in `app/plannerSchema.sql` not yet implemented

### State Management

- **Subnet Calculator State**:
  - Stored in `subnetMap` (subnet structure) and `subnetNotes` (user notes/colors)
  - Persisted via URL hash or Import/Export modal
  - Hydration flag `isHydratingFromSnapshot` prevents unnecessary re-renders

- **Planner Database State**:
  - Managed via SQLite in-memory database with optional file persistence
  - Migration system in `planner-db.js` (currently at version 3)
  - Snapshot rendering: hydrates `subnetMap` from `planner_subnet` table on load
  - Auto-saves: debounced writes after split/join/note/color operations
  - Extended fields: `_vlan`, `_gateway`, `_vrf`, `_capacityTotal`, `_capacityUsed` in `subnetMap`

### Key Data Structures

- **subnetMap**: Nested object representing subnet hierarchy (keys are CIDR notation like "10.0.0.0/16")
- **subnetNotes**: Metadata for each subnet (note text, background color)
- **Operating modes**: Affects minimum subnet size and reserved IP calculations
  - Standard: /32 min, 2 reserved IPs
  - AWS: /28 min, 5 reserved IPs
  - Azure: /29 min, 5 reserved IPs
  - OCI: /30 min, 3 reserved IPs

## Design Tenets

When contributing, align with these core principles:

1. **Simplicity is king**: First-time users should find the tool intuitive
2. **Subnetting is design work**: Prioritize visual clarity
3. **Users control the data**: No server-side storage; provide convenient save/share options
4. **Embrace community contributions**: Consider all feedback in context of these tenets

## Testing

- Uses Playwright for end-to-end testing
- Test files in `src/tests/`:
  - `subnet-basic.spec.ts`: Basic subnet operations
  - `planner-basics.spec.ts`, `planner-snapshot.spec.ts`: Database features
  - `ui-usage.spec.ts`, `ui-error-handling.spec.ts`: UI interactions
  - `import-export.spec.ts`, `url-sharing.spec.ts`: Persistence features
  - `deep-functional.spec.ts`: Complex scenarios
  - `bug-fixes.spec.ts`: Regression tests
- Custom test runner `run-playwright-with-summary.mjs` provides JSON summary output
- Tests expect the app to be running (use `npm start` in another terminal)

## Important Notes

- **No package.json in root**: All dependencies managed in `src/package.json`
- **Bootstrap is customized**: Built from SCSS in `src/scss/custom.scss`
- **HTTPS required for clipboard**: Use `npm run local-secure-start` to test copy-to-clipboard features
- **Windows environment**: This repo is on Windows (use backslashes in paths if needed)
- **Current branch**: `feat/orchestrated-transition` - implementing planner database integration
- **Database schema status**:
  - Active schema (v3): `planner_state`, `planner_subnet`, `planner_vrf` in `dist/js/planner-db.js`
  - Reference schema: `app/plannerSchema.sql` (hierarchical building planner, not yet implemented)
  - See `app/.prompts/BuildingProject.PRD.v4.md` for current implementation status
- **Known test issue**: Tests expect schema v2 but code is at v3 (all tests currently failing, fix pending in M1.5)
- **Git hooks**: None configured, but avoid force pushing to main/master