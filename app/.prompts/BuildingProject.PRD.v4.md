# Visual Subnet Calculator — Building Project Planner PRD (v4)

**Status:** Draft - Reflecting Actual Progress
**Branch:** feat/orchestrated-transition
**Last Updated:** 2025-09-29

## Executive Summary

This PRD supersedes v3 and reflects the **actual state of implementation** as of commit `e468734`. The orchestrator and agents have completed M0 and M1, establishing SQLite foundations and integrating calculator state persistence into the database. However, **the implementation diverged from the original plan** in critical ways that require course correction.

## What Was Actually Built (M0 + M1)

### Achievements ✓

1. **SQLite WASM Integration** (M0 baseline)
   - `dist/js/planner-db.js`: Full PlannerDbManager with File System Access API support
   - Migration system at **schema version 3** (not 2 as tests expect)
   - OPFS fallback and in-memory mode with download/upload
   - Create/Open/Save/Download UI controls in `dist/index.html`

2. **Planner State Tables** (M1 partial)
   - `planner_state`: stores base_network, operating_mode (singleton row, id=1)
   - `planner_subnet`: stores hierarchical subnet tree with parent_id, cidr, note, color, ordinal
   - Migration v3 added: name, vlan_id, gateway_ip, purpose, vrf_id, is_management, capacity_total, capacity_used
   - `planner_vrf`: stores VRF definitions (GLOBAL, MGMT preseeded)

3. **Calculator ↔ SQLite Integration** (M1 core)
   - `dist/js/main.js:260`: `hydratePlannerFromSnapshot()` loads from DB and populates `subnetMap`
   - `dist/js/main.js:1448`: `schedulePlannerSnapshotPersist()` debounces writes after UI actions
   - `dist/js/main.js:1488`: `persistPlannerSnapshot()` serializes `subnetMap` tree to `planner_subnet` rows
   - Reset/split/join/note/color operations trigger snapshot saves
   - `subnetMap` now tracks extended fields: `_vlan`, `_gateway`, `_vrf`, `_capacityTotal`, `_capacityUsed`

4. **Test Coverage** (partial)
   - `src/tests/planner-basics.spec.ts`: DB bootstrap and reopen flow
   - `src/tests/planner-snapshot.spec.ts`: Save/load tree persistence
   - Tests passing at time of M1 completion, but **now failing due to schema version mismatch**

### Critical Gaps & Inconsistencies ✗

1. **Schema Version Drift**
   - Code is at migration v3 (TARGET_VERSION = 3), adding VLAN/gateway/VRF columns
   - Tests expect v2 (`planner-basics.spec.ts:27`)
   - **Blocker:** All 96 tests failing due to this mismatch

2. **Hierarchical Schema Never Used**
   - PRD v3 called for `tbl_building`, `tbl_floors`, `tbl_idf`, `tbl_rack`, `tbl_device`, `tbl_supernet`, `tbl_subnet`, `tbl_interface`
   - Migration v1 creates these tables, but **none of the UI or logic touches them**
   - No CRUD operations, no foreign key enforcement, no data flows
   - Dead code occupying schema space

3. **Two Conflicting Subnet Models**
   - **Model A (unused):** `tbl_supernet` + `tbl_subnet` (migration v1, PostgreSQL-style schema from `app/plannerSchema.sql`)
   - **Model B (in use):** `planner_subnet` tree (migration v2+v3, self-referential parent_id)
   - These models overlap in purpose but are not integrated
   - VLAN/gateway/VRF columns exist in both schemas (v1's `tbl_subnet.vlan_id` and v3's `planner_subnet.vlan_id`)

4. **PRD Milestones M2-M6 Untouched**
   - M2 (VLAN uniqueness, gateway validation, VRF propagation, capacity tracking)
   - M3 (interface assignment UI, MGMT/INTERCONNECT/LOOPBACK)
   - M4 (Save/Load workflows beyond basic file handling)
   - M5 (remove URL sharing - still present in codebase)
   - M6 (undo/redo, polish)

5. **URL Sharing Still Present**
   - `dist/js/lz-string.min.js` still included
   - `src/tests/url-sharing.spec.ts` still runs
   - `dist/js/main.js` still has URL serialization logic
   - PRD v3 M5 goal unmet

6. **No UI for Hierarchical Planner**
   - Calculator UI enhanced with DB controls, but no Building Explorer, no device CRUD, no interface assignment
   - `dist/index.html` has a "Planner Database" panel but it only exercises the sample building seed
   - No mode toggle between "Calculator Only" and "Building Planner"

## Root Cause Analysis

