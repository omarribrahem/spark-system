/**
 * Contracts, Subscriptions & Website Projects Module Unit Tests (Milestone M4)
 * Covers:
 * - Marketing contract creation, rate locking in integer piasters, initial due generation.
 * - Monthly dues generation, uniqueness constraint (contract_id, year, month).
 * - Due status evaluation and tracking.
 * - Recurring software/tool subscriptions with cadence and renewal dates.
 * - Website project creation with milestones and progression.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createWasmDriver, WasmSqlDriver } from '../../../src/database/driver/wasm-driver';
import { runMigrations } from '../../../src/database/migrations/runner';
import {
  ClientRepository,
  ContractRepository,
  PaymentRepository,
} from '../../../src/database/repositories';
import {
  fetchMarketingContracts,
  generateMonthlyDuesForActiveContracts,
  createSubscription,
  fetchSubscriptions,
  fetchWebsiteProjects,
  calculateNextRenewalDate,
  getWebsiteMilestoneInfo,
} from '../../../src/modules/contracts/contract-service';
import { DomainInvariantError } from '../../../src/domain/rules/invariants';

describe('Contracts & Subscriptions Module Unit Tests (M4)', () => {
  let driver: WasmSqlDriver;
  let clientRepo: ClientRepository;
  let contractRepo: ContractRepository;
  let paymentRepo: PaymentRepository;
  let clientId: string;

  beforeEach(async () => {
    driver = await createWasmDriver();
    await runMigrations(driver);

    clientRepo = new ClientRepository(driver);
    contractRepo = new ContractRepository(driver);
    paymentRepo = new PaymentRepository(driver);

    // Create a base client
    const client = await clientRepo.create({
      name: 'شركة الأمل للتسويق',
      companyName: 'مجموعة الأمل التجارية',
      phone: '01011223344',
    });
    clientId = client.id;
  });

  afterEach(async () => {
    await driver.close();
  });

  describe('Marketing Contracts & Historical Rate Locking', () => {
    it('creates a marketing contract with locked integer piasters monthly rate', async () => {
      const contract = await contractRepo.createMarketingContract({
        clientId,
        monthlyAmount: 750000, // 7,500 EGP = 750,000 piasters
        startDate: '2026-09-01',
        endDate: '2027-08-31',
        notes: 'إدارة حملات سوشيال ميديا وإعلانات ممولة',
        status: 'active',
      });

      expect(contract.id).toBeDefined();
      expect(contract.client_id).toBe(clientId);
      expect(contract.monthly_amount).toBe(750000);
      expect(contract.start_date).toBe('2026-09-01');
      expect(contract.end_date).toBe('2027-08-31');
      expect(contract.status).toBe('active');

      const retrieved = await contractRepo.getMarketingContractById(contract.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.monthly_amount).toBe(750000);
    });

    it('rejects marketing contract with non-integer or negative monthly amount', async () => {
      await expect(
        contractRepo.createMarketingContract({
          clientId,
          monthlyAmount: -50000,
          startDate: '2026-09-01',
        })
      ).rejects.toThrow(DomainInvariantError);

      await expect(
        contractRepo.createMarketingContract({
          clientId,
          monthlyAmount: 1250.75 as unknown as number, // floating point forbidden
          startDate: '2026-09-01',
        })
      ).rejects.toThrow(DomainInvariantError);
    });

    it('rejects contract creation with empty clientId or invalid dates', async () => {
      await expect(
        contractRepo.createMarketingContract({
          clientId: '   ',
          monthlyAmount: 500000,
          startDate: '2026-09-01',
        })
      ).rejects.toThrow(DomainInvariantError);

      await expect(
        contractRepo.createMarketingContract({
          clientId,
          monthlyAmount: 500000,
          startDate: 'not-a-date',
        })
      ).rejects.toThrow(DomainInvariantError);
    });
  });

  describe('Monthly Dues Generation & Uniqueness Enforce', () => {
    it('generates a monthly due locking the contract current rate', async () => {
      const contract = await contractRepo.createMarketingContract({
        clientId,
        monthlyAmount: 500000, // 5,000 EGP
        startDate: '2026-09-01',
      });

      const due = await contractRepo.generateMonthlyDue(
        contract.id,
        2026,
        9,
        '2026-09-01'
      );

      expect(due.id).toBeDefined();
      expect(due.contract_id).toBe(contract.id);
      expect(due.year).toBe(2026);
      expect(due.month).toBe(9);
      expect(due.base_amount).toBe(500000); // Locked base amount!
      expect(due.due_date).toBe('2026-09-01');

      const duesList = await contractRepo.listDuesByContract(contract.id);
      expect(duesList).toHaveLength(1);
      expect(duesList[0].id).toBe(due.id);
    });

    it('strictly enforces unique constraint on (contract_id, year, month)', async () => {
      const contract = await contractRepo.createMarketingContract({
        clientId,
        monthlyAmount: 600000,
        startDate: '2026-09-01',
      });

      // First generation succeeds
      await contractRepo.generateMonthlyDue(contract.id, 2026, 9, '2026-09-01');

      // Duplicate generation for same contract, year, and month must fail
      await expect(
        contractRepo.generateMonthlyDue(contract.id, 2026, 9, '2026-09-01')
      ).rejects.toThrow();
    });

    it('bulk generates dues for active contracts without duplicating existing ones', async () => {
      const contract1 = await contractRepo.createMarketingContract({
        clientId,
        monthlyAmount: 400000,
        startDate: '2026-08-01',
        status: 'active',
      });

      const contract2 = await contractRepo.createMarketingContract({
        clientId,
        monthlyAmount: 800000,
        startDate: '2026-09-01',
        status: 'active',
      });

      // Pre-generate for contract1 for month 9
      await contractRepo.generateMonthlyDue(contract1.id, 2026, 9, '2026-09-01');

      // Run bulk generator for month 9
      const result = await generateMonthlyDuesForActiveContracts(driver, 2026, 9);
      expect(result.generatedCount).toBe(1); // Only contract2 was generated
      expect(result.skippedCount).toBe(1); // Contract1 was safely skipped

      const contractsWithDetails = await fetchMarketingContracts(driver);
      const c1Details = contractsWithDetails.find((c) => c.id === contract1.id);
      const c2Details = contractsWithDetails.find((c) => c.id === contract2.id);

      expect(c1Details?.duesCount).toBe(1);
      expect(c2Details?.duesCount).toBe(1);
    });
  });

  describe('Dues Financial Evaluation & Allocation Integration', () => {
    it('evaluates paidAmount and remainingAmount after recording allocated payment', async () => {
      const contract = await contractRepo.createMarketingContract({
        clientId,
        monthlyAmount: 1000000, // 10,000 EGP = 1,000,000 piasters
        startDate: '2026-09-01',
      });

      const due = await contractRepo.generateMonthlyDue(contract.id, 2026, 9, '2026-09-01');

      // Check initial state
      let contracts = await fetchMarketingContracts(driver);
      let c = contracts.find((x) => x.id === contract.id)!;
      expect(c.totalRemainingDuesPiasters).toBe(1000000);
      expect(c.paidDuesCount).toBe(0);

      // Record a partial payment of 4,000 EGP (400,000 piasters) allocated to this due
      await paymentRepo.recordPayment({
        clientId,
        amount: 400000,
        method: 'bank_transfer',
        date: '2026-09-05',
        targets: [
          {
            targetType: 'marketing_due',
            targetId: due.id,
            duePiasters: 1000000,
            requestedPiasters: 400000,
          },
        ],
      });

      contracts = await fetchMarketingContracts(driver);
      c = contracts.find((x) => x.id === contract.id)!;
      expect(c.totalRemainingDuesPiasters).toBe(600000); // 10,000 - 4,000 = 6,000 EGP remaining
      expect(c.paidDuesCount).toBe(0);

      // Record remaining payment of 6,000 EGP (600,000 piasters)
      await paymentRepo.recordPayment({
        clientId,
        amount: 600000,
        method: 'cash',
        date: '2026-09-10',
        targets: [
          {
            targetType: 'marketing_due',
            targetId: due.id,
            duePiasters: 600000,
            requestedPiasters: 600000,
          },
        ],
      });

      contracts = await fetchMarketingContracts(driver);
      c = contracts.find((x) => x.id === contract.id)!;
      expect(c.totalRemainingDuesPiasters).toBe(0);
      expect(c.paidDuesCount).toBe(1);
    });
  });

  describe('Subscriptions & Recurring Services', () => {
    it('creates a software subscription with cadence and calculates next renewal date', async () => {
      const sub = await createSubscription(driver, {
        clientId,
        serviceName: 'استضافة سحابية ودومين احترافي',
        monthlyAmount: 120000, // 1,200 EGP
        startDate: '2026-09-01',
        billingDay: 15,
        notes: 'تجديد تلقائي في يوم 15 من كل شهر',
      });

      expect(sub.id).toBeDefined();
      expect(sub.client_id).toBe(clientId);
      expect(sub.monthly_amount).toBe(120000);
      expect(sub.billing_day).toBe(15);
      expect(sub.status).toBe('active');

      const subscriptions = await fetchSubscriptions(driver);
      expect(subscriptions).toHaveLength(1);
      expect(subscriptions[0].clientName).toBe('شركة الأمل للتسويق');
      expect(subscriptions[0].serviceName).toBe('استضافة سحابية ودومين احترافي');
      expect(subscriptions[0].nextRenewalDate).toBeDefined();
    });

    it('calculates next renewal date accurately given billing day', () => {
      const renewalDate = calculateNextRenewalDate('2026-09-01', 1);
      expect(renewalDate).toMatch(/^[0-9]{4}-[0-9]{2}-01$/);
    });
  });

  describe('Website Development Projects & Milestones', () => {
    it('creates a website project with milestone tracking', async () => {
      const project = await contractRepo.createWebsiteProject({
        clientId,
        name: 'متجر مجوهرات إلكتروني',
        totalPrice: 3500000, // 35,000 EGP = 3,500,000 piasters
        startDate: '2026-09-01',
        expectedDeliveryDate: '2026-11-15',
        nextPaymentAmount: 1500000,
        nextPaymentDate: '2026-09-15',
        notes: 'تصميم UI/UX، ربط بوابات الدفع والشحن',
      });

      expect(project.id).toBeDefined();
      expect(project.client_id).toBe(clientId);
      expect(project.name).toBe('متجر مجوهرات إلكتروني');
      expect(project.total_price).toBe(3500000);
      expect(project.status).toBe('new');

      const projects = await fetchWebsiteProjects(driver);
      expect(projects).toHaveLength(1);
      expect(projects[0].progressPercentage).toBe(15); // 'new' milestone is 15%
      expect(projects[0].milestoneTitle).toBe('بدء المشروع والتعاقد');
    });

    it('progresses website project milestones and updates progress percentages', async () => {
      const project = await contractRepo.createWebsiteProject({
        clientId,
        name: 'موقع تعريفي للشركة',
        totalPrice: 2000000,
        startDate: '2026-09-01',
      });

      // Advance to in_progress
      await contractRepo.updateWebsiteMilestone(project.id, 'in_progress');
      let projects = await fetchWebsiteProjects(driver);
      expect(projects[0].status).toBe('in_progress');
      expect(projects[0].progressPercentage).toBe(50);

      // Advance to waiting for client
      await contractRepo.updateWebsiteMilestone(project.id, 'waiting');
      projects = await fetchWebsiteProjects(driver);
      expect(projects[0].status).toBe('waiting');
      expect(projects[0].progressPercentage).toBe(80);

      // Advance to completed
      await contractRepo.updateWebsiteMilestone(project.id, 'completed');
      projects = await fetchWebsiteProjects(driver);
      expect(projects[0].status).toBe('completed');
      expect(projects[0].progressPercentage).toBe(100);
    });

    it('returns valid milestone metadata for all project statuses', () => {
      expect(getWebsiteMilestoneInfo('new').progressPercentage).toBe(15);
      expect(getWebsiteMilestoneInfo('in_progress').progressPercentage).toBe(50);
      expect(getWebsiteMilestoneInfo('waiting').progressPercentage).toBe(80);
      expect(getWebsiteMilestoneInfo('completed').progressPercentage).toBe(100);
      expect(getWebsiteMilestoneInfo('cancelled').progressPercentage).toBe(0);
    });
  });
});
