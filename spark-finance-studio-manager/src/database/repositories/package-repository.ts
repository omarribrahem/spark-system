/**
 * PackageRepository: Persistence for Sold Client Packages, Immutable Snapshot Locking,
 * Decoupled Entitlement Ledger (Minutes / Reels), and FIFO Consumption.
 */

import { IDatabaseDriver } from '../driver/types';
import {
  PackageUnit,
  PackageStatus,
} from '../../domain/models/package';
import {
  assertIntegerPiasters,
  assertIntegerMinutes,
  assertNonEmptyString,
  assertValidDateString,
  DomainInvariantError,
} from '../../domain/rules/invariants';

export interface ClientPackageRecord {
  id: string;
  client_id: string;
  package_template_id: string | null;
  name_snapshot: string;
  sold_price: number; // integer piasters
  purchased_at: string; // 'YYYY-MM-DD'
  status: PackageStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClientPackageItemRecord {
  id: string;
  client_package_id: string;
  unit: PackageUnit;
  purchased_quantity: number;
  used_quantity: number;
  reserved_quantity: number;
}

export interface ClientPackageWithItems extends ClientPackageRecord {
  items: ClientPackageItemRecord[];
}

export interface CreatePackageItemInput {
  unit: PackageUnit;
  quantity: number; // minutes for hours, count for reels
}

export interface CreateClientPackageInput {
  id?: string;
  clientId: string;
  packageTemplateId?: string | null;
  nameSnapshot: string;
  soldPrice: number; // integer piasters
  purchasedAt: string; // 'YYYY-MM-DD'
  notes?: string | null;
  items: CreatePackageItemInput[];
}

export class PackageRepository {
  constructor(private driver: IDatabaseDriver) {}

  /**
   * Creates a client package with immutable snapshots and child entitlement items.
   */
  public async createClientPackage(
    input: CreateClientPackageInput
  ): Promise<ClientPackageWithItems> {
    const packageId = input.id ?? crypto.randomUUID();
    const clientId = assertNonEmptyString(input.clientId, 'clientId');
    const nameSnapshot = assertNonEmptyString(input.nameSnapshot, 'nameSnapshot');
    assertIntegerPiasters(input.soldPrice, 'soldPrice');
    assertValidDateString(input.purchasedAt, 'purchasedAt');

    if (!input.items || input.items.length === 0) {
      throw new DomainInvariantError('Client package must contain at least one entitlement item');
    }

    const now = new Date().toISOString();

    return await this.driver.transaction(async (tx) => {
      // 1. Insert Client Package
      await tx.execute(
        `INSERT INTO client_packages (
          id, client_id, package_template_id, name_snapshot, sold_price, purchased_at, status, notes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'not_started', ?, ?, ?);`,
        [
          packageId,
          clientId,
          input.packageTemplateId ?? null,
          nameSnapshot,
          input.soldPrice,
          input.purchasedAt,
          input.notes ?? null,
          now,
          now,
        ]
      );

      // 2. Insert Entitlement Items
      const createdItems: ClientPackageItemRecord[] = [];
      for (const it of input.items) {
        assertIntegerMinutes(it.quantity, `item.${it.unit}.quantity`);
        if (it.quantity <= 0) {
          throw new DomainInvariantError(`Entitlement quantity must be positive, got: ${it.quantity}`);
        }

        const itemId = crypto.randomUUID();
        await tx.execute(
          `INSERT INTO client_package_items (
            id, client_package_id, unit, purchased_quantity, used_quantity, reserved_quantity
          ) VALUES (?, ?, ?, ?, 0, 0);`,
          [itemId, packageId, it.unit, it.quantity]
        );

        createdItems.push({
          id: itemId,
          client_package_id: packageId,
          unit: it.unit,
          purchased_quantity: it.quantity,
          used_quantity: 0,
          reserved_quantity: 0,
        });
      }

      // 3. Activity Log
      await tx.execute(
        `INSERT INTO activity_log (id, action, entity_type, entity_id, timestamp, note, payload_json)
         VALUES (?, 'PACKAGE_CREATED', 'package', ?, ?, ?, ?);`,
        [
          crypto.randomUUID(),
          packageId,
          now,
          `Package "${nameSnapshot}" purchased for client ${clientId}`,
          JSON.stringify({
            nameSnapshot,
            soldPrice: input.soldPrice,
            itemsCount: createdItems.length,
          }),
        ]
      );

      return {
        id: packageId,
        client_id: clientId,
        package_template_id: input.packageTemplateId ?? null,
        name_snapshot: nameSnapshot,
        sold_price: input.soldPrice,
        purchased_at: input.purchasedAt,
        status: 'not_started',
        notes: input.notes ?? null,
        created_at: now,
        updated_at: now,
        items: createdItems,
      };
    });
  }

