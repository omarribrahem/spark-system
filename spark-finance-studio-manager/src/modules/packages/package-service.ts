/**
 * PackageService: Domain logic, persistence helpers, and catalog management
 * for Package Templates, Client Packages, and Entitlement Items.
 * All hours stored strictly as integer minutes; reels as discrete counts; prices as integer piasters.
 */

import { IDatabaseDriver } from '../../database/driver/types';
import {
  PackageRepository,
  ClientPackageWithItems,
  ClientPackageRecord,
  ClientPackageItemRecord,
  CreatePackageItemInput,
} from '../../database/repositories/package-repository';
import {
  assertIntegerPiasters,
  assertIntegerMinutes,
  assertNonEmptyString,
  DomainInvariantError,
} from '../../domain/rules/invariants';
import { PackageUnit } from '../../domain/models/package';

export interface PackageTemplateWithItems {
  id: string;
  name: string;
  default_price: number; // integer piasters
  active: number;
  created_at: string;
  hoursMinutes: number; // 0 if none
  reelsCount: number; // 0 if none
}

export interface ClientPackageDetails extends ClientPackageRecord {
  clientName: string;
  clientCompany: string | null;
  items: ClientPackageItemRecord[];
  hoursPurchasedMinutes: number;
  hoursUsedMinutes: number;
  hoursReservedMinutes: number;
  hoursRemainingMinutes: number;
  reelsPurchased: number;
  reelsUsed: number;
  reelsReserved: number;
  reelsRemaining: number;
  isLowBalance: boolean;
  isFullyConsumed: boolean;
  paidAmountPiasters: number;
}

export interface SavePackageTemplateInput {
  id?: string;
  name: string;
  defaultPricePiasters: number;
  hoursMinutes: number;
  reelsCount: number;
  active?: number;
}

export interface SellPackageInput {
  clientId: string;
  packageTemplateId?: string | null;
  nameSnapshot: string;
  soldPricePiasters: number;
  purchasedAt: string; // 'YYYY-MM-DD'
  hoursMinutes: number;
  reelsCount: number;
  notes?: string | null;
}

/**
 * Seeds default package catalog templates if table is empty (Package A, Package B, Package C).
 */
export async function ensureDefaultPackageTemplates(driver: IDatabaseDriver): Promise<void> {
  const existing = await driver.query<{ count: number }>(
    `SELECT COUNT(*) AS count FROM package_templates;`
  );
  if (existing[0]?.count > 0) return;

  const now = new Date().toISOString();

  // Package A: 5 hours (300 minutes), 0 reels, 1,500 EGP (150,000 piasters)
  const idA = crypto.randomUUID();
  await driver.execute(
    `INSERT INTO package_templates (id, name, default_price, active, created_at)
     VALUES (?, ?, ?, 1, ?);`,
    [idA, 'باقة أ: 5 ساعات استوديو', 150000, now]
  );
  await driver.execute(
    `INSERT INTO package_template_items (id, package_template_id, unit, quantity)
     VALUES (?, ?, 'hours', 300);`,
    [crypto.randomUUID(), idA]
  );

  // Package B: 10 hours (600 minutes), 0 reels, 2,800 EGP (280,000 piasters)
  const idB = crypto.randomUUID();
  await driver.execute(
    `INSERT INTO package_templates (id, name, default_price, active, created_at)
     VALUES (?, ?, ?, 1, ?);`,
    [idB, 'باقة ب: 10 ساعات استوديو', 280000, now]
  );
  await driver.execute(
    `INSERT INTO package_template_items (id, package_template_id, unit, quantity)
     VALUES (?, ?, 'hours', 600);`,
    [crypto.randomUUID(), idB]
  );

  // Package C: 10 hours (600 minutes) + 3 reels, 4,000 EGP (400,000 piasters)
  const idC = crypto.randomUUID();
  await driver.execute(
    `INSERT INTO package_templates (id, name, default_price, active, created_at)
     VALUES (?, ?, ?, 1, ?);`,
    [idC, 'باقة ج (كريتور): 10 ساعات استوديو + 3 ريلز', 400000, now]
  );
  await driver.execute(
    `INSERT INTO package_template_items (id, package_template_id, unit, quantity)
     VALUES (?, ?, 'hours', 600);`,
    [crypto.randomUUID(), idC]
  );
  await driver.execute(
    `INSERT INTO package_template_items (id, package_template_id, unit, quantity)
     VALUES (?, ?, 'reels', 3);`,
    [crypto.randomUUID(), idC]
  );
}

/**
 * Fetches all package templates from the catalog with their items
 */
