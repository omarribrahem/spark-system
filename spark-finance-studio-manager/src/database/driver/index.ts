import { IDatabaseDriver } from './types';
import { createTauriDriver } from './tauri-driver';
import { createWasmDriver } from './wasm-driver';

export * from './types';
export * from './wasm-driver';
export * from './tauri-driver';

let activeDriver: IDatabaseDriver | null = null;

/**
 * Detects whether the current runtime environment is inside Tauri desktop
 */
export function isTauriEnvironment(): boolean {
  if (typeof window !== 'undefined') {
    return '__TAURI_INTERNALS__' in window || '__TAURI__' in window;
  }
  return false;
}

/**
 * Factory that returns the appropriate database driver based on runtime:
 * - TauriSqlDriver in Tauri desktop production
 * - WasmSqlDriver in headless tests / web preview
 */
export async function getDatabaseDriver(forceWasm = false): Promise<IDatabaseDriver> {
  if (activeDriver) {
    return activeDriver;
  }

  if (!forceWasm && isTauriEnvironment()) {
    try {
      activeDriver = await createTauriDriver();
      return activeDriver;
    } catch (e) {
      console.warn('Failed to initialize TauriSqlDriver, falling back to WasmSqlDriver', e);
    }
  }

  activeDriver = await createWasmDriver();
  return activeDriver;
}

/**
 * Resets the active driver singleton (primarily for testing)
 */
export async function resetDatabaseDriver(): Promise<void> {
  if (activeDriver) {
    await activeDriver.close();
    activeDriver = null;
  }
}
