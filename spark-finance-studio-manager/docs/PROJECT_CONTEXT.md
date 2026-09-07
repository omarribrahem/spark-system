# Project Context: Spark Finance & Studio Manager

```yaml
artifact_type: project-specific-decision
status: approved
confidence: high
classification: medium-system
as_of: 2026-09-06
```

---

## 1. Objective & Users

### 1.1 Business Problem & Context
**Spark** is a creative agency and media production studio based in Egypt that provides integrated services including:
1. Monthly retainers for marketing, social media management, and advertising.
2. Recurring subscriptions for software/platforms (e.g., 3arrab).
3. Custom website design and development milestones.
4. Professional studio rental by hours, reels production, and bundled packages (e.g., Creator Package: 10 studio hours + 3 reels).

Historically, Spark relied on ad-hoc spreadsheets, paper notes, and informal messaging to manage these operations. This caused severe operational friction:
- **Financial vs. Service Balance Conflation**: An urgent operational question like *"Did the client pay?"* was frequently mixed up with *"How many hours or reels does the client have remaining?"*. Paying in full does not immediately consume studio time, and consuming studio time does not mean the invoice was settled.
- **Payment Distribution Ambiguity**: Clients often transfer lump sums (via Cash or Vodafone Cash/InstaPay) intended to cover multiple services simultaneously (e.g., 6,000 EGP for marketing, 2,500 EGP for studio rental, 1,500 EGP for extra reels). Spreadsheets failed to track granular allocations, resulting in disputes and unrecorded client credit.
- **Studio Overlaps & Duration Discrepancies**: Studio sessions were frequently double-booked or planned for 2 hours but actually lasted 2.5 or 3 hours, causing untracked over-consumption and scheduling conflicts.
- **Data Loss & Fragility**: Spreadsheets lacked transactional integrity, automated backups, receipt attachments, or audit trails, leaving the business vulnerable to accidental deletions and hardware failure.

### 1.2 Primary Persona: Safaa (Operations & Finance Manager)
- **Role**: Sole operational coordinator managing daily studio schedules, client onboarding, payment logging, dues tracking, and expense recording.
- **Core Daily Questions**:
  > "مين دفع؟ دفع كام؟ مقابل إيه؟ فاضله كام فلوس؟ فاضله كام ساعة أو Reel؟ عنده حجز إمتى؟ وإيه اللي محتاج متابعة النهاردة؟"
- **Key Jobs-to-be-Done (JTBD)**:
  1. **Morning Briefing**: Open the app and instantly see today's studio timeline, overdue invoices, and items requiring immediate action.
  2. **Fast Scheduling**: Book single or recurring studio slots with instant overlap validation and automatic hour deduction from client packages.
  3. **Split Payment Entry**: Record a payment and cleanly allocate it across marketing dues, website milestones, and package purchases in seconds.
  4. **Client 360 Verification**: Open any client profile and immediately understand their financial standing and remaining service entitlements.
  5. **Data Protection**: Run daily operations offline with zero cloud friction, knowing that local data is atomically backed up and optionally mirrored to Google Drive.

### 1.3 Expected Business Outcomes
- 100% elimination of double-booked studio sessions via automated conflict prevention.
- Zero floating-point rounding errors across all financial transactions and balances.
- Clear, real-time separation between client monetary debt and studio/reel service balances.
- Full offline operational capability on Windows desktop with sub-second response times.
- Safe local backup with 30-day automated retention and non-blocking cloud mirror.

### 1.4 Strict Non-Goals (Out of Scope for MVP)
To maintain velocity and prevent architectural over-engineering, the following are explicitly out of scope:
- **No Cloud Database / SaaS Architecture**: No remote servers, No Supabase, No Firebase, No central Node.js API.
- **No Multi-User Concurrent Access**: Single desktop application designed for Safaa on her Windows workstation.
- **No User Authentication / RBAC**: No login screen, passwords, or permission tiers.
- **No Double-Entry General Ledger (ERP)**: No chart of accounts, tax depreciation, or GAAP balance sheets. The system tracks operational cash flow and client debt.
- **No Automated External Messaging**: No WhatsApp API, SMS gateways, or automated email dispatch.
- **No Public Client Portal**: No online self-booking links or customer-facing web logins.
- **No Bank Gateway Integrations**: No direct Stripe/Paymob/Fawry payment gateway hooks; manual entry of Cash and Vodafone Cash/InstaPay transfers.

