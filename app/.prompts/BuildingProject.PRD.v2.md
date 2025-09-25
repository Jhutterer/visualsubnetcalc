# Visual Subnet Calculator — Building Project Planner PRD (v2)

Owner: TBD
Status: Draft
Last Updated: YYYY-MM-DD

## Summary

Extend Visual Subnet Calculator with a Building Project Planner that models a single building (up to 10 floors) and assigns IPs/VLANs down to specific device interfaces within racks/IDFs, while preserving simplicity, visual clarity, and offline user control. This version integrates resolved decisions for VLAN scope, L2/L3 modeling, rack visualization, device templates, management networks, and scale constraints.

## Scope & Constraints

- Single building per plan (v1); up to 10 floors.
- VLAN uniqueness scoped per building.
- No graphical rack visualization in v1 (defer to future); use tabular views.
- Scale target: up to 1,000 interfaces, 100 devices, 50 racks with responsive UI.
- Static site only; offline-first with local persistence and export/import.

## Goals

- Model the physical hierarchy: floors → IDFs → racks → devices → interfaces.
- Manage addressing: a single supernet per building split into subnets; track VLANs, gateways, management networks, L3 interconnects, and loopbacks.
- Assign specific IPs to specific interfaces with strong validation.
- Keep workflows fast for design/rework (split/merge, reassign, undo/redo).
- Save, import/export, and share plans with no server storage.

## Non-Goals

- Real-time multi-user collaboration or hosted storage.
- Device discovery/inventory protocols (SNMP/NETCONF/etc.).
- Full DCIM (power/thermal/cabling paths) or L2 topology mapping.
- Broad vendor config generation in v1 (may add targeted snippets later).

## Personas

- Network Engineer (primary): designs the building plan and allocations.
- Field Technician: executes installs, needs per-rack/per-device port assignments.
- Reviewer/Stakeholder: verifies plan, provides notes and approvals.

## Key Use Cases

- Define the building supernet, split into subnets with VLANs and gateways.
- Build hierarchy: floors → IDFs → racks; add devices (curated templates) and interfaces.
- Assign management IPs from a selected management subnet by default.
- Create L3 interconnect subnets (/31 or /30) and bind them to point-to-point interfaces.
- Assign device loopbacks (per VRF) for routing/management as needed.
- Rework quickly: split/merge subnets, rename, move devices, reassign IPs.
- Save to a single file and reload later; export to share.

## Functional Requirements

Hierarchy & Building Plan
- Create/open/save a Building Plan (single building scope).
- CRUD: floors (1–10), IDFs, racks, devices, interfaces via simple forms.
- Rack placement metadata: firstRackU, rackUSize, stackMember (boolean).
- Device templates (curated): Firewall, Router, Switch, UPS, PDU with basic default interfaces and types.

Subnet Management
- One supernet per building (CIDR). Visual split/merge to create subnets.
- Subnet metadata: name, VLAN ID, gateway IP, purpose (LAN, MGMT, INTERCONNECT, OTHER), notes/color.
- Management networks: allow engineer to choose one or more subnets with purpose=MGMT; default device management IPs are allocated from a selected MGMT subnet.
- Interconnects: support /31 or /30 subnets with purpose=INTERCONNECT; allocate to two interfaces (or single in /31 with one address per side as appropriate).
- Reserved-address rules by mode (Standard, AWS, Azure, OCI) as documented in README.
- Validate available hosts and minimum sizes per mode; block invalid splits.

L2/L3 Modeling (Minimal, v1)
- VLAN uniqueness enforced per building.
- VRFs (lightweight): define named VRFs per building; subnets are associated with a VRF; interfaces inherit VRF from subnet assignment, with override only for loopbacks.
- Loopbacks: create interface type=LOOPBACK with per-device unique IP in a chosen VRF.

