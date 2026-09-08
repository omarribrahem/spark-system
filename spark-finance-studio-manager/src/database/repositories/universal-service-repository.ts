/**
 * UniversalServiceRepository:
 * Manages Services, Plan Templates, and Sold Plans with immutable snapshots
 * and atomic entitlement management.
 */

import { IDatabaseDriver } from '../driver/types';
import {
  UniversalServiceDefinition,
  PlanTemplate,
  PlanTemplateEntitlement,
  SoldPlan,
  SoldPlanEntitlement,
  BillingMethod,
  ServiceStatus,
  CollectionStatus,
} from '../../domain/models/universal-service';
import {
  assertIntegerPiasters,
  assertNonEmptyString,
  DomainInvariantError,
} from '../../domain/rules/invariants';

export interface CreateServiceInput {
  name: string;
  serviceTypeKey?: string | null;
  description?: string | null;
  billingMethod: BillingMethod;
  defaultPrice: number; // integer piasters
  currency?: string;
  defaultDurationDays?: number | null;
  unitName?: string | null;
  requiresContract?: boolean;
  hasFixedDates?: boolean;
  autoRenew?: boolean;
  tags?: string | null;
}

export interface CreatePlanTemplateInput {
  serviceId?: string | null;
  name: string;
  description?: string | null;
  defaultPrice: number; // integer piasters
  billingMethod: BillingMethod;
  durationDays?: number | null;
  terms?: string | null;
  tags?: string | null;
  entitlements: Array<{
    name: string;
    key: string;
    quantity: number;
    unit: string;
    allowOverage?: boolean;
    rolloverAllowed?: boolean;
  }>;
}

export interface SellPlanInput {
  clientId: string;
  planTemplateId?: string | null;
  nameSnapshot: string;
  priceSnapshot: number; // integer piasters
  discountSnapshot?: number; // integer piasters
  taxSnapshot?: number; // integer piasters
  billingMethod: BillingMethod;
  termsSnapshot?: string | null;
  startDate: string;
  endDate?: string | null;
  renewalDate?: string | null;
  serviceStatus?: ServiceStatus;
  collectionStatus?: CollectionStatus;
  assignee?: string | null;
  agreementId?: string | null;
  notes?: string | null;
  entitlements: Array<{
    name: string;
    key: string;
    quantity: number;
    unit: string;
    allowOverage?: boolean;
    rolloverAllowed?: boolean;
  }>;
}

export class UniversalServiceRepository {
  constructor(private driver: IDatabaseDriver) {}

  // -------------------------------------------------------------
  // Services Management
  // -------------------------------------------------------------

  public async createService(input: CreateServiceInput): Promise<UniversalServiceDefinition> {
    assertNonEmptyString(input.name, 'service name');
    assertIntegerPiasters(input.defaultPrice, 'defaultPrice');

    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    await this.driver.execute(
      `INSERT INTO service_definitions (
        id, name, service_type_key, description, billing_model, default_price, currency,
        default_duration_days, unit_name, requires_contract, has_fixed_dates, auto_renew,
        active, tags, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?);`,
      [
        id,
        input.name.trim(),
        input.serviceTypeKey?.trim() ?? null,
        input.description?.trim() ?? null,
        input.billingMethod,
        input.defaultPrice,
        input.currency ?? 'EGP',
        input.defaultDurationDays ?? null,
        input.unitName?.trim() ?? null,
        input.requiresContract ? 1 : 0,
        input.hasFixedDates ? 1 : 0,
        input.autoRenew ? 1 : 0,
        input.tags?.trim() ?? null,
        now,
        now,
      ]
    );

    return (await this.getServiceById(id))!;
  }

  public async getServiceById(id: string): Promise<UniversalServiceDefinition | null> {
    const rows = await this.driver.query<UniversalServiceDefinition>(
      `SELECT *, billing_model AS billing_method FROM service_definitions WHERE id = ? LIMIT 1;`,
      [id]
    );
    return rows[0] ?? null;
  }

