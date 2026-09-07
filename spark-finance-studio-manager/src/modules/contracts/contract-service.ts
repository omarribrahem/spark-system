/**
 * ContractService: Data aggregation and business logic for Contracts,
 * Subscriptions, and Website Projects.
 */

import { IDatabaseDriver } from '../../database/driver/types';
import { WebsiteProjectStatus } from '../../domain/models/contract';
import {
  MarketingContractRecord,
  MarketingMonthlyDueRecord,
  WebsiteProjectRecord,
  ContractRepository,
} from '../../database/repositories/contract-repository';
import {
  assertIntegerPiasters,
  assertNonEmptyString,
  assertValidDateString,
} from '../../domain/rules/invariants';

export interface DueWithPaymentInfo extends MarketingMonthlyDueRecord {
  paidAmount: number;
  remainingAmount: number;
}

export interface MarketingContractWithDetails extends MarketingContractRecord {
  clientName: string;
  clientCompany: string | null;
  duesCount: number;
  paidDuesCount: number;
  overdueDuesCount: number;
  totalRemainingDuesPiasters: number;
  dues: DueWithPaymentInfo[];
}

export interface SubscriptionRecord {
  id: string;
  client_id: string;
  service_id: string;
  monthly_amount: number;
  start_date: string;
  end_date: string | null;
  billing_day: number;
  status: 'active' | 'paused' | 'ended' | 'cancelled';
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface SubscriptionWithDetails extends SubscriptionRecord {
  clientName: string;
  clientCompany: string | null;
  serviceName: string;
  nextRenewalDate: string;
}

export interface WebsiteProjectWithDetails extends WebsiteProjectRecord {
  clientName: string;
  clientCompany: string | null;
  progressPercentage: number;
  milestoneTitle: string;
}

export interface CreateSubscriptionInput {
  clientId: string;
  serviceName: string;
  monthlyAmount: number; // piasters
  startDate: string;
  endDate?: string | null;
  billingDay?: number;
  notes?: string | null;
}

/**
 * Maps website project status to progress percentage and Arabic title
 */
export function getWebsiteMilestoneInfo(status: WebsiteProjectStatus): {
  progressPercentage: number;
  milestoneTitle: string;
  colorClass: string;
} {
  switch (status) {
    case 'new':
      return { progressPercentage: 15, milestoneTitle: 'بدء المشروع والتعاقد', colorClass: 'bg-blue-500' };
    case 'in_progress':
      return { progressPercentage: 50, milestoneTitle: 'قيد التصميم والتطوير', colorClass: 'bg-amber-500' };
    case 'waiting':
      return { progressPercentage: 80, milestoneTitle: 'بانتظار مراجعة العميل والمحتوى', colorClass: 'bg-purple-500' };
    case 'completed':
      return { progressPercentage: 100, milestoneTitle: 'تم الإطلاق والتسليم النهائي', colorClass: 'bg-emerald-500' };
    case 'cancelled':
      return { progressPercentage: 0, milestoneTitle: 'ملغي', colorClass: 'bg-slate-400' };
    default:
      return { progressPercentage: 0, milestoneTitle: 'غير محدد', colorClass: 'bg-slate-400' };
  }
}

/**
 * Calculates next renewal date based on billing day and start date
 */
export function calculateNextRenewalDate(_startDate: string, billingDay = 1): string {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth() + 1; // 1-12
  const day = today.getDate();

  let targetYear = year;
  let targetMonth = month;

  if (day >= billingDay) {
    targetMonth += 1;
    if (targetMonth > 12) {
      targetMonth = 1;
      targetYear += 1;
    }
  }

  const mm = String(targetMonth).padStart(2, '0');
  const dd = String(Math.min(billingDay, 28)).padStart(2, '0');
  return `${targetYear}-${mm}-${dd}`;
}

/**
 * Fetches marketing contracts with client details and dues calculation
 */
export async function fetchMarketingContracts(
  driver: IDatabaseDriver
): Promise<MarketingContractWithDetails[]> {
  const contractRows = await driver.query<MarketingContractRecord>(
    `SELECT id, client_id, monthly_amount, start_date, end_date, status, notes, created_at, updated_at
     FROM marketing_contracts
     ORDER BY start_date DESC, created_at DESC;`
  );

  const clientRows = await driver.query<{ id: string; name: string; company_name: string | null }>(
    `SELECT id, name, company_name FROM clients;`
  );
  const clientMap = new Map<string, { name: string; company_name: string | null }>();
  clientRows.forEach((c) => clientMap.set(c.id, c));

  // Query all dues with paid allocations
  const allDues = await driver.query<DueWithPaymentInfo>(
    `SELECT d.id, d.contract_id, d.year, d.month, d.base_amount, d.due_date, d.status, d.created_at, d.updated_at,
            COALESCE(SUM(CASE WHEN p.status = 'active' THEN pa.amount ELSE 0 END), 0) AS paidAmount,
            MAX(0, d.base_amount - COALESCE(SUM(CASE WHEN p.status = 'active' THEN pa.amount ELSE 0 END), 0)) AS remainingAmount
     FROM marketing_monthly_dues d
     LEFT JOIN payment_allocations pa ON pa.target_type = 'marketing_due' AND pa.target_id = d.id
     LEFT JOIN payments p ON pa.payment_id = p.id
     GROUP BY d.id
     ORDER BY d.due_date DESC;`
  );

  const duesByContract = new Map<string, DueWithPaymentInfo[]>();
  for (const due of allDues) {
    const list = duesByContract.get(due.contract_id) || [];
    list.push(due);
    duesByContract.set(due.contract_id, list);
  }

  return contractRows.map((contract) => {
    const client = clientMap.get(contract.client_id);
    const contractDues = duesByContract.get(contract.id) || [];

    const duesCount = contractDues.length;
    const paidDuesCount = contractDues.filter((d) => d.remainingAmount === 0).length;
    const overdueDuesCount = contractDues.filter((d) => d.status === 'overdue' && d.remainingAmount > 0).length;
    const totalRemainingDuesPiasters = contractDues.reduce((sum, d) => sum + d.remainingAmount, 0);

    return {
      ...contract,
      clientName: client?.name ?? 'عميل غير معروف',
      clientCompany: client?.company_name ?? null,
      duesCount,
      paidDuesCount,
      overdueDuesCount,
      totalRemainingDuesPiasters,
      dues: contractDues,
    };
  });
}

/**
 * Ensures a service definition exists by name or creates it
 */
export async function ensureServiceDefinition(
  driver: IDatabaseDriver,
  serviceName: string,
  billingModel = 'monthly'
): Promise<string> {
  const existing = await driver.query<{ id: string }>(
    `SELECT id FROM service_definitions WHERE name = ? LIMIT 1;`,
    [serviceName]
  );
  if (existing.length > 0) {
    return existing[0].id;
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await driver.execute(
    `INSERT INTO service_definitions (id, name, billing_model, description, active, created_at)
     VALUES (?, ?, ?, ?, 1, ?);`,
    [id, serviceName, billingModel, `خدمة ${serviceName}`, now]
  );
  return id;
}

/**
 * Creates a recurring subscription record
 */
export async function createSubscription(
  driver: IDatabaseDriver,
  input: CreateSubscriptionInput
): Promise<SubscriptionRecord> {
  const id = crypto.randomUUID();
  const clientId = assertNonEmptyString(input.clientId, 'clientId');
  const serviceName = assertNonEmptyString(input.serviceName, 'serviceName');
  assertIntegerPiasters(input.monthlyAmount, 'monthlyAmount');
  assertValidDateString(input.startDate, 'startDate');
  if (input.endDate) {
    assertValidDateString(input.endDate, 'endDate');
  }

  const serviceId = await ensureServiceDefinition(driver, serviceName, 'monthly');
  const billingDay = input.billingDay && input.billingDay >= 1 && input.billingDay <= 28 ? input.billingDay : 1;
  const now = new Date().toISOString();

  await driver.execute(
    `INSERT INTO subscriptions (
      id, client_id, service_id, monthly_amount, start_date, end_date, billing_day, status, notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?);`,
    [
      id,
      clientId,
      serviceId,
      input.monthlyAmount,
      input.startDate,
      input.endDate ?? null,
      billingDay,
      input.notes ?? null,
      now,
      now,
    ]
  );

  const rows = await driver.query<SubscriptionRecord>(
    `SELECT id, client_id, service_id, monthly_amount, start_date, end_date, billing_day, status, notes, created_at, updated_at
     FROM subscriptions WHERE id = ? LIMIT 1;`,
    [id]
  );
  return rows[0];
}

/**
 * Fetches all subscriptions with client & service information
 */
export async function fetchSubscriptions(
  driver: IDatabaseDriver
): Promise<SubscriptionWithDetails[]> {
  const rows = await driver.query<SubscriptionRecord>(
    `SELECT id, client_id, service_id, monthly_amount, start_date, end_date, billing_day, status, notes, created_at, updated_at
     FROM subscriptions
     ORDER BY start_date DESC, created_at DESC;`
  );

  const clientRows = await driver.query<{ id: string; name: string; company_name: string | null }>(
    `SELECT id, name, company_name FROM clients;`
  );
  const clientMap = new Map<string, { name: string; company_name: string | null }>();
  clientRows.forEach((c) => clientMap.set(c.id, c));

  const serviceRows = await driver.query<{ id: string; name: string }>(
    `SELECT id, name FROM service_definitions;`
  );
  const serviceMap = new Map<string, string>();
  serviceRows.forEach((s) => serviceMap.set(s.id, s.name));

  return rows.map((sub) => {
    const client = clientMap.get(sub.client_id);
    const serviceName = serviceMap.get(sub.service_id) || 'اشتراك خدمة';
    const nextRenewalDate = calculateNextRenewalDate(sub.start_date, sub.billing_day);

    return {
      ...sub,
      clientName: client?.name ?? 'عميل غير معروف',
      clientCompany: client?.company_name ?? null,
      serviceName,
      nextRenewalDate,
    };
  });
}

/**
 * Fetches all website projects with client information and calculated milestones
 */
export async function fetchWebsiteProjects(
  driver: IDatabaseDriver
): Promise<WebsiteProjectWithDetails[]> {
  const projectRows = await driver.query<WebsiteProjectRecord>(
    `SELECT id, client_id, name, total_price, start_date, expected_delivery_date,
            next_payment_amount, next_payment_date, status, notes, created_at, updated_at
     FROM website_projects
     ORDER BY created_at DESC;`
  );

  const clientRows = await driver.query<{ id: string; name: string; company_name: string | null }>(
    `SELECT id, name, company_name FROM clients;`
  );
  const clientMap = new Map<string, { name: string; company_name: string | null }>();
  clientRows.forEach((c) => clientMap.set(c.id, c));

  return projectRows.map((proj) => {
    const client = clientMap.get(proj.client_id);
    const info = getWebsiteMilestoneInfo(proj.status);

    return {
      ...proj,
      clientName: client?.name ?? 'عميل غير معروف',
      clientCompany: client?.company_name ?? null,
      progressPercentage: info.progressPercentage,
      milestoneTitle: info.milestoneTitle,
    };
  });
}

/**
 * Generates monthly dues for all active contracts for a given year & month.
 * Avoids duplicate dues using the unique constraint.
 */
export async function generateMonthlyDuesForActiveContracts(
  driver: IDatabaseDriver,
  year: number,
  month: number
): Promise<{ generatedCount: number; skippedCount: number }> {
  const activeContracts = await driver.query<MarketingContractRecord>(
    `SELECT id, client_id, monthly_amount, start_date, end_date, status, notes, created_at, updated_at
     FROM marketing_contracts
     WHERE status = 'active';`
  );

  const contractRepo = new ContractRepository(driver);
  let generatedCount = 0;
  let skippedCount = 0;

  const mm = String(month).padStart(2, '0');
  const dueDate = `${year}-${mm}-01`;

  for (const contract of activeContracts) {
    // Check if contract is within valid active period for that year/month
    const startPeriod = contract.start_date.substring(0, 7);
    const targetPeriod = `${year}-${mm}`;
    if (startPeriod > targetPeriod) {
      skippedCount++;
      continue;
    }
    if (contract.end_date && contract.end_date.substring(0, 7) < targetPeriod) {
      skippedCount++;
      continue;
    }

    // Check if due already exists
    const existing = await driver.query<{ id: string }>(
      `SELECT id FROM marketing_monthly_dues WHERE contract_id = ? AND year = ? AND month = ? LIMIT 1;`,
      [contract.id, year, month]
    );

    if (existing.length > 0) {
      skippedCount++;
      continue;
    }

    try {
      await contractRepo.generateMonthlyDue(contract.id, year, month, dueDate);
      generatedCount++;
    } catch (e) {
      console.warn(`Failed to generate due for contract ${contract.id}:`, e);
      skippedCount++;
    }
  }

  return { generatedCount, skippedCount };
}
