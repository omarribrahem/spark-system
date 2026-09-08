import { describe, it, expect, beforeEach } from 'vitest';
import { createWasmDriver, WasmSqlDriver } from '../../../src/database/driver/wasm-driver';
import { runMigrations } from '../../../src/database/migrations/runner';
import { ClientRepository } from '../../../src/database/repositories';
import { UniversalServiceRepository } from '../../../src/database/repositories/universal-service-repository';
import { UnifiedReelsRepository } from '../../../src/database/repositories/unified-reels-repository';
import { DomainInvariantError } from '../../../src/domain/rules/invariants';

describe('UnifiedReelsRepository & Idempotency Unit Tests', () => {
  let driver: WasmSqlDriver;
  let clientRepo: ClientRepository;
  let serviceRepo: UniversalServiceRepository;
  let reelsRepo: UnifiedReelsRepository;
  let clientAId: string;
  let clientBId: string;
  let soldPlanAId: string;

  beforeEach(async () => {
    driver = await createWasmDriver();
    await runMigrations(driver);

    clientRepo = new ClientRepository(driver);
    serviceRepo = new UniversalServiceRepository(driver);
    reelsRepo = new UnifiedReelsRepository(driver);

    const clientA = await clientRepo.create({
      name: 'عميل أ (المتجر العصري)',
      phone: '01000000001',
    });
    clientAId = clientA.id;

    const clientB = await clientRepo.create({
      name: 'عميل ب (مطعم البركة)',
      phone: '01000000002',
    });
    clientBId = clientB.id;

    // Sell plan with 3 reels to Client A
    const soldPlan = await serviceRepo.sellPlan({
      clientId: clientAId,
      nameSnapshot: 'باقة ريلز انستجرام (3 ريلز)',
      priceSnapshot: 300000,
      billingMethod: 'entitlement_package',
      startDate: '2026-03-01T00:00:00.000Z',
      entitlements: [
        {
          name: 'فيديوهات ريلز',
          key: 'reels',
          quantity: 3,
          unit: 'فيديو',
          allowOverage: false,
        },
      ],
    });
    soldPlanAId = soldPlan.id;
  });

  it('lists default workflow stages when none are customized', async () => {
    const stages = await reelsRepo.listWorkflowStages();
    expect(stages.length).toBe(7);
    expect(stages.map((s) => s.stage_key)).toEqual([
      'planned',
      'ready_to_film',
      'filmed',
      'editing',
      'review',
      'delivered',
      'cancelled',
    ]);
  });

  it('creates and updates reels linked to client and sold plan', async () => {
    const reel = await reelsRepo.saveReel({
      clientId: clientAId,
      soldPlanId: soldPlanAId,
      title: 'فيديو إطلاق المنتج الجديد',
      status: 'planned',
      priority: 'high',
      notes: 'تصوير داخل الفرع الرئيسي',
    });

    expect(reel.id).toBeDefined();
    expect(reel.client_id).toBe(clientAId);
    expect(reel.sold_plan_id).toBe(soldPlanAId);
    expect(reel.status).toBe('planned');
    expect(reel.title).toBe('فيديو إطلاق المنتج الجديد');
    expect(reel.clientName).toBe('عميل أ (المتجر العصري)');
    expect(reel.planNameSnapshot).toBe('باقة ريلز انستجرام (3 ريلز)');
  });

  it('blocks linking reel to a plan owned by another client', async () => {
    const reel = await reelsRepo.saveReel({
      clientId: clientAId,
      title: 'ريل أولي',
      status: 'planned',
    });

    // Try to update reel setting soldPlanId of Client A while client is changed to Client B
    await expect(
      reelsRepo.saveReel({
        id: reel.id,
        clientId: clientBId,
        soldPlanId: soldPlanAId, // belongs to Client A!
        title: 'ريل بعد التعديل',
      })
    ).rejects.toThrow(DomainInvariantError);
  });

  it('transitions stage with atomic entitlement deduction upon delivery', async () => {
    const reel = await reelsRepo.saveReel({
      clientId: clientAId,
      soldPlanId: soldPlanAId,
      title: 'ريل الخريف',
      status: 'planned',
    });

    // Move to filmed, then editing, then review (no quota consumed yet)
    await reelsRepo.transitionStage(reel.id, 'filmed');
    await reelsRepo.transitionStage(reel.id, 'editing');
    await reelsRepo.transitionStage(reel.id, 'review');

    let plan = (await serviceRepo.getSoldPlanById(soldPlanAId))!;
    let reelsEnt = plan.entitlements.find((e) => e.entitlement_key === 'reels')!;
    expect(reelsEnt.quantity_used).toBe(0);
    expect(reelsEnt.quantity_remaining).toBe(3);

    // Deliver reel -> quota decremented
    await reelsRepo.transitionStage(reel.id, 'delivered');

    plan = (await serviceRepo.getSoldPlanById(soldPlanAId))!;
    reelsEnt = plan.entitlements.find((e) => e.entitlement_key === 'reels')!;
    expect(reelsEnt.quantity_used).toBe(1);
    expect(reelsEnt.quantity_remaining).toBe(2);

    const deliveredReel = (await reelsRepo.getReelById(reel.id))!;
    expect(deliveredReel.status).toBe('delivered');
    expect(deliveredReel.delivered_date).toBeDefined();
  });

  it('guarantees idempotency: repeated delivery or double-drop does not deduct quota twice', async () => {
    const reel = await reelsRepo.saveReel({
      clientId: clientAId,
      soldPlanId: soldPlanAId,
      title: 'ريل التخفيضات الكبرى',
      status: 'review',
    });

    // 1st delivery
    await reelsRepo.transitionStage(reel.id, 'delivered');

    let plan = (await serviceRepo.getSoldPlanById(soldPlanAId))!;
    let reelsEnt = plan.entitlements.find((e) => e.entitlement_key === 'reels')!;
    expect(reelsEnt.quantity_used).toBe(1);
    expect(reelsEnt.quantity_remaining).toBe(2);

    // 2nd delivery attempt on same reel (e.g. repeated drag or duplicate event)
    await reelsRepo.transitionStage(reel.id, 'delivered');
    await reelsRepo.transitionStage(reel.id, 'delivered');

    plan = (await serviceRepo.getSoldPlanById(soldPlanAId))!;
    reelsEnt = plan.entitlements.find((e) => e.entitlement_key === 'reels')!;
    // MUST STILL BE 1 used and 2 remaining!
    expect(reelsEnt.quantity_used).toBe(1);
    expect(reelsEnt.quantity_remaining).toBe(2);
  });

  it('restores entitlement quota when reel moves backward from delivered', async () => {
    const reel = await reelsRepo.saveReel({
      clientId: clientAId,
      soldPlanId: soldPlanAId,
      title: 'ريل رمضان',
      status: 'review',
    });

    // Deliver reel
    await reelsRepo.transitionStage(reel.id, 'delivered');

    let plan = (await serviceRepo.getSoldPlanById(soldPlanAId))!;
    let reelsEnt = plan.entitlements.find((e) => e.entitlement_key === 'reels')!;
    expect(reelsEnt.quantity_used).toBe(1);
    expect(reelsEnt.quantity_remaining).toBe(2);

    // Customer requests rework -> move back to 'editing'
    await reelsRepo.transitionStage(reel.id, 'editing');

    plan = (await serviceRepo.getSoldPlanById(soldPlanAId))!;
    reelsEnt = plan.entitlements.find((e) => e.entitlement_key === 'reels')!;
    // Restored to 0 used and 3 remaining!
    expect(reelsEnt.quantity_used).toBe(0);
    expect(reelsEnt.quantity_remaining).toBe(3);

    // Redeliver
    await reelsRepo.transitionStage(reel.id, 'delivered');
    plan = (await serviceRepo.getSoldPlanById(soldPlanAId))!;
    reelsEnt = plan.entitlements.find((e) => e.entitlement_key === 'reels')!;
    expect(reelsEnt.quantity_used).toBe(1);
    expect(reelsEnt.quantity_remaining).toBe(2);
  });
});