---

## 2. Inputs & Evidence

| Artifact / Document | Authority / Source | Version / Date | Role in System Architecture |
|---------------------|--------------------|----------------|-----------------------------|
| **Product Requirements Document (PRD)** | Spark Operations / PRD v1.0 | 2026-09-06 | Authoritative product baseline, domain rules (BR-001 to BR-030), user flows A-H, edge cases EC-001 to EC-025, and acceptance tests §61. |
| **Agent Implementation Plan (AR)** | Architecture Team | 2026-09-06 | 11-phase execution plan (Phase 0 to Phase 10) detailing stop gates and deliverables. |
| **Architecture OS Framework** | `d:/Project/Template/architecture-os` | 2026-09-06 | Governance standards, decision models, constitutions (Security, Data, UX, Reliability), and ADR specifications. |
| **Original User Request** | User Mandate (`ORIGINAL_REQUEST.md`) | 2026-09-06 | High-level business invariants, target directory, integrity constraints, and acceptance criteria. |
| **Spec Miner Survey Reports** | Spec Miners 1 & 2 (`.agents/spec_miner_...`) | 2026-09-06 | Comprehensive technical analysis, entity lifecycle graphs, calculation engine formulations, and edge case catalog. |

---

## 3. System Characteristics

- **Runtime & Deployment**: Windows Desktop Application (.exe / .msi) powered by Tauri v2 (Rust desktop host + embedded WebView2).
- **Data Persistence**: Local embedded SQLite database configured with Write-Ahead Logging (`PRAGMA journal_mode = WAL;`) and enforced foreign keys (`PRAGMA foreign_keys = ON;`).
- **Offline Mandate**: 100% functional without an active internet connection. Zero runtime cloud dependencies for core workflows.
- **Financial Unit of Record**: Egyptian Pounds (EGP), stored strictly as **integer piasters** (1 EGP = 100 piasters). Zero floating-point arithmetic.
- **Time Unit of Record**: Studio durations stored strictly as **integer minutes** (1 hour = 60 minutes, 1.5 hours = 90 minutes). Reel deliverables stored as **integer units**.
- **User Interface & Localization**: Native Arabic Right-to-Left (`dir="rtl"`), Cairo typography, Spark Orange branding (`#F97316`), and strict bidirectional isolation (`<bdi>`) for numbers, currencies, dates, and phone numbers.
- **File Attachments**: Local file system storage under `%APPDATA%/SparkManager/attachments/` referenced by relative paths and SHA-256 hashes in SQLite.
- **Backup & Recovery**: Atomic archive generation (`.zip` containing `spark.db`, `attachments/`, `settings.json`, and `manifest.json`), automated daily trigger with 30-day retention, pre-restore safety snapshot, and optional non-blocking Google Drive mirror via Windows Credential Manager.

---

## 4. Constraints & Capabilities

### 4.1 Technical Constraints
- **Platform Target**: Windows 10/11 (x64) desktop workstations.
- **Host Architecture**: Tauri v2 providing low memory overhead (~35MB RAM vs ~200MB+ for Electron), fast native startup (<1.5s), and secure Rust backend.
- **Database Engine**: Embedded SQLite 3 with ACID transactions. No external DBMS installation or background Windows service required.
- **Client Technology**: React 18/19, TypeScript, Tailwind CSS, Vite bundler.
- **Automated Testing Environment**: Headless execution in Vitest using `sql.js` (WebAssembly SQLite) to mirror exact SQLite production schema and constraints without requiring a native Tauri runtime during CI.

### 4.2 Business & Operational Constraints
- Single primary operator (Safaa) operating during standard Egyptian business hours.
- Highly intuitive UI requiring zero training or accounting background.
- Tolerance for overdue payments: overdue marketing or website dues must alert the operator but **never** automatically shut down services or cancel contracts.

---

## 5. Known, Unknown, Assumed Matrix