  /**
   * Consumes an amount of units (minutes for hours, count for reels) from a specific client package.
   */
  public async consumePackageItem(
    clientPackageId: string,
    unit: PackageUnit,
    amount: number
  ): Promise<void> {
    assertNonEmptyString(clientPackageId, 'clientPackageId');
    assertIntegerMinutes(amount, 'amount');

    if (amount <= 0) return;

    await this.driver.transaction(async (tx) => {
      const itemRows = await tx.query<ClientPackageItemRecord>(
        `SELECT id, client_package_id, unit, purchased_quantity, used_quantity, reserved_quantity
         FROM client_package_items
         WHERE client_package_id = ? AND unit = ? LIMIT 1;`,
        [clientPackageId, unit]
      );

      if (itemRows.length === 0) {
        throw new DomainInvariantError(
          `Package ${clientPackageId} does not contain unit "${unit}"`
        );
      }

      const item = itemRows[0];
      const available = item.purchased_quantity - item.used_quantity;
      if (amount > available) {
        throw new DomainInvariantError(
          `Cannot consume ${amount} ${unit}: only ${available} available in package ${clientPackageId}`
        );
      }

      const newUsed = item.used_quantity + amount;
      await tx.execute(
        `UPDATE client_package_items
         SET used_quantity = ?
         WHERE id = ?;`,
        [newUsed, item.id]
      );

      // Check all items to update package status
      const allItems = await tx.query<ClientPackageItemRecord>(
        `SELECT id, client_package_id, unit, purchased_quantity, used_quantity, reserved_quantity
         FROM client_package_items
         WHERE client_package_id = ?;`,
        [clientPackageId]
      );

      const allFullyUsed = allItems.every((it) => it.used_quantity >= it.purchased_quantity);
      const anyUsed = allItems.some((it) => it.used_quantity > 0 || it.reserved_quantity > 0);

      const newStatus: PackageStatus = allFullyUsed
        ? 'fully_used'
        : anyUsed
        ? 'active'
        : 'not_started';

      const now = new Date().toISOString();
      await tx.execute(
        `UPDATE client_packages SET status = ?, updated_at = ? WHERE id = ?;`,
        [newStatus, now, clientPackageId]
      );

      // Activity Log
      await tx.execute(
        `INSERT INTO activity_log (id, action, entity_type, entity_id, timestamp, note, payload_json)
         VALUES (?, 'PACKAGE_CONSUMED', 'package', ?, ?, ?, ?);`,
        [
          crypto.randomUUID(),
          clientPackageId,
          now,
          `Consumed ${amount} ${unit} from package ${clientPackageId}`,
          JSON.stringify({ unit, amount, newUsed, remaining: item.purchased_quantity - newUsed }),
        ]
      );
    });
  }

