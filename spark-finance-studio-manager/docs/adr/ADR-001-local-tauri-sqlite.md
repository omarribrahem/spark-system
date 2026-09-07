# ADR-001: Selection of Tauri v2 + SQLite with Dual-Driver Repository Pattern

```yaml
artifact_type: project-specific-decision
status: accepted
date: 2026-09-06
supersedes: []
```

---

## 1. Context & Business Drivers

Spark requires a dedicated business management tool for Safaa to oversee marketing contracts, website milestones, studio bookings, package quotas (hours and reels), split payments, and company expenses. 

### Key Decision Drivers:
- **DRV-01: Offline-First Mandate**: The application must function reliably with 100% feature availability without an active internet connection.
- **DRV-02: Zero Cloud Costs & Administrative Overhead**: Eliminating recurring server hosting, database subscriptions (e.g., Supabase, Neon), and cloud maintenance.
- **DRV-03: Relational & Financial Integrity**: Strict ACID transactions, foreign key cascades, and complex multi-table joins are required to support multi-target split payments and studio conflict prevention.
- **DRV-04: Test Velocity & CI Compatibility**: Automated test suites (Vitest) must run instantly in headless CI environments without requiring a native Rust toolchain or compiled desktop binary on every test execution.

---

## 2. Options Considered

### Option A: Web / SaaS Application (React + Supabase / PostgreSQL)
- **Description**: Centralized cloud database hosted on Supabase with a web frontend.
- **Pros**: Accessible from any web browser; simple multi-device access.
- **Cons & Risks**:
  - **Direct Violation of DRV-01**: Completely inoperable during internet outages or studio connection drops.
  - Recurring monthly hosting and database bills.
  - Exposure of internal company financial ledgers to public internet attack surfaces.
- **Verdict**: **Rejected**.

### Option B: Electron Desktop App (Electron + better-sqlite3)
- **Description**: Desktop wrapper bundling Chromium and Node.js with native C++ SQLite bindings.
- **Pros**: Mature ecosystem; direct access to Node.js APIs.
- **Cons & Risks**:
  - Extremely heavy memory footprint (~180MB to 300MB RAM at idle).
  - Bloated installer size (>120MB).
  - Slower cold startup times (>3 seconds on standard office PCs).
  - Complex native compilation dependencies (`node-gyp`) causing frequent developer setup friction on Windows.
- **Verdict**: **Rejected**.

### Option C: Browser PWA with IndexedDB / Dexie.js
- **Description**: Client-side single-page application persisting to browser IndexedDB.
- **Pros**: Zero installation; cross-platform.
- **Cons & Risks**:
  - **Severe Violation of DRV-03**: IndexedDB is a NoSQL object store lacking true relational foreign key enforcement, ACID rollback transactions across multiple tables, and rich SQL joins.
  - Browser storage eviction policies risk accidental data wiping by the operating system or browser cache cleaners.
  - Unsuitable for atomic backup archives and file attachment copying.
- **Verdict**: **Rejected**.

### Option D: Tauri v2 Desktop Monolith + SQLite with Dual-Driver Repository Pattern (Selected)
- **Description**: Lightweight Windows desktop application powered by Tauri v2 (Rust desktop host + OS-native WebView2) and embedded SQLite, paired with an abstract `IDatabaseDriver` interface supporting both native `@tauri-apps/plugin-sql` and headless WebAssembly `sql.js`.
- **Pros**:
  - Extremely lightweight memory footprint (~35MB RAM).
  - Compact installer (<15MB).
  - Instant cold startup (<1.5s).
  - Robust SQLite relational engine with WAL mode and foreign key enforcement.
  - Direct access to Windows filesystem and Windows Credential Manager via Rust.
  - Dual-driver abstraction enables instant in-memory Vitest testing via `sql.js` without Rust compilation.
- **Verdict**: **Accepted**.

---

## 3. Decision & Technical Rationale

We decide to build **Spark Finance & Studio Manager** as an **Offline-First Desktop Monolith** using **Tauri v2** and **SQLite**, structured with the **Dual-Driver Repository Pattern**:

```typescript
export interface IDatabaseDriver {
  execute(sql: string, params?: unknown[]): Promise<QueryResult>;
  query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]>;
  transaction<T>(fn: (tx: IDatabaseDriver) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}
```

1. **Production Runtime (`TauriSqlDriver`)**: In production, the React frontend delegates database operations to Tauri's official SQL plugin (`@tauri-apps/plugin-sql`), communicating with an embedded SQLite database (`spark.db`) residing in `%APPDATA%/SparkManager/`.
2. **Automated Testing & Web Preview Runtime (`WasmSqlDriver`)**: In automated test suites (Vitest) and rapid UI development, the repositories consume an in-memory SQLite engine powered by `sql.js` (SQLite compiled to WebAssembly). This executes the exact same SQL migration scripts, schema constraints, triggers, and transactions with zero platform dependency.

---

## 4. Consequences & Trade-offs

### 4.1 Positive Consequences (Benefits)
- **Absolute Offline Guarantee**: The app never fails due to network dropouts.
- **Peak Performance**: Local SQLite queries resolve in `< 5ms`, delivering instantaneous UI rendering.
- **Flawless Financial Integrity**: Integer piasters and SQLite ACID transactions eliminate data corruption.
- **Rapid Test Feedback**: Vitest runs hundreds of repository and calculator tests in `< 2 seconds` using the WASM driver.
- **Zero Ongoing Infrastructure Cost**: No cloud servers, no bandwidth costs, no subscription fees.

### 4.2 Negative Consequences & Costs
- **Single Machine Constraint**: Operations are anchored to Safaa's Windows desktop (mitigated by automated backup snapshots and the opt-in Google Drive mirror).
- **Driver Abstraction Overhead**: Developers must maintain SQL queries that remain compatible across both native SQLite and `sql.js` (standard SQLite dialect without engine-specific extensions).
- **Windows Packaging Requirement**: Release distribution requires building Windows `.msi` and `.exe` bundles via Tauri CLI.

### 4.3 Residual Risks & Mitigations
- **Risk**: SQLite file corruption due to sudden power cutoff during writes.
  - **Mitigation**: Database is configured with `PRAGMA journal_mode = WAL;` and `PRAGMA synchronous = NORMAL;`, which guarantees database consistency even across sudden power failures.
- **Risk**: Divergence between WASM `sql.js` and native Tauri SQLite behavior.
  - **Mitigation**: Both engines run official SQLite 3 core code; integration tests verify identical schema migration execution and trigger behavior.