| ID | Category | Item Description | Status | Evidence / Impact | Owner |
|---|---|---|---|---|---|
| **KN-01** | Known | Financial storage must be integer piasters (1 EGP = 100 piasters) | Confirmed | PRD §56; prevents floating-point rounding errors. | Dev / Architecture |
| **KN-02** | Known | Studio duration must be integer minutes | Confirmed | PRD §55; handles 0.5h, 1.5h, 4.5h cleanly without decimal drift. | Dev / Architecture |
| **KN-03** | Known | Package C combines hours and reels in one purchase | Confirmed | PRD §13.1, §61 Test 1; hours and reels deplete independently. | Dev / Architecture |
| **KN-04** | Known | Overlap detection must hard-block overlapping studio sessions | Confirmed | PRD §14.13, §61 Test 8; $S_{\text{new}} < E_{\text{exist}} \land E_{\text{new}} > S_{\text{exist}}$. | Dev / Architecture |
| **KN-05** | Known | No hard deletes for payments or clients; voiding requires reason | Confirmed | PRD §40, §41; mandatory audit trail in `activity_log`. | Dev / Architecture |
| **AS-01** | Assumed | Google Drive backup is opt-in and non-blocking | Assumed | User request; offline functionality takes precedence. App works 100% offline if user never links Drive. | Dev / Architecture |
| **AS-02** | Assumed | Single studio physical room | Assumed | Spark currently operates one primary recording studio space; overlap applies globally across the room. | Operations / Safaa |
| **AS-03** | Assumed | Local retention policy is 30 daily backup archives | Assumed | PRD §39.2; automated cleanup of backups older than 30 days to protect disk storage. | Dev / Architecture |
| **UN-01** | Unknown | Exact Google Workspace OAuth Client ID/Secret provisioning | Open | Requires Spark Admin to provide OAuth credentials in Settings screen or use pre-configured desktop client credentials. System functions completely without it. | Spark Management |

---

## 6. Architecture OS Classification Summary

### 6.1 Heuristic Scorecard
Architecture OS evaluates systems across 8 standard dimensions (0 to 3 scale):

| Dimension | Score | Evidence & Rationale |
|-----------|:-----:|----------------------|
| **Domain Complexity** | **2 / 3** | Highly specific domain rules: decoupled financial and service balances, multi-target split payments, unallocated client credits, package snapshot pricing, recurring calendar rule generators, and planned vs. actual duration reconciliations. |
| **Actors & Tenancy** | **1 / 3** | Single tenant, single local operator (Safaa), no concurrent multi-user editing, no role-based permission hierarchy in MVP. |
| **Data & Consistency** | **3 / 3** | Highest level of local consistency: ACID transactions, foreign key enforcement, integer arithmetic for currency and time, immutable financial snapshots, zero hard deletes, atomic backups with SHA-256 integrity, and pre-restore safeguards. |
| **Integration & Async** | **1 / 3** | Simple async boundary: non-blocking Google Drive mirror via OAuth and OS Keychain; local file attachment copying. No external Webhooks, message buses, or live streaming APIs. |
| **Operations & Availability** | **1 / 3** | Single desktop installation on Windows. High local availability required, but zero cloud DevOps, load balancing, Kubernetes, or multi-region failover. |
| **Security & Regulation** | **2 / 3** | Local financial records, client personal contact details, secure storage of OAuth refresh tokens in Windows Credential Manager via Rust `keyring`. |
| **UX & Client Diversity** | **2 / 3** | High-craft Arabic RTL interface (`dir="rtl"`), Cairo typography, strict `<bdi>` bidirectional text isolation, customized timeline views, and 4 mandatory component states (loading, skeleton, empty, error). |
| **Team & Change Topology** | **0 / 3** | Greenfield project, unified codebase, rapid single-team delivery. |

### 6.2 Classification Rationale: **Medium System**
The project is officially classified as an **Architecture OS Medium System**.
- **Why Medium**: The rigorous data consistency requirements (integer piasters, multi-target payment splitting, ACID rollbacks, atomic backups, foreign keys) and domain logic complexity (decoupled service/financial balances, schedule conflict blocking, recurring rule generation) far exceed what is permissible in a "Small System".
- **Adjacent Rejection: Small System**: Rejected because a Small System classification would justify naive key-value stores (e.g., LocalStorage/IndexedDB) or loose schemas without foreign keys, which would cause catastrophic data corruption in financial ledgers and studio bookings.
- **Adjacent Rejection: Large / Highly Complex System**: Rejected because the application has zero distributed nodes, no microservices, no multi-tenant database partitions, and no concurrent distributed consensus requirements.

---

## 7. Compliance Sign-off

- **Architecture Lead**: Worker M0 (Architecture OS Specialist)
- **Specification Date**: 2026-09-06
- **Readiness Gate**: Phase 0 Governance Approved. Proceed to architectural blueprint and schema definition.
