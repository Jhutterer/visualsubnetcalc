# Visual Subnet Calculator — Building Project Planner PRD

Owner: TBD
Status: Draft
Last Updated: YYYY‑MM‑DD

## Vision

Extend Visual Subnet Calculator into a project planner that models real buildings (building → floors → IDFs → racks → devices → interfaces) and assigns IPs/VLANs down to specific device interfaces, while preserving the tool’s core tenets:

- Simplicity for first‑time users
- Visual clarity for subnet design work
- Users control the data (offline‑first, no server storage)
- Embrace community contributions

This feature enables network engineers to quickly split supernets into practical subnets and then allocate specific addresses to specific interfaces on devices deployed in racks, IDFs, floors, and buildings. Plans save locally and can be revised rapidly.

## Goals

- Model physical hierarchy: buildings, floors, IDFs, racks, devices, interfaces.
- Manage supernets/subnets per building; track VLANs, gateway IPs, MGMT IP's, L3 interconnects, loopbacks.
- Assign IPs to device interfaces with guardrails (uniqueness, reserved ranges).
- Keep workflows fast, simple, and visual; support split/merge and quick rework.
- Save, import/export, and share plans without remote storage.
- Remain a static site (no backend dependency), with optional portable project files.

## Non‑Goals

- Real‑time multi‑user collaboration or hosted storage.
- Device discovery, SNMP inventory, or automated enforcement on hardware.
- Full DCIM (power/thermal/weight), cable pathing, or L2 topology mapping.
- Config generation for every vendor (future possibility, not core scope now).

## Personas

- Network Engineer (primary): designs/allocates addressing for a building.
- Field Technician: views racks/devices and assigned ports/addresses on site.
- Reviewer/Stakeholder: inspects plan, leaves notes, validates allocations.

## Key User Stories

- As an engineer, I define a building supernet and split it into subnets with VLANs and gateways.
- As an engineer, I create floors → IDFs → racks, and place devices into racks.
- As an engineer, I assign specific IPs to specific device interfaces from subnets.
- As an engineer, I quickly rework: re‑split, merge, rename, reassign without losing work.
- As an engineer, I save and share my plan as a single file; I can load it later to continue.
- As a technician, I filter by building/floor/IDF/rack/device to see my port assignments.

## Scope Overview

1) Project Mode (new): a toggle that reveals project hierarchy alongside the subnet table and enables device/interface assignment workflows.
2) Hierarchy Management: CRUD for building, floors, IDFs, racks, devices, interfaces.
3) Address Planning: define supernet(s) per building, split into subnets, set VLAN, gateway, and notes.
4) Interface Assignment: allocate single IPs from a subnet pool to device interfaces with validation.
5) Persistence/Sharing: offline‑first local persistence, import/export to a portable project file, and compatibility with existing shareable URL state where feasible.
6) Fast Rework: quick split/merge, move devices, reassign addresses with strong undo/redo.

## Data Model Alignment

Adopt the conceptual schema provided in `app/database-schema.md` and `app/plannerSchema.sql` with SQLite‑friendly types at runtime. Mapping highlights:

- Building (tbl_building): name, slug, mailing_address; links to floors and supernets.
- Floor (tbl_floors): buildingID, number/name; links to IDFs.
- IDF (tbl_idf): floorID, name; links to racks.
- Rack (tbl_rack): idfID, totalU, rackType, name; links to devices.
- Device (tbl_device): rackID, deviceType, mgmtIP, name, firstRackU, rackUSize, stackMember, manufacturer, model; links to interfaces.
- Interface (tbl_interface): deviceID, name, type, subnetID, ipAddress, description.
- Supernet (tbl_supernet): network (CIDR), building_id; links to subnets.
- Subnet (tbl_subnet): supernetID, network (CIDR), name, vlanID, gatewayIP, avail_hosts.

SQLite types: represent `CIDR`/`INET` as TEXT with application‑level validation and IP math in JS; use INTEGER keys. Maintain foreign keys in JSON/Local DB representation.

## Functional Requirements

Hierarchy & Project
- Create/open/save a Building.
- CRUD: buildings, floors, IDFs, racks, devices, interfaces with simple forms.
- Rack placement: `firstRackU`, `rackUSize`; optional stack membership flag.
- Device templates: optional presets by vendor/model to pre‑seed interfaces.

Subnet Management
- Define one supernet per building.
- Split/merge subnets visually with the existing calculator paradigms.
- Set per‑subnet metadata: name, VLAN ID, gateway IP, notes/color tags.
- Respect reserved addresses per mode (Standard, AWS, Azure, OCI, per README):
  - Standard: /32 min; reserve network + 0 and broadcast.
  - AWS: /28 min; reserve 5 addresses (network, router, DNS, future, broadcast).
  - Azure: /29 min; reserve 5 addresses (network, gw, dns/dns, broadcast).
  - OCI: /30 min; reserve 3 addresses (network, gw at +1, broadcast).
