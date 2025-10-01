# Visual Subnet Planner Database Schema (v3)

**Status:** Active (as of M1.5 schema cleanup)
**Schema Version:** 3
**Branch:** feat/orchestrated-transition
**Last Updated:** 2025-09-30

## Overview

This document describes the **actual** SQLite schema used by the Visual Subnet Calculator's planner database feature. The schema is at version 3 and consists of three tables:

1. `planner_state` - Singleton row storing base network and operating mode
2. `planner_subnet` - Hierarchical tree of subnets with self-referential parent_id
3. `planner_vrf` - VRF definitions (GLOBAL, MGMT, and user-defined)

## Schema Diagram

```mermaid
erDiagram
    planner_state {
        INTEGER id PK "CHECK(id=1)"
        TEXT base_network
        TEXT operating_mode
        TEXT updated_at
    }
    planner_subnet {
        INTEGER id PK
        INTEGER parent_id FK "nullable"
        TEXT cidr
        TEXT note
        TEXT color
        INTEGER ordinal
        TEXT name
        INTEGER vlan_id "nullable"
        TEXT gateway_ip
        TEXT purpose
        INTEGER vrf_id FK "nullable"
        INTEGER is_management
        INTEGER capacity_total
        INTEGER capacity_used
    }
    planner_vrf {
        INTEGER id PK
        TEXT name UNIQUE
    }

    planner_subnet }o--|| planner_subnet : "parent_id (self-ref)"
    planner_subnet }o--|| planner_vrf : "vrf_id"
```

## Table Definitions

### planner_state (Migration v2)

Stores global planner configuration. Only one row (id=1) is allowed.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PRIMARY KEY, CHECK(id=1) | Always 1 (singleton) |
| base_network | TEXT | NOT NULL, DEFAULT '' | Root network CIDR (e.g., '10.0.0.0/16') |
| operating_mode | TEXT | NOT NULL, DEFAULT 'Standard' | Calculator mode: Standard, AWS, Azure, OCI |
| updated_at | TEXT | NOT NULL, DEFAULT CURRENT_TIMESTAMP | Last modification timestamp |

### planner_subnet (Migration v2 + v3)

Stores hierarchical subnet tree. Each row represents a subnet with optional parent reference.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT | Unique subnet ID |
| parent_id | INTEGER | REFERENCES planner_subnet(id) ON DELETE CASCADE, nullable | Parent subnet ID (NULL for root subnets) |
| cidr | TEXT | NOT NULL | Subnet in CIDR notation (e.g., '10.0.1.0/24') |
| note | TEXT | DEFAULT '' | User-provided description |
| color | TEXT | DEFAULT '' | Background color for UI display |
| ordinal | INTEGER | NOT NULL, DEFAULT 0 | Sort order within parent's children |
| name | TEXT | DEFAULT '' (v3) | Subnet label |
| vlan_id | INTEGER | nullable (v3) | VLAN tag (must be unique across tree) |
| gateway_ip | TEXT | DEFAULT '' (v3) | Default gateway IP address |
| purpose | TEXT | NOT NULL, DEFAULT 'LAN' (v3) | Purpose: LAN, MGMT, INTERCONNECT, LOOPBACK, OTHER |
| vrf_id | INTEGER | REFERENCES planner_vrf(id) ON DELETE SET NULL (v3) | VRF assignment (NULL = GLOBAL) |
| is_management | INTEGER | NOT NULL, DEFAULT 0 (v3) | Boolean: 1 if management subnet, 0 otherwise |
| capacity_total | INTEGER | NOT NULL, DEFAULT 0 (v3) | Total IP addresses in subnet |
| capacity_used | INTEGER | NOT NULL, DEFAULT 0 (v3) | Number of allocated IPs |

**Indexes:**
- `idx_planner_subnet_parent` on `parent_id`
- `idx_planner_subnet_vlan` on `vlan_id`

### planner_vrf (Migration v3)

Stores VRF (Virtual Routing and Forwarding) definitions.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT | Unique VRF ID |
| name | TEXT | NOT NULL UNIQUE | VRF name (e.g., 'GLOBAL', 'MGMT', 'GUEST') |

**Preseeded rows:**
- `(1, 'GLOBAL')` - Default VRF for standard LANs
- `(2, 'MGMT')` - Management VRF for device management interfaces

## Migration History

### Migration v1 (Placeholder)

**Status:** Intentionally empty (removed in M1.5 schema cleanup)

**Rationale:** Originally created 8 hierarchical tables (tbl_building, tbl_floors, tbl_idf, tbl_rack, tbl_device, tbl_supernet, tbl_subnet, tbl_interface) for a full building planner feature, but none of these tables were ever used by the application. They were removed in PRD v4 M1.5 to eliminate dead code and schema confusion.

**Future:** Building planner schema will be restored in PRD v5 when the feature is actually implemented.

### Migration v2 (Active)

Created `planner_state` and `planner_subnet` tables to persist the subnet calculator's state to SQLite.

**Key features:**
- Self-referential `parent_id` for tree structure
- Singleton `planner_state` table with CHECK constraint
- Indexes for efficient parent lookups

### Migration v3 (Active)

Extended `planner_subnet` with networking metadata columns:
- `name`: Human-readable subnet label
- `vlan_id`: VLAN tagging support
- `gateway_ip`: Default gateway per subnet
- `purpose`: Categorization (LAN, MGMT, etc.)
- `vrf_id`: VRF isolation
- `is_management`: Quick filter for management subnets
- `capacity_total` / `capacity_used`: IP allocation tracking

Also created `planner_vrf` table with preseeded GLOBAL and MGMT VRFs.

## Usage Patterns

### Snapshot Persistence

The calculator's `subnetMap` object is serialized to `planner_subnet` rows via `savePlannerSnapshot()` in `dist/js/planner-db.js`. The tree structure is preserved through `parent_id` references.

### Snapshot Loading

`loadPlannerSnapshot()` reconstructs the `subnetMap` tree from `planner_subnet` rows, sorted by `ordinal` within each parent.

### Auto-save

Split, join, note, and color operations trigger debounced writes via `schedulePlannerSnapshotPersist()` in `dist/js/main.js`.

## Validation Rules (Enforced in M2)

1. **VLAN Uniqueness:** `vlan_id` must be unique across all `planner_subnet` rows (excluding NULL)
2. **Gateway Range:** `gateway_ip` must be within the subnet's CIDR range
3. **VRF Consistency:** Child subnets should inherit parent's `vrf_id` unless explicitly overridden
4. **Capacity Tracking:** `capacity_used` ≤ `capacity_total`

## Testing

- `src/tests/planner-basics.spec.ts`: DB bootstrap and migration tests
- `src/tests/planner-snapshot.spec.ts`: Save/load tree persistence tests

## See Also

- `app/plannerSchema.sql` - Archived PostgreSQL schema (future reference for PRD v5)
- `app/.prompts/BuildingProject.PRD.v4.md` - Current PRD with M1.5 cleanup rationale
- `CLAUDE.md` - Project overview and architecture notes
