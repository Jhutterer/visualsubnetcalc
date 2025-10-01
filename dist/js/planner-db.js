(function () {
  const TARGET_VERSION = 3;
  const MIGRATIONS = {
    1: `-- Migration v1 intentionally empty (reserved for future building planner)
        -- Original hierarchical tables (tbl_building, tbl_floors, etc.) removed
        -- as they were never used by the application. See PRD v4 M1.5.
        SELECT 1;`,
    2: `CREATE TABLE IF NOT EXISTS planner_state (

          id INTEGER PRIMARY KEY CHECK (id = 1),

          base_network TEXT NOT NULL DEFAULT '',

          operating_mode TEXT NOT NULL DEFAULT 'Standard',

          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP

        );

        CREATE TABLE IF NOT EXISTS planner_subnet (

          id INTEGER PRIMARY KEY AUTOINCREMENT,

          parent_id INTEGER REFERENCES planner_subnet(id) ON DELETE CASCADE,

          cidr TEXT NOT NULL,

          note TEXT DEFAULT '',

          color TEXT DEFAULT '',

          ordinal INTEGER NOT NULL DEFAULT 0

        );

        CREATE INDEX IF NOT EXISTS idx_planner_subnet_parent ON planner_subnet(parent_id);`,
    3: `-- Migration v3: Extended subnet metadata
        -- Create VRF table first
        CREATE TABLE IF NOT EXISTS planner_vrf (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL UNIQUE
        );
        INSERT OR IGNORE INTO planner_vrf (id, name) VALUES (1, 'GLOBAL');
        INSERT OR IGNORE INTO planner_vrf (id, name) VALUES (2, 'MGMT');

        -- SQLite doesn't support ADD COLUMN IF NOT EXISTS
        -- This migration assumes it runs ONCE on a v2 database
        -- Re-running on a v3 database will fail (as expected)
        ALTER TABLE planner_subnet ADD COLUMN name TEXT DEFAULT '';
        ALTER TABLE planner_subnet ADD COLUMN vlan_id INTEGER;
        ALTER TABLE planner_subnet ADD COLUMN gateway_ip TEXT DEFAULT '';
        ALTER TABLE planner_subnet ADD COLUMN purpose TEXT NOT NULL DEFAULT 'LAN';
        ALTER TABLE planner_subnet ADD COLUMN vrf_id INTEGER REFERENCES planner_vrf(id) ON DELETE SET NULL;
        ALTER TABLE planner_subnet ADD COLUMN is_management INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE planner_subnet ADD COLUMN capacity_total INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE planner_subnet ADD COLUMN capacity_used INTEGER NOT NULL DEFAULT 0;

        CREATE INDEX IF NOT EXISTS idx_planner_subnet_vlan ON planner_subnet(vlan_id);`,
  };
  function ready(callback) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", callback);
    } else {
      callback();
    }
  }
  function emitPlannerDbOpened(detail = {}) {
    if (
      typeof window === "undefined" ||
      typeof window.dispatchEvent !== "function"
    ) {
      return;
    }
    try {
      window.dispatchEvent(new CustomEvent("planner-db:opened", { detail }));
    } catch (err) {
      console.warn("PlannerDb failed to dispatch opened event", err);
    }
  }
  function ensureSqliteModule() {
    if (typeof sqlite3InitModule !== "function") {
      throw new Error(
        "SQLite wasm module not loaded: sqlite3InitModule is undefined",
      );
    }
  }
  class PlannerDbManager {
    constructor() {
      this.sqlite3 = null;
      this.db = null;
      this.mode = "uninitialized";
      this.sourceLabel = "";
      this.fileHandle = null;
      this.lastSavedTimestamp = null;
      this._initPromise = null;
      this._listeners = new Set();
      this._managedPointers = [];
    }
    async init() {
      if (this._initPromise) {
        return this._initPromise;
      }
      ensureSqliteModule();
      this._initPromise = sqlite3InitModule({
        locateFile: (file) => `js/${file}`,
      }).then((sqliteModule) => {
        this.sqlite3 = sqliteModule;
        this.mode = "ready";
        this.notifyChange();
      });
      return this._initPromise;
    }
    async ensureReady() {
      await this.init();
      if (!this.sqlite3) {
        throw new Error("SQLite module failed to load");
      }
    }
    supportsFileSystemAccess() {
      return (
        typeof window !== "undefined" &&
        typeof window.showSaveFilePicker === "function" &&
        typeof window.showOpenFilePicker === "function"
      );
    }
    dispatchPlannerEvent(eventName, detail = {}) {
      if (typeof window === "undefined" || typeof window.dispatchEvent !== "function") {
        return;
      }
      try {
        window.dispatchEvent(new CustomEvent(eventName, { detail }));
      } catch (err) {
        console.warn(`PlannerDb failed to dispatch ${eventName} event`, err);
      }
    }
    releaseManagedPointers() {
      if (!this._managedPointers.length) {
        return;
      }
      const wasm = this.sqlite3?.wasm;
      if (!wasm?.dealloc) {
        this._managedPointers.length = 0;
        return;
      }
      while (this._managedPointers.length) {
        const ptr = this._managedPointers.pop();
        try {
          wasm.dealloc(ptr);
        } catch (err) {
          console.warn("PlannerDb failed to free SQLite buffer", err);
        }
      }
    }
    async persistToHandle(handle, { silent = false } = {}) {
      if (!handle) return;
      try {
        const writable = await handle.createWritable();
        const bytes = new Uint8Array(this.exportDatabaseAsArray());
        await writable.write(bytes);
        await writable.close();
        this.lastSavedTimestamp = new Date().toISOString();
        this.dispatchPlannerEvent('planner-db:saved', {
          timestamp: this.lastSavedTimestamp,
          sourceLabel: this.sourceLabel
        });
      } catch (err) {
        if (!silent) {
          throw err;
        }
        console.warn("PlannerDb failed to persist to file", err);
      }
    }
    async persistCurrentDatabase(options = {}) {
      if (!this.fileHandle) return;
      try {
        await this.persistToHandle(this.fileHandle, options);
      } catch (err) {
        console.warn("PlannerDb auto-save failed", err);
      }
    }
    async createInMemory() {
      await this.ensureReady();
      this.closeDatabase();
      this.db = new this.sqlite3.oo1.DB();
      this.mode = "memory";
      this.sourceLabel = "In-memory";
      this.fileHandle = null;
      this.afterOpen();
    }
    async createWithFilePicker() {
      if (!this.supportsFileSystemAccess()) {
        throw new Error("File System Access API is not available");
      }
      await this.ensureReady();
      const handle = await window.showSaveFilePicker({
        suggestedName: "planner.sqlite",
        types: [
          {
            description: "SQLite Database",
            accept: {
              "application/x-sqlite3": [".sqlite", ".db"],
            },
          },
        ],
      });
      this.closeDatabase();
      try {
        this.db = new this.sqlite3.oo1.DB();
        this.mode = "file-access";
        this.fileHandle = handle;
        this.sourceLabel = handle.name || "planner.sqlite";
        this.afterOpen();
        await this.persistToHandle(handle);
      } catch (err) {
        this.closeDatabase();
        this.fileHandle = null;
        throw err;
      }
    }
    async saveAs() {
      if (!this.db) {
        throw new Error("No database to save");
      }
      if (!this.supportsFileSystemAccess()) {
        throw new Error("File System Access API is not available");
      }
      const handle = await window.showSaveFilePicker({
        suggestedName: this.sourceLabel || "planner.sqlite",
        types: [
          {
            description: "SQLite Database",
            accept: {
              "application/x-sqlite3": [".sqlite", ".db"],
            },
          },
        ],
      });
      const oldHandle = this.fileHandle;
      const oldLabel = this.sourceLabel;
      this.fileHandle = handle;
      this.sourceLabel = handle.name;
      this.mode = "file-access";
      try {
        await this.persistToHandle(handle);
        this.notifyChange();
      } catch (err) {
        this.fileHandle = oldHandle;
        this.sourceLabel = oldLabel;
        throw err;
      }
    }
    async openDatabaseFromUint8Array(bytes, label = "Imported file") {
      await this.ensureReady();
      this.closeDatabase();
      const capi = this.sqlite3?.capi;
      if (!capi?.sqlite3_deserialize) {
        throw new Error("sqlite3_deserialize is not available in this build");
      }
      const wasm = this.sqlite3.wasm;
      const buffer =
        bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
      const db = new this.sqlite3.oo1.DB();
      const ptr = wasm.allocFromTypedArray(buffer);
      const freeFlag = capi.SQLITE_DESERIALIZE_FREEONCLOSE ?? 1;
      const resizeFlag = capi.SQLITE_DESERIALIZE_RESIZEABLE ?? 2;
      const flags = freeFlag | resizeFlag;
      const pSchema = wasm.allocCString("main");
      let success = false;
      try {
        const rc = capi.sqlite3_deserialize(
          db.pointer,
          pSchema,
          ptr,
          buffer.byteLength,
          buffer.byteLength,
          flags,
        );
        if (rc !== capi.SQLITE_OK) {
          throw new Error("sqlite3_deserialize failed with code " + rc);
        }
        if (!(flags & freeFlag)) {
          this._managedPointers.push(ptr);
        }
        success = true;
      } catch (err) {
        wasm.dealloc(ptr);
        throw err;
      } finally {
        wasm.dealloc(pSchema);
        if (!success) {
          try {
            db.close();
          } catch (closeErr) {
            console.warn("Error closing failed database", closeErr);
          }
        }
      }
      this.db = db;
      this.mode = "file";
      this.sourceLabel = label;
      this.afterOpen();
    }
    async openFromFile(file) {
      const buffer = await file.arrayBuffer();
      await this.openDatabaseFromUint8Array(new Uint8Array(buffer), file.name);
      this.fileHandle = null;
    }
    async openWithFilePicker() {
      if (!this.supportsFileSystemAccess()) {
        throw new Error("File System Access API is not available");
      }
      const [handle] = await window.showOpenFilePicker({
        multiple: false,
        types: [
          {
            description: "SQLite Database",
            accept: {
              "application/x-sqlite3": [".sqlite", ".db"],
            },
          },
        ],
      });
      const file = await handle.getFile();
      await this.openDatabaseFromUint8Array(
        new Uint8Array(await file.arrayBuffer()),
        handle.name || file.name || "Planner database",
      );
      this.fileHandle = handle;
      this.mode = "file-access";
      this.sourceLabel = handle.name || file.name || "Planner database";
    }
    closeDatabase() {
      if (this.db) {
        try {
          this.db.close();
        } catch (err) {
          console.warn("Error closing database", err);
        }
      }
      this.db = null;
      this.fileHandle = null;
      this.sourceLabel = "";
      this.lastSavedTimestamp = null;
      this.mode = "ready";
      this.releaseManagedPointers();
      this.dispatchPlannerEvent('planner-db:closed', {});
      this.notifyChange();
    }
    afterOpen() {
      this.enableForeignKeys();
      this.runMigrations();
      this.notifyChange();
      emitPlannerDbOpened({
        mode: this.mode,
        sourceLabel: this.sourceLabel,
        hasDatabase: this.hasDatabase?.() ?? false,
      });
    }
    enableForeignKeys() {
      if (!this.db) return;
      this.db.exec("PRAGMA foreign_keys = ON;");
    }
    runMigrations() {
      if (!this.db) return;
      let currentVersion = this.getUserVersion();
      if (currentVersion === undefined || currentVersion === null) {
        currentVersion = 0;
      }
      const migrationVersions = Object.keys(MIGRATIONS)
        .map((key) => Number(key))
        .filter((version) => Number.isFinite(version))
        .sort((a, b) => a - b);
      let migrationsApplied = false;
      for (const version of migrationVersions) {
        if (version > TARGET_VERSION) {
          break;
        }
        if (currentVersion >= version) {
          continue;
        }
        const migrationSql = MIGRATIONS[version];
        if (!migrationSql) {
          continue;
        }
        try {
          this.db.exec("BEGIN");
          this.db.exec(migrationSql);
          this.db.exec(`PRAGMA user_version = ${version};`);
          this.db.exec("COMMIT");
          currentVersion = version;
          migrationsApplied = true;
        } catch (err) {
          try {
            this.db.exec("ROLLBACK");
          } catch (rollbackErr) {
            console.warn("SQLite rollback failed", rollbackErr);
          }
          throw err;
        }
      }
      if (currentVersion > TARGET_VERSION) {
        console.warn(
          "Database user_version is newer than supported version",
          currentVersion,
        );
      }
      if (migrationsApplied) {
        void this.persistCurrentDatabase({ silent: true });
      }
    }
    async runInTransaction(worker) {
      if (!this.db) throw new Error("No database connected");
      this.db.exec("BEGIN");
      try {
        await worker();
        this.db.exec("COMMIT");
      } catch (err) {
        try {
          this.db.exec("ROLLBACK");
        } catch (rollbackErr) {
          console.warn("PlannerDb rollback failed", rollbackErr);
        }
        throw err;
      }
    }
    getUserVersion() {
      if (!this.db) return 0;
      let version = 0;
      this.db.exec({
        sql: "PRAGMA user_version;",
        rowMode: "array",
        callback: (row) => {
          version = row[0] || 0;
        },
      });
      return version;
    }
    getForeignKeyState() {
      if (!this.db) return 0;
      let enabled = 0;
      this.db.exec({
        sql: "PRAGMA foreign_keys;",
        rowMode: "array",
        callback: (row) => {
          enabled = row[0] || 0;
        },
      });
      return enabled;
    }
    listTables() {
      if (!this.db) return [];
      const tables = [];
      this.db.exec({
        sql: "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;",
        rowMode: "array",
        callback: (row) => {
          tables.push(row[0]);
        },
      });
      return tables;
    }
    selectAll(sql, params = []) {
      if (!this.db) return [];
      const rows = [];
      this.db.exec({
        sql,
        bind: params,
        rowMode: "object",
        callback: (row) => rows.push(row),
      });
      return rows;
    }
    run(sql, params = []) {
      if (!this.db) throw new Error("No database connected");
      this.db.exec({ sql, bind: params });
      this.notifyChange();
      void this.persistCurrentDatabase({ silent: true });
    }
    async insertSampleBuilding() {
      // DEPRECATED: This method referenced tbl_building which was removed in M1.5.
      // Building planner schema will be restored in PRD v5.
      // For now, this is a no-op to avoid breaking existing UI button references.
      console.warn('insertSampleBuilding() is deprecated and does nothing (M1.5 schema cleanup)');
    }
    listBuildings() {
      // DEPRECATED: This method referenced tbl_building which was removed in M1.5.
      // Building planner schema will be restored in PRD v5.
      return [];
    }
    async savePlannerSnapshot(snapshot) {
      await this.ensureReady();
      if (!this.db) throw new Error("No database connected");
      const snapshotData =
        snapshot && typeof snapshot === "object" ? snapshot : {};
      const baseNetwork =
        typeof snapshotData.baseNetwork === "string"
          ? snapshotData.baseNetwork
          : "";
      const operatingModeInput =
        typeof snapshotData.operatingMode === "string"
          ? snapshotData.operatingMode.trim()
          : "";
      const operatingMode = operatingModeInput || "Standard";
      const tree = Array.isArray(snapshotData.tree) ? snapshotData.tree : [];
      const lastInsertRowId = this.sqlite3?.capi?.sqlite3_last_insert_rowid;
      if (typeof lastInsertRowId !== "function") {
        throw new Error("sqlite3_last_insert_rowid is not available");
      }
      await this.runInTransaction(async () => {
        this.db.exec("DELETE FROM planner_state;");
        this.db.exec({
          sql: "INSERT INTO planner_state (id, base_network, operating_mode, updated_at) VALUES (1, ?, ?, CURRENT_TIMESTAMP);",
          bind: [baseNetwork, operatingMode],
        });
        this.db.exec("DELETE FROM planner_subnet;");
        const insertNode = (node, parentId, fallbackOrdinal) => {
          if (
            !node ||
            typeof node.cidr !== "string" ||
            node.cidr.length === 0
          ) {
            return;
          }
          const note = typeof node.note === "string" ? node.note : "";
          const color = typeof node.color === "string" ? node.color : "";
          const name = typeof node.name === "string" ? node.name.trim() : "";
          let vlanId = null;
          if (
            node.vlanId !== undefined &&
            node.vlanId !== null &&
            node.vlanId !== ""
          ) {
            const parsedVlan = Number(node.vlanId);
            if (Number.isFinite(parsedVlan)) {
              vlanId = Math.max(0, Math.trunc(parsedVlan));
            }
          }
          const gatewayIp =
            typeof node.gatewayIp === "string" ? node.gatewayIp.trim() : "";
          const purpose =
            typeof node.purpose === "string" && node.purpose.length
              ? node.purpose.trim().toUpperCase()
              : "LAN";
          let vrfId = null;
          if (
            node.vrfId !== undefined &&
            node.vrfId !== null &&
            node.vrfId !== ""
          ) {
            const parsedVrf = Number(node.vrfId);
            if (Number.isFinite(parsedVrf)) {
              vrfId = Math.max(0, Math.trunc(parsedVrf));
            }
          }
          const isManagement = node.isManagement ? 1 : 0;
          const capacityTotalValue = Number(node.capacityTotal);
          const capacityTotal = Number.isFinite(capacityTotalValue)
            ? Math.max(0, Math.trunc(capacityTotalValue))
            : 0;
          const capacityUsedValue = Number(node.capacityUsed);
          const capacityUsed = Number.isFinite(capacityUsedValue)
            ? Math.max(
                0,
                Math.min(capacityTotal, Math.trunc(capacityUsedValue)),
              )
            : 0;
          const preferredOrdinal = Number(node.ordinal);
          const ordinal = Number.isFinite(preferredOrdinal)
            ? preferredOrdinal
            : Number.isFinite(fallbackOrdinal)
              ? fallbackOrdinal
              : 0;
          this.db.exec({
            sql: "INSERT INTO planner_subnet (parent_id, cidr, note, color, ordinal, name, vlan_id, gateway_ip, purpose, vrf_id, is_management, capacity_total, capacity_used) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);",
            bind: [
              parentId ?? null,
              node.cidr,
              note,
              color,
              ordinal,
              name,
              vlanId,
              gatewayIp,
              purpose,
              vrfId,
              isManagement,
              capacityTotal,
              capacityUsed,
            ],
          });
          const insertedId = lastInsertRowId(this.db.pointer);
          if (Array.isArray(node.children)) {
            node.children.forEach((child, index) =>
              insertNode(child, insertedId, index),
            );
          }
        };
        tree.forEach((node, index) => insertNode(node, null, index));
      });
      await this.persistCurrentDatabase({ silent: true });
      this.notifyChange();
    }
    async loadPlannerSnapshot() {
      await this.ensureReady();
      if (!this.db) throw new Error("No database connected");
      const [stateRow] = this.selectAll(
        "SELECT id, base_network AS baseNetwork, operating_mode AS operatingMode, updated_at AS updatedAt FROM planner_state WHERE id = 1 LIMIT 1;",
      );
      const rows = this.selectAll(
        "SELECT id, parent_id AS parentId, cidr, note, color, ordinal, name, vlan_id AS vlanId, gateway_ip AS gatewayIp, purpose, vrf_id AS vrfId, is_management AS isManagement, capacity_total AS capacityTotal, capacity_used AS capacityUsed FROM planner_subnet ORDER BY id ASC;",
      );
      const nodesById = new Map();
      rows.forEach((row) => {
        const ordinalValue = Number(row.ordinal);
        let vlanId = null;
        if (
          row.vlanId !== undefined &&
          row.vlanId !== null &&
          row.vlanId !== ""
        ) {
          const parsedVlan = Number(row.vlanId);
          if (Number.isFinite(parsedVlan)) {
            vlanId = Math.max(0, Math.trunc(parsedVlan));
          }
        }
        let vrfId = null;
        if (row.vrfId !== undefined && row.vrfId !== null && row.vrfId !== "") {
          const parsedVrf = Number(row.vrfId);
          if (Number.isFinite(parsedVrf)) {
            vrfId = Math.max(0, Math.trunc(parsedVrf));
          }
        }
        const isManagement =
          row.isManagement === 1 ||
          row.isManagement === true ||
          row.isManagement === "1";
        const capacityTotalValue = Number(row.capacityTotal);
        const capacityUsedValue = Number(row.capacityUsed);
        const capacityTotal = Number.isFinite(capacityTotalValue)
          ? Math.max(0, Math.trunc(capacityTotalValue))
          : 0;
        const capacityUsed = Number.isFinite(capacityUsedValue)
          ? Math.max(0, Math.min(capacityTotal, Math.trunc(capacityUsedValue)))
          : 0;
        nodesById.set(row.id, {
          cidr: row.cidr,
          note: typeof row.note === "string" ? row.note : "",
          color: typeof row.color === "string" ? row.color : "",
          ordinal: Number.isFinite(ordinalValue) ? ordinalValue : 0,
          name: typeof row.name === "string" ? row.name.trim() : "",
          vlanId,
          gatewayIp:
            typeof row.gatewayIp === "string" ? row.gatewayIp.trim() : "",
          purpose:
            typeof row.purpose === "string" && row.purpose.length
              ? row.purpose.toUpperCase()
              : "LAN",
          vrfId,
          isManagement,
          capacityTotal,
          capacityUsed,
          children: [],
        });
      });
      const roots = [];
      rows.forEach((row) => {
        const node = nodesById.get(row.id);
        if (!node) {
          return;
        }
        if (row.parentId === null || row.parentId === undefined) {
          roots.push(node);
          return;
        }
        const parent = nodesById.get(row.parentId);
        if (parent) {
          parent.children.push(node);
        } else {
          roots.push(node);
        }
      });
      const sortNodes = (nodeList) => {
        nodeList.sort((a, b) => (a.ordinal || 0) - (b.ordinal || 0));
        nodeList.forEach((child) => sortNodes(child.children));
      };
      sortNodes(roots);
      return {
        baseNetwork: stateRow?.baseNetwork ?? "",
        operatingMode: stateRow?.operatingMode ?? "Standard",
        updatedAt: stateRow?.updatedAt ?? null,
        tree: roots,
      };
    }
    listVrfs() {
      if (!this.db) throw new Error("No database connected");
      return this.selectAll(
        "SELECT id, name FROM planner_vrf ORDER BY name ASC;",
      );
    }
    exportDatabaseAsArray() {
      if (!this.db) throw new Error("No database connected");
      if (!this.sqlite3?.capi?.sqlite3_js_db_export) {
        throw new Error("SQLite export not supported in current build");
      }
      const bytes = this.sqlite3.capi.sqlite3_js_db_export(this.db.pointer);
      return Array.from(bytes);
    }
    getDiagnostics() {
      const hasDb = !!this.db;
      return {
        hasDatabase: hasDb,
        mode: this.mode,
        sourceLabel: this.sourceLabel,
        userVersion: hasDb ? this.getUserVersion() : 0,
        foreignKeys: hasDb ? this.getForeignKeyState() : 0,
        tables: hasDb ? this.listTables() : [],
        buildingCount: 0, // tbl_building removed in M1.5
        fileHandleName: this.fileHandle?.name ?? null,
        lastSavedTimestamp: this.lastSavedTimestamp,
      };
    }
    hasDatabase() {
      return !!this.db;
    }
    onChange(listener) {
      this._listeners.add(listener);
    }
    offChange(listener) {
      this._listeners.delete(listener);
    }
    notifyChange() {
      for (const listener of this._listeners) {
        try {
          listener();
        } catch (err) {
          console.warn("PlannerDb listener error", err);
        }
      }
    }
  }
  ready(async () => {
    const statusEl = document.querySelector('[data-testid="db-status"]');
    const buildingTableBody = document.querySelector(
      "#db-buildings-table tbody",
    );
    const createBtn = document.querySelector("#db-create-btn");
    const insertBtn = document.querySelector("#db-insert-sample-btn");
    const saveBtn = document.querySelector("#db-save-btn");
    const saveAsBtn = document.querySelector("#db-save-as-btn");
    const closeBtn = document.querySelector("#db-close-btn");
    const exportBtn = document.querySelector("#db-export-btn");
    const openBtn = document.querySelector("#db-open-btn");
    const fileInput = document.querySelector("#db-file-input");
    const feedbackEl = document.querySelector("#db-feedback");
    const filenameEl = document.querySelector("#db-filename");
    const lastSavedEl = document.querySelector("#db-last-saved");
    const savingIndicatorEl = document.querySelector("#db-saving-indicator");
    const manager = new PlannerDbManager();
    window.plannerDbManager = manager;
    const formatRelativeTime = (date) => {
      const seconds = Math.floor((new Date() - date) / 1000);
      if (seconds < 60) return 'just now';
      const minutes = Math.floor(seconds / 60);
      if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
      const hours = Math.floor(minutes / 60);
      if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
      const days = Math.floor(hours / 24);
      return `${days} day${days !== 1 ? 's' : ''} ago`;
    };
    const render = () => {
      const diag = manager.getDiagnostics();
      if (diag.hasDatabase) {
        const label =
          diag.mode === "memory"
            ? "in-memory"
            : diag.fileHandleName
              ? `file: ${diag.fileHandleName}`
              : diag.sourceLabel;
        statusEl.textContent = `Connected to planner database (${label})`;
      } else {
        statusEl.textContent = "No planner database loaded";
      }
      buildingTableBody.innerHTML = "";
      if (diag.hasDatabase) {
        const buildings = manager.listBuildings();
        if (buildings.length === 0) {
          const row = document.createElement("tr");
          const cell = document.createElement("td");
          cell.colSpan = 4;
          cell.textContent = "No buildings in database";
          row.appendChild(cell);
          buildingTableBody.appendChild(row);
        } else {
          buildings.forEach((building) => {
            const row = document.createElement("tr");
            row.setAttribute("data-testid", "db-building-row");
            row.innerHTML = `<th scope="row">${building.id}</th>

              <td data-testid="db-building-name">${building.name}</td>

              <td>${building.slug}</td>

              <td>${building.mailing_address ?? ""}</td>`;
            buildingTableBody.appendChild(row);
          });
        }
      }
      // File name display
      if (filenameEl) {
        if (diag.hasDatabase && diag.sourceLabel) {
          filenameEl.textContent = `File: ${diag.sourceLabel}`;
          filenameEl.style.display = 'block';
        } else {
          filenameEl.style.display = 'none';
        }
      }
      // Timestamp display
      if (lastSavedEl) {
        if (diag.hasDatabase && diag.lastSavedTimestamp) {
          const relative = formatRelativeTime(new Date(diag.lastSavedTimestamp));
          lastSavedEl.textContent = `Last saved: ${relative}`;
          lastSavedEl.title = new Date(diag.lastSavedTimestamp).toLocaleString();
          lastSavedEl.style.display = 'block';
        } else {
          lastSavedEl.style.display = 'none';
        }
      }
      exportBtn.disabled = !diag.hasDatabase;
      insertBtn.disabled = !diag.hasDatabase;
      if (saveBtn) {
        saveBtn.disabled = !(diag.hasDatabase && manager.fileHandle);
      }
      if (saveAsBtn) {
        saveAsBtn.disabled = !diag.hasDatabase;
      }
      if (closeBtn) {
        closeBtn.disabled = !diag.hasDatabase;
      }
    };
    const showFeedback = (message, type = "info") => {
      if (!feedbackEl) return;
      feedbackEl.textContent = message;
      feedbackEl.className = "";
      feedbackEl.classList.add(
        "small",
        type === "error" ? "text-danger" : "text-muted",
      );
    };
    manager.onChange(render);
    try {
      await manager.ensureReady();
      const supportsFsa = manager.supportsFileSystemAccess();
      showFeedback(
        supportsFsa
          ? "SQLite engine ready. Use Create to store a .sqlite file locally (falls back to in-browser storage if unavailable)."
          : "SQLite engine ready. Initialize or open a planner database to continue.",
      );
    } catch (err) {
      console.error(err);
      showFeedback(
        "Failed to load SQLite engine. Check console for details.",
        "error",
      );
      return;
    }
    createBtn.addEventListener("click", async () => {
      try {
        if (manager.supportsFileSystemAccess()) {
          try {
            await manager.createWithFilePicker();
            showFeedback(
              "Created planner database file. Changes will auto-save locally.",
            );
            return;
          } catch (err) {
            console.warn(
              "PlannerDb File System Access create failed, falling back",
              err,
            );
          }
        }
        await manager.createInMemory();
        showFeedback("Created in-memory planner database (user_version 1).");
      } catch (err) {
        console.error(err);
        showFeedback("Could not create planner database.", "error");
      }
    });
    if (saveBtn) {
      saveBtn.addEventListener("click", async () => {
        try {
          if (!manager.fileHandle) {
            showFeedback(
              "Open or create a planner database file before saving.",
              "error",
            );
            return;
          }
          await manager.persistCurrentDatabase();
          const fileName =
            manager.fileHandle?.name ?? manager.sourceLabel ?? "planner.sqlite";
          showFeedback(`Planner database saved to ${fileName}.`);
        } catch (err) {
          console.error(err);
          showFeedback("Unable to save planner database.", "error");
        }
      });
    }
    if (saveAsBtn) {
      saveAsBtn.addEventListener("click", async () => {
        try {
          if (!manager.hasDatabase()) {
            showFeedback("No database to save.", "error");
            return;
          }
          await manager.saveAs();
          showFeedback(`Planner database saved as ${manager.sourceLabel}.`);
        } catch (err) {
          if (err.name === 'AbortError') {
            showFeedback("Save As cancelled.");
            return;
          }
          console.error(err);
          showFeedback("Unable to save database to new file.", "error");
        }
      });
    }
    if (closeBtn) {
      closeBtn.addEventListener("click", () => {
        if (!manager.hasDatabase()) return;
        if (!confirm('Close the current database? Any unsaved changes will be lost.')) {
          return;
        }
        try {
          manager.closeDatabase();
          showFeedback("Database closed.");
        } catch (err) {
          console.error(err);
          showFeedback("Error closing database.", "error");
        }
      });
    }
    insertBtn.addEventListener("click", async () => {
      try {
        await manager.insertSampleBuilding();
        showFeedback("Sample building synchronized into database.");
      } catch (err) {
        console.error(err);
        showFeedback("Unable to insert sample building.", "error");
      }
    });
    exportBtn.addEventListener("click", () => {
      try {
        const dataArray = manager.exportDatabaseAsArray();
        const bytes = new Uint8Array(dataArray);
        const blob = new Blob([bytes], { type: "application/octet-stream" });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = "planner.sqlite";
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);
        showFeedback("Exported planner database.");
      } catch (err) {
        console.error(err);
        showFeedback("Unable to export planner database.", "error");
      }
    });
    openBtn.addEventListener("click", async () => {
      if (manager.supportsFileSystemAccess()) {
        try {
          await manager.openWithFilePicker();
          showFeedback(
            `Loaded planner database from ${manager.fileHandle?.name ?? manager.sourceLabel}.`,
          );
          return;
        } catch (err) {
          console.error(err);
          showFeedback(
            "Unable to open planner database via File System Access.",
            "error",
          );
        }
      }
      fileInput.value = "";
      fileInput.click();
    });
    fileInput.addEventListener("change", async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      try {
        await manager.openFromFile(file);
        showFeedback(`Loaded planner database from ${file.name}.`);
      } catch (err) {
        console.error(err);
        showFeedback("Unable to load selected database.", "error");
      }
    });
    // Event listeners for save/close operations
    window.addEventListener('planner-db:saved', () => {
      render(); // Update timestamp display
      if (savingIndicatorEl) {
        savingIndicatorEl.style.display = 'none';
      }
    });
    window.addEventListener('planner-db:closed', () => {
      render(); // Reset UI to initial state
    });
    render();
  });
})();