export async function fetchPackageTemplates(driver: IDatabaseDriver): Promise<PackageTemplateWithItems[]> {
  await ensureDefaultPackageTemplates(driver);

  const templates = await driver.query<{
    id: string;
    name: string;
    default_price: number;
    active: number;
    created_at: string;
  }>(`SELECT id, name, default_price, active, created_at FROM package_templates ORDER BY default_price ASC;`);

  const items = await driver.query<{
    package_template_id: string;
    unit: string;
    quantity: number;
  }>(`SELECT package_template_id, unit, quantity FROM package_template_items;`);

  return templates.map((t) => {
    const templateItems = items.filter((i) => i.package_template_id === t.id);
    const hoursItem = templateItems.find((i) => i.unit === 'hours');
    const reelsItem = templateItems.find((i) => i.unit === 'reels');

    return {
      ...t,
      hoursMinutes: hoursItem ? hoursItem.quantity : 0,
      reelsCount: reelsItem ? reelsItem.quantity : 0,
    };
  });
}

/**
 * Creates or updates a package template in the catalog
 */
export async function savePackageTemplate(
  driver: IDatabaseDriver,
  input: SavePackageTemplateInput
): Promise<string> {
  const name = assertNonEmptyString(input.name, 'name');
  assertIntegerPiasters(input.defaultPricePiasters, 'defaultPricePiasters');
  assertIntegerMinutes(input.hoursMinutes, 'hoursMinutes');
  assertIntegerMinutes(input.reelsCount, 'reelsCount');

  if (input.hoursMinutes <= 0 && input.reelsCount <= 0) {
    throw new DomainInvariantError('الباقة يجب أن تحتوي على ساعات استوديو أو عدد ريلز أكبر من الصفر');
  }

  const now = new Date().toISOString();

  if (input.id) {
    // Update existing template
    await driver.transaction(async (tx) => {
      await tx.execute(
        `UPDATE package_templates SET name = ?, default_price = ?, active = ? WHERE id = ?;`,
        [name, input.defaultPricePiasters, input.active ?? 1, input.id]
      );
      await tx.execute(`DELETE FROM package_template_items WHERE package_template_id = ?;`, [input.id]);

      if (input.hoursMinutes > 0) {
        await tx.execute(
          `INSERT INTO package_template_items (id, package_template_id, unit, quantity) VALUES (?, ?, ?, ?);`,
          [crypto.randomUUID(), input.id, 'hours', input.hoursMinutes]
        );
      }
      if (input.reelsCount > 0) {
        await tx.execute(
          `INSERT INTO package_template_items (id, package_template_id, unit, quantity) VALUES (?, ?, ?, ?);`,
          [crypto.randomUUID(), input.id, 'reels', input.reelsCount]
        );
      }
    });
    return input.id;
  } else {
    // Insert new template
    const templateId = crypto.randomUUID();
    await driver.transaction(async (tx) => {
      await tx.execute(
        `INSERT INTO package_templates (id, name, default_price, active, created_at)
         VALUES (?, ?, ?, ?, ?);`,
        [templateId, name, input.defaultPricePiasters, input.active ?? 1, now]
      );

      if (input.hoursMinutes > 0) {
        await tx.execute(
          `INSERT INTO package_template_items (id, package_template_id, unit, quantity) VALUES (?, ?, ?, ?);`,
          [crypto.randomUUID(), templateId, 'hours', input.hoursMinutes]
        );
      }
      if (input.reelsCount > 0) {
        await tx.execute(
          `INSERT INTO package_template_items (id, package_template_id, unit, quantity) VALUES (?, ?, ?, ?);`,
          [crypto.randomUUID(), templateId, 'reels', input.reelsCount]
        );
      }
    });
    return templateId;
  }
}

/**
 * Sells a package to a client:
 * 1. Creates immutable snapshot in client_packages and client_package_items via PackageRepository.
 * 2. Automatically provisions discrete reel_items records for discrete reel pipeline tracking.
 */
