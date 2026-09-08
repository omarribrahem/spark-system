# Project Architecture: Spark Finance & Studio Manager

```yaml
artifact_type: project-specific-decision
status: approved
confidence: high
classification: medium-system
as_of: 2026-09-06
```

---

## 1. Context, Classification & Business Drivers

### 1.1 Context Link
This architecture blueprint builds directly upon the business context, persona definitions, and scope boundaries established in [`docs/PROJECT_CONTEXT.md`](PROJECT_CONTEXT.md).

### 1.2 System Classification: Medium System
Evaluated under the Architecture OS framework, Spark Finance & Studio Manager is classified as a **Medium System** based on high data consistency requirements (3/3), domain logic complexity (2/3), and high-craft RTL user experience (2/3), balanced by single-user operational simplicity (1/3) and an offline-first execution environment (1/3).

### 1.3 Architectural Drivers (Ranked)
1. **DRV-01: Zero-Network Offline Reliability**: The system must run 100% locally on Windows without any dependency on external servers or internet connectivity for its daily core operations.
2. **DRV-02: Strict Financial & Relational Integrity**: Financial transactions must never lose precision (integer piasters), never allow over-allocation, enforce foreign keys, support transactional rollback, and prohibit permanent hard deletes.
3. **DRV-03: Decoupled Service vs. Financial Balances**: Money paid and service entitlements (hours/reels) must exist in separate, independent state spaces.
4. **DRV-04: Hard Conflict Blocking for Studio Scheduling**: The scheduling engine must guarantee zero double-bookings of the studio room via synchronous transactional overlap detection.
5. **DRV-05: Atomic Local Backup & Safe Disaster Recovery**: Consistent database snapshots, file attachment integrity, SHA-256 checksum verification, and pre-restore safeguards against data loss.
6. **DRV-06: Ergonomic Arabic RTL Operational Speed**: Sub-second UI responsiveness, Cairo typography, `<bdi>` isolation, and high-density operational views tailored for Safaa.

---

## 2. Architectural Decisions

### 2.1 Selected Architecture: Offline-First Desktop Monolith (Tauri v2 + SQLite)
The application is structured as a **Desktop Monolith** hosted by **Tauri v2** on Windows 10/11:
- **Presentation Layer**: React 18/19, TypeScript, Tailwind CSS, Vite.
- **Domain Engine**: Pure TypeScript domain calculators and state machines isolated from UI and storage.
- **Data Layer**: Local embedded SQLite database operating in WAL (Write-Ahead Logging) mode with `PRAGMA foreign_keys = ON;`.
- **Desktop Runtime Host**: Rust backend (Tauri v2) providing native windowing, file system attachment management, Windows Credential Manager integration, and atomic backup operations.