The orchestrator agents built **M1 as a parallel system** rather than a replacement:
- They added `planner_state`/`planner_subnet` to persist calculator state without touching the original building planner schema
- They extended `planner_subnet` (v3) with VLAN/gateway/VRF columns that duplicate `tbl_subnet` fields
- They did not integrate the two models or deprecate the unused tables

**This creates technical debt** that will compound if not addressed before moving forward.

## Revised Strategy for v4

### Immediate Action: Reconcile Schema (M1.5)

**Goal:** Stabilize the current implementation and align tests before proceeding to M2.

1. **Fix Schema Version Mismatch**
   - Update `planner-basics.spec.ts:27` to expect `userVersion = 3`
   - Document that v3 is the current stable schema
   - Run full test suite to confirm green

2. **Deprecate or Integrate Hierarchical Tables**
   - **Option A (Recommended):** Remove unused tables from migration v1 (tbl_building through tbl_interface) to reduce confusion; keep only `planner_state`, `planner_subnet`, `planner_vrf`
   - **Option B:** Add foreign keys linking `planner_subnet.id` to a new `subnet_id` column in a future `tbl_subnet` bridge (complex, deferred)
   - **Decision:** Go with Option A for v4; defer full building planner to future PRD

3. **Consolidate Documentation**
   - Archive `app/plannerSchema.sql` (PostgreSQL schema) as reference only
   - Update `app/database-schema.md` to reflect actual SQLite schema (v3 migrations)
   - Clarify that v4 scope is "calculator + snapshot persistence" not "full building planner"

### M2-M6 Rescoped for v4

#### M2: Enhanced Subnet Metadata & Validation
- **Scope:** Use existing `planner_subnet` columns (vlan_id, gateway_ip, vrf_id, purpose) in the calculator UI
- **Tasks:**
  - Add VLAN input field to subnet rows; enforce uniqueness across tree
  - Add gateway input field; validate with `isGatewayValidForSubnet()`
  - Add VRF dropdown (from `planner_vrf` table); display in subnet table
  - Add purpose dropdown (LAN, MGMT, INTERCONNECT, OTHER)
  - Implement capacity tracking UI (show `_capacityTotal`, `_capacityUsed` from snapshot)
  - Add constraint checks in `persistPlannerSnapshot()` before writes
- **Tests:** Extend `planner-snapshot.spec.ts` to validate VLAN collisions, gateway out-of-range, VRF consistency
- **Commit:** `feat(subnets): add VLAN/gateway/VRF UI and validation to calculator`

#### M3: Remove URL Sharing (was M5)
- **Rationale:** Simpler than interface assignment; clears technical debt early
- **Scope:**
  - Remove `dist/js/lz-string.min.js` and `<script>` tag from `dist/index.html`
  - Remove URL serialization logic from `dist/js/main.js` (search for `LZString`, `window.location.hash`)
  - Delete or gut `src/tests/url-sharing.spec.ts` (or replace with DB-only sharing test)
  - Remove "Copy Shareable URL" button from UI
  - Update `README.md` to reflect file-based persistence only
- **Tests:** Ensure no tests depend on URL hash; `npm test` green after removal
- **Commit:** `refactor(persistence): remove URL sharing and lz-string dependency`

#### M4: Save/Load Workflow Polish (was M4 partial)
- **Scope:** Improve File System Access flows and user feedback
- **Tasks:**
  - Show current file name in UI (e.g., "planner-2025-09-29.sqlite")
  - Add "Save As" button to create new file handle
  - Add "Close Database" button to clear state and return to Open/Create choice
  - Add last-saved timestamp display
  - Improve auto-save debounce (currently `schedulePlannerSnapshotPersist()`); add user-visible indicator
  - Handle file permission errors gracefully (prompt re-authorization)
- **Tests:** `planner-basics.spec.ts` updated to cover Save As and Close flows
- **Commit:** `feat(persistence): polish Save/Load UX with file name display and Save As`

#### M5: Building Planner UI (Deferred from v3 M2/M3)
- **Scope:** Restore `tbl_building`, `tbl_floors`, `tbl_idf`, `tbl_rack`, `tbl_device`, `tbl_supernet`, `tbl_subnet`, `tbl_interface` with purpose
- **Tasks:**
  - Add migration v4 to recreate hierarchical tables (clean slate)
  - Link `planner_subnet` to `tbl_subnet` via new `subnet_id` column (optional bridge)
  - Build Building Explorer UI (left panel, tree view)
  - Add device templates CRUD
  - Add MGMT IP assignment from `planner_subnet` where `purpose='MGMT'`
