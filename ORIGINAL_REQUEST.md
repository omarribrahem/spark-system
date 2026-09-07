# Original User Request

## 2026-09-06T19:32:16Z

Build Spark Finance & Studio Manager: an offline-first, Arabic-first (RTL) desktop business management application on Windows for Spark's operations (clients, marketing contracts, studio bookings, hour/reel packages, split payments, expenses, and local backup), following the product requirements in `D:\Project\Spark Internal\Spark Finance & Studio Manager — Full Product Requirements Document v1.0.md` and phases in `D:\Project\Spark Internal\AGENT_IMPLEMENTATION_PLAN_AR.md`.

Working directory: d:/Project/Spark Internal/spark-finance-studio-manager
Integrity mode: demo

## Requirements

### R1. Architecture OS Documentation & Project Bootstrap (Phase 0 & 1)
- Establish Architecture OS docs (`docs/PROJECT_CONTEXT.md`, `docs/ARCHITECTURE.md`, `docs/DATA_MODEL.md`, `docs/DESIGN_SYSTEM.md`, ADRs, test strategy).
- Scaffold desktop runtime using Tauri v2, React, TypeScript, Tailwind CSS, and local SQLite with migrations and foreign keys enabled.
- App shell with RTL layout (`dir="rtl"`), sidebar, header with search & Quick Add, and custom theme tokens based on Spark branding.

### R2. Domain Logic & Financial/Service Balance Engine (Phase 2)
- Explicit separation between Financial Balance (EGP stored strictly as integer piasters) and Service Balance (time stored strictly as integer minutes, reels as integer counts).
- Pure domain calculators and unit tests for: payment allocations without over-allocation, unallocated credit, package consumption, overlap detection for studio bookings, and due/overdue calculation.
- Support multi-target payment splitting (one payment distributed across multiple contracts/services) and voiding payments with mandatory reason logging.

### R3. Core Modules Implementation (Phases 3 to 7)
- **Clients**: Centralized client profile aggregating all contracts, subscriptions, packages, upcoming bookings, and transaction history.
- **Marketing, Subscriptions & Websites**: Recurring monthly dues, flexible website milestones, overdue states without auto-cancelling contracts, historical price preservation.
- **Packages & Reels**: Sold package templates/snapshots (hours, reels, mixed), tracking planned vs. actual consumed usage, reel lifecycle and optional booking linkage.
- **Studio Booking & Scheduling**: Day/Week/Month calendar views (default week), single and recurring booking rules, hard blocking overlap detection, planned vs actual duration resolution, booking cancellation with credit restoration.
- **Expenses & Receipts**: Categorized expense tracking and receipt attachment copying to the app data directory with relative paths.

### R4. Operations Dashboard, Reporting & Global Search (Phase 8)
- Operational daily dashboard for Safaa: today's bookings, payments due/overdue, timeline, action items ("needs attention"), and month snapshot.
- Reporting suite: monthly cash flow summary, revenue by service based on allocations, outstanding balances, package remaining balances, studio utilization, and client statements.
- Global instant search across clients, contracts, and bookings.

### R5. Data Safety, Local Backup & Optional Google Drive Mirror (Phase 9)
- Atomic local backup snapshots (SQLite database + attachments + settings) with SHA-256 integrity verification, manual "Backup Now", automated daily on app launch, and 30-day retention.
- Safe restore mechanism that creates a pre-restore backup before atomic replacement.
- Opt-in, non-blocking Google Drive backup mirror with isolated OAuth desktop credentials stored securely in OS keychain.

## Acceptance Criteria

### Financial & Data Integrity
- [ ] Financial amounts are strictly stored as integer piasters; no floating point rounding errors in calculations or balances.
- [ ] Over-allocation is prevented at the database/transaction level; surplus payment amounts automatically convert to client credit.
- [ ] Service usage (minutes/reels) and financial balances operate independently (e.g. Package C scenario: 10h + 3 reels remains strictly consistent after consuming 4.5h and 1 reel).
- [ ] Historical prices and sold package item snapshots are immutable even if service definitions change.
- [ ] No hard deletes for financial transactions or client records (void/archive status with activity log).

### Scheduling & Operations
- [ ] Studio booking prevents conflicting/overlapping reservations with a blocking validation error.
- [ ] Recurring booking creation previews conflicts and allows resolution before committing to SQLite.
- [ ] Cancelling a booked session restores reserved hours back to the client's active package without manual intervention.

### Platform & UI/UX
- [ ] Complete Arabic RTL interface with appropriate bidirectional isolation for numbers, currency (EGP), dates, and telephone numbers.
- [ ] All mandatory states implemented: loading, skeleton, empty state, and actionable error state.
- [ ] Full offline operation: core application functions with zero network dependency.
- [ ] Automated suite: lint (`npm run lint`), typecheck (`tsc --noEmit`), and domain calculation unit tests pass cleanly.
