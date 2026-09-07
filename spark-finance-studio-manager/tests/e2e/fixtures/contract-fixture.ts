import { IDatabaseDriver } from '../harness/test-database';

export interface ContractData {
  id?: string;
  clientId: string;
  monthlyAmountPiasters: number;
  startDate: string;
  endDate?: string;
  billingTiming?: 'start_of_month' | 'end_of_month';
  status?: 'draft' | 'active' | 'paused' | 'ended' | 'cancelled';
  notes?: string;
}

export interface ContractDueData {
  id?: string;
  contractId: string;
  clientId: string;
  year: number;
  month: number;
  baseAmountPiasters: number;
  extrasAmountPiasters?: number;
  dueDate: string;
  status?: 'upcoming' | 'due' | 'partial' | 'paid' | 'overdue';
}

export class ContractFixture {
  constructor(private driver: IDatabaseDriver) {}

  public async createContract(data: ContractData): Promise<string> {
    const id = data.id || `contract_${Math.random().toString(36).substring(2, 9)}`;
    await this.driver.execute(
      `INSERT INTO marketing_contracts (id, client_id, monthly_amount, start_date, end_date, billing_timing, status, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        data.clientId,
        data.monthlyAmountPiasters,
        data.startDate,
        data.endDate || null,
        data.billingTiming || 'end_of_month',
        data.status || 'active',
        data.notes || null,
      ]
    );
    return id;
  }

  public async createDue(data: ContractDueData): Promise<string> {
    const id = data.id || `due_${Math.random().toString(36).substring(2, 9)}`;
    const extras = data.extrasAmountPiasters || 0;
    const total = data.baseAmountPiasters + extras;

    await this.driver.execute(
      `INSERT INTO marketing_contract_dues (id, contract_id, client_id, year, month, base_amount, extras_amount, total_amount, paid_amount, due_date, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      [
        id,
        data.contractId,
        data.clientId,
        data.year,
        data.month,
        data.baseAmountPiasters,
        extras,
        total,
        data.dueDate,
        data.status || 'upcoming',
      ]
    );
    return id;
  }

  public async addExtra(dueId: string, description: string, amountPiasters: number): Promise<string> {
    const extraId = `extra_${Math.random().toString(36).substring(2, 9)}`;
    await this.driver.execute(
      `INSERT INTO marketing_extras (id, due_id, description, amount)
       VALUES (?, ?, ?, ?)`,
      [extraId, dueId, description, amountPiasters]
    );

    // Update due total_amount and extras_amount
    const dues = await this.driver.query<{ extras_amount: number; total_amount: number }>(
      'SELECT extras_amount, total_amount FROM marketing_contract_dues WHERE id = ?',
      [dueId]
    );
    if (dues.length > 0) {
      const currentExtras = dues[0].extras_amount || 0;
      const currentTotal = dues[0].total_amount || 0;
      await this.driver.execute(
        'UPDATE marketing_contract_dues SET extras_amount = ?, total_amount = ? WHERE id = ?',
        [currentExtras + amountPiasters, currentTotal + amountPiasters, dueId]
      );
    }

    return extraId;
  }
}