```
┌────────────────────────────────────────────────────────────────────────┐
│                        TAURI v2 DESKTOP MONOLITH                       │
│                                                                        │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                    UI / PRESENTATION LAYER                       │  │
│  │   React 18 + Tailwind CSS + Lucide Icons + Cairo RTL Font        │  │
│  │   - App Shell (Sidebar, Top Bar, Quick Add, Global Search Ctrl+K)│  │
│  │   - Views: Dashboard, Clients, Finance, Packages, Studio, Reports│  │
│  │   - 4 Mandatory States: Loading, Skeleton, Empty, Error          │  │
│  └──────────────────────────────────┬───────────────────────────────┘  │
│                                     │ Calls                            │
│                                     ▼                                  │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                       DOMAIN LOGIC ENGINE                        │  │
│  │   Pure Mathematical Functions (Zero UI / Zero DB Dependencies)   │  │
│  │   - Piaster Payment Splitter & Over-Allocation Validator         │  │
│  │   - Unallocated Client Credit Calculator                         │  │
│  │   - Studio Overlap Conflict Detector (S_new < E_old & E_new > S) │  │
│  │   - Package Consumption & Entitlement Reconciler (Minutes/Reels) │  │
│  │   - Due Date & Overdue Status Evaluator                          │  │
│  └──────────────────────────────────┬───────────────────────────────┘  │
│                                     │ Uses                             │
│                                     ▼                                  │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                     DATA ACCESS LAYER (REPOSITORIES)             │  │
│  │   Abstract IDatabaseDriver Interface                             │  │
│  │   - ClientRepository, PaymentRepository, BookingRepository, etc. │  │
│  └───────────────┬──────────────────────────────────┬───────────────┘  │
│                  │                                  │                  │
│       Production │ Driver                Test & Web │ Driver           │
│                  ▼                                  ▼                  │
│  ┌───────────────────────────────┐  ┌───────────────────────────────┐  │
│  │        TauriSqlDriver         │  │         WasmSqlDriver         │  │
│  │  (@tauri-apps/plugin-sql)     │  │       (sql.js in WASM)        │  │
│  └───────────────┬───────────────┘  └───────────────────────────────┘  │
│                  │ IPC                                                 │
│                  ▼                                                     │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                    TAURI RUST HOST RUNTIME                       │  │
│  │   - SQLite Engine (spark.db, WAL Mode, Foreign Keys = ON)        │  │
│  │   - File Storage: %APPDATA%/SparkManager/attachments/            │  │
│  │   - Atomic Backup: VACUUM INTO + ZIP + SHA-256 Manifest          │  │
│  │   - Pre-Restore Snapshot Engine & PRAGMA integrity_check         │  │
│  │   - Windows Credential Manager Integration (via keyring crate)   │  │
│  │   - Non-blocking Google Drive Sync Background Worker             │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Rejected Alternatives & Rationales

| Alternative Considered | Rationale for Rejection |
|------------------------|-------------------------|
| **Web SaaS + Supabase / PostgreSQL** | **Rejected**: Violates DRV-01 (Offline-First). Requires recurring cloud hosting costs, internet connection for daily studio management, and exposes internal financial data to public cloud endpoints unnecessarily. |
| **Electron + SQLite (better-sqlite3)** | **Rejected**: Electron has a heavy memory footprint (~200MB+ vs ~35MB for Tauri), large installer size (>120MB vs ~15MB for Tauri), and slower cold startup times on modest desktop workstations. |
| **Browser LocalStorage / IndexedDB** | **Rejected**: Violates DRV-02 (Relational & Financial Integrity). Lacks ACID transactions, foreign key cascades, and complex SQL joins, making multi-target payment splitting and atomic backups fragile and prone to corruption. |
| **Microservices / CQRS / Event Sourcing** | **Rejected**: Grossly over-engineered for a single-operator desktop tool. Standard Transaction Script pattern on relational SQLite satisfies all business invariants with minimal complexity. |

### 2.3 Dynamic Custom Fields & Typed Filter AST Query Engine
To enable Safaa and Spark administration to define bespoke client attributes without compromising relational integrity or resorting to un-indexed JSON blobs:
1. **Normalized Relational Representation**:
   - `client_custom_field_definitions`: Schema catalog with immutable snake_case `field_key`, types, and display flags.
   - `client_custom_field_options`: Predefined options for select types.
   - `client_custom_field_values`: Normalized typed columns (`text_value`, `number_value`, `date_value`, `boolean_value`) with `(client_id, field_definition_id)` composite primary key.
   - `client_custom_field_multiselect_values`: Child junction table for multi-select options.
2. **Typed Filter AST & Query Compiler**:
   - Invariant: User search and filter conditions are compiled into an Abstract Syntax Tree (`FilterAST`) with strict allowlisted operators and fields.
   - Execution occurs exclusively within SQLite (`queryWithFilterAST`) using subqueries and `EXISTS` to avoid N+1 queries and memory bloat.
   - Safe parameter binding (`?`) ensures zero possibility of SQL injection.
   - Preset configurations (`client_filter_presets`) allow saving and restoring complex filter rule sets with graceful degradation when custom fields are deactivated.

### 2.4 The Dual-Driver Repository Pattern (`IDatabaseDriver`)
To enable frictionless automated testing and UI development without requiring a native Rust build on every test run, the data access layer abstracts the SQLite driver behind a unified interface:

```typescript
export interface QueryResult {
  rowsAffected: number;
  lastInsertId?: number;
}

export interface IDatabaseDriver {
  execute(sql: string, params?: unknown[]): Promise<QueryResult>;
  query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]>;
  transaction<T>(fn: (tx: IDatabaseDriver) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}
