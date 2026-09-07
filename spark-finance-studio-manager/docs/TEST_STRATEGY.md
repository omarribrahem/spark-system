# Test Strategy: Spark Finance & Studio Manager

```yaml
artifact_type: project-specific-test-strategy
status: approved
confidence: high
classification: medium-system
as_of: 2026-09-06
```

---

## 1. Testing Philosophy & Quality Principles

Spark Finance & Studio Manager manages real company financial cash flows, client debts, and studio operating schedules. Faulty calculations, over-allocations, or schedule overlaps directly damage operations.

### Core Testing Invariants:
1. **Zero Hardcoded Fakes or Mocks for Domain Logic**: All business algorithms (payment allocations, credit balance math, studio overlap detection, package entitlement consumption) must run through pure, deterministic TypeScript functions with comprehensive boundary test coverage.
2. **Real Relational Enforcement in Tests**: Repository and database integration tests must execute against a real SQLite engine (via `sql.js` WebAssembly) enforcing real foreign keys (`PRAGMA foreign_keys = ON;`), transactions, and triggers.
3. **100% Deterministic Execution**: Zero flaky tests, zero timing race conditions, zero network dependencies. All test data must be self-contained and generated in-memory.
4. **Mandatory UI State Coverage**: Components must be tested across all 4 mandatory states: Loading, Skeleton, Empty (with actionable CTA), and Actionable Error.

---

## 2. The 4-Tier Automated Testing Pyramid

```
                       ┌─────────────────────────┐
                       │         TIER 4          │
                       │   End-to-End Workflows  │
                       │  (Full Business Journeys│
                       │   & PRD §61 Scenarios)  │
                       ├─────────────────────────┤
                       │         TIER 3          │
                       │  Component States & RTL │
                       │ (Loading/Empty/Error/   │
                       │  Cairo BDI Isolation)   │
                       ├─────────────────────────┤
                       │         TIER 2          │
                       │  SQLite & Repositories  │
                       │ (WasmSqlDriver, Foreign │
                       │  Keys, Triggers, ACID)  │
                       ├─────────────────────────┤
                       │         TIER 1          │
                       │   Pure Domain Engines   │
                       │ (Piasters, Minutes,     │
                       │  Overlap, Allocations)  │
                       └─────────────────────────┘
```

---

## 3. Tier Specifications & Test Coverage

### 3.1 Tier 1: Pure Domain Calculation Engine Unit Tests
Located in `tests/unit/domain/`. Tests pure TypeScript domain calculators without any database, file system, or UI dependencies.

#### Target Calculators & Coverage Requirements:
1. **`calculateAllocation(paymentPiasters: number, targets: TargetDue[]): AllocationResult`**
   - Invariant: $\sum \text{allocated} \le \text{paymentPiasters}$.
   - Tests:
     - Exact payment matching total targets.
     - Under-payment with partial allocation across prioritised targets.
     - Over-payment surplus converting to `unallocatedCreditPiasters`.
     - Over-allocation attempt throwing explicit validation error `BR-021`.
     - Zero and negative payment values rejected.
2. **`checkStudioOverlap(existing: TimeSlot[], proposed: TimeSlot): OverlapResult`**
   - Invariant: Overlap condition $S_{\text{new}} < E_{\text{exist}} \land E_{\text{new}} > S_{\text{exist}}$.
   - Tests:
     - Exact same start and end time (Full overlap $\rightarrow$ Block).
     - Proposed starts inside existing ($S_{\text{new}} \in (S, E) \rightarrow$ Block).
     - Proposed ends inside existing ($E_{\text{new}} \in (S, E) \rightarrow$ Block).
     - Proposed completely envelopes existing ($S_{\text{new}} < S \land E_{\text{new}} > E \rightarrow$ Block).
     - Adjacent back-to-back bookings ($E_{\text{new}} = S_{\text{exist}}$ or $S_{\text{new}} = E_{\text{exist}} \rightarrow$ Valid, NO overlap).
     - Same time slot on different dates ($\rightarrow$ Valid, NO overlap).
     - Cancelled existing bookings ($\rightarrow$ Ignored, NO overlap).
3. **`reconcilePackageConsumption(purchasedMinutes: number, usedMinutes: number, reservedMinutes: number, sessionActualMinutes: number): ConsumptionResult`**
   - Invariant: Pure integer minutes math. $1.5\text{h} = 90\text{m}$, $2.5\text{h} = 150\text{m}$.
   - Tests:
     - Actual duration equal to planned duration.
     - Actual duration less than planned duration (releases surplus reserved minutes).
     - Actual duration exceeds planned duration (additional minutes deducted).
     - Actual duration exceeds total package balance (triggers excess resolution flag; prevents negative balance).
     - Package status transitions: `not_started` $\rightarrow$ `active` $\rightarrow$ `fully_used`.
4. **`calculateDueStatus(dueDate: string, todayDate: string, totalPiasters: number, paidPiasters: number): DueStatusResult`**
   - Tests:
     - `paid` when $\text{paid} \ge \text{total}$.
     - `upcoming` when $\text{today} < \text{monthStart}$ and $\text{paid} == 0$.
     - `due` when $\text{today} \le \text{dueDate}$ and $\text{paid} == 0$.
     - `partial` when $\text{today} \le \text{dueDate}$ and $0 < \text{paid} < \text{total}$.
     - `overdue` when $\text{today} > \text{dueDate}$ and $\text{paid} < \text{total}$ (with accurate overdue days count).

---

