import { describe, it, expect, beforeEach } from 'vitest';
import { createWasmDriver, WasmSqlDriver } from '../../../src/database/driver/wasm-driver';
import { runMigrations } from '../../../src/database/migrations/runner';
import { ClientRepository } from '../../../src/database/repositories';
import { UniversalServiceRepository } from '../../../src/database/repositories/universal-service-repository';
import { DomainInvariantError } from '../../../src/domain/rules/invariants';

describe('UniversalServiceRepository Unit Tests', () => {
  let driver: WasmSqlDriver;
  let clientRepo: ClientRepository;
  let serviceRepo: UniversalServiceRepository;
  let testClientId: string;

  beforeEach(async () => {
    driver = await createWasmDriver();
    await runMigrations(driver);

    clientRepo = new ClientRepository(driver);
    serviceRepo = new UniversalServiceRepository(driver);

    const client = await clientRepo.create({
      name: 'شركة الأفق للإعلام',
      companyName: 'الأفق للإنتاج',
      phone: '01011112222',
    });
    testClientId = client.id;
  });

  describe('Service Definitions Catalog', () => {
    it('creates and lists service definitions with various billing models', async () => {
      const s1 = await serviceRepo.createService({
        name: 'إنتاج إعلانات تيك توك',
        billingMethod: 'one_time',
        defaultPrice: 500000, // 5,000 EGP
        unitName: 'إعلان',
      });

      const s2 = await serviceRepo.createService({
        name: 'باقة إدارة سوشيال ميديا شهرية',
        billingMethod: 'recurring',
        defaultPrice: 1200000, // 12,000 EGP
        unitName: 'شهر',
        autoRenew: true,
      });

      expect(s1.id).toBeDefined();
      expect(s1.name).toBe('إنتاج إعلانات تيك توك');
      expect(s1.default_price).toBe(500000);
      expect(s1.billing_method).toBe('one_time');
      expect(s2.id).toBeDefined();
      expect(s2.billing_method).toBe('recurring');

      const all = await serviceRepo.listServices();
      expect(all.length).toBeGreaterThanOrEqual(2);

      const updated = await serviceRepo.updateService(s1.id, {
        name: 'إنتاج إعلانات تيك توك وريلز سينمائي',
        defaultPrice: 650000,
      });
      expect(updated.name).toBe('إنتاج إعلانات تيك توك وريلز سينمائي');
      expect(updated.default_price).toBe(650000);
    });

    it('validates financial invariants on service creation', async () => {
      await expect(
        serviceRepo.createService({
          name: 'خدمة غير صحيحة',
          billingMethod: 'one_time',
          defaultPrice: 99.99, // Float error
        })
      ).rejects.toThrow(DomainInvariantError);
    });
  });

  describe('Plan Templates & Entitlements', () => {
    it('creates a plan template with composite entitlements', async () => {
      const template = await serviceRepo.createPlanTemplate({
        name: 'باقة التميز ج (10 ساعات + 3 ريلز)',
        billingMethod: 'entitlement_package',
        defaultPrice: 400000, // 4,000 EGP
        entitlements: [
          {
            name: 'ساعات استوديو',
            key: 'hours',
            quantity: 10,
            unit: 'ساعة',
            allowOverage: false,
          },
          {
            name: 'فيديوهات ريلز',
            key: 'reels',
            quantity: 3,
            unit: 'فيديو',
            allowOverage: false,
          },
        ],
      });

      expect(template.id).toBeDefined();
      expect(template.entitlements.length).toBe(2);
      expect(template.entitlements[0].entitlement_key).toBe('hours');
      expect(template.entitlements[0].quantity).toBe(10);
      expect(template.entitlements[1].entitlement_key).toBe('reels');
      expect(template.entitlements[1].quantity).toBe(3);
    });
  });

  describe('Sold Plans with Frozen Snapshots & Entitlements', () => {
    it('sells a plan with immutable price and terms snapshots and creates audit log', async () => {
      const sold = await serviceRepo.sellPlan({
        clientId: testClientId,
        nameSnapshot: 'باقة نمو الأعمال الخاصة',
        priceSnapshot: 500000, // 5,000 EGP
        discountSnapshot: 50000, // 500 EGP
        taxSnapshot: 63000, // 630 EGP (14%)
        billingMethod: 'entitlement_package',
        termsSnapshot: 'شاملة التصوير والمونتاج خلال 30 يوماً فقط من التعاقد',
        startDate: '2026-03-01T00:00:00.000Z',
        entitlements: [
          {
            name: 'ساعات تصوير',
            key: 'hours',
            quantity: 15,
            unit: 'ساعة',
            allowOverage: false,
          },
          {
            name: 'ريلز احترافي',
            key: 'reels',
            quantity: 5,
            unit: 'فيديو',
            allowOverage: false,
          },
        ],
      });

      expect(sold.id).toBeDefined();
      expect(sold.client_id).toBe(testClientId);
      expect(sold.price_snapshot).toBe(500000);
      expect(sold.discount_snapshot).toBe(50000);
      expect(sold.tax_snapshot).toBe(63000);
      expect(sold.total_snapshot).toBe(513000); // 500000 - 50000 + 63000
      expect(sold.terms_snapshot).toBe('شاملة التصوير والمونتاج خلال 30 يوماً فقط من التعاقد');
      expect(sold.entitlements.length).toBe(2);

      const reelsEnt = sold.entitlements.find((e) => e.entitlement_key === 'reels');
      expect(reelsEnt).toBeDefined();
      expect(reelsEnt?.quantity_initial).toBe(5);
      expect(reelsEnt?.quantity_used).toBe(0);
      expect(reelsEnt?.quantity_remaining).toBe(5);

      // Verify audit log entry
      const auditLogs = await driver.query<{ action: string; entity_id: string }>(
        `SELECT action, entity_id FROM general_audit_logs WHERE entity_id = ?;`,
        [sold.id]
      );
      expect(auditLogs.length).toBe(1);
      expect(auditLogs[0].action).toBe('PLAN_SOLD');
    });

    it('consumes and restores entitlements atomically with over-consumption protection', async () => {
      const sold = await serviceRepo.sellPlan({
        clientId: testClientId,
        nameSnapshot: 'باقة ريلز مخصصة',
        priceSnapshot: 200000,
        billingMethod: 'entitlement_package',
        startDate: '2026-03-01T00:00:00.000Z',
        entitlements: [
          {
            name: 'ريلز',
            key: 'reels',
            quantity: 2,
            unit: 'فيديو',
            allowOverage: false,
          },
        ],
      });

      // 1. Consume 1 reel
      await serviceRepo.consumeEntitlement(sold.id, 'reels', 1);
      let reloaded = (await serviceRepo.getSoldPlanById(sold.id))!;
      let reelsEnt = reloaded.entitlements.find((e) => e.entitlement_key === 'reels')!;
      expect(reelsEnt.quantity_used).toBe(1);
      expect(reelsEnt.quantity_remaining).toBe(1);

      // 2. Consume 2nd reel
      await serviceRepo.consumeEntitlement(sold.id, 'reels', 1);
      reloaded = (await serviceRepo.getSoldPlanById(sold.id))!;
      reelsEnt = reloaded.entitlements.find((e) => e.entitlement_key === 'reels')!;
      expect(reelsEnt.quantity_used).toBe(2);
      expect(reelsEnt.quantity_remaining).toBe(0);

      // 3. Over-consumption blocked when allow_overage is false
      await expect(
        serviceRepo.consumeEntitlement(sold.id, 'reels', 1)
      ).rejects.toThrow(DomainInvariantError);

      // 4. Restore 1 reel
      await serviceRepo.restoreEntitlement(sold.id, 'reels', 1);
      reloaded = (await serviceRepo.getSoldPlanById(sold.id))!;
      reelsEnt = reloaded.entitlements.find((e) => e.entitlement_key === 'reels')!;
      expect(reelsEnt.quantity_used).toBe(1);
      expect(reelsEnt.quantity_remaining).toBe(1);

      // 5. Restore another reel
      await serviceRepo.restoreEntitlement(sold.id, 'reels', 1);
      reloaded = (await serviceRepo.getSoldPlanById(sold.id))!;
      reelsEnt = reloaded.entitlements.find((e) => e.entitlement_key === 'reels')!;
      expect(reelsEnt.quantity_used).toBe(0);
      expect(reelsEnt.quantity_remaining).toBe(2);

      // 6. Over-restoration capped at quantity_initial
      await serviceRepo.restoreEntitlement(sold.id, 'reels', 1);
      reloaded = (await serviceRepo.getSoldPlanById(sold.id))!;
      reelsEnt = reloaded.entitlements.find((e) => e.entitlement_key === 'reels')!;
      expect(reelsEnt.quantity_used).toBe(0);
      expect(reelsEnt.quantity_remaining).toBe(2);
    });
  });
});
