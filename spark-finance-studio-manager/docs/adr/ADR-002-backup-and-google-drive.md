# ADR-002: Atomic Local Backup Architecture with Safe Restore & Opt-In Google Drive Mirror

```yaml
artifact_type: project-specific-decision
status: accepted
date: 2026-09-06
supersedes: []
```

---

## 1. Context & Business Drivers

As an offline-first desktop application, Spark Finance & Studio Manager stores all critical company financial ledgers, client contracts, studio bookings, and payment receipt files locally on the operator's machine (`%APPDATA%/SparkManager/`).

### Key Decision Drivers:
- **DRV-05: Disaster Recovery & Hardware Protection**: Safeguarding business data against hard drive failure, malware/ransomware, accidental deletion, or Windows OS corruption.
- **Relational & Attachment Consistency**: A backup must capture both the SQLite database (`spark.db`) and all associated receipt attachments (`attachments/`) in a mutually consistent state.
- **Operator Safety (No Self-Inflicted Data Loss)**: A restore action must never accidentally destroy live data if an outdated or corrupt archive is imported.
- **Non-Blocking Cloud Mirror**: Providing optional off-site cloud replication without introducing runtime cloud dependencies or exposing user credentials.

---

## 2. Options Considered

### Option A: Live Cloud Multi-Master Synchronization (e.g. CouchDB, CRDTs, ElectricSQL)
- **Description**: Real-time bi-directional row sync over WebSocket to a cloud database.
- **Pros**: Continuous real-time offsite replication.
- **Cons & Risks**:
  - Immensely complex conflict resolution protocols for multi-target split payments and studio booking slots.
  - Requires maintaining and paying for a remote cloud database cluster.
  - Conflicts with the single-operator offline-first operational simplicity mandate.
- **Verdict**: **Rejected**.

### Option B: Naive Live File Copy to OneDrive / Dropbox / Google Drive Folder
- **Description**: Pointing the SQLite database path directly to a synchronized cloud folder or running standard file-copy commands while the app is active.
- **Pros**: Simple to set up with existing cloud sync clients.
- **Cons & Risks**:
  - **Severe SQLite Corruption Risk**: Cloud sync clients (e.g., OneDrive) frequently lock SQLite files (`spark.db`, `spark.db-wal`, `spark.db-shm`) while transactions are executing, causing `SQLITE_BUSY` errors or corrupted database headers.
  - Does not guarantee transactional consistency between the database and the attachments directory.
- **Verdict**: **Rejected**.

### Option C: Consistent Atomic Local Snapshot Bundle + Pre-Restore Safeguard + Isolated Google Drive Mirror (Selected)
- **Description**: Complete multi-tier disaster recovery architecture:
  1. Consistent database capture via SQLite `VACUUM INTO` into a staging file.
  2. Single compressed archive (`.zip`) containing `spark.db`, `attachments/`, `settings.json`, and `manifest.json`.
  3. Cryptographic SHA-256 verification of archive contents.
  4. Automated daily backups on app launch with 30-day rolling retention.
  5. Mandatory Pre-Restore Safety Snapshot before applying any restore operation.
  6. Non-blocking, opt-in Google Drive mirror authenticating via desktop OAuth and storing tokens securely in Windows Credential Manager (OS Keychain).
- **Verdict**: **Accepted**.

---

## 3. Decision & Technical Rationale

