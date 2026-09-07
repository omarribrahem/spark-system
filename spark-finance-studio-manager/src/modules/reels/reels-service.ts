/**
 * ReelsService: Pipeline management, 5-stage state machine transitions,
 * and optional linkage to client packages and studio bookings.
 */

import { IDatabaseDriver } from '../../database/driver/types';
import { PackageRepository } from '../../database/repositories/package-repository';
import { assertNonEmptyString } from '../../domain/rules/invariants';

export type ReelStage = 'planned' | 'filmed' | 'editing' | 'review' | 'delivered';

export interface ReelRecord {
  id: string;
  client_id: string;
  client_package_id: string | null;
  studio_booking_id: string | null;
  status: string;
  title: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReelItemWithDetails extends ReelRecord {
  clientName: string;
  clientCompany: string | null;
  packageNameSnapshot: string | null;
  stage: ReelStage;
  targetDate: string | null;
}

export interface SaveReelInput {
  id?: string;
  clientId: string;
  clientPackageId?: string | null;
  studioBookingId?: string | null;
  status?: string;
  title: string;
  notes?: string | null;
  targetDate?: string | null;
}

export const REEL_STAGES: Array<{
  id: ReelStage;
  title: string;
  colorClass: string;
  borderClass: string;
  badgeClass: string;
}> = [
  {
    id: 'planned',
    title: 'المخطط (Planned)',
    colorClass: 'bg-blue-50 text-blue-700',
    borderClass: 'border-blue-200',
    badgeClass: 'bg-blue-100 text-blue-800',
  },
  {
    id: 'filmed',
    title: 'تم التصوير (Filmed)',
    colorClass: 'bg-amber-50 text-amber-700',
    borderClass: 'border-amber-200',
    badgeClass: 'bg-amber-100 text-amber-800',
  },
  {
    id: 'editing',
    title: 'قيد المونتاج (In Editing)',
    colorClass: 'bg-purple-50 text-purple-700',
    borderClass: 'border-purple-200',
    badgeClass: 'bg-purple-100 text-purple-800',
  },
  {
    id: 'review',
    title: 'قيد المراجعة (Review)',
    colorClass: 'bg-indigo-50 text-indigo-700',
    borderClass: 'border-indigo-200',
    badgeClass: 'bg-indigo-100 text-indigo-800',
  },
  {
    id: 'delivered',
    title: 'تم التسليم (Delivered)',
    colorClass: 'bg-emerald-50 text-emerald-700',
    borderClass: 'border-emerald-200',
    badgeClass: 'bg-emerald-100 text-emerald-800',
  },
];

/**
 * Normalizes raw status strings to 5 canonical Kanban stages
 */
export function normalizeReelStage(rawStatus: string): ReelStage {
  const s = rawStatus.toLowerCase();
  if (s === 'available' || s === 'planned') return 'planned';
  if (s === 'filmed') return 'filmed';
  if (s === 'editing' || s === 'in_editing') return 'editing';
  if (s === 'review' || s === 'in_review') return 'review';
  if (s === 'delivered' || s === 'completed') return 'delivered';
  return 'planned';
}

/**
 * Gets next stage in standard happy path progression
 */
export function getNextReelStage(current: ReelStage): ReelStage | null {
  switch (current) {
    case 'planned':
      return 'filmed';
    case 'filmed':
      return 'editing';
    case 'editing':
      return 'review';
    case 'review':
      return 'delivered';
    case 'delivered':
      return null;
  }
}

/**
 * Gets previous stage for reverting
 */
export function getPreviousReelStage(current: ReelStage): ReelStage | null {
  switch (current) {
    case 'delivered':
      return 'review';
    case 'review':
      return 'editing';
    case 'editing':
      return 'filmed';
    case 'filmed':
      return 'planned';
    case 'planned':
      return null;
  }
}

/**
 * Parses target date from notes tag [target:YYYY-MM-DD] if present
 */
export function extractTargetDateFromNotes(notes: string | null): {
  cleanNotes: string;
  targetDate: string | null;
} {
  if (!notes) return { cleanNotes: '', targetDate: null };
  const match = notes.match(/\[target:([0-9]{4}-[0-9]{2}-[0-9]{2})\]/);
  if (match) {
    const targetDate = match[1];
    const cleanNotes = notes.replace(match[0], '').trim();
    return { cleanNotes, targetDate };
  }
  return { cleanNotes: notes, targetDate: null };
}

/**
 * Encodes target date into notes tag
 */
export function formatNotesWithTargetDate(notes: string | null, targetDate?: string | null): string {
  let base = (notes || '').replace(/\[target:[0-9]{4}-[0-9]{2}-[0-9]{2}\]/, '').trim();
  if (targetDate) {
    base = base ? `${base} [target:${targetDate}]` : `[target:${targetDate}]`;
  }
  return base;
}

/**
 * Fetches all reel items with joined client and package details
 */
export async function fetchReels(
  driver: IDatabaseDriver,
  filterClientId?: string | null
): Promise<ReelItemWithDetails[]> {
  const whereClause = filterClientId ? `WHERE r.client_id = ?` : '';
  const params = filterClientId ? [filterClientId] : [];

  const rows = await driver.query<ReelRecord>(
    `SELECT r.id, r.client_id, r.client_package_id, r.studio_booking_id,
            r.status, r.title, r.notes, r.created_at, r.updated_at
     FROM reel_items r
     ${whereClause}
     ORDER BY r.updated_at DESC, r.created_at DESC;`,
    params
  );

  const clientRows = await driver.query<{ id: string; name: string; company_name: string | null }>(
    `SELECT id, name, company_name FROM clients;`
  );
  const clientMap = new Map<string, { name: string; company_name: string | null }>();
  clientRows.forEach((c) => clientMap.set(c.id, c));

  const packageRows = await driver.query<{ id: string; name_snapshot: string }>(
    `SELECT id, name_snapshot FROM client_packages;`
  );
  const packageMap = new Map<string, string>();
  packageRows.forEach((p) => packageMap.set(p.id, p.name_snapshot));

  return rows.map((r) => {
    const client = clientMap.get(r.client_id);
    const packageName = r.client_package_id ? packageMap.get(r.client_package_id) || null : null;
    const stage = normalizeReelStage(r.status);
    const { cleanNotes, targetDate } = extractTargetDateFromNotes(r.notes);

    return {
      ...r,
      notes: cleanNotes,
      clientName: client?.name ?? 'عميل غير معروف',
      clientCompany: client?.company_name ?? null,
      packageNameSnapshot: packageName,
      stage,
      targetDate: targetDate || r.created_at.split('T')[0],
    };
  });
}

/**
 * Advances or changes the stage of a reel.
 * A package entitlement is consumed precisely while a linked reel is delivered;
 * reverting the reel restores it, preventing repeated delivery from double-counting.
 */
export async function updateReelStage(
  driver: IDatabaseDriver,
  reelId: string,
  newStage: ReelStage
): Promise<void> {
  assertNonEmptyString(reelId, 'reelId');

  const existing = await driver.query<ReelRecord>(
    `SELECT id, client_id, client_package_id, studio_booking_id, status, title, notes, created_at, updated_at
     FROM reel_items WHERE id = ? LIMIT 1;`,
    [reelId]
  );

  if (existing.length === 0) {
    throw new Error(`Reel ${reelId} not found`);
  }

  const reel = existing[0];
  const oldStage = normalizeReelStage(reel.status);
  const now = new Date().toISOString();

  await driver.transaction(async (tx) => {
    const packageRepo = reel.client_package_id ? new PackageRepository(tx) : null;
    if (newStage === 'delivered' && oldStage !== 'delivered' && reel.client_package_id) {
      await packageRepo?.consumePackageItem(reel.client_package_id, 'reels', 1);
    } else if (oldStage === 'delivered' && newStage !== 'delivered' && reel.client_package_id) {
      await packageRepo?.restorePackageItem(reel.client_package_id, 'reels', 1);
    }

    await tx.execute(
      `UPDATE reel_items SET status = ?, updated_at = ? WHERE id = ?;`,
      [newStage, now, reelId]
    );
  });
}

/**
 * Creates or updates a reel item
 */
export async function saveReel(
  driver: IDatabaseDriver,
  input: SaveReelInput
): Promise<string> {
  const clientId = assertNonEmptyString(input.clientId, 'clientId');
  const title = assertNonEmptyString(input.title, 'title');
  const stage = input.status || 'planned';
  const now = new Date().toISOString();
  const fullNotes = formatNotesWithTargetDate(input.notes || null, input.targetDate);

  if (input.id) {
    await driver.execute(
      `UPDATE reel_items
       SET client_id = ?, client_package_id = ?, status = ?, title = ?, notes = ?, updated_at = ?
       WHERE id = ?;`,
      [
        clientId,
        input.clientPackageId ?? null,
        stage,
        title,
        fullNotes || null,
        now,
        input.id,
      ]
    );
    return input.id;
  } else {
    const reelId = crypto.randomUUID();
    await driver.execute(
      `INSERT INTO reel_items (
        id, client_id, client_package_id, studio_booking_id, status, title, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        reelId,
        clientId,
        input.clientPackageId ?? null,
        input.studioBookingId ?? null,
        stage,
        title,
        fullNotes || null,
        now,
        now,
      ]
    );
    return reelId;
  }
}
