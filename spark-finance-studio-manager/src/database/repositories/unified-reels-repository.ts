/**
 * UnifiedReelsRepository:
 * Manages production reels, custom workflow stages, and strict idempotent
 * entitlement deduction/restoration on sold plans.
 */

import { IDatabaseDriver } from '../driver/types';
import { WorkflowStage, DEFAULT_REEL_STAGES } from '../../domain/models/universal-service';
import { UniversalServiceRepository } from './universal-service-repository';
import { PackageRepository } from './package-repository';
import {
  assertNonEmptyString,
  DomainInvariantError,
} from '../../domain/rules/invariants';

export interface ReelWithDetails {
  id: string;
  client_id: string;
  client_package_id: string | null;
  sold_plan_id: string | null;
  studio_booking_id: string | null;
  status: string; // stage key
  title: string | null;
  notes: string | null;
  assignee: string | null;
  priority: string;
  target_date: string | null;
  filmed_date: string | null;
  delivered_date: string | null;
  external_links: string | null;
  tags: string | null;
  created_at: string;
  updated_at: string;
  clientName: string;
  clientCompany: string | null;
  planNameSnapshot: string | null;
}

export interface SaveReelRecordInput {
  id?: string;
  clientId: string;
  soldPlanId?: string | null;
  studioBookingId?: string | null;
  status?: string;
  title: string;
  notes?: string | null;
  assignee?: string | null;
  priority?: string;
  targetDate?: string | null;
  filmedDate?: string | null;
  deliveredDate?: string | null;
  externalLinks?: string | null;
  tags?: string | null;
}

export class UnifiedReelsRepository {
  private serviceRepo: UniversalServiceRepository;

  constructor(private driver: IDatabaseDriver) {
    this.serviceRepo = new UniversalServiceRepository(driver);
  }

  public async listWorkflowStages(): Promise<WorkflowStage[]> {
    const rows = await this.driver.query<WorkflowStage>(
      `SELECT * FROM workflow_stages WHERE workflow_type = 'reel' AND active = 1 ORDER BY sort_order ASC;`
    );
    if (rows.length === 0) {
      return DEFAULT_REEL_STAGES.map((s, idx) => ({
        id: `def-${idx}`,
        workflow_type: 'reel',
        stage_key: s.stage_key,
        label: s.label,
        color_class: s.color_class,
        sort_order: s.sort_order,
        is_protected: s.is_protected,
        active: 1,
      }));
    }
    return rows;
  }

