# Visual Subnet Calculator — Building Project Planner PRD (v3)

Owner: TBD
Status: Draft
Last Updated: YYYY-MM-DD

## Summary

This version makes SQLite the authoritative datastore for all application state while preserving simple, offline use. The app runs as a static site and operates on a local .sqlite file selected by the user; if no file exists, the app creates a new .sqlite file with the required schema. URL sharing is removed from the project. Export to XML is supported for interoperability and documentation.

## Scope & Constraints

- Single building per plan (v1); up to 10 floors.
- SQLite is the source of truth for all data (no JSON/URL share state).
- Storage options:
  - Primary: Local .sqlite file via the File System Access API. On first use (or when no file is chosen), prompt to Open an existing .sqlite or Create New; creating initializes schema/migrations and saves the file to a user-selected location.
  - Fallback 1: OPFS (Origin Private File System) backed .sqlite when File System Access API is unavailable; provide explicit Export/Import .sqlite to move plans between browsers/machines.
  - Fallback 2: In-memory SQLite with explicit Download/Upload of the .sqlite file where neither File System Access nor OPFS is available.
- XML export is supported (read-only export; import from XML is optional future work).
- No URL sharing; remove any shareable URL features and dependencies.
- UI remains a static site (no backend) using JS + SQLite WASM for data operations.
- Scale target: up to 1,000 interfaces, 100 devices, 50 racks with responsive UI.

## Goals

- Model the physical hierarchy: floors → IDFs → racks → devices → interfaces.
- Manage addressing: one supernet per building, split into subnets; track VLANs, gateways, VRFs, management networks, interconnects, and loopbacks.
- Assign specific IPs to specific interfaces with strong validation and guardrails.
- Persist all state in SQLite with foreign keys, indices, and constraints.
- Provide export to XML for plan archiving and external tooling.
- Maintain fast design/rework workflows: split/merge, reassign, undo/redo.

## Non-Goals

- URL sharing and compressed state in query strings (removed).
- Real-time multi-user collaboration or hosted storage.
- Device discovery/inventory protocols (SNMP/NETCONF/etc.).
- Full DCIM/cable pathing visualization in v1 (tabular racks only).

## Personas

- Network Engineer: designs the building plan and allocations.
- Field Technician: needs per-rack/per-device port assignments.
- Reviewer/Stakeholder: verifies plan and leaves notes.

## Key Use Cases

- Define a building supernet and split into subnets with VLANs and gateways.
- Build hierarchy: floors → IDFs → racks; add devices (curated templates) and interfaces.
- Assign management IPs from a selected management subnet by default.
- Create interconnect subnets (/31 or /30) for P2P links; assign to interfaces.
- Add loopbacks per device (per VRF) for routing/management.
- Rework quickly: split/merge subnets, rename, move devices, reassign IPs.
- Save as .sqlite; export as XML for review/sharing.

## Startup & File Handling

- On launch, present: Open .sqlite or Create New.
- Open .sqlite: prompt for a file, verify schema version, run migrations if needed, and load.
- Create New: prompt for a location/name, initialize schema (PRAGMA foreign_keys=ON; user_version set), and open the database.
- Keep the file handle open for transactional writes; show current database name and last saved timestamp in the UI. Provide Save, Save As, Close, and Switch Database actions.

## Functional Requirements

Hierarchy & Building Plan
- Single Building plan with floors (1–10), IDFs, racks, devices, interfaces.
- CRUD with simple forms; device placement metadata: firstRackU, rackUSize, stackMember.
- Curated device templates: Firewall, Router, Switch, UPS, PDU (basic default interfaces).

Subnet Management
- One supernet (CIDR) per building; visual split/merge to create subnets.
- Subnet fields: name, VLAN ID (unique per building), gateway IP, purpose (LAN, MGMT, INTERCONNECT, OTHER), VRF, notes/color.
- Management subnets: allow the engineer to designate MGMT subnets and select the default MGMT subnet for device management IPs.
- Interconnect subnets: support /31 or /30; allocate to two interfaces (per rules).
- Enforce reserved-address rules by mode (Standard, AWS, Azure, OCI per README) and minimum sizes.

L2/L3 Modeling (Minimal v1)
- VLAN uniqueness scoped to building.
- VRFs: define named VRFs; subnets belong to a VRF; interfaces inherit VRF from subnet unless LOOPBACK (explicit VRF).
- Loopbacks: interface type=LOOPBACK, per-device unique IP, VRF-bound.