### 3.2 Tier 2: SQLite Schema & Repository Integration Tests
Located in `tests/integration/database/`. Uses `WasmSqlDriver` powered by `sql.js` to execute real SQL queries against an in-memory SQLite database.

#### Coverage Requirements:
1. **Migration Runner Verification**:
   - Executes all 22 migration tables in order.
   - Verifies table schemas, unique constraints, and check constraints.
2. **Foreign Key Enforcement**:
   - Confirms `PRAGMA foreign_keys = ON;` is active.
   - Rejects orphaned `marketing_contracts` with invalid `client_id`.
   - Rejects orphaned `payment_allocations` with invalid `payment_id`.
3. **Database Triggers**:
   - Verifies `updated_at` triggers automatically update on row modifications.
   - Verifies `trg_prevent_payment_delete` raises a SQLite error upon `DELETE FROM payments`.
4. **Transactional ACID Rollback**:
   - Simulates a multi-table operation (e.g. creating payment + creating 3 allocations + updating client credit).
   - Induces an error on the 3rd allocation; asserts that the payment and earlier allocations are completely rolled back.
5. **Payment Voiding Workflow**:
   - Sets payment status to `void` with mandatory `void_reason`.
   - Rolls back target obligation balances to unpaid/partial.
   - Asserts corresponding audit entry written to `activity_log`.

---

### 3.3 Tier 3: Component State & Accessibility Tests
Located in `tests/unit/ui/`. Uses React Testing Library with Vitest and JSDOM.

#### Coverage Requirements:
1. **The 4 Mandatory States**:
   - Every module view (Clients list, Studio calendar, Finance ledger, Dashboard) tested for:
     - `Loading`: Displays spinner.
     - `Skeleton`: Displays placeholder layout elements without layout shift.
     - `Empty`: Displays contextual Arabic message and primary action button.
     - `Actionable Error`: Displays friendly Arabic error and calls retry handler on button click.
2. **Bidirectional Isolation (`<bdi>`)**:
   - Verifies currency values display as `<bdi>X</bdi> ج.م`.
   - Verifies phone numbers render with `dir="ltr"` inside `<bdi>`.
   - Verifies date/time ranges render chronologically without Arabic scrambling.
3. **Keyboard Shortcuts & Modal Focus**:
   - `Ctrl+K` triggers the global search modal.
   - `Escape` dismisses open modals.
   - Focus is trapped inside active modals.

---

### 3.4 Tier 4: End-to-End Operational Workflows
Located in `tests/e2e/`. Simulates complete real-world user journeys through the application services.

#### Master Workflow Scenarios:
1. **The Package C Full Lifecycle (PRD §61 Test 1)**:
   - Create client "Karim Hesham".
   - Purchase Creator Package (10h + 3 reels for 4,000 EGP = 400,000 piasters).
   - Record 400,000 piasters cash payment allocated to package.
   - Schedule studio session for 2.0h (120 min) $\rightarrow$ Reserved minutes = 120.
   - Complete session with actual duration 4.5h (270 min) and mark 1 reel delivered.
   - Assert:
     - Financial Balance: Due = 0 piasters, Paid = 400,000 piasters (`paid`).
     - Service Balance: Hours Remaining = 5.5h (330 min), Reels Remaining = 2.
     - Package Status: `active` (NOT `fully_used`).
2. **Recurring Studio Generation & Conflict Resolution (PRD §61 Test 2)**:
   - Create recurring rule for 4 consecutive Saturdays (4:00 PM - 6:00 PM).
   - Introduce an existing booking on the 2nd Saturday.
   - Run conflict preview; assert 3 available slots and 1 conflict detected.
   - Select "Skip Conflict" $\rightarrow$ exactly 3 bookings inserted into database.
3. **Studio Overlap Hard Blocking (PRD §61 Test 8)**:
   - Create confirmed booking on 2026-09-10 from 14:00 to 16:00.
   - Attempt to book 2026-09-10 from 15:00 to 17:00.
   - Assert: Save is blocked, returns Arabic conflict error, database row count unchanged.
4. **Multi-Target Payment Split with Client Credit (PRD §61 Tests 6 & 7)**:
   - Client owes: Marketing 6,000 EGP, Studio 2,500 EGP. Total dues = 8,500 EGP.
   - Client pays 10,000 EGP Cash.
   - Allocate 6,000 EGP to Marketing, 2,500 EGP to Studio.
   - Surplus 1,500 EGP unallocated.
   - Assert: Both services marked `paid`; client profile shows `unallocatedCredit = 150000 piasters` (1,500 EGP).
5. **Atomic Backup, Corruption Invalidation & Safe Restore**:
   - Generate backup ZIP archive with `manifest.json` and SHA-256.
   - Tamper with database content inside ZIP (corrupt SHA-256).
   - Attempt restore $\rightarrow$ Assert restore rejected immediately with error.
   - Execute restore with valid archive $\rightarrow$ Pre-restore safety backup created; data successfully restored.

---

## 4. Test Execution & Quality Gates

The continuous integration and local verification workflow enforces strict quality gates:

```bash
# 1. Typecheck: Zero TypeScript errors
npx tsc --noEmit

# 2. Linter: Strict ESLint compliance
npm run lint

# 3. Unit & Integration & E2E Test Suite (Vitest)
npm test

# 4. Coverage Audit: Validate domain calculator coverage >= 95%
npm run test:coverage
```

### Gate Rules:
- **Build Blocker**: Any type error, lint warning, or failing test in Tiers 1–4 blocks milestone completion.
- **No Degradation**: Previous milestone tests must continue to pass (Zero regressions).