IP Assignment
- Assign IPs from a subnet to interfaces; uniqueness enforced project-wide.
- Roles/status: AVAILABLE, RESERVED (by rule), GATEWAY, ALLOCATED, MGMT, INTERCONNECT.
- Suggest next available IP; manual override allowed with validation.
- Per-subnet capacity and allocation list with links to consuming interfaces.
- Device-level management IP is distinct from routed/data interfaces; defaults to MGMT subnet.

Editing & Rework
- Undo/redo for split/merge, delete/move, (re)assign operations.
- Bulk operations: sequential port assignment, apply VLAN, reserve ranges.
- Safe rework: when subnets change, flag orphaned or out-of-range assignments and guide fix-up.

Validation
- IP uniqueness within the plan; gateway must be within subnet and not a reserved address (except per-mode gateway rule).
- VLAN conflicts flagged per building scope.
- VRF consistency: interface VRF must match the subnet VRF unless interface is a loopback.

Search/Filter
- Filter by floor/IDF/rack/device/subnet/VLAN/VRF/purpose.
- Global search by device name, interface, IP, VLAN, VRF, notes.

Notes/Annotations
- Notes and color tags at subnet, device, and interface levels; included in export.

## Data Model & Schema

Baseline alignment with app/database-schema.md and app/plannerSchema.sql. Represent CIDR/INET as TEXT in the app, with JS validation and IP math. Proposed minimal additions for v1 features:

- tbl_vrf (NEW): id PK, buildingID FK, name TEXT, description TEXT.
- tbl_subnet (ADD): purpose TEXT CHECK in ('LAN','MGMT','INTERCONNECT','OTHER'), vrfID FK NULLABLE.
- tbl_interface (ADD): vrfID FK NULLABLE (defaults from subnet), role TEXT NULLABLE CHECK in ('DATA','MGMT','INTERCONNECT','LOOPBACK').
- Indices: unique(ipAddress) scoped to building; unique(vlanID, buildingID) for VLAN uniqueness; indices on (subnetID), (deviceID), (vrfID).

These additions can be persisted in JSON/IndexedDB first, with optional SQLite/WASM support and SQL export that extends the provided schema.

## UX & IA

- Mode Toggle: Calculator Only vs Building Planner (default remains Calculator for first-time users).
- Left Panel: Building Explorer tree (Floor → IDF → Rack → Device → Interface) with inline add/edit.
- Main Tabs:
  - Subnets: enhanced table (VLAN, purpose, gateway, VRF, capacity, actions: Assign IPs, View Allocations).
  - Devices: curated device templates, management IPs, interface lists.
  - Interfaces: assignment workspace with filters (subnet/VLAN/VRF/purpose), bulk actions, validation cues.
  - Racks: tabular rack listing (no graphical U-view in v1); links to devices and positions.

Accessibility: maintain ARIA roles/labels consistent with current patterns and tests.

## Persistence & Sharing

- Offline-first: autosave to IndexedDB/localStorage with a clear “Clear Local Data” option.
- Export/Import a single Building Plan file (.vscproj JSON, optionally compressed with lz-string) containing hierarchy, addressing, VRFs, and assignments.
- Optional: SQLite/WASM export/import following the schema (with proposed additions).
- Versioning: projectVersion and configVersion with migration layer in dist/js/main.js.
- Backward compatibility: keep Calculator-only URL state working independently of Building plans.

## Performance

- Target: 1,000 interfaces, 100 devices, 50 racks per plan.
- Incremental DOM updates where possible; avoid full-table re-render.
- Defer heavy operations (e.g., deep split previews) until user requests.

## Security & Privacy

- No remote storage or telemetry by default.
- Validate and sanitize imports; reject malformed foreign keys, invalid IP/CIDR.
- Clear data visibility: indicate local autosave state; easy wipe controls.

## Testing & QA (Playwright in src/tests)

