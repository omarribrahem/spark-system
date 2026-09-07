/**
 * ContractRepository: Persistence for Marketing Retainer Contracts, Monthly Dues Generation,
 * Historical Rate Locking, and Website Development Projects with Milestones.
 */

import { IDatabaseDriver } from '../driver/types';
import {
  ContractStatus,
  DueStatus,
  WebsiteProjectStatus,
} from '../../domain/models/contract';
import {
  assertIntegerPiasters,
  assertNonEmptyString,
  assertValidDateString,
  DomainInvariantError,
} from '../../domain/rules/invariants';

export interface MarketingContractRecord {
  id: string;
  client_id: string;
  monthly_amount: number; // integer piasters
  start_date: string; // 'YYYY-MM-DD'
  end_date: string | null;
  status: ContractStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface MarketingMonthlyDueRecord {
  id: string;
  contract_id: string;
  year: number;
  month: number;
  base_amount: number;
  due_date: string;
  status: DueStatus;
  created_at: string;
  updated_at: string;
}

export interface WebsiteProjectRecord {
  id: string;
  client_id: string;
  name: string;
  total_price: number; // integer piasters
  start_date: string; // 'YYYY-MM-DD'
  expected_delivery_date: string | null;
  next_payment_amount: number | null;
  next_payment_date: string | null;
  status: WebsiteProjectStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateMarketingContractInput {
  id?: string;
  clientId: string;
  monthlyAmount: number; // integer piasters
  startDate: string; // 'YYYY-MM-DD'
  endDate?: string | null;
  notes?: string | null;
  status?: ContractStatus;
}

export interface CreateWebsiteProjectInput {
  id?: string;
  clientId: string;
  name: string;
  totalPrice: number; // integer piasters
  startDate: string; // 'YYYY-MM-DD'
  expectedDeliveryDate?: string | null;
  nextPaymentAmount?: number | null;
  nextPaymentDate?: string | null;
  notes?: string | null;
}

export class ContractRepository {
  constructor(private driver: IDatabaseDriver) {}