IP Assignment
- Assign IPs from subnets to interfaces; uniqueness enforced across the plan.
- Roles/status: AVAILABLE, RESERVED, GATEWAY, ALLOCATED, MGMT, INTERCONNECT.
- Next-available suggestion; manual override with validation.
- Per-subnet capacity tracking; list allocations linking to consuming interfaces.

Editing & Rework
- Undo/redo for split/merge, delete/move, (re)assign operations (app-level history with transactional DB operations).
- Bulk operations: sequential port assignment, apply VLAN, reserve ranges.
- Reconciliation: when subnets change, flag out-of-range allocations and guide fix-up.

Validation
- IP uniqueness; gateway inside subnet and not reserved (except per-mode gateway rule).
- VLAN collisions flagged per building.
- VRF consistency: interface VRF must match subnet VRF unless LOOPBACK.

Search/Filter
- Filter by floor/IDF/rack/device/subnet/VLAN/VRF/purpose.
- Global search by device, interface, IP, VLAN, VRF, notes.

Notes/Annotations
- Notes and color tags on subnet/device/interface; stored in SQLite and included in XML export.

## Data Model & SQLite Schema

Base alignment with app/plannerSchema.sql and app/database-schema.md. Use SQLite types:
- IP/CIDR stored as TEXT; validate and canonicalize in app logic; optional CHECK constraints.
- BOOLEAN as INTEGER(0/1); FOREIGN KEYs enforced via PRAGMA foreign_keys=ON.

Schema (additions on top of plannerSchema.sql):
- tbl_vrf (NEW)
  - id INTEGER PRIMARY KEY, buildingID INTEGER NOT NULL REFERENCES tbl_building(ID), name TEXT NOT NULL, description TEXT
- tbl_subnet (ADD columns)
  - purpose TEXT NOT NULL CHECK (purpose IN ('LAN','MGMT','INTERCONNECT','OTHER')) DEFAULT 'LAN'
  - vrfID INTEGER NULL REFERENCES tbl_vrf(id)
- tbl_interface (ADD columns)
  - vrfID INTEGER NULL REFERENCES tbl_vrf(id)
  - role TEXT NULL CHECK (role IN ('DATA','MGMT','INTERCONNECT','LOOPBACK'))
- Indices & Constraints
  - UNIQUE(vlanID, supernetID OR building_id scope) to enforce VLAN uniqueness per building
  - UNIQUE(ipAddress) (or unique per building) to enforce address uniqueness
  - Indices on (subnetID), (deviceID), (vrfID) for query performance

Views (optional)
- v_subnet_allocations: joins subnets → interfaces to summarize usage/capacity
- v_device_interfaces: devices → interfaces with role/vrf/subnet

Triggers (optional)
- Prevent assigning an IP outside its subnet
- Auto-tag GATEWAY reservation when ipAddress == gatewayIP of the subnet

## SQLite Runtime Architecture

- Library: SQLite WASM (official sqlite.org build) or sql.js.
- Persistence: Primary is a user-selected local .sqlite file opened via the File System Access API (read/write). Fallback to OPFS, then in-memory as needed.
- Data Access Layer: thin DAO in JS to execute SQL, migrations, and transactions; all calculator state reads/writes go through SQL.
- Migrations: schema versioning via PRAGMA user_version with incremental migration scripts.
- Durability: use WAL journaling where supported; batch frequent UI updates into transactions; autosave policy visible to the user.

## XML Export

- Provide a one-click XML export of the current SQLite-backed plan.
- Deterministic ordering (by primary keys) for stable diffs.
- High-level structure:
  - <building>, <floors>, <idfs>, <racks>, <devices>, <interfaces>
  - <supernet>, <subnets>, with attributes: network, vlanId, gateway, purpose, vrf
  - <vrfs>
  - <notes>
- Optional XSD to describe the XML shape.

