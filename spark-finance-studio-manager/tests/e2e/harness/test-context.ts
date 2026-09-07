import { IDatabaseDriver, createTestDatabase } from './test-database';
import { runTestMigrations } from './test-migrations';
import { registerCustomMatchers } from './custom-matchers';

export interface TestContext {
  driver: IDatabaseDriver;
  cleanup: () => Promise<void>;
  seedDate: string; // ISO format e.g. '2026-10-05'
}

/**
 * Creates a fresh, isolated test execution context with in-memory database and schema.
 */
export async function setupTestContext(initialDate = '2026-10-05'): Promise<TestContext> {
  registerCustomMatchers();

  const driver = await createTestDatabase();
  await runTestMigrations(driver);

  return {
    driver,
    seedDate: initialDate,
    cleanup: async () => {
      await driver.close();
    },
  };
}

/**
 * Formats integer piasters into Arabic EGP representation for UI verification.
 * e.g. 150000 -> "1,500 ج.م"
 */
export function formatPiastersToEgp(piasters: number): string {
  const egp = piasters / 100;
  return `${egp.toLocaleString('ar-EG')} ج.م`;
}

/**
 * Formats integer minutes into decimal hours for UI verification.
 * e.g. 90 -> 1.5
 */
export function minutesToDecimalHours(minutes: number): number {
  return minutes / 60;
}