- Planner toggle and hierarchy CRUD.
- Subnet split/merge with mode-specific reserved ranges enforced.
- IP assignment (including MGMT and INTERCONNECT) with uniqueness and gateway validation.
- VRF assignment consistency and loopback handling.
- Import/export round-trip fidelity (JSON); optional SQLite round-trip behind a flag.
- Accessibility checks for new controls.

## Milestones & Acceptance Criteria

M0: Foundations
- Define VRF and purpose model; finalize schema additions; implement IP/CIDR utilities.
- AC: Schema/JSON documented; validators pass; unit tests for IP math.

M1: Building Planner & Hierarchy CRUD
- Mode toggle; Explorer tree; floors/IDFs/racks/devices/interfaces CRUD; curated device templates.
- AC: Create a 10-floor building with racks/devices; data persists and reloads.

M2: Subnets + VLAN/Gateway/Purpose
- One supernet per building; split/merge; VLAN uniqueness per building; purpose and VRF on subnets; gateway validation.
- AC: Capacity counters correct; reserved rules enforced across modes.

M3: IP Assignment (+MGMT, +INTERCONNECT, +Loopbacks)
- Interface assignment workspace; next-available suggestions; VRF propagation; loopback support.
- AC: Assign across devices; search/filter by VLAN/VRF/purpose; validations fire correctly.

M4: Save/Import/Export
- JSON export/import with migration versioning; autosave; optional SQLite(WASM) export.
- AC: Round-trip for a realistic building plan; Calculator-only URLs remain functional.

M5: Polish & Undo/Redo
- Undo/redo for split/merge/assign/move; bulk tools; notes/tags; tabular rack listings.
- AC: Undo/redo covers key operations; notes persist; rack lists navigate cleanly.

## Future Enhancements (Post-v1)

- Graphical rack U-views and cable/patch-panel mapping.
- Vendor-specific config snippets for interface IPs and VLANs.
- Multi-building roll-ups and capacity dashboards.
- Bulk CSV import of device inventory.

## Appendix

Type Mapping (SQLite)
- CIDR/INET as TEXT (validated/canonicalized by app utilities).
- BOOLEAN as INTEGER(0/1); enforce in UI and import validation.

Example JSON Outline (Building Plan)
```
{
  "projectVersion": "1.0.0",
  "building": { "id": 1000, "name": "HQ", "slug": "hq", "address": "..." },
  "vrfs": [ { "id": 10, "buildingId": 1000, "name": "GLOBAL" }, { "id": 11, "name": "MGMT" } ],
  "floors": [ { "id": 1100, "buildingId": 1000, "number": 1, "name": "1" } ],
  "idfs": [ { "id": 1200, "floorId": 1100, "name": "IDF-1A" } ],
  "racks": [ { "id": 1300, "idfId": 1200, "name": "RACK-01", "totalU": 42 } ],
  "devices": [ { "id": 1400, "rackId": 1300, "type": "Switch", "mgmtIP": "10.0.0.10", "model": "..." } ],
  "interfaces": [
    { "id": 1500, "deviceId": 1400, "name": "Gi1/0/1", "type": "DATA", "subnetId": 2001, "vrfId": 10, "ip": "10.0.1.11" },
    { "id": 1501, "deviceId": 1400, "name": "Lo0", "type": "LOOPBACK", "vrfId": 10, "ip": "10.255.0.1" }
  ],
  "supernet": { "id": 1900, "buildingId": 1000, "network": "10.0.0.0/16" },
  "subnets": [
    { "id": 2001, "supernetId": 1900, "network": "10.0.1.0/24", "vlanId": 101, "gateway": "10.0.1.1", "purpose": "LAN", "vrfId": 10 },
    { "id": 2002, "supernetId": 1900, "network": "10.0.10.0/24", "vlanId": 10, "gateway": "10.0.10.1", "purpose": "MGMT", "vrfId": 11 }
  ],
  "notes": { "subnet:2001": "Staff LAN" }
}
```