  public async listServices(activeOnly = false): Promise<UniversalServiceDefinition[]> {
    const where = activeOnly ? 'WHERE active = 1' : '';
    return await this.driver.query<UniversalServiceDefinition>(
      `SELECT *, billing_model AS billing_method FROM service_definitions ${where} ORDER BY created_at ASC;`
    );
  }

  public async updateService(
    id: string,
    updates: Partial<CreateServiceInput> & { active?: number }
  ): Promise<UniversalServiceDefinition> {
    const existing = await this.getServiceById(id);
    if (!existing) throw new Error(`Service ${id} not found`);

    const now = new Date().toISOString();
    const fields: string[] = ['updated_at = ?'];
    const params: unknown[] = [now];

    if (updates.name !== undefined) {
      fields.push('name = ?');
      params.push(updates.name.trim());
    }
    if (updates.serviceTypeKey !== undefined) {
      fields.push('service_type_key = ?');
      params.push(updates.serviceTypeKey?.trim() ?? null);
    }
    if (updates.description !== undefined) {
      fields.push('description = ?');
      params.push(updates.description?.trim() ?? null);
    }
    if (updates.billingMethod !== undefined) {
      fields.push('billing_model = ?');
      params.push(updates.billingMethod);
    }
    if (updates.defaultPrice !== undefined) {
      assertIntegerPiasters(updates.defaultPrice, 'defaultPrice');
      fields.push('default_price = ?');
      params.push(updates.defaultPrice);
    }
    if (updates.active !== undefined) {
      fields.push('active = ?');
      params.push(updates.active);
    }
    if (updates.tags !== undefined) {
      fields.push('tags = ?');
      params.push(updates.tags?.trim() ?? null);
    }

    params.push(id);
    await this.driver.execute(
      `UPDATE service_definitions SET ${fields.join(', ')} WHERE id = ?;`,
      params
    );

    return (await this.getServiceById(id))!;
  }

  // -------------------------------------------------------------
  // Plan Templates Management
  // -------------------------------------------------------------

