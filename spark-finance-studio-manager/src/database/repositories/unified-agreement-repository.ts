/**
 * UnifiedAgreementRepository:
 * Manages universal client agreements (Contracts, Recurring Subscriptions, Project Milestones)
 * with unified financial arithmetic and status tracking.
 */

import { IDatabaseDriver } from '../driver/types';
import {
  ClientAgreement,
  BillingMethod,
  ServiceStatus,
  CollectionStatus,
} from '../../domain/models/universal-service';
import {
  calculateFinancialTotals,
  determineCollectionStatus,
} from '../../domain/calculators/financial-calculator';
import {
  assertIntegerPiasters,
  assertNonEmptyString,
} from '../../domain/rules/invariants';

export interface CreateAgreementInput {
  clientId: string;
  serviceId?: string | null;
  planTemplateId?: string | null;
  agreementNumber?: string | null;
  displayName: string;
  agreementType: 'contract' | 'subscription' | 'project' | 'custom';
  startDate: string;
  endDate?: string | null;
  renewalDate?: string | null;
  billingMethod: BillingMethod;
  agreedAmount: number; // integer piasters
  discountAmount?: number; // integer piasters
  taxAmount?: number; // integer piasters
  serviceStatus?: ServiceStatus;
  collectionStatus?: CollectionStatus;
  assignee?: string | null;
  notes?: string | null;
}

export interface AgreementWithDetails extends ClientAgreement {
  clientName: string;
  clientCompany: string | null;
  serviceName: string | null;
  paidAmount: number;
  remainingAmount: number;
}

export class UnifiedAgreementRepository {
  constructor(private driver: IDatabaseDriver) {}

  public async createAgreement(input: CreateAgreementInput): Promise<ClientAgreement> {
    assertNonEmptyString(input.clientId, 'clientId');
    assertNonEmptyString(input.displayName, 'displayName');
    assertIntegerPiasters(input.agreedAmount, 'agreedAmount');

    const discount = input.discountAmount ?? 0;
    const tax = input.taxAmount ?? 0;
    assertIntegerPiasters(discount, 'discountAmount');
    assertIntegerPiasters(tax, 'taxAmount');

    const totals = calculateFinancialTotals({
      baseAmountPiasters: input.agreedAmount,
      discountPiasters: discount,
      taxPiasters: tax,
    });

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const agreementNum =
      input.agreementNumber?.trim() ||
      `AGR-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

    await this.driver.execute(
      `INSERT INTO client_agreements (
        id, client_id, service_id, plan_template_id, agreement_number, display_name,
        agreement_type, start_date, end_date, renewal_date, billing_method, agreed_amount,
        discount_amount, tax_amount, total_amount, service_status, collection_status,
        assignee, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        id,
        input.clientId,
        input.serviceId ?? null,
        input.planTemplateId ?? null,
        agreementNum,
        input.displayName.trim(),
        input.agreementType,
        input.startDate,
        input.endDate ?? null,
        input.renewalDate ?? null,
        input.billingMethod,
        input.agreedAmount,
        discount,
        tax,
        totals.totalPiasters,
        input.serviceStatus ?? 'active',
        input.collectionStatus ?? 'unpaid',
        input.assignee?.trim() ?? null,
        input.notes?.trim() ?? null,
        now,
        now,
      ]
    );

    return (await this.getAgreementById(id))!;
  }

  public async getAgreementById(id: string): Promise<ClientAgreement | null> {
    const rows = await this.driver.query<ClientAgreement>(
      `SELECT * FROM client_agreements WHERE id = ? LIMIT 1;`,
      [id]
    );
    return rows[0] ?? null;
  }

  public async listAgreements(filter?: {
    clientId?: string;
    agreementType?: string;
    serviceStatus?: string;
  }): Promise<AgreementWithDetails[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filter?.clientId) {
      conditions.push('ca.client_id = ?');
      params.push(filter.clientId);
    }
    if (filter?.agreementType && filter.agreementType !== 'all') {
      conditions.push('ca.agreement_type = ?');
      params.push(filter.agreementType);
    }
    if (filter?.serviceStatus && filter.serviceStatus !== 'all') {
      conditions.push('ca.service_status = ?');
      params.push(filter.serviceStatus);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const rows = await this.driver.query<
      ClientAgreement & { clientName: string; clientCompany: string | null; serviceName: string | null }
    >(
      `SELECT ca.*, c.name AS clientName, c.company_name AS clientCompany, sd.name AS serviceName
       FROM client_agreements ca
       JOIN clients c ON ca.client_id = c.id
       LEFT JOIN service_definitions sd ON ca.service_id = sd.id
       ${whereClause}
       ORDER BY ca.created_at DESC;`,
      params
    );

    // Calculate actual payments allocated to each agreement
    const results: AgreementWithDetails[] = [];
    for (const r of rows) {
      const paidRows = await this.driver.query<{ paid: number }>(
        `SELECT COALESCE(SUM(pa.amount), 0) AS paid
         FROM payment_allocations pa
         JOIN payments p ON pa.payment_id = p.id
         WHERE pa.target_type IN ('contract', 'subscription', 'marketing_due', 'project')
           AND pa.target_id = ?
           AND p.status = 'active';`,
        [r.id]
      );
      const paidAmount = Number(paidRows[0]?.paid ?? 0);
      const totals = calculateFinancialTotals({
        baseAmountPiasters: r.agreed_amount,
        discountPiasters: r.discount_amount,
        taxPiasters: r.tax_amount,
        paidAmountPiasters: paidAmount,
      });

      results.push({
        ...r,
        paidAmount,
        remainingAmount: totals.remainingPiasters,
        collection_status: determineCollectionStatus(totals),
      });
    }

    return results;
  }
}