```

1. **`TauriSqlDriver`**: Utilizes `@tauri-apps/plugin-sql` to execute queries directly against the local `spark.db` managed by Tauri's Rust backend. Used in production and native desktop builds.
2. **`WasmSqlDriver`**: Utilizes `sql.js` (SQLite compiled to WebAssembly) to execute queries in-memory. Used in Vitest automated unit/integration suites and browser preview modes, ensuring 100% schema and query parity without native binaries.

### 2.4 Boundaries & Communication Paths
- **Frontend to Domain**: Synchronous pure function calls. Zero asynchronous overhead.
- **Frontend to Database**: Asynchronous promises via `IDatabaseDriver`. All multi-table updates are executed within explicit SQLite transactions (`BEGIN IMMEDIATE ... COMMIT`).
- **Frontend to Native Rust (Tauri IPC)**: Strongly typed IPC commands via `@tauri-apps/api/core`:
  - `save_attachment`: Copies uploaded file from arbitrary OS path to `%APPDATA%/SparkManager/attachments/` and returns relative path + SHA-256.
  - `create_backup`: Executes `VACUUM INTO`, bundles ZIP archive with manifest, and applies retention policy.
  - `restore_backup`: Executes pre-restore safeguard, verifies SHA-256 and `PRAGMA integrity_check`, and replaces live files.
  - `sync_google_drive`: Triggers background upload of latest backup archive using credentials from Windows Keychain.

---

## 3. Quality Behaviors

### 3.1 Security & Trust Model
- **Boundary**: Local single-user desktop workstation.
- **Credential Storage**: Google OAuth client tokens and refresh tokens are stored in the **Windows Credential Manager (OS Keychain)** via the Rust `keyring` crate. They are **never** stored in SQLite tables, plain-text JSON files, or web local storage.
- **Local File Isolation**: Attachments (payment receipts, expense invoices) are copied into `%APPDATA%/SparkManager/attachments/` using UUID-based filenames to prevent directory traversal and path injection.
- **IPC Whitelisting**: Tauri v2 capability configuration restricts native system access exclusively to necessary app data directories and keychain APIs.

### 3.2 Reliability & Fault Tolerance
- **Database Safety**:
  - `PRAGMA journal_mode = WAL;` (Write-Ahead Logging) enables concurrent read queries without blocking writes and protects against database corruption on power loss.
  - `PRAGMA foreign_keys = ON;` is executed on every connection to enforce relational cascades and prevent orphaned records.
  - `PRAGMA synchronous = NORMAL;` balances speed with disk crash resilience.
- **Safe Disaster Recovery**:
  - **Pre-Restore Snapshot**: The system automatically creates a complete backup of live data before executing any restore operation (`pre-restore-backup-YYYY-MM-DD-HHmmss.zip`).
  - **Integrity Validation**: Restores require `PRAGMA integrity_check;` to return `ok` and all file SHA-256 hashes to match `manifest.json` before touching production data.

### 3.3 Performance Budgets
- **Startup Time**: Cold launch to interactive dashboard in `< 1.5 seconds`.
- **Query Latency**: All operational dashboard queries (Today's bookings, needs attention, month snapshot) resolve in `< 50ms`.
- **Memory Footprint**: Working set memory `<= 70 MB RAM`.
- **Archive Time**: Local ZIP backup snapshot generation completed in `< 3 seconds`.

### 3.4 Observability & Audit Trail
- **Activity Log**: Critical business events (Payment voiding, booking cancellations, package balance manual adjustments, contract terminations) are permanently written to the `activity_log` SQLite table with timestamp, action type, entity ID, and mandatory user note.
- **System Logging**: Backup operations and background Google Drive sync attempts are logged to `%APPDATA%/SparkManager/logs/backup.log`.

### 3.5 Accessibility & UI/UX Standards
- **RTL-First Structure**: `dir="rtl"` declared on root HTML shell.
- **Typography**: Cairo typeface with explicit font weights (400, 500, 600, 700).
- **Bidirectional Isolation**: Mandatory `<bdi>` wrapping for numbers, currency symbols (`ج.م`), telephone numbers, and date/time intervals to prevent bidirectional layout distortion.
- **Interactive Targets**: Minimum button and interactive touch target size of $44 \times 44\text{ px}$.
- **Mandatory States**: Every data component implements Loading, Skeleton, Empty (with action), and Actionable Error states.

---

## 4. Code Structure Derivation

The codebase layout directly reflects the architectural layers:

```
d:/Project/Spark Internal/spark-finance-studio-manager/
├── docs/                                # Phase 0 Governance Documents
│   ├── PROJECT_CONTEXT.md               # Context, actors, classification, constraints
│   ├── ARCHITECTURE.md                  # This document
│   ├── DATA_MODEL.md                    # 22-table schema, types, indexes, triggers
│   ├── DESIGN_SYSTEM.md                 # RTL Cairo tokens, #F97316 palette, states
│   ├── TEST_STRATEGY.md                 # 4-tier test strategy & Vitest configuration
│   ├── ACCEPTANCE_TRACEABILITY.md       # PRD §61 & feature matrix mapping
│   └── adr/                             # Architectural Decision Records
│       ├── ADR-001-local-tauri-sqlite.md
│       └── ADR-002-backup-and-google-drive.md
├── src/
│   ├── app/                             # Application shell, routing, global providers
│   ├── domain/                          # Pure business logic (Zero external dependencies)
│   │   ├── calculators/                 # Pure math: allocation, overlap, package, overdue
│   │   ├── models/                      # TypeScript domain types & interfaces
│   │   └── rules/                       # Domain validation invariants & policies
│   ├── database/                        # Persistence layer
│   │   ├── driver/                      # IDatabaseDriver, TauriSqlDriver, WasmSqlDriver
│   │   ├── migrations/                  # Versioned SQL migration files
│   │   └── repositories/                # Typed domain repositories (Clients, Bookings, etc.)
│   ├── modules/                         # Feature modules
│   │   ├── clients/                     # Client management & 360 profile
│   │   ├── finance/                     # Payments, multi-split allocations, expenses
│   │   ├── contracts/                   # Marketing contracts, subscriptions, websites
│   │   ├── packages/                    # Package catalog, sold snapshots, reels pipeline
│   │   ├── studio/                      # Scheduling, Day/Week/Month calendar, conflict engine
│   │   ├── dashboard/                   # Safaa's daily command center & widgets
│   │   ├── reports/                     # Cash flow, revenue by service, utilization reports
│   │   └── backup/                      # Backup manager, restore UI, Google Drive settings
│   ├── ui/                              # Design system & shared components
│   │   ├── components/                  # Buttons, inputs, modals, cards, badges
│   │   ├── feedback/                    # Skeleton loaders, empty states, error boundaries
│   │   └── layout/                      # Sidebar, topbar, Quick Add dropdown
│   └── shared/                          # Utility functions (piaster formatters, dates, RTL)
├── src-tauri/                           # Native Rust host (Tauri v2)
│   ├── src/                             # Rust commands (backup, attachments, keyring)
│   ├── Cargo.toml                       # Rust dependencies (tauri, rusqlite, keyring, zip)
│   └── tauri.conf.json                  # Window configuration, capabilities, permissions
└── tests/                               # Automated test suites
    ├── unit/                            # Domain calculators & rule unit tests
    ├── integration/                     # Repository tests against in-memory sql.js
    └── e2e/                             # End-to-end operational user workflow tests