Example (illustrative)
```xml
<plan version="1.0">
  <building id="1000" name="HQ" slug="hq" address="123 Main St"/>
  <vrfs>
    <vrf id="10" name="GLOBAL"/>
    <vrf id="11" name="MGMT"/>
  </vrfs>
  <supernet id="1900" network="10.0.0.0/16" buildingId="1000"/>
  <subnets>
    <subnet id="2001" supernetId="1900" network="10.0.1.0/24" vlanId="101" gateway="10.0.1.1" purpose="LAN" vrfId="10"/>
    <subnet id="2002" supernetId="1900" network="10.0.10.0/24" vlanId="10" gateway="10.0.10.1" purpose="MGMT" vrfId="11"/>
  </subnets>
  <floors>
    <floor id="1100" buildingId="1000" number="1" name="1"/>
  </floors>
  <idfs>
    <idf id="1200" floorId="1100" name="IDF-1A"/>
  </idfs>
  <racks>
    <rack id="1300" idfId="1200" name="RACK-01" totalU="42"/>
  </racks>
  <devices>
    <device id="1400" rackId="1300" type="Switch" mgmtIP="10.0.10.10" model="X"/>
  </devices>
  <interfaces>
    <interface id="1500" deviceId="1400" name="Gi1/0/1" role="DATA" subnetId="2001" vrfId="10" ip="10.0.1.11"/>
    <interface id="1501" deviceId="1400" name="Lo0" role="LOOPBACK" vrfId="10" ip="10.255.0.1"/>
  </interfaces>
  <notes>
    <note key="subnet:2001">Staff LAN</note>
  </notes>
  <modes>
    <mode>STANDARD</mode>
  </modes>
  <metadata exportedAt="2025-01-01T12:00:00Z"/>
  
</plan>
```

## UX & IA

- Mode Toggle: Calculator Only vs Building Planner (default remains Calculator for first-time users).
- Left Panel: Building Explorer tree (Floor → IDF → Rack → Device → Interface) with inline add/edit.
- Main Tabs:
  - Subnets: enhanced table (VLAN, purpose, gateway, VRF, capacity, Assign IPs, View Allocations).
  - Devices: templates, management IPs, interface lists.
  - Interfaces: assignment workspace with filters and bulk actions.
  - Racks: tabular listing (no graphical U-view in v1).
- Remove URL share UI; remove any references to shareable links.
- Add Database controls (Open, Create New, Save, Save As, Close) in a top-level menu or toolbar with status (file name, last saved).

Accessibility: maintain ARIA roles/labels consistent with existing tests.

## Performance

- Indices in SQLite to keep common queries responsive.
- Incremental DOM updates; avoid full-table re-render.
- Defer heavy computations until requested (e.g., deep split previews).

## Security & Privacy

- Local-only; no telemetry or remote storage.
- Validate/sanitize imports; XML export escapes special characters.
- Clear indication of where the DB is stored (local file path/handle vs OPFS) and how to clear/close it.
- File handle permissions: explain browser prompts and how to re-authorize access if needed.

## Testing & QA (Playwright)

- SQLite initialization and migrations (user_version) verified.
- File handling: Open existing .sqlite, Create New .sqlite, Save/Save As, and Close workflows validated via File System Access API (with fallbacks covered where unsupported).
- Planner toggle and full CRUD across hierarchy tables.
- Subnet split/merge with mode-specific reserved addresses enforced.
- IP assignment (MGMT/INTERCONNECT/LOOPBACK) with uniqueness and gateway validation.
- XML export: schema compliance (optional XSD), deterministic ordering, special-char escaping.
- Remove/adjust tests that previously validated URL sharing; remove lz-string vendor file.

## Milestones & Acceptance Criteria

M0: SQLite Foundations
- Integrate SQLite WASM; implement Open/Create using the File System Access API; establish DAO and migrations.
- AC: Create New produces a valid .sqlite with schema and user_version; Open loads and migrates an existing .sqlite; PRAGMA foreign_keys=ON; basic CRUD verified in DB.

M1: Replace In-Memory State with DB
- Route calculator state and project entities through SQL; implement transactions.
- AC: App functions using DB only; reload reflects DB contents.

M2: Subnets + VLAN/Gateway/VRF/Purpose
- Split/merge; VLAN uniqueness per building; gateway validation; VRF on subnets.
- AC: Capacity counters correct; reserved rules enforced across modes.

M3: Interface Assignment (+MGMT, +INTERCONNECT, +Loopbacks)
- Assignment UI; next-available suggestions; VRF propagation; loopbacks.
- AC: Assign across devices; filters work; validations fire correctly.

M4: Save/Load & XML Export
- Save/Load .sqlite via File System Access API (primary); OPFS and download/upload fallbacks. XML export with XSD (optional).
- AC: Round-trip .sqlite using Open/Create/Save/Save As; XML export opens and validates.

M5: Remove URL Sharing
- Remove lz-string and URL serialization; update UI/docs/tests accordingly.
- AC: No share URL features remain; tests pass.

M6: Polish & Undo/Redo
- Undo/redo covering split/merge/assign/move; bulk tools; notes/tags.
- AC: History operates across DB-backed operations; no data corruption.

## Future Enhancements

- Graphical rack U-views and cabling.
- Vendor config snippets for interface IPs and VLANs.
- Multi-building plans and roll-up dashboards.
- XML import with validation and conflict resolution.