export async function sellPackageToClient(
  driver: IDatabaseDriver,
  input: SellPackageInput
): Promise<ClientPackageWithItems> {
  const packageRepo = new PackageRepository(driver);

  const items: CreatePackageItemInput[] = [];
  if (input.hoursMinutes > 0) {
    items.push({ unit: 'hours', quantity: input.hoursMinutes });
  }
  if (input.reelsCount > 0) {
    items.push({ unit: 'reels', quantity: input.reelsCount });
  }

  if (items.length === 0) {
    throw new DomainInvariantError('يجب أن تحتوي الباقة على رصيد ساعات أو رصيد ريلز على الأقل');
  }

  const createdPkg = await packageRepo.createClientPackage({
    clientId: input.clientId,
    packageTemplateId: input.packageTemplateId ?? null,
    nameSnapshot: input.nameSnapshot,
    soldPrice: input.soldPricePiasters,
    purchasedAt: input.purchasedAt,
    notes: input.notes ?? null,
    items,
  });

  // Provision discrete reel items if package contains reels
  if (input.reelsCount > 0) {
    const now = new Date().toISOString();
    for (let i = 1; i <= input.reelsCount; i++) {
      const reelId = crypto.randomUUID();
      await driver.execute(
        `INSERT INTO reel_items (id, client_id, client_package_id, status, title, notes, created_at, updated_at)
         VALUES (?, ?, ?, 'planned', ?, ?, ?, ?);`,
        [
          reelId,
          input.clientId,
          createdPkg.id,
          `${input.nameSnapshot} - ريل #${i}`,
          `تم إنشاؤه تلقائياً مع شراء الباقة (${input.nameSnapshot})`,
          now,
          now,
        ]
      );
    }
  }

  return createdPkg;
}

/**
 * Fetches all client packages with complete entitlement calculations,
 * low balance flags, and client information.
 */
