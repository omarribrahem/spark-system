# Spark System

Spark System is an Arabic RTL, offline-first finance and studio management application. The desktop application uses React, TypeScript, Tauri, Rust, and local SQLite storage.

## Project location

The application source is in `spark-finance-studio-manager/`. Product and implementation documents are kept at the repository root and under the application's `docs/` directory.

## Requirements

- Node.js and npm
- Rust toolchain
- Windows prerequisites for Tauri 2

## Web development preview

```powershell
cd spark-finance-studio-manager
npm install
npm run dev
```

The browser preview is intended for interface development. Durable local data and native functionality require the Tauri desktop runtime.

## Validation

```powershell
cd spark-finance-studio-manager
npm run typecheck
npm run lint
npm run test:all
npm run build
```

## Desktop development

Install the Tauri CLI when the desktop workflow is enabled, then run the Tauri development command from `spark-finance-studio-manager/`. Do not commit databases, backups, user attachments, environment files, or updater signing keys.

## Data safety

Application updates must never overwrite the user's SQLite database or attachments. Create and verify a backup before applying database migrations or desktop updates. See the architecture decisions in `spark-finance-studio-manager/docs/adr/`.