  public async saveReel(input: SaveReelRecordInput): Promise<ReelWithDetails> {
    assertNonEmptyString(input.clientId, 'clientId');
    assertNonEmptyString(input.title, 'title');

    const id = input.id ?? crypto.randomUUID();
    const now = new Date().toISOString();
    const status = input.status ?? 'planned';

    return await this.driver.transaction(async (tx) => {
      // If updating, check existing
      const existing = await tx.query<{ id: string; status: string; client_id: string; sold_plan_id: string | null }>(
        `SELECT id, status, client_id, sold_plan_id FROM reel_items WHERE id = ? LIMIT 1;`,
        [id]
      );

      if (existing.length > 0) {
        // Validate plan ownership
        if (input.soldPlanId) {
          const plan = await tx.query<{ client_id: string }>(
            `SELECT client_id FROM sold_plans WHERE id = ? LIMIT 1;`,
            [input.soldPlanId]
          );
          if (plan.length > 0 && plan[0].client_id !== input.clientId) {
            throw new DomainInvariantError('لا يمكن ربط الريل بخطة تتبع عميلاً آخر');
          }
        }

        await tx.execute(
          `UPDATE reel_items SET
            client_id = ?, sold_plan_id = ?, studio_booking_id = ?, status = ?,
            title = ?, notes = ?, assignee = ?, priority = ?, target_date = ?,
            filmed_date = ?, delivered_date = ?, external_links = ?, tags = ?,
            updated_at = ?
           WHERE id = ?;`,
          [
            input.clientId,
            input.soldPlanId ?? null,
            input.studioBookingId ?? null,
            status,
            input.title.trim(),
            input.notes?.trim() ?? null,
            input.assignee?.trim() ?? null,
            input.priority ?? 'normal',
            input.targetDate ?? null,
            input.filmedDate ?? null,
            input.deliveredDate ?? null,
            input.externalLinks?.trim() ?? null,
            input.tags?.trim() ?? null,
            now,
            id,
          ]
        );
      } else {
        await tx.execute(
          `INSERT INTO reel_items (
            id, client_id, client_package_id, sold_plan_id, studio_booking_id,
            status, title, notes, assignee, priority, target_date, filmed_date,
            delivered_date, external_links, tags, created_at, updated_at
          ) VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
          [
            id,
            input.clientId,
            input.soldPlanId ?? null,
            input.studioBookingId ?? null,
            status,
            input.title.trim(),
            input.notes?.trim() ?? null,
            input.assignee?.trim() ?? null,
            input.priority ?? 'normal',
            input.targetDate ?? null,
            input.filmedDate ?? null,
            input.deliveredDate ?? null,
            input.externalLinks?.trim() ?? null,
            input.tags?.trim() ?? null,
            now,
            now,
          ]
        );
      }

      const res = (await this.getReelById(id, tx))!;
      return res;
    });
  }

  public async getReelById(id: string, driver: IDatabaseDriver = this.driver): Promise<ReelWithDetails | null> {
    const rows = await driver.query<ReelWithDetails>(
      `SELECT r.*, c.name AS clientName, c.company_name AS clientCompany, sp.name_snapshot AS planNameSnapshot
       FROM reel_items r
       JOIN clients c ON r.client_id = c.id
       LEFT JOIN sold_plans sp ON r.sold_plan_id = sp.id
       WHERE r.id = ? LIMIT 1;`,
      [id]
    );
    return rows[0] ?? null;
  }

  public async listReels(filter?: { clientId?: string; status?: string; soldPlanId?: string }): Promise<ReelWithDetails[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filter?.clientId) {
      conditions.push('r.client_id = ?');
      params.push(filter.clientId);
    }
    if (filter?.status && filter.status !== 'all') {
      conditions.push('r.status = ?');
      params.push(filter.status);
    }
    if (filter?.soldPlanId) {
      conditions.push('r.sold_plan_id = ?');
      params.push(filter.soldPlanId);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    return await this.driver.query<ReelWithDetails>(
      `SELECT r.*, c.name AS clientName, c.company_name AS clientCompany, sp.name_snapshot AS planNameSnapshot
       FROM reel_items r
       JOIN clients c ON r.client_id = c.id
       LEFT JOIN sold_plans sp ON r.sold_plan_id = sp.id
       ${where}
       ORDER BY r.updated_at DESC, r.created_at DESC;`,
      params
    );
  }

  /**
   * Transitions a reel stage with idempotent entitlement deduction.
   */
  public async transitionStage(reelId: string, targetStage: string): Promise<void> {
    assertNonEmptyString(reelId, 'reelId');
    assertNonEmptyString(targetStage, 'targetStage');

    await this.driver.transaction(async (tx) => {
      const rows = await tx.query<{
        id: string;
        status: string;
        client_id: string;
        sold_plan_id: string | null;
        client_package_id: string | null;
      }>(
        `SELECT id, status, client_id, sold_plan_id, client_package_id FROM reel_items WHERE id = ? LIMIT 1;`,
        [reelId]
      );

      if (rows.length === 0) throw new Error(`Reel ${reelId} not found`);
      const reel = rows[0];
      const prevStage = reel.status;

      // Idempotency: if already in target stage, do nothing!
      if (prevStage === targetStage) return;

      const now = new Date().toISOString();
      const planId = reel.sold_plan_id;

      // 1. Moving INTO 'delivered'
      if (targetStage === 'delivered' && prevStage !== 'delivered') {
        if (planId) {
          await this.serviceRepo.consumeEntitlement(planId, 'reels', 1, tx);
        }
        if (reel.client_package_id) {
          const pkgRepo = new PackageRepository(tx);
          await pkgRepo.consumePackageItem(reel.client_package_id, 'reels', 1);
        }
        await tx.execute(
          `UPDATE reel_items SET status = ?, delivered_date = ?, updated_at = ? WHERE id = ?;`,
          [targetStage, now.split('T')[0], now, reelId]
        );
        return;
      }

      // 2. Moving OUT of 'delivered' (or cancelled from delivered)
      if (prevStage === 'delivered' && targetStage !== 'delivered') {
        if (planId) {
          await this.serviceRepo.restoreEntitlement(planId, 'reels', 1, tx);
        }
        if (reel.client_package_id) {
          const pkgRepo = new PackageRepository(tx);
          await pkgRepo.restorePackageItem(reel.client_package_id, 'reels', 1);
        }
        await tx.execute(
          `UPDATE reel_items SET status = ?, updated_at = ? WHERE id = ?;`,
          [targetStage, now, reelId]
        );
        return;
      }

      // 3. Regular transition between other stages
      await tx.execute(
        `UPDATE reel_items SET status = ?, updated_at = ? WHERE id = ?;`,
        [targetStage, now, reelId]
      );
    });
  }
}
