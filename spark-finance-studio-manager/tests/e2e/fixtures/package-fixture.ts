import { IDatabaseDriver } from '../harness/test-database';

export interface PackageSoldData {
  id?: string;
  clientId: string;
  templateId?: string;
  packageName: string;
  soldPricePiasters: number;
  purchaseDate: string;
  hoursMinutesQuota: number; // integer minutes (e.g. 10 hours = 600)
  reelsQuota?: number;       // integer count (e.g. 3)
}

export class PackageFixture {
  constructor(private driver: IDatabaseDriver) {}

  public async sellPackage(data: PackageSoldData): Promise<{ packageId: string; hoursItemId: string; reelsItemId?: string }> {
    const packageId = data.id || `pkg_${Math.random().toString(36).substring(2, 9)}`;

    await this.driver.execute(
      `INSERT INTO client_packages (id, client_id, template_id, package_name_snapshot, sold_price, paid_amount, purchase_date, status)
       VALUES (?, ?, ?, ?, ?, 0, ?, 'not_started')`,
      [packageId, data.clientId, data.templateId || null, data.packageName, data.soldPricePiasters, data.purchaseDate]
    );

    // Create hours item
    const hoursItemId = `pkg_item_hours_${Math.random().toString(36).substring(2, 9)}`;
    await this.driver.execute(
      `INSERT INTO client_package_items (id, client_package_id, unit_type, purchased_quantity, used_quantity, reserved_quantity)
       VALUES (?, ?, 'hours', ?, 0, 0)`,
      [hoursItemId, packageId, data.hoursMinutesQuota]
    );

    let reelsItemId: string | undefined;
    if (data.reelsQuota && data.reelsQuota > 0) {
      reelsItemId = `pkg_item_reels_${Math.random().toString(36).substring(2, 9)}`;
      await this.driver.execute(
        `INSERT INTO client_package_items (id, client_package_id, unit_type, purchased_quantity, used_quantity, reserved_quantity)
         VALUES (?, ?, 'reels', ?, 0, 0)`,
        [reelsItemId, packageId, data.reelsQuota]
      );

      // Also create discrete reel_items for tracking
      for (let i = 1; i <= data.reelsQuota; i++) {
        const reelId = `reel_${packageId}_${i}`;
        await this.driver.execute(
          `INSERT INTO reel_items (id, client_package_id, title, status)
           VALUES (?, ?, ?, 'available')`,
          [reelId, packageId, `${data.packageName} - Reel #${i}`]
        );
      }
    }

    return { packageId, hoursItemId, reelsItemId };
  }

  public async getPackageSummary(packageId: string): Promise<{
    status: string;
    soldPrice: number;
    paidAmount: number;
    hoursPurchased: number;
    hoursUsed: number;
    hoursReserved: number;
    hoursAvailable: number;
    reelsPurchased: number;
    reelsUsed: number;
    reelsRemaining: number;
  }> {
    const pkgs = await this.driver.query<{ status: string; sold_price: number; paid_amount: number }>(
      'SELECT status, sold_price, paid_amount FROM client_packages WHERE id = ?',
      [packageId]
    );

    const items = await this.driver.query<{
      unit_type: string;
      purchased_quantity: number;
      used_quantity: number;
      reserved_quantity: number;
    }>('SELECT unit_type, purchased_quantity, used_quantity, reserved_quantity FROM client_package_items WHERE client_package_id = ?', [packageId]);

    let hoursPurchased = 0, hoursUsed = 0, hoursReserved = 0;
    let reelsPurchased = 0, reelsUsed = 0;

    for (const item of items) {
      if (item.unit_type === 'hours') {
        hoursPurchased = item.purchased_quantity;
        hoursUsed = item.used_quantity;
        hoursReserved = item.reserved_quantity;
      } else if (item.unit_type === 'reels') {
        reelsPurchased = item.purchased_quantity;
        reelsUsed = item.used_quantity;
      }
    }

    const hoursAvailable = hoursPurchased - hoursUsed - hoursReserved;
    const reelsRemaining = reelsPurchased - reelsUsed;

    return {
      status: pkgs[0]?.status || 'unknown',
      soldPrice: pkgs[0]?.sold_price || 0,
      paidAmount: pkgs[0]?.paid_amount || 0,
      hoursPurchased,
      hoursUsed,
      hoursReserved,
      hoursAvailable,
      reelsPurchased,
      reelsUsed,
      reelsRemaining,
    };
  }
}