We decide to implement **Consistent Atomic Local Snapshot Backups** paired with a **Safe Restore Protocol** and an **Opt-In Google Drive Mirror**:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        BACKUP ARCHITECTURE PIPELINE                   │
│                                                                        │
│   1. Trigger (Manual "Backup Now" OR Daily Startup Check)              │
│                           │                                            │
│                           ▼                                            │
│   2. Consistent DB Snapshot via: `VACUUM INTO 'spark.db.bak'`          │
│                           │                                            │
│                           ▼                                            │
│   3. Compute SHA-256 Hashes for DB, Attachments, and Settings          │
│                           │                                            │
│                           ▼                                            │
│   4. Generate manifest.json and Compress into spark-backup-*.tmp       │
│                           │                                            │
│                           ▼                                            │
│   5. Atomic Rename to: backups/spark-backup-YYYY-MM-DD-HHmmss.zip      │
│                           │                                            │
│                           ▼                                            │
│   6. Apply Retention Policy: Retain 30 latest, auto-purge older        │
│                           │                                            │
│         ┌─────────────────┴─────────────────┐                          │
│         │ (If Google Drive is Connected)    │ (If Offline / Unlinked)  │
│         ▼                                   ▼                          │
│   7. Background Non-Blocking Upload    Local backup complete.          │
│      - Tokens from Windows Keychain    No network actions.             │
│      - Failure logged to backup.log                                    │
└────────────────────────────────────────────────────────────────────────┘
```

### 3.1 Manifest Specification (`manifest.json`)
Every backup archive embeds a cryptographically verifiable manifest:
```json
{
  "manifest_version": "1.0",
  "app_version": "1.0.0",
  "backup_timestamp": "2026-09-06T19:30:00Z",
  "backup_type": "automated",
  "files": [
    {
      "path": "spark.db",
      "size": 1572864,
      "sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    },
    {
      "path": "attachments/payments/rec-abc-123.jpg",
      "size": 45012,
      "sha256": "4b227777d4dd1fc61c6f884f48641d02b4d121d3fd328cb08b5531fcacdabf8a"
    },
    {
      "path": "settings.json",
      "size": 340,
      "sha256": "127e44a30eef7f8a7e0c4b260907d722d3b5b158ad0761e2f3d9a1c89f5bc3e5"
    }
  ],
  "archive_sha256": "a591a6d40bf420404a011733cfb7b190d62c65bf0bcda32b57b277d9ad9f146e"
}
```

### 3.2 Safe Restore Protocol (Pre-Restore Safeguard)
Restoring from a backup archive executes the following rigorous protocol:
1. **User Confirmation**: The UI presents an explicit warning modal explaining that current local data will be replaced.
2. **Mandatory Pre-Restore Snapshot**: The system automatically executes a full backup of the current live database and attachments, saving it as `backups/pre-restore-backup-YYYY-MM-DD-HHmmss.zip`. If this safety backup fails, the restore process immediately halts.
3. **Archive Verification**: The target archive is extracted to a temporary folder (`%TEMP%/spark-restore-staging/`). All extracted files are hashed and validated against `manifest.json`.
4. **SQLite Integrity Check**: The extracted database is inspected using:
   ```sql
   PRAGMA integrity_check;
   ```
   If the query returns anything other than `ok`, the restore is aborted.
5. **Atomic Replacement & Reload**: Staged files are moved into `%APPDATA%/SparkManager/`, replacing previous files, and Tauri automatically reloads the webview to re-initialize SQLite connections.

### 3.3 Google Drive Mirror & Keychain Security
- **OAuth Desktop Client Flow**: Users authenticate with Google once via standard browser popup. Scope is strictly confined to `https://www.googleapis.com/auth/drive.file` (access only to files created by Spark Manager).
- **Windows Credential Manager (OS Keychain)**: The OAuth `refresh_token` and `access_token` are saved using the Rust `keyring` crate under service name `SparkFinanceStudioManager`.
  - **Zero Leaks**: Tokens are **never** stored in SQLite, web LocalStorage, or plaintext JSON files.
- **Non-Blocking Background Worker**: Uploads run asynchronously in a separate Rust thread. Network drops, timeouts, or expired tokens never block the UI or produce disruptive error modals for Safaa. Failures are written to `logs/backup.log`.

---

## 4. Consequences & Trade-offs

### 4.1 Positive Consequences
- **Total Disaster Resilience**: Spark can recover from complete hardware loss within minutes on any Windows PC.
- **Zero SQLite Corruption Risk**: `VACUUM INTO` creates clean, uncorrupted database clones regardless of active connections.
- **Human Error Protection**: The pre-restore safeguard ensures Safaa can immediately reverse an accidental restore.
- **Keychain Security Compliance**: Client OAuth tokens are guarded by Windows user account cryptography.

### 4.2 Costs & Operational Overhead
- **Disk Space Consumption**: Retaining 30 backup archives consumes ~30MB to 150MB of disk storage (automatically managed by the 30-day purge cycle).
- **Restore Re-authentication**: If restored on a new computer, Google Drive must be re-authorized if cloud mirror is desired (local data restores completely without internet).