```

---

## 5. Applicability Matrix for Conditional Artifacts

| Conditional Artifact | Status | Trigger / Rationale | Target Location |
|----------------------|:------:|---------------------|-----------------|
| **DATA_MODEL.md** | **Required** | Durable 22-table schema with foreign keys, triggers, and strict integer constraints. | `docs/DATA_MODEL.md` |
| **DESIGN_SYSTEM.md** | **Required** | Custom Arabic RTL Cairo typography, Spark `#F97316` brand palette, and 4 mandatory states. | `docs/DESIGN_SYSTEM.md` |
| **TEST_STRATEGY.md** | **Required** | 4-tier testing pyramid, headless WASM SQLite driver, and acceptance criteria coverage. | `docs/TEST_STRATEGY.md` |
| **ADR-001 (Tauri + SQLite)** | **Required** | Core platform selection ruling out Web/SaaS and Electron. | `docs/adr/ADR-001-local-tauri-sqlite.md` |
| **ADR-002 (Backup & Drive)** | **Required** | Disaster recovery architecture, pre-restore safeguard, and keychain token storage. | `docs/adr/ADR-002-backup-and-google-drive.md` |
| **ACCEPTANCE_TRACEABILITY** | **Required** | Mandatory bidirectional traceability for PRD §61 acceptance scenarios. | `docs/ACCEPTANCE_TRACEABILITY.md` |
| **API_CONTRACT.md** | **Omitted** | Application is a self-contained local desktop monolith with no external HTTP/REST/GraphQL APIs. Internal IPC documented in §2.4. | N/A |
| **DEPLOYMENT_PLAN.md** | **Deferred** | Scheduled for Milestone M8 prior to release packaging (.msi/.exe bundler). | N/A |

---

## 6. Validation & Evolution Rules

1. **Architecture Conformance Audits**: Any proposed change to financial calculation models, data storage types, or runtime drivers requires an updated ADR and approval from the Architecture Specialist.
2. **Zero Calculations in Presentation Components**: Frontend components (`src/ui/`, `src/modules/`) must never execute raw financial math, time division, or balance deductions in JSX; all operations must delegate to `src/domain/calculators/`.
3. **Integrity Enforcement**: Every pull request / milestone commit must pass `npm run lint`, `npx tsc --noEmit`, and the 100% green Vitest automated test suite.