- **Status:** **Not included in v4 scope**; move to PRD v5
- **Rationale:** Calculator persistence must stabilize first

#### M6: Undo/Redo (was M6)
- **Scope:** App-level history for split/merge/assign operations
- **Tasks:**
  - Add `planner_history` table (snapshot_id, action_type, timestamp, state_json)
  - Implement undo/redo stack in `dist/js/main.js`
  - Add Undo/Redo buttons to UI
  - Transactional rollback on undo
- **Tests:** `planner-snapshot.spec.ts` extended for undo/redo flows
- **Commit:** `feat(ux): add undo/redo for subnet operations`

#### M7: XML Export (was M4 partial)
- **Scope:** Export current `planner_state` + `planner_subnet` tree to XML
- **Tasks:**
  - Write `exportPlannerToXml()` in `dist/js/main.js`
  - Deterministic ordering by subnet ID
  - Include VRF, VLAN, gateway, purpose, capacity metadata
  - Add "Export to XML" button in UI
  - Optional XSD schema in `app/planner-export.xsd`
- **Tests:** New `planner-export.spec.ts` to validate XML structure
- **Commit:** `feat(export): add XML export for planner snapshots`

## Revised Milestones for v4

```
M1.5: Schema Reconciliation & Cleanup
├─ Fix test expectations (userVersion = 3)
├─ Remove unused tbl_* tables from migration v1
├─ Update database-schema.md to reflect actual v3 schema
├─ Run full test suite: `npm test` → green
└─ Commit: `refactor(schema): align DB migrations with actual usage and fix tests`

M2: Enhanced Subnet Metadata & Validation
├─ Add VLAN/gateway/VRF/purpose UI fields to calculator
├─ Implement validation logic (uniqueness, range checks)
├─ Update snapshot persistence to enforce constraints
├─ Tests: planner-snapshot.spec.ts extended
└─ Commit: `feat(subnets): add VLAN/gateway/VRF UI and validation to calculator`

M3: Remove URL Sharing
├─ Delete lz-string dependency and URL serialization logic
├─ Remove "Copy Shareable URL" button
├─ Gut url-sharing.spec.ts or replace with DB sharing test
├─ Update README.md
└─ Commit: `refactor(persistence): remove URL sharing and lz-string dependency`

M4: Save/Load Workflow Polish
├─ Display current file name and last-saved timestamp
├─ Add "Save As" and "Close Database" buttons
├─ Improve auto-save feedback (debounce indicator)
├─ Handle file permission errors
└─ Commit: `feat(persistence): polish Save/Load UX with file name display and Save As`

M6: Undo/Redo
├─ Add planner_history table (migration v4)
├─ Implement undo/redo stack with transactional rollback
├─ Add UI buttons for Undo/Redo
└─ Commit: `feat(ux): add undo/redo for subnet operations`

M7: XML Export
├─ Implement exportPlannerToXml() with deterministic ordering
├─ Add "Export to XML" button
├─ Write planner-export.spec.ts test
└─ Commit: `feat(export): add XML export for planner snapshots`

M5: Building Planner UI (DEFERRED to PRD v5)
├─ Restore hierarchical tables (migration v4+)
├─ Build Building Explorer UI
├─ Add device templates and interface assignment
└─ Status: Out of scope for v4
```

## Non-Goals for v4 (Moved to v5)

- Full building hierarchy (floors → IDFs → racks → devices → interfaces)
- Interface assignment UI (MGMT, INTERCONNECT, LOOPBACK)
- Device templates and CRUD
- Multi-building plans
- Graphical rack U-views
- XML import (export only in v4)

## Key Acceptance Criteria for v4

1. **Schema Stability:** Migration v3 documented and tests green; no unused tables
2. **Calculator Persistence:** Split/join/note/color operations round-trip through SQLite
3. **VLAN/Gateway/VRF:** UI fields present and validated; constraints enforced in DB
4. **No URL Sharing:** lz-string removed; file-based persistence only
5. **Save/Load UX:** File name display, Save As, Close Database, last-saved timestamp
6. **Undo/Redo:** History stack functional with transactional rollback
7. **XML Export:** One-click export of planner snapshot with deterministic ordering
8. **Test Suite:** `npm test` green for all 96+ specs

## Testing Strategy