  public async createMarketingContract(
    input: CreateMarketingContractInput
  ): Promise<MarketingContractRecord> {
    const id = input.id ?? crypto.randomUUID();
    const clientId = assertNonEmptyString(input.clientId, 'clientId');
    assertIntegerPiasters(input.monthlyAmount, 'monthlyAmount');
    assertValidDateString(input.startDate, 'startDate');
    if (input.endDate) {
      assertValidDateString(input.endDate, 'endDate');
    }

    const now = new Date().toISOString();
    const status: ContractStatus = input.status ?? 'active';

    await this.driver.execute(
      `INSERT INTO marketing_contracts (
        id, client_id, monthly_amount, start_date, end_date, status, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        id,
        clientId,
        input.monthlyAmount,
        input.startDate,
        input.endDate ?? null,
        status,
        input.notes ?? null,
        now,
        now,
      ]
    );

    const contract = await this.getMarketingContractById(id);
    return contract!;
  }

  public async getMarketingContractById(id: string): Promise<MarketingContractRecord | null> {
    const rows = await this.driver.query<MarketingContractRecord>(
      `SELECT id, client_id, monthly_amount, start_date, end_date, status, notes, created_at, updated_at
       FROM marketing_contracts WHERE id = ? LIMIT 1;`,
      [id]
    );
    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * Generates a monthly due obligation for a contract.
   * Locks the contract's current monthly_amount as base_amount.
   * Enforces uniqueness for (contract_id, year, month).
   */
  public async generateMonthlyDue(
    contractId: string,
    year: number,
    month: number,
    dueDate: string
  ): Promise<MarketingMonthlyDueRecord> {
    assertNonEmptyString(contractId, 'contractId');
    assertValidDateString(dueDate, 'dueDate');

    if (month < 1 || month > 12) {
      throw new DomainInvariantError(`Month must be between 1 and 12, got: ${month}`);
    }

    const contract = await this.getMarketingContractById(contractId);
    if (!contract) {
      throw new Error(`Contract ${contractId} not found`);
    }

    const dueId = crypto.randomUUID();
    const now = new Date().toISOString();
    const today = now.split('T')[0];

    const initialStatus: DueStatus = today > dueDate ? 'overdue' : today === dueDate ? 'due' : 'upcoming';

    await this.driver.execute(
      `INSERT INTO marketing_monthly_dues (
        id, contract_id, year, month, base_amount, due_date, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [dueId, contractId, year, month, contract.monthly_amount, dueDate, initialStatus, now, now]
    );

    const rows = await this.driver.query<MarketingMonthlyDueRecord>(
      `SELECT id, contract_id, year, month, base_amount, due_date, status, created_at, updated_at
       FROM marketing_monthly_dues WHERE id = ? LIMIT 1;`,
      [dueId]
    );
    return rows[0];
  }

  public async listDuesByContract(contractId: string): Promise<MarketingMonthlyDueRecord[]> {
    return await this.driver.query<MarketingMonthlyDueRecord>(
      `SELECT id, contract_id, year, month, base_amount, due_date, status, created_at, updated_at
       FROM marketing_monthly_dues
       WHERE contract_id = ?
       ORDER BY year ASC, month ASC;`,
      [contractId]
    );
  }

  public async createWebsiteProject(
    input: CreateWebsiteProjectInput
  ): Promise<WebsiteProjectRecord> {
    const id = input.id ?? crypto.randomUUID();
    const clientId = assertNonEmptyString(input.clientId, 'clientId');
    const name = assertNonEmptyString(input.name, 'name');
    assertIntegerPiasters(input.totalPrice, 'totalPrice');
    assertValidDateString(input.startDate, 'startDate');

    if (input.expectedDeliveryDate) {
      assertValidDateString(input.expectedDeliveryDate, 'expectedDeliveryDate');
    }
    if (input.nextPaymentAmount !== undefined && input.nextPaymentAmount !== null) {
      assertIntegerPiasters(input.nextPaymentAmount, 'nextPaymentAmount');
    }
    if (input.nextPaymentDate) {
      assertValidDateString(input.nextPaymentDate, 'nextPaymentDate');
    }

    const now = new Date().toISOString();

    await this.driver.execute(
      `INSERT INTO website_projects (
        id, client_id, name, total_price, start_date, expected_delivery_date,
        next_payment_amount, next_payment_date, status, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?, ?);`,
      [
        id,
        clientId,
        name,
        input.totalPrice,
        input.startDate,
        input.expectedDeliveryDate ?? null,
        input.nextPaymentAmount ?? null,
        input.nextPaymentDate ?? null,
        input.notes ?? null,
        now,
        now,
      ]
    );

    const rows = await this.driver.query<WebsiteProjectRecord>(
      `SELECT id, client_id, name, total_price, start_date, expected_delivery_date,
              next_payment_amount, next_payment_date, status, notes, created_at, updated_at
       FROM website_projects WHERE id = ? LIMIT 1;`,
      [id]
    );
    return rows[0];
  }

  public async updateWebsiteMilestone(
    id: string,
    status: WebsiteProjectStatus,
    nextPaymentAmount?: number | null,
    nextPaymentDate?: string | null
  ): Promise<void> {
    assertNonEmptyString(id, 'id');
    const now = new Date().toISOString();

    if (nextPaymentAmount !== undefined && nextPaymentAmount !== null) {
      assertIntegerPiasters(nextPaymentAmount, 'nextPaymentAmount');
    }
    if (nextPaymentDate) {
      assertValidDateString(nextPaymentDate, 'nextPaymentDate');
    }

    await this.driver.execute(
      `UPDATE website_projects
       SET status = ?, next_payment_amount = ?, next_payment_date = ?, updated_at = ?
       WHERE id = ?;`,
      [status, nextPaymentAmount ?? null, nextPaymentDate ?? null, now, id]
    );
  }
}
