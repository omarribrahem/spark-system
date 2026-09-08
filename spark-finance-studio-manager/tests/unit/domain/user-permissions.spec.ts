import { describe, it, expect, beforeEach } from 'vitest';
import { createWasmDriver, WasmSqlDriver } from '../../../src/database/driver/wasm-driver';
import { runMigrations } from '../../../src/database/migrations/runner';
import {
  hasPermission,
  assertPermission,
  PermissionDeniedError,
} from '../../../src/domain/models/user-permissions';
import { UserRepository } from '../../../src/database/repositories/user-repository';

describe('User Roles & Permissions Domain & Persistence Tests', () => {
  let driver: WasmSqlDriver;
  let userRepo: UserRepository;

  beforeEach(async () => {
    driver = await createWasmDriver();
    await runMigrations(driver);
    userRepo = new UserRepository(driver);
  });

  describe('RBAC Logic & Permission Assertions', () => {
    it('grants admin all permissions unconditionally', () => {
      expect(hasPermission('admin', 'manage_users')).toBe(true);
      expect(hasPermission('admin', 'manage_settings')).toBe(true);
      expect(hasPermission('admin', 'restore_backup')).toBe(true);
      expect(hasPermission('admin', 'manage_finance')).toBe(true);
      expect(hasPermission('admin', 'manage_operations')).toBe(true);
      expect(hasPermission('admin', 'override_entitlements')).toBe(true);

      expect(() => assertPermission('admin', 'manage_users')).not.toThrow();
    });

    it('limits finance role to financial actions and blocks operational/admin actions', () => {
      expect(hasPermission('finance', 'manage_finance')).toBe(true);
      expect(hasPermission('finance', 'void_payment')).toBe(true);
      expect(hasPermission('finance', 'create_backup')).toBe(true);

      expect(hasPermission('finance', 'manage_users')).toBe(false);
      expect(hasPermission('finance', 'manage_settings')).toBe(false);
      expect(hasPermission('finance', 'manage_reels')).toBe(false);
      expect(hasPermission('finance', 'override_entitlements')).toBe(false);

      expect(() => assertPermission('finance', 'manage_users')).toThrow(PermissionDeniedError);
    });

    it('limits operations role to clients, plans, reels and bookings', () => {
      expect(hasPermission('operations', 'manage_clients')).toBe(true);
      expect(hasPermission('operations', 'manage_services_and_plans')).toBe(true);
      expect(hasPermission('operations', 'manage_reels')).toBe(true);
      expect(hasPermission('operations', 'manage_bookings')).toBe(true);

      expect(hasPermission('operations', 'manage_finance')).toBe(false);
      expect(hasPermission('operations', 'void_payment')).toBe(false);
      expect(hasPermission('operations', 'manage_users')).toBe(false);

      expect(() => assertPermission('operations', 'void_payment')).toThrow(PermissionDeniedError);
    });

    it('treats viewer role as read-only with no mutation permissions', () => {
      expect(hasPermission('viewer', 'manage_clients')).toBe(false);
      expect(hasPermission('viewer', 'manage_finance')).toBe(false);
      expect(hasPermission('viewer', 'manage_reels')).toBe(false);
      expect(hasPermission('viewer', 'create_backup')).toBe(false);

      expect(() => assertPermission('viewer', 'manage_clients')).toThrow(PermissionDeniedError);
    });
  });

  describe('UserRepository Persistence & Seeding', () => {
    it('retrieves default seeded users accurately', async () => {
      const users = await userRepo.listUsers();
      expect(users.length).toBeGreaterThanOrEqual(4);

      const admin = users.find((u) => u.role === 'admin');
      const finance = users.find((u) => u.role === 'finance');
      const ops = users.find((u) => u.role === 'operations');
      const viewer = users.find((u) => u.role === 'viewer');

      expect(admin).toBeDefined();
      expect(finance).toBeDefined();
      expect(ops).toBeDefined();
      expect(viewer).toBeDefined();
    });

    it('creates and updates users', async () => {
      const newUser = await userRepo.createUser({
        name: 'أحمد مساعد عمليات',
        email: 'ahmed@spark.internal',
        role: 'operations',
      });

      expect(newUser.id).toBeDefined();
      expect(newUser.name).toBe('أحمد مساعد عمليات');
      expect(newUser.role).toBe('operations');

      const updated = await userRepo.updateUser(newUser.id, {
        role: 'finance',
      });
      expect(updated.role).toBe('finance');
    });
  });
});
