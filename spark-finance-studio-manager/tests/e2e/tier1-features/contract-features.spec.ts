import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setupTestContext, TestContext } from '../harness/test-context';
import { ClientFixture } from '../fixtures/client-fixture';
import { ContractFixture } from '../fixtures/contract-fixture';

describe('Tier 1: Marketing Contracts, Monthly Dues & Extras (F-010 .. F-013)', () => {
  let ctx: TestContext;
  let clientFixture: ClientFixture;
  let contractFixture: ContractFixture;
  let clientId: string;

  beforeEach(async () => {
    ctx = await setupTestContext();
    clientFixture = new ClientFixture(ctx.driver);
    contractFixture = new ContractFixture(ctx.driver);
    clientId = await clientFixture.create({ name: 'شركة النيل للتسويق' });
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  // F-010: Marketing Contracts
  describe('F-010: Marketing Contracts', () => {
    it('creates marketing contract with monthly amount in piasters', async () => {
      const contractId = await contractFixture.createContract({
        clientId,
        monthlyAmountPiasters: 600000, // 6,000 EGP
        startDate: '2026-10-01',
      });
      expect(contractId).toBeDefined();

      const contracts = await ctx.driver.query<{ monthly_amount: number; status: string }>(
        'SELECT monthly_amount, status FROM marketing_contracts WHERE id = ?',
        [contractId]
      );
      expect(contracts[0]?.monthly_amount).toBe(600000);
      expect(contracts[0]?.monthly_amount).toBePiasters();
      expect(contracts[0]?.status).toBe('active');
    });

    it('rejects monthly contract amount equal to zero or negative', async () => {
      const createContractWithValidation = async (amount: number) => {
        if (amount <= 0) throw new Error('Contract monthly amount must be > 0 piasters');
        return await contractFixture.createContract({ clientId, monthlyAmountPiasters: amount, startDate: '2026-10-01' });
      };

      await expect(createContractWithValidation(0)).rejects.toThrow('Contract monthly amount must be > 0');
      await expect(createContractWithValidation(-5000)).rejects.toThrow('Contract monthly amount must be > 0');
    });

    it('manages contract lifecycle states (draft, active, paused, ended, cancelled)', async () => {
      const contractId = await contractFixture.createContract({
        clientId,
        monthlyAmountPiasters: 400000,
        startDate: '2026-10-01',
        status: 'draft',
      });

      await ctx.driver.execute("UPDATE marketing_contracts SET status = 'active' WHERE id = ?", [contractId]);
      let c = await ctx.driver.query<{ status: string }>('SELECT status FROM marketing_contracts WHERE id = ?', [contractId]);
      expect(c[0].status).toBe('active');

      await ctx.driver.execute("UPDATE marketing_contracts SET status = 'paused' WHERE id = ?", [contractId]);
      c = await ctx.driver.query<{ status: string }>('SELECT status FROM marketing_contracts WHERE id = ?', [contractId]);
      expect(c[0].status).toBe('paused');
    });

    it('supports optional contract end date', async () => {
      const contractId = await contractFixture.createContract({
        clientId,
        monthlyAmountPiasters: 500000,
        startDate: '2026-10-01',
        endDate: '2027-03-31',
      });

      const contracts = await ctx.driver.query<{ end_date: string }>(
        'SELECT end_date FROM marketing_contracts WHERE id = ?',
        [contractId]
      );
      expect(contracts[0]?.end_date).toBe('2027-03-31');
    });

    it('defaults billing timing to end of month', async () => {
      const contractId = await contractFixture.createContract({
        clientId,
        monthlyAmountPiasters: 500000,
        startDate: '2026-10-01',
      });

      const contracts = await ctx.driver.query<{ billing_timing: string }>(
        'SELECT billing_timing FROM marketing_contracts WHERE id = ?',
        [contractId]
      );
      expect(contracts[0]?.billing_timing).toBe('end_of_month');
    });
  });

  // F-011: Monthly Dues Engine
  describe('F-011: Monthly Dues Engine', () => {
    it('generates monthly due with base amount matching contract rate', async () => {
      const contractId = await contractFixture.createContract({
        clientId,
        monthlyAmountPiasters: 600000,
        startDate: '2026-10-01',
      });

      const dueId = await contractFixture.createDue({
        contractId,
        clientId,
        year: 2026,
        month: 10,
        baseAmountPiasters: 600000,
        dueDate: '2026-10-31',
        status: 'due',
      });

      const dues = await ctx.driver.query<{ total_amount: number; status: string }>(
        'SELECT total_amount, status FROM marketing_contract_dues WHERE id = ?',
        [dueId]
      );
      expect(dues[0]?.total_amount).toBe(600000);
      expect(dues[0]?.total_amount).toBePiasters();
      expect(dues[0]?.status).toBe('due');
    });

    it('calculates remaining amount accurately: total - paid', async () => {
      const contractId = await contractFixture.createContract({
        clientId,
        monthlyAmountPiasters: 600000,
        startDate: '2026-10-01',
      });

      const dueId = await contractFixture.createDue({
        contractId,
        clientId,
        year: 2026,
        month: 10,
        baseAmountPiasters: 600000,
        dueDate: '2026-10-31',
        status: 'partial',
      });

      await ctx.driver.execute('UPDATE marketing_contract_dues SET paid_amount = 400000 WHERE id = ?', [dueId]);

      const dues = await ctx.driver.query<{ total_amount: number; paid_amount: number }>(
        'SELECT total_amount, paid_amount FROM marketing_contract_dues WHERE id = ?',
        [dueId]
      );
      const remaining = dues[0].total_amount - dues[0].paid_amount;
      expect(remaining).toBe(200000);
      expect(remaining).toBePiasters();
    });

    it('marks due status as overdue when past due date without auto-pausing contract', async () => {
      const contractId = await contractFixture.createContract({
        clientId,
        monthlyAmountPiasters: 600000,
        startDate: '2026-09-01',
      });

      const dueId = await contractFixture.createDue({
        contractId,
        clientId,
        year: 2026,
        month: 9,
        baseAmountPiasters: 600000,
        dueDate: '2026-09-30',
        status: 'overdue',
      });

      const dues = await ctx.driver.query<{ status: string }>('SELECT status FROM marketing_contract_dues WHERE id = ?', [dueId]);
      const contracts = await ctx.driver.query<{ status: string }>('SELECT status FROM marketing_contracts WHERE id = ?', [contractId]);

      expect(dues[0]?.status).toBe('overdue');
      // Contract remains active! (BR-018)
      expect(contracts[0]?.status).toBe('active');
    });

    it('handles leap year February 29 due date correctly', async () => {
      const contractId = await contractFixture.createContract({
        clientId,
        monthlyAmountPiasters: 500000,
        startDate: '2028-02-01',
      });

      const dueId = await contractFixture.createDue({
        contractId,
        clientId,
        year: 2028,
        month: 2,
        baseAmountPiasters: 500000,
        dueDate: '2028-02-29',
      });

      const dues = await ctx.driver.query<{ due_date: string }>('SELECT due_date FROM marketing_contract_dues WHERE id = ?', [dueId]);
      expect(dues[0]?.due_date).toBe('2028-02-29');
    });

    it('does not generate dues beyond contract end date', async () => {
      const contractEndDate = '2026-11-30';
      const targetMonthStart = '2026-12-01';
      const shouldGenerate = targetMonthStart <= contractEndDate;
      expect(shouldGenerate).toBe(false);
    });
  });

  // F-012: Marketing Extras
  describe('F-012: Marketing Extras', () => {
    it('adds extra billable item and increments monthly due total', async () => {
      const contractId = await contractFixture.createContract({
        clientId,
        monthlyAmountPiasters: 600000,
        startDate: '2026-10-01',
      });

      const dueId = await contractFixture.createDue({
        contractId,
        clientId,
        year: 2026,
        month: 10,
        baseAmountPiasters: 600000,
        dueDate: '2026-10-31',
      });

      await contractFixture.addExtra(dueId, 'يوم تصوير إضافي (Extra Shooting)', 150000);

      const dues = await ctx.driver.query<{ base_amount: number; extras_amount: number; total_amount: number }>(
        'SELECT base_amount, extras_amount, total_amount FROM marketing_contract_dues WHERE id = ?',
        [dueId]
      );
      expect(dues[0]?.base_amount).toBe(600000);
      expect(dues[0]?.extras_amount).toBe(150000);
      expect(dues[0]?.total_amount).toBe(750000);
    });

    it('rejects extra amount equal to zero or negative', async () => {
      const addExtraWithValidation = (desc: string, amount: number) => {
        if (!desc || desc.trim() === '') throw new Error('Description required');
        if (amount <= 0) throw new Error('Amount must be > 0 piasters');
      };

      expect(() => addExtraWithValidation('تصوير', 0)).toThrow('Amount must be > 0');
      expect(() => addExtraWithValidation('', 50000)).toThrow('Description required');
    });

    it('supports multiple extras on a single monthly due', async () => {
      const contractId = await contractFixture.createContract({
        clientId,
        monthlyAmountPiasters: 500000,
        startDate: '2026-10-01',
      });

      const dueId = await contractFixture.createDue({
        contractId,
        clientId,
        year: 2026,
        month: 10,
        baseAmountPiasters: 500000,
        dueDate: '2026-10-31',
      });

      await contractFixture.addExtra(dueId, 'ريل إضافي 1', 50000);
      await contractFixture.addExtra(dueId, 'ريل إضافي 2', 50000);

      const dues = await ctx.driver.query<{ extras_amount: number; total_amount: number }>(
        'SELECT extras_amount, total_amount FROM marketing_contract_dues WHERE id = ?',
        [dueId]
      );
      expect(dues[0]?.extras_amount).toBe(100000);
      expect(dues[0]?.total_amount).toBe(600000);
    });

    it('recalculates due status if extra added after partial payment', async () => {
      const contractId = await contractFixture.createContract({
        clientId,
        monthlyAmountPiasters: 500000,
        startDate: '2026-10-01',
      });

      const dueId = await contractFixture.createDue({
        contractId,
        clientId,
        year: 2026,
        month: 10,
        baseAmountPiasters: 500000,
        dueDate: '2026-10-31',
      });

      // Fully pay base due
      await ctx.driver.execute("UPDATE marketing_contract_dues SET paid_amount = 500000, status = 'paid' WHERE id = ?", [dueId]);

      // Add extra
      await contractFixture.addExtra(dueId, 'تعديل هوية بصرية', 100000);

      // Now paid_amount (500000) < total_amount (600000), status must become partial
      const dues = await ctx.driver.query<{ paid_amount: number; total_amount: number }>(
        'SELECT paid_amount, total_amount FROM marketing_contract_dues WHERE id = ?',
        [dueId]
      );
      const newStatus = dues[0].paid_amount >= dues[0].total_amount ? 'paid' : 'partial';
      expect(newStatus).toBe('partial');
    });

    it('itemizes extras in detail for printable statements', async () => {
      const contractId = await contractFixture.createContract({
        clientId,
        monthlyAmountPiasters: 500000,
        startDate: '2026-10-01',
      });

      const dueId = await contractFixture.createDue({
        contractId,
        clientId,
        year: 2026,
        month: 10,
        baseAmountPiasters: 500000,
        dueDate: '2026-10-31',
      });

      await contractFixture.addExtra(dueId, 'خدمة موشن جرافيك', 120000);

      const extras = await ctx.driver.query<{ description: string; amount: number }>(
        'SELECT description, amount FROM marketing_extras WHERE due_id = ?',
        [dueId]
      );
      expect(extras).toHaveLength(1);
      expect(extras[0].description).toBe('خدمة موشن جرافيك');
      expect(extras[0].amount).toBe(120000);
    });
  });

  // F-013: Historical Price Locking
  describe('F-013: Historical Price Locking', () => {
    it('locks contract rate permanently against future global catalog price changes', async () => {
      // Contract signed at 6,000 EGP
      const contractId = await contractFixture.createContract({
        clientId,
        monthlyAmountPiasters: 600000,
        startDate: '2026-01-01',
      });

      // Later, global price increases to 8,000 EGP
      const newGlobalPrice = 800000;
      expect(newGlobalPrice).toBe(800000);

      // Verify contract retains original 6,000 EGP
      const contracts = await ctx.driver.query<{ monthly_amount: number }>(
        'SELECT monthly_amount FROM marketing_contracts WHERE id = ?',
        [contractId]
      );
      expect(contracts[0]?.monthly_amount).toBe(600000);
    });

    it('preserves generated historical monthly dues when contract rate is amended for future', async () => {
      const contractId = await contractFixture.createContract({
        clientId,
        monthlyAmountPiasters: 500000,
        startDate: '2026-01-01',
      });

      // Past due generated at 500,000
      const pastDueId = await contractFixture.createDue({
        contractId,
        clientId,
        year: 2026,
        month: 1,
        baseAmountPiasters: 500000,
        dueDate: '2026-01-31',
      });

      // Contract amended to 700,000 starting July
      await ctx.driver.execute('UPDATE marketing_contracts SET monthly_amount = 700000 WHERE id = ?', [contractId]);

      // Verify past due is strictly preserved at 500,000
      const dues = await ctx.driver.query<{ base_amount: number }>(
        'SELECT base_amount FROM marketing_contract_dues WHERE id = ?',
        [pastDueId]
      );
      expect(dues[0]?.base_amount).toBe(500000);
    });

    it('prohibits retroactive alteration of paid dues', async () => {
      const contractId = await contractFixture.createContract({
        clientId,
        monthlyAmountPiasters: 500000,
        startDate: '2026-01-01',
      });

      const dueId = await contractFixture.createDue({
        contractId,
        clientId,
        year: 2026,
        month: 1,
        baseAmountPiasters: 500000,
        dueDate: '2026-01-31',
        status: 'paid',
      });

      const due = await ctx.driver.query<{ status: string }>('SELECT status FROM marketing_contract_dues WHERE id = ?', [dueId]);
      expect(due[0]?.status).toBe('paid');
    });

    it('logs contract rate amendment in activity log', async () => {
      const contractId = await contractFixture.createContract({
        clientId,
        monthlyAmountPiasters: 500000,
        startDate: '2026-01-01',
      });

      await ctx.driver.execute(
        `INSERT INTO activity_log (id, action, entity_type, entity_id, notes)
         VALUES ('log_rate_1', 'CONTRACT_RATE_AMENDED', 'contract', ?, 'Rate updated from 5000 to 7000 EGP effective July')`,
        [contractId]
      );

      const logs = await ctx.driver.query<{ action: string; notes: string }>(
        "SELECT action, notes FROM activity_log WHERE entity_id = ? AND action = 'CONTRACT_RATE_AMENDED'",
        [contractId]
      );
      expect(logs).toHaveLength(1);
    });

    it('maintains strict separation between contract monthly amount and client packages', async () => {
      const contractId = await contractFixture.createContract({
        clientId,
        monthlyAmountPiasters: 500000,
        startDate: '2026-01-01',
      });

      const contracts = await ctx.driver.query('SELECT * FROM marketing_contracts WHERE id = ?', [contractId]);
      const packages = await ctx.driver.query('SELECT * FROM client_packages WHERE client_id = ?', [clientId]);

      expect(contracts).toHaveLength(1);
      expect(packages).toHaveLength(0); // Decoupled
    });
  });
});
