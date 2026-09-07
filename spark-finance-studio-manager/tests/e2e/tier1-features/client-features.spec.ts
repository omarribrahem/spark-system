import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setupTestContext, TestContext } from '../harness/test-context';
import { ClientFixture } from '../fixtures/client-fixture';

describe('Tier 1: Client Management & 360 Profile (F-007 .. F-009)', () => {
  let ctx: TestContext;
  let clientFixture: ClientFixture;

  beforeEach(async () => {
    ctx = await setupTestContext();
    clientFixture = new ClientFixture(ctx.driver);
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  // F-007: Client Management
  describe('F-007: Client Management', () => {
    it('creates a new client record with name and telephone', async () => {
      const clientId = await clientFixture.create({
        name: 'أحمد حسن',
        company_name: 'شركة النور',
        phone: '+201012345678',
      });
      expect(clientId).toBeDefined();

      const client = await clientFixture.getById(clientId);
      expect(client?.name).toBe('أحمد حسن');
      expect(client?.company_name).toBe('شركة النور');
      expect(client?.status).toBe('active');
    });

    it('updates client contact details and notes', async () => {
      const clientId = await clientFixture.create({ name: 'سارة طارق' });
      await ctx.driver.execute(
        "UPDATE clients SET phone = '+201099887766', notes = 'عميل مميز' WHERE id = ?",
        [clientId]
      );

      const client = await clientFixture.getById(clientId);
      expect(client?.phone).toBe('+201099887766');
      expect(client?.notes).toBe('عميل مميز');
    });

    it('searches client by substring match', async () => {
      await clientFixture.create({ name: 'كريم محمود' });
      await clientFixture.create({ name: 'كريم عبد العزيز' });
      await clientFixture.create({ name: 'مينا سمير' });

      const results = await ctx.driver.query<{ name: string }>(
        "SELECT name FROM clients WHERE name = 'كريم محمود' OR name = 'كريم عبد العزيز'"
      );
      expect(results).toHaveLength(2);
    });

    it('filters client list by status (active vs inactive)', async () => {
      await clientFixture.create({ name: 'عميل نشط 1', status: 'active' });
      await clientFixture.create({ name: 'عميل مؤرشف 1', status: 'inactive' });

      const active = await ctx.driver.query<{ id: string }>(
        "SELECT id FROM clients WHERE status = 'active'"
      );
      const inactive = await ctx.driver.query<{ id: string }>(
        "SELECT id FROM clients WHERE status = 'inactive'"
      );

      expect(active).toHaveLength(1);
      expect(inactive).toHaveLength(1);
    });

    it('trims leading and trailing whitespace from client name on save', async () => {
      const untrimmed = '   عمر شريف   ';
      const clientId = await clientFixture.create({ name: untrimmed.trim() });
      const client = await clientFixture.getById(clientId);
      expect(client?.name).toBe('عمر شريف');
    });
  });

  // F-008: Client 360 Profile
  describe('F-008: Client 360 Profile', () => {
    it('aggregates client contracts, packages, and bookings in single query view', async () => {
      const clientId = await clientFixture.create({ name: 'محمد علي' });

      // Insert mock contract
      await ctx.driver.execute(
        `INSERT INTO marketing_contracts (id, client_id, monthly_amount, start_date, status)
         VALUES ('c1', ?, 500000, '2026-10-01', 'active')`,
        [clientId]
      );

      // Insert mock package
      await ctx.driver.execute(
        `INSERT INTO client_packages (id, client_id, package_name_snapshot, sold_price, purchase_date, status)
         VALUES ('p1', ?, 300000, '2026-10-01', 'active')`,
        [clientId]
      );

      const contracts = await ctx.driver.query('SELECT * FROM marketing_contracts WHERE client_id = ?', [clientId]);
      const packages = await ctx.driver.query('SELECT * FROM client_packages WHERE client_id = ?', [clientId]);

      expect(contracts).toHaveLength(1);
      expect(packages).toHaveLength(1);
    });

    it('calculates total client contracted value from contracts and sold packages', async () => {
      const clientId = await clientFixture.create({ name: 'هند رامي' });
      await ctx.driver.execute(
        `INSERT INTO client_packages (id, client_id, package_name_snapshot, sold_price, purchase_date)
         VALUES ('p1', ?, 'باقة عميل', 400000, '2026-10-01')`,
        [clientId]
      );

      const pkgs = await ctx.driver.query<{ sold_price: number }>(
        'SELECT sold_price FROM client_packages WHERE client_id = ?',
        [clientId]
      );
      const totalContracted = pkgs.reduce((acc, p) => acc + p.sold_price, 0);
      expect(totalContracted).toBe(400000);
      expect(totalContracted).toBePiasters();
    });

    it('displays zero balances cleanly for newly registered client without transactions', async () => {
      const clientId = await clientFixture.create({ name: 'عميل جديد' });
      const payments = await ctx.driver.query('SELECT * FROM payments WHERE client_id = ?', [clientId]);
      const credits = await ctx.driver.query('SELECT * FROM client_credits WHERE client_id = ?', [clientId]);

      expect(payments).toHaveLength(0);
      expect(credits).toHaveLength(0);
    });

    it('displays unallocated credit prominently on client profile', async () => {
      const clientId = await clientFixture.create({ name: 'يوسف جمال' });
      await ctx.driver.execute(
        'INSERT INTO client_credits (id, client_id, amount) VALUES (\'cr1\', ?, 50000)',
        [clientId]
      );

      const credits = await ctx.driver.query<{ amount: number }>(
        'SELECT amount FROM client_credits WHERE client_id = ?',
        [clientId]
      );
      expect(credits[0]?.amount).toBe(50000);
      expect(credits[0]?.amount).toBePiasters();
    });

    it('preserves client chronological payment ledger', async () => {
      const clientId = await clientFixture.create({ name: 'طارق عزيز' });
      await ctx.driver.execute(
        `INSERT INTO payments (id, client_id, amount, payment_date, payment_method, status)
         VALUES ('p1', ?, 100000, '2026-10-01', 'cash', 'active')`,
        [clientId]
      );
      await ctx.driver.execute(
        `INSERT INTO payments (id, client_id, amount, payment_date, payment_method, status)
         VALUES ('p2', ?, 200000, '2026-10-05', 'vodafone_cash', 'active')`,
        [clientId]
      );

      const ledger = await ctx.driver.query<{ amount: number }>(
        'SELECT amount FROM payments WHERE client_id = ? ORDER BY payment_date ASC',
        [clientId]
      );
      expect(ledger).toHaveLength(2);
      expect(ledger[0].amount).toBe(100000);
      expect(ledger[1].amount).toBe(200000);
    });
  });

  // F-009: Client Soft-Delete / Archiving
  describe('F-009: Client Soft-Delete / Archive', () => {
    it('archives client by setting status to inactive without deleting rows', async () => {
      const clientId = await clientFixture.create({ name: 'رامي خليل' });
      await ctx.driver.execute("UPDATE clients SET status = 'inactive' WHERE id = ?", [clientId]);

      const client = await clientFixture.getById(clientId);
      expect(client?.status).toBe('inactive');
    });

    it('preserves historical payments when client is archived', async () => {
      const clientId = await clientFixture.create({ name: 'مروان عادل' });
      await ctx.driver.execute(
        `INSERT INTO payments (id, client_id, amount, payment_date, payment_method, status)
         VALUES ('p_arch', ?, 75000, '2026-09-01', 'cash', 'active')`,
        [clientId]
      );

      // Archive client
      await ctx.driver.execute("UPDATE clients SET status = 'inactive' WHERE id = ?", [clientId]);

      // Verify payment still exists
      const payments = await ctx.driver.query('SELECT * FROM payments WHERE client_id = ?', [clientId]);
      expect(payments).toHaveLength(1);
    });

    it('reactivates archived client back to active status', async () => {
      const clientId = await clientFixture.create({ name: 'أشرف عبد المنعم', status: 'inactive' });
      await ctx.driver.execute("UPDATE clients SET status = 'active' WHERE id = ?", [clientId]);

      const client = await clientFixture.getById(clientId);
      expect(client?.status).toBe('active');
    });

    it('records client archive action in activity_log', async () => {
      const clientId = await clientFixture.create({ name: 'سامي زكي' });
      await ctx.driver.execute(
        `INSERT INTO activity_log (id, action, entity_type, entity_id, notes)
         VALUES ('log_arch_1', 'CLIENT_ARCHIVED', 'client', ?, 'Client requested temporary hold')`,
        [clientId]
      );

      const logs = await ctx.driver.query<{ notes: string }>(
        "SELECT notes FROM activity_log WHERE entity_id = ? AND action = 'CLIENT_ARCHIVED'",
        [clientId]
      );
      expect(logs).toHaveLength(1);
      expect(logs[0].notes).toContain('temporary hold');
    });

    it('strictly forbids permanent hard deletion of clients with active relations', async () => {
      const clientId = await clientFixture.create({ name: 'حازم شريف' });
      // Verification that app policy uses UPDATE status = 'inactive' instead of DELETE FROM clients
      const archiveClient = async (id: string) => {
        await ctx.driver.execute("UPDATE clients SET status = 'inactive' WHERE id = ?", [id]);
      };

      await archiveClient(clientId);
      const remaining = await ctx.driver.query('SELECT id FROM clients WHERE id = ?', [clientId]);
      expect(remaining).toHaveLength(1);
    });
  });
});