export async function fetchClientPackages(
  driver: IDatabaseDriver,
  filterClientId?: string | null
): Promise<ClientPackageDetails[]> {
  const whereClause = filterClientId ? `WHERE cp.client_id = ?` : '';
  const params = filterClientId ? [filterClientId] : [];

  const packages = await driver.query<ClientPackageRecord>(
    `SELECT cp.id, cp.client_id, cp.package_template_id, cp.name_snapshot, cp.sold_price,
            cp.purchased_at, cp.status, cp.notes, cp.created_at, cp.updated_at
     FROM client_packages cp
     ${whereClause}
     ORDER BY cp.purchased_at DESC, cp.created_at DESC;`,
    params
  );

  const clientRows = await driver.query<{ id: string; name: string; company_name: string | null }>(
    `SELECT id, name, company_name FROM clients;`
  );
  const clientMap = new Map<string, { name: string; company_name: string | null }>();
  clientRows.forEach((c) => clientMap.set(c.id, c));

  const allItems = await driver.query<ClientPackageItemRecord>(
    `SELECT id, client_package_id, unit, purchased_quantity, used_quantity, reserved_quantity
     FROM client_package_items;`
  );

  // Fetch payment allocations directly for client_packages
  const allocRows = await driver.query<{ target_id: string; total: number }>(
    `SELECT pa.target_id, COALESCE(SUM(pa.amount), 0) AS total
     FROM payment_allocations pa
     JOIN payments p ON pa.payment_id = p.id
     WHERE pa.target_type = 'client_package' AND p.status = 'active'
     GROUP BY pa.target_id;`
  );
  const paidMap = new Map<string, number>();
  allocRows.forEach((a) => paidMap.set(a.target_id, a.total));

  const unifiedPackages = packages.map((pkg) => {
    const client = clientMap.get(pkg.client_id);
    const pkgItems = allItems.filter((i) => i.client_package_id === pkg.id);

    const hoursItem = pkgItems.find((i) => i.unit === 'hours');
    const reelsItem = pkgItems.find((i) => i.unit === 'reels');

    const hoursPurchased = hoursItem ? hoursItem.purchased_quantity : 0;
    const hoursUsed = hoursItem ? hoursItem.used_quantity : 0;
    const hoursReserved = hoursItem ? hoursItem.reserved_quantity : 0;
    const hoursRemaining = Math.max(0, hoursPurchased - hoursUsed - hoursReserved);

    const reelsPurchased = reelsItem ? reelsItem.purchased_quantity : 0;
    const reelsUsed = reelsItem ? reelsItem.used_quantity : 0;
    const reelsReserved = reelsItem ? reelsItem.reserved_quantity : 0;
    const reelsRemaining = Math.max(0, reelsPurchased - reelsUsed - reelsReserved);

    const isLowBalance =
      (hoursPurchased > 0 && hoursRemaining <= 60 && hoursRemaining > 0) ||
      (reelsPurchased > 0 && reelsRemaining <= 1 && reelsRemaining > 0);

    const isFullyConsumed =
      (hoursPurchased === 0 || hoursRemaining === 0) &&
      (reelsPurchased === 0 || reelsRemaining === 0);

    const paidAmount = paidMap.get(pkg.id) || 0;

    return {
      ...pkg,
      clientName: client?.name ?? 'عميل غير معروف',
      clientCompany: client?.company_name ?? null,
      items: pkgItems,
      hoursPurchasedMinutes: hoursPurchased,
      hoursUsedMinutes: hoursUsed,
      hoursReservedMinutes: hoursReserved,
      hoursRemainingMinutes: hoursRemaining,
      reelsPurchased,
      reelsUsed,
      reelsReserved,
      reelsRemaining,
      isLowBalance,
      isFullyConsumed,
      paidAmountPiasters: paidAmount,
    };
  });

  // Query universal sold_plans
  try {
    const soldPlans = await driver.query<{
      id: string;
      client_id: string;
      plan_template_id: string | null;
      name_snapshot: string;
      price_snapshot: number;
      total_snapshot: number;
      start_date: string;
      service_status: string;
      notes: string | null;
      created_at: string;
      updated_at: string;
    }>(
      `SELECT sp.id, sp.client_id, sp.plan_template_id, sp.name_snapshot, sp.price_snapshot,
              sp.total_snapshot, sp.start_date, sp.service_status, sp.notes, sp.created_at, sp.updated_at
       FROM sold_plans sp
       ${whereClause}
       ORDER BY sp.start_date DESC, sp.created_at DESC;`,
      params
    );

    const soldEntitlements = await driver.query<{
      id: string;
      sold_plan_id: string;
      entitlement_name: string;
      entitlement_key: string;
      purchased_quantity: number;
      consumed_quantity: number;
      remaining_quantity: number;
      unit: string;
    }>(
      `SELECT id, sold_plan_id, entitlement_name, entitlement_key, purchased_quantity, consumed_quantity, remaining_quantity, unit
       FROM sold_plan_entitlements;`
    );

    const unifiedSoldPlans: ClientPackageDetails[] = soldPlans.map((sp) => {
      const client = clientMap.get(sp.client_id);
      const planEnts = soldEntitlements.filter((e) => e.sold_plan_id === sp.id);

      const hrsEnt = planEnts.find((e) => e.entitlement_key === 'hours');
      const reelsEnt = planEnts.find((e) => e.entitlement_key === 'reels');

      const hoursPurchased = hrsEnt ? Math.round(hrsEnt.purchased_quantity * 60) : 0;
      const hoursUsed = hrsEnt ? Math.round(hrsEnt.consumed_quantity * 60) : 0;
      const hoursRemaining = hrsEnt ? Math.round(hrsEnt.remaining_quantity * 60) : 0;

      const reelsPurchased = reelsEnt ? reelsEnt.purchased_quantity : 0;
      const reelsUsed = reelsEnt ? reelsEnt.consumed_quantity : 0;
      const reelsRemaining = reelsEnt ? reelsEnt.remaining_quantity : 0;

      const isLowBalance =
        (hoursPurchased > 0 && hoursRemaining <= 60 && hoursRemaining > 0) ||
        (reelsPurchased > 0 && reelsRemaining <= 1 && reelsRemaining > 0);

      const isFullyConsumed =
        (hoursPurchased === 0 || hoursRemaining === 0) &&
        (reelsPurchased === 0 || reelsRemaining === 0);

      const mappedItems: ClientPackageItemRecord[] = planEnts.map((e) => ({
        id: e.id,
        client_package_id: sp.id,
        unit: (e.entitlement_key === 'hours' ? 'hours' : 'reels') as PackageUnit,
        purchased_quantity: e.entitlement_key === 'hours' ? Math.round(e.purchased_quantity * 60) : e.purchased_quantity,
        used_quantity: e.entitlement_key === 'hours' ? Math.round(e.consumed_quantity * 60) : e.consumed_quantity,
        reserved_quantity: 0,
        created_at: sp.created_at,
      }));

      return {
        id: sp.id,
        client_id: sp.client_id,
        package_template_id: sp.plan_template_id,
        name_snapshot: sp.name_snapshot,
        sold_price: sp.total_snapshot || sp.price_snapshot,
        purchased_at: sp.start_date,
        status: (sp.service_status === 'active' ? 'active' : sp.service_status === 'completed' ? 'depleted' : 'cancelled') as any,
        notes: sp.notes,
        created_at: sp.created_at,
        updated_at: sp.updated_at,
        clientName: client?.name ?? 'عميل غير معروف',
        clientCompany: client?.company_name ?? null,
        items: mappedItems,
        hoursPurchasedMinutes: hoursPurchased,
        hoursUsedMinutes: hoursUsed,
        hoursReservedMinutes: 0,
        hoursRemainingMinutes: hoursRemaining,
        reelsPurchased,
        reelsUsed,
        reelsReserved: 0,
        reelsRemaining,
        isLowBalance,
        isFullyConsumed,
        paidAmountPiasters: 0,
      };
    });

    return [...unifiedPackages, ...unifiedSoldPlans];
  } catch {
    return unifiedPackages;
  }
}