  /**
   * Reverses a previously consumed entitlement. This is used only when a
   * delivered reel is deliberately moved back into the production workflow.
   */
  public async restorePackageItem(
    clientPackageId: string,
    unit: PackageUnit,
    amount: number
  ): Promise<void> {
    assertNonEmptyString(clientPackageId, 'clientPackageId');
    assertIntegerMinutes(amount, 'amount');
    if (amount <= 0) return;

    await this.driver.transaction(async (tx) => {
      const itemRows = await tx.query<ClientPackageItemRecord>(
        `SELECT id, client_package_id, unit, purchased_quantity, used_quantity, reserved_quantity
         FROM client_package_items
         WHERE client_package_id = ? AND unit = ? LIMIT 1;`,
        [clientPackageId, unit]
      );
      if (itemRows.length === 0) {
        throw new DomainInvariantError(`Package ${clientPackageId} does not contain unit "${unit}"`);
      }

      const item = itemRows[0];
      if (amount > item.used_quantity) {
        throw new DomainInvariantError(
          `Cannot restore ${amount} ${unit}: only ${item.used_quantity} have been consumed in package ${clientPackageId}`
        );
      }

      const newUsed = item.used_quantity - amount;
      await tx.execute('UPDATE client_package_items SET used_quantity = ? WHERE id = ?', [newUsed, item.id]);

      const allItems = await tx.query<ClientPackageItemRecord>(
        `SELECT id, client_package_id, unit, purchased_quantity, used_quantity, reserved_quantity
         FROM client_package_items WHERE client_package_id = ?;`,
        [clientPackageId]
      );
      const allFullyUsed = allItems.every((it) => it.used_quantity >= it.purchased_quantity);
      const anyUsed = allItems.some((it) => it.used_quantity > 0 || it.reserved_quantity > 0);
      const status: PackageStatus = allFullyUsed ? 'fully_used' : anyUsed ? 'active' : 'not_started';
      const now = new Date().toISOString();

      await tx.execute('UPDATE client_packages SET status = ?, updated_at = ? WHERE id = ?', [
        status,
        now,
        clientPackageId,
      ]);
      await tx.execute(
        `INSERT INTO activity_log (id, action, entity_type, entity_id, timestamp, note, payload_json)
         VALUES (?, 'PACKAGE_CONSUMPTION_RESTORED', 'package', ?, ?, ?, ?);`,
        [
          crypto.randomUUID(),
          clientPackageId,
          now,
          `Restored ${amount} ${unit} to package ${clientPackageId}`,
          JSON.stringify({ unit, amount, newUsed, remaining: item.purchased_quantity - newUsed }),
        ]
      );
    });
  }

  public async getById(clientPackageId: string): Promise<ClientPackageWithItems | null> {
    const pkgRows = await this.driver.query<ClientPackageRecord>(
      `SELECT id, client_id, package_template_id, name_snapshot, sold_price, purchased_at, status, notes, created_at, updated_at
       FROM client_packages WHERE id = ? LIMIT 1;`,
      [clientPackageId]
    );

    if (pkgRows.length === 0) return null;

    const items = await this.driver.query<ClientPackageItemRecord>(
      `SELECT id, client_package_id, unit, purchased_quantity, used_quantity, reserved_quantity
       FROM client_package_items WHERE client_package_id = ?;`,
      [clientPackageId]
    );

    return {
      ...pkgRows[0],
      items,
    };
  }

  public async listByClient(clientId: string): Promise<ClientPackageWithItems[]> {
    const packages = await this.driver.query<ClientPackageRecord>(
      `SELECT id, client_id, package_template_id, name_snapshot, sold_price, purchased_at, status, notes, created_at, updated_at
       FROM client_packages
       WHERE client_id = ?
       ORDER BY purchased_at DESC, created_at DESC;`,
      [clientId]
    );

    const result: ClientPackageWithItems[] = [];
    for (const pkg of packages) {
      const items = await this.driver.query<ClientPackageItemRecord>(
        `SELECT id, client_package_id, unit, purchased_quantity, used_quantity, reserved_quantity
         FROM client_package_items WHERE client_package_id = ?;`,
        [pkg.id]
      );
      result.push({ ...pkg, items });
    }

    return result;
  }

  public async listActivePackages(clientId: string): Promise<ClientPackageWithItems[]> {
    const packages = await this.driver.query<ClientPackageRecord>(
      `SELECT id, client_id, package_template_id, name_snapshot, sold_price, purchased_at, status, notes, created_at, updated_at
       FROM client_packages
       WHERE client_id = ? AND status IN ('not_started', 'active')
       ORDER BY purchased_at ASC, created_at ASC;`,
      [clientId]
    );

    const result: ClientPackageWithItems[] = [];
    for (const pkg of packages) {
      const items = await this.driver.query<ClientPackageItemRecord>(
        `SELECT id, client_package_id, unit, purchased_quantity, used_quantity, reserved_quantity
         FROM client_package_items WHERE client_package_id = ?;`,
        [pkg.id]
      );
      result.push({ ...pkg, items });
    }

    return result;
  }
}