  public async createPlanTemplate(input: CreatePlanTemplateInput): Promise<PlanTemplate & { entitlements: PlanTemplateEntitlement[] }> {
    assertNonEmptyString(input.name, 'plan template name');
    assertIntegerPiasters(input.defaultPrice, 'defaultPrice');

    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    return await this.driver.transaction(async (tx) => {
      await tx.execute(
        `INSERT INTO plan_templates (
          id, service_id, name, description, default_price, billing_method,
          duration_days, terms, active, sort_order, tags, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 0, ?, ?, ?);`,
        [
          id,
          input.serviceId ?? null,
          input.name.trim(),
          input.description?.trim() ?? null,
          input.defaultPrice,
          input.billingMethod,
          input.durationDays ?? null,
          input.terms?.trim() ?? null,
          input.tags?.trim() ?? null,
          now,
          now,
        ]
      );

      for (let i = 0; i < input.entitlements.length; i++) {
        const ent = input.entitlements[i];
        await tx.execute(
          `INSERT INTO plan_template_entitlements (
            id, plan_template_id, entitlement_name, entitlement_key, quantity, unit,
            allow_overage, rollover_allowed, sort_order, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
          [
            crypto.randomUUID(),
            id,
            ent.name.trim(),
            ent.key.trim().toLowerCase(),
            ent.quantity,
            ent.unit.trim(),
            ent.allowOverage ? 1 : 0,
            ent.rolloverAllowed ? 1 : 0,
            i * 10,
            now,
          ]
        );
      }

      const created = (await this.getPlanTemplateById(id, tx))!;
      return created;
    });
  }

  public async getPlanTemplateById(
    id: string,
    driver: IDatabaseDriver = this.driver
  ): Promise<(PlanTemplate & { entitlements: PlanTemplateEntitlement[] }) | null> {
    const rows = await driver.query<PlanTemplate>(
      `SELECT * FROM plan_templates WHERE id = ? LIMIT 1;`,
      [id]
    );
    if (rows.length === 0) return null;

    const entitlements = await driver.query<PlanTemplateEntitlement>(
      `SELECT * FROM plan_template_entitlements WHERE plan_template_id = ? ORDER BY sort_order ASC;`,
      [id]
    );

    return { ...rows[0], entitlements };
  }

  public async listPlanTemplates(activeOnly = false): Promise<Array<PlanTemplate & { entitlements: PlanTemplateEntitlement[] }>> {
    const where = activeOnly ? 'WHERE active = 1' : '';
    const templates = await this.driver.query<PlanTemplate>(
      `SELECT * FROM plan_templates ${where} ORDER BY sort_order ASC, created_at DESC;`
    );

    const result: Array<PlanTemplate & { entitlements: PlanTemplateEntitlement[] }> = [];
    for (const t of templates) {
      const entitlements = await this.driver.query<PlanTemplateEntitlement>(
        `SELECT * FROM plan_template_entitlements WHERE plan_template_id = ? ORDER BY sort_order ASC;`,
        [t.id]
      );
      result.push({ ...t, entitlements });
    }
    return result;
  }

  // -------------------------------------------------------------
  // Sold Plans & Entitlements Management (with immutable snapshots)
  // -------------------------------------------------------------

  public async sellPlan(input: SellPlanInput): Promise<SoldPlan & { entitlements: SoldPlanEntitlement[] }> {
    assertNonEmptyString(input.clientId, 'clientId');
    assertNonEmptyString(input.nameSnapshot, 'nameSnapshot');
    assertIntegerPiasters(input.priceSnapshot, 'priceSnapshot');

    const discount = input.discountSnapshot ?? 0;
    const tax = input.taxSnapshot ?? 0;
    assertIntegerPiasters(discount, 'discountSnapshot');
    assertIntegerPiasters(tax, 'taxSnapshot');

    const total = input.priceSnapshot - discount + tax;
    assertIntegerPiasters(total, 'total');

    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    return await this.driver.transaction(async (tx) => {
      await tx.execute(
        `INSERT INTO sold_plans (
          id, client_id, plan_template_id, name_snapshot, price_snapshot, discount_snapshot,
          tax_snapshot, total_snapshot, billing_method, terms_snapshot, start_date, end_date,
          renewal_date, service_status, collection_status, assignee, agreement_id, notes,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        [
          id,
          input.clientId,
          input.planTemplateId ?? null,
          input.nameSnapshot.trim(),
          input.priceSnapshot,
          discount,
          tax,
          total,
          input.billingMethod,
          input.termsSnapshot?.trim() ?? null,
          input.startDate,
          input.endDate ?? null,
          input.renewalDate ?? null,
          input.serviceStatus ?? 'active',
          input.collectionStatus ?? 'unpaid',
          input.assignee?.trim() ?? null,
          input.agreementId ?? null,
          input.notes?.trim() ?? null,
          now,
          now,
        ]
      );

      for (let i = 0; i < input.entitlements.length; i++) {
        const ent = input.entitlements[i];
        await tx.execute(
          `INSERT INTO sold_plan_entitlements (
            id, sold_plan_id, entitlement_name, entitlement_key, quantity_initial,
            quantity_used, quantity_reserved, quantity_remaining, unit, allow_overage,
            rollover_allowed, sort_order, created_at
          ) VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?, ?, ?);`,
          [
            crypto.randomUUID(),
            id,
            ent.name.trim(),
            ent.key.trim().toLowerCase(),
            ent.quantity,
            ent.quantity,
            ent.unit.trim(),
            ent.allowOverage ? 1 : 0,
            ent.rolloverAllowed ? 1 : 0,
            i * 10,
            now,
          ]
        );
      }

      // Log to general_audit_logs
      await tx.execute(
        `INSERT INTO general_audit_logs (
          id, entity_type, entity_id, action, user_id, change_reason, old_values_json, new_values_json, timestamp
        ) VALUES (?, 'sold_plan', ?, 'PLAN_SOLD', ?, 'بيع خطة للعميل مع تثبيت اللقطة التاريخية للبنود والأسعار', NULL, ?, ?);`,
        [
          crypto.randomUUID(),
          id,
          input.assignee ?? 'system',
          JSON.stringify({
            clientId: input.clientId,
            name: input.nameSnapshot,
            total,
            entitlementsCount: input.entitlements.length,
          }),
          now,
        ]
      );

      const sold = (await this.getSoldPlanById(id, tx))!;
      return sold;
    });
  }

  public async getSoldPlanById(
    id: string,
    driver: IDatabaseDriver = this.driver
  ): Promise<(SoldPlan & { entitlements: SoldPlanEntitlement[] }) | null> {
    const rows = await driver.query<SoldPlan>(
      `SELECT * FROM sold_plans WHERE id = ? LIMIT 1;`,
      [id]
    );
    if (rows.length === 0) return null;

    const entitlements = await driver.query<SoldPlanEntitlement>(
      `SELECT * FROM sold_plan_entitlements WHERE sold_plan_id = ? ORDER BY sort_order ASC;`,
      [id]
    );

    return { ...rows[0], entitlements };
  }

  public async listSoldPlans(clientId?: string): Promise<Array<SoldPlan & { entitlements: SoldPlanEntitlement[]; clientName: string }>> {
    const where = clientId ? 'WHERE sp.client_id = ?' : '';
    const params = clientId ? [clientId] : [];

    const plans = await this.driver.query<SoldPlan & { clientName: string }>(
      `SELECT sp.*, c.name AS clientName
       FROM sold_plans sp
       JOIN clients c ON sp.client_id = c.id
       ${where}
       ORDER BY sp.created_at DESC;`,
      params
    );

    const result: Array<SoldPlan & { entitlements: SoldPlanEntitlement[]; clientName: string }> = [];
    for (const p of plans) {
      const entitlements = await this.driver.query<SoldPlanEntitlement>(
        `SELECT * FROM sold_plan_entitlements WHERE sold_plan_id = ? ORDER BY sort_order ASC;`,
        [p.id]
      );
      result.push({ ...p, entitlements });
    }
    return result;
  }

  /**
   * Consumes an entitlement unit from a sold plan atomically.
   */
  public async consumeEntitlement(
    soldPlanId: string,
    entitlementKey: string,
    quantity = 1,
    driver: IDatabaseDriver = this.driver
  ): Promise<void> {
    const rows = await driver.query<SoldPlanEntitlement>(
      `SELECT * FROM sold_plan_entitlements WHERE sold_plan_id = ? AND entitlement_key = ? LIMIT 1;`,
      [soldPlanId, entitlementKey]
    );
    if (rows.length === 0) {
      throw new DomainInvariantError(`بند الاستحقاق "${entitlementKey}" غير موجود في هذه الخطة`);
    }

    const ent = rows[0];
    if (ent.allow_overage !== 1 && ent.quantity_remaining < quantity) {
      throw new DomainInvariantError(
        `رصيد الاستحقاق "${ent.entitlement_name}" غير كافٍ. المتبقي: ${ent.quantity_remaining}`
      );
    }

    const newUsed = ent.quantity_used + quantity;
    const newRemaining = Math.max(0, ent.quantity_initial - newUsed);

    await driver.execute(
      `UPDATE sold_plan_entitlements
       SET quantity_used = ?, quantity_remaining = ?
       WHERE id = ?;`,
      [newUsed, newRemaining, ent.id]
    );
  }

  /**
   * Restores an entitlement unit to a sold plan atomically.
   */
  public async restoreEntitlement(
    soldPlanId: string,
    entitlementKey: string,
    quantity = 1,
    driver: IDatabaseDriver = this.driver
  ): Promise<void> {
    const rows = await driver.query<SoldPlanEntitlement>(
      `SELECT * FROM sold_plan_entitlements WHERE sold_plan_id = ? AND entitlement_key = ? LIMIT 1;`,
      [soldPlanId, entitlementKey]
    );
    if (rows.length === 0) return;

    const ent = rows[0];
    const newUsed = Math.max(0, ent.quantity_used - quantity);
    const newRemaining = Math.min(ent.quantity_initial, ent.quantity_initial - newUsed);

    await driver.execute(
      `UPDATE sold_plan_entitlements
       SET quantity_used = ?, quantity_remaining = ?
       WHERE id = ?;`,
      [newUsed, newRemaining, ent.id]
    );
  }
}