- Validate `avail_hosts` on subnet updates; enforce minimum sizes by mode.

IP Assignment
- Assign IP from a subnet pool to a specific interface; track uniqueness and status:
  - Available, Reserved (by rule), Allocated (to interface), Gateway, Management.
- Suggest next available IP; allow manual override with validation.
- Show consumed/remaining capacity per subnet; list allocated IPs with links back to devices/interfaces.
- Support management IP on device and interface IPs independently.

Search/Filter/Navigation
- Filter by building/floor/IDF/rack/device/subnet/VLAN.
- Global search by device name, interface name, IP, VLAN, notes.
- Quick link from subnet rows to the interfaces consuming addresses.

Editing & Rework
- Undo/redo for destructive operations (split/merge, delete, move, reassign).
- Bulk assignment tools: sequential port assignment, apply VLAN to selection, reserve ranges.
- Safe rework: when a subnet is split/merged, reconcile existing allocations (warn and assist migration; keep orphaned IP assignments highlighted until resolved).

Validation
- Uniqueness: IP must be unique within a project; VLAN conflicts flagged per L2 domain (simplified: per building or per configured scope).
- follow router<>L3 /30 <> Distro(all SVI's)<>>L2<>>Access layer
- Gateway within subnet, always first available IP, and not within reserved blocks (except designated gateway rule per mode).
- Mode‑specific subnet size constraints enforced.

Notes/Annotations
- Notes, color tags at subnet, device, interface levels; preserved in export.

Import/Export & Persistence
- Export/Import a single “Project File” (.vscproj suggested) containing JSON metadata for hierarchy, subnets, and assignments; backwards compatible URL state for basic subnet maps where possible.
- Optional: export/import SQLite DB (or SQLite‑WASM file) mirroring the schema for portability with other tools.
- Local persistence: autosave to browser storage (IndexedDB/localStorage) with manual export; no remote storage by default (aligns to “Users control the data”).
- Versioning: include `projectVersion`, `configVersion`, and migration path.

Accessibility & Internationalization
- Maintain ARIA roles and accessible labels per existing UI patterns and tests.
- Keep visible text configurable and translatable in future (defer actual i18n).

## UX & IA

High‑level IA
- Project Mode Toggle: switch between “Calculator Only” and “Project Planner”. Default remains simple calculator for first‑time users.
- Left Panel: Project Explorer tree (Building → Floor → IDF → Rack → Device → Interface). Inline add/edit actions.
- Right Main Area: Tabs
  - Subnets: current subnet table (enhanced with per‑building context and VLAN/gateway columns).
  - Devices: table grouped by rack with device details and management IPs.
  - Interfaces: assign IPs view — filter by subnet/VLAN; bulk actions; per‑row assignment status.
  - Racks: visual rack layout (simplified U‑positions), link to device details.

Key Interactions
- From a subnet row, “Assign IPs” opens filtered Interfaces view for that subnet.
- From a device, “Add Interface(s)” with type presets (e.g., Gi, Te, Mgmt) and count.
- Drag‑drop devices between racks (optional v1.1) or via “Move to rack” action.
- Inline validation messages; non‑blocking warnings with quick fixes.

Keep It Simple
- Minimal required fields; sensible defaults; progressive disclosure for advanced options.
- Keyboard shortcuts for common actions (split, assign next IP, save, undo/redo).

## Persistence & Sharing Design

Default (Static Site, Offline‑First)
- Continue using static `dist/` with JS and IndexedDB/localStorage for autosave.
- Export/Import JSON‑based Project File; incorporate compression (lz‑string) similar to shareable URLs.

Optional SQLite Path
- Provide export/import of a SQLite DB file (via SQLite‑WASM in browser) that follows the schema in `app/plannerSchema.sql`, with type mapping:
  - `CIDR`, `INET` → TEXT (app‑validated); IDs → INTEGER; booleans as INTEGER(0/1).
- This is optional and must not be a runtime hard dependency.

Versioning & Compatibility
- Add `projectVersion` with semantic increments; include a migration layer in `dist/js/main.js` to read older JSON.
- Keep existing URL‑share format working for “Calculator Only” mode; Project‑specific state stored in file/IndexedDB.

## Performance & Limits

- Target support: up to 1,000 interfaces, 100 devices, 50 racks per project with responsive UI.
- Avoid full re‑renders; update DOM incrementally where feasible.
- Defer heavy calculations (e.g., large split previews) behind user action.

## Security & Privacy

- No remote storage or telemetry by default; users export/import files.
- Clearly indicate when data is in browser storage; provide “Clear Local Data”.
- Validate and sanitize imported content; reject invalid IP/CIDR and malformed foreign keys.

## Testing & QA

- Extend Playwright tests in `src/tests/`:
  - Project Mode toggling and basic CRUD for hierarchy entities.
  - Subnet split/merge with reserved‑address rules across modes.
  - IP assignment to interfaces; uniqueness and gateway validation.
  - Import/export round‑trip fidelity (JSON); optional SQLite round‑trip behind a flag.
  - Accessibility checks: roles/labels for new UI controls.

## Risks & Mitigations

- Complexity creep vs. simplicity: gate features behind Project Mode; preserve Calculator‑only workflows.
- Data model drift: anchor to `database-schema.md`; validate on import; include migrations.
- Browser storage limits: encourage file exports; keep JSON compact; compress when practical.
- IP math correctness: centralize IP/CIDR utilities and unit test them.

## Milestones & Acceptance Criteria

M0: Foundations (Design/Schema)
- Data model finalized; type mapping for SQLite/JSON documented.
- AC: Schema aligns with `database-schema.md`; utilities for IP validation ready.

M1: Project Mode & Hierarchy CRUD
- Project Mode toggle; Project Explorer with Building/Floor/IDF/Rack/Device/Interface CRUD.
- AC: Create a building with hierarchy; persist locally; reload works.

M2: Subnets with VLAN/Gateway
- Supernet and subnet management per building; VLAN/gateway fields; mode‑specific constraints.
- AC: Split/merge works; reserved addresses enforced; capacity counters correct.

M3: Interface IP Assignment
- Interface table with assignment workflows; uniqueness/gateway validation; suggestions.
- AC: Assign IPs across multiple devices; search/filter functional.

M4: Save/Import/Export
- JSON project export/import; versioning and migration; autosave option.
- AC: Round‑trip fidelity for a non‑trivial project; backward compatibility for Calculator‑only URLs.

M5: Racks & UX Polish
- Rack view with U positions; device movement; bulk actions; undo/redo.
- AC: Visual rack layout renders; undo/redo covers split/merge/assign/move.

M6: Test Coverage & Docs
- Playwright coverage for new flows; README/Help updates; example project file.
- AC: Tests pass locally; sample plan demonstrably loads and navigates.

## Open Questions

- VLAN scope: per building vs. per floor/IDF domain — what collisions are acceptable?
  -ANSWER: Per building.  
- Do we need L2/L3 domain modeling beyond VLAN ID (e.g., VRFs)?
  -ANSWER: Yes. 
- Minimum viable rack visualization (textual table vs. graphical U‑layout) for v1?
  -ANSWER: Lets move visualization to future. 
- Device templates: curated library or user‑defined only?
  -ANSWER: curated library. Very basic options for Firewall, Router, Switch(es), UPS's, PDU's
- Should management IPs be pulled from dedicated mgmt subnets by default?
  -ANSWER: yes. allow engineer to pick subnet for mgmt. 
- What’s the maximum target scale we need to guarantee in older browsers?
  -ANSWER: This will be for one building only with 10 floors max.

## Appendix

Type Mapping (SQLite)
- CIDR/INET → TEXT (validated by app; canonicalized as string), with helpers to compute broadcast, first/last usable, contains(), nextAvailable(), reserved() by mode.
- BOOLEAN → INTEGER(0/1), enforced by UI and import validation.

Example JSON Outline (Project File)
```
{
  "projectVersion": "1.0.0",
  "buildings": [ { "id": 1000, "name": "HQ", ... } ],
  "floors": [ { "id": 1100, "buildingId": 1000, ... } ],
  "idfs": [ { "id": 1200, "floorId": 1100, ... } ],
  "racks": [ { "id": 1300, "idfId": 1200, ... } ],
  "devices": [ { "id": 1400, "rackId": 1300, "mgmtIP": "10.0.0.10", ... } ],
  "interfaces": [ { "id": 1500, "deviceId": 1400, "name": "Gi1/0/1", "subnetId": 2001, "ipAddress": "10.0.1.11" } ],
  "supernets": [ { "id": 1900, "buildingId": 1000, "network": "10.0.0.0/16" } ],
  "subnets": [ { "id": 2001, "supernetId": 1900, "network": "10.0.1.0/24", "vlanId": 101, "gatewayIP": "10.0.1.1" } ],
  "notes": { "subnet:2001": "Staff LAN" }
}
```

File Formats
- `.vscproj` (JSON, compressed optional) for primary exchange.
- Optional `.sqlite` export for interoperability with the provided schema.

Future Enhancements (Post‑v1)
- Config snippets by vendor for interface IP assignments.
- Cable terminations and patch panel mapping.
- Multi‑building roll‑up dashboards and capacity planning.
- Bulk import of device inventory from CSV.