- **Unit Tests:** None (static site, browser-based SQLite)
- **E2E Tests (Playwright):**
  - `planner-basics.spec.ts`: DB bootstrap, migration, reopen (update to v3)
  - `planner-snapshot.spec.ts`: Save/load tree with VLAN/gateway/VRF validation
  - `planner-export.spec.ts`: XML export structure and content (new)
  - `subnet-basic.spec.ts`: Calculator operations (existing, should remain green)
  - `ui-usage.spec.ts`, `ui-error-handling.spec.ts`: UI flows (existing)
  - ~~`url-sharing.spec.ts`~~: Remove or replace with DB-only test
- **Manual Testing:**
  - File System Access API flows on Chrome/Edge
  - OPFS fallback on Firefox
  - Download/upload fallback on Safari/unsupported browsers

## Performance Targets

- Subnet tree with 1,000 nodes: render < 500ms
- SQLite snapshot persist: < 100ms (debounced)
- File System Access write: < 200ms (async, non-blocking)

## Security & Privacy

- Local-only; no telemetry or remote storage
- File handle permissions explained in UI
- Validate/sanitize XML exports (escape special chars)

## Documentation Updates

- `README.md`: Remove URL sharing instructions; add file-based persistence guide
- `app/database-schema.md`: Reflect v3 schema (planner_state, planner_subnet, planner_vrf only)
- `app/plannerSchema.sql`: Archive as "future reference" or delete
- `CLAUDE.md`: Update "Architecture" section to reflect v4 scope

## Migration Path from v3 PRD

**For users:** No migration needed (no users on feat branch yet).

**For orchestrator:**
1. Complete M1.5 (schema cleanup) first to unblock tests
2. Proceed linearly through M2 → M3 → M4 → M6 → M7
3. Defer M5 (building planner UI) to next PRD cycle
4. Commit atomically per milestone with conventional commits
5. Run `npm test` after each milestone; auto-fix loop (max 2 attempts) on failures

## Success Metrics

- All Playwright tests green after M1.5
- Zero unused tables in schema after M1.5
- VLAN/gateway/VRF validation enforced in M2
- lz-string dependency removed in M3
- Undo/redo functional in M6
- XML export produces valid output in M7
- Feature branch `feat/orchestrated-transition` ready for PR to main after M7

## Open Questions

1. Should `planner_subnet.capacity_total` and `capacity_used` be auto-calculated or user-editable?
   - **Recommendation:** Auto-calculated from subnet size and child allocations; read-only in UI
2. Should VRFs beyond GLOBAL/MGMT be user-creatable in v4?
   - **Recommendation:** Yes, add "Manage VRFs" modal in M2 for CRUD
3. Should we keep migration v1's hierarchical tables as dead code or remove them?
   - **Recommendation:** Remove in M1.5 to avoid confusion; restore in v5 when ready to implement

## Appendix: Actual Schema (v3)

```sql
-- Migration v2: Planner state and subnet tree
CREATE TABLE planner_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  base_network TEXT NOT NULL DEFAULT '',
  operating_mode TEXT NOT NULL DEFAULT 'Standard',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE planner_subnet (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  parent_id INTEGER REFERENCES planner_subnet(id) ON DELETE CASCADE,
  cidr TEXT NOT NULL,
  note TEXT DEFAULT '',
  color TEXT DEFAULT '',
  ordinal INTEGER NOT NULL DEFAULT 0
);

-- Migration v3: Extended subnet metadata
ALTER TABLE planner_subnet ADD COLUMN name TEXT DEFAULT '';
ALTER TABLE planner_subnet ADD COLUMN vlan_id INTEGER;
ALTER TABLE planner_subnet ADD COLUMN gateway_ip TEXT DEFAULT '';
ALTER TABLE planner_subnet ADD COLUMN purpose TEXT NOT NULL DEFAULT 'LAN';
ALTER TABLE planner_subnet ADD COLUMN vrf_id INTEGER REFERENCES planner_vrf(id) ON DELETE SET NULL;
ALTER TABLE planner_subnet ADD COLUMN is_management INTEGER NOT NULL DEFAULT 0;
ALTER TABLE planner_subnet ADD COLUMN capacity_total INTEGER NOT NULL DEFAULT 0;
ALTER TABLE planner_subnet ADD COLUMN capacity_used INTEGER NOT NULL DEFAULT 0;

CREATE TABLE planner_vrf (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);

INSERT OR IGNORE INTO planner_vrf (id, name) VALUES (1, 'GLOBAL');
INSERT OR IGNORE INTO planner_vrf (id, name) VALUES (2, 'MGMT');

CREATE INDEX idx_planner_subnet_parent ON planner_subnet(parent_id);
CREATE INDEX idx_planner_subnet_vlan ON planner_subnet(vlan_id);
```

---

**End of PRD v4**