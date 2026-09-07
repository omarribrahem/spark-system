import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createWasmDriver, WasmSqlDriver } from '../../../src/database/driver/wasm-driver';
import { runMigrations } from '../../../src/database/migrations/runner';
import {
  ClientRepository,
  PaymentRepository,
  ContractRepository,
  PackageRepository,
  BookingRepository,
} from '../../../src/database/repositories';
import { DomainInvariantError } from '../../../src/domain/rules/invariants';

describe('Clients Module Unit Tests (M3)', () => {
  let driver: WasmSqlDriver;
  let clientRepo: ClientRepository;
  let paymentRepo: PaymentRepository;
  let contractRepo: ContractRepository;
  let packageRepo: PackageRepository;
  let bookingRepo: BookingRepository;

  beforeEach(async () => {
    driver = await createWasmDriver();
    await runMigrations(driver);

    clientRepo = new ClientRepository(driver);
    paymentRepo = new PaymentRepository(driver);
    contractRepo = new ContractRepository(driver);
    packageRepo = new PackageRepository(driver);
    bookingRepo = new BookingRepository(driver);
  });

  afterEach(async () => {
    await driver.close();
  });

  describe('Client Management & CRUD', () => {
    it('creates a client with valid Egyptian data and persists to SQLite', async () => {
      const client = await clientRepo.create({
        name: 'محمد الشناوي',
        companyName: 'شناوي ستوديو',
        phone: '01099887766',
        secondaryPhone: '01122334455',
        notes: 'يفضل التواصل بعد الظهر',
      });

      expect(client.id).toBeDefined();
      expect(client.name).toBe('محمد الشناوي');
      expect(client.company_name).toBe('شناوي ستوديو');
      expect(client.phone).toBe('01099887766');
      expect(client.active).toBe(1);

      const retrieved = await clientRepo.getById(client.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.name).toBe('محمد الشناوي');
    });

    it('rejects client creation with empty or whitespace-only name', async () => {
      await expect(
        clientRepo.create({
          name: '   ',
          companyName: 'شركة وهمية',
        })
      ).rejects.toThrow(DomainInvariantError);
    });

    it('updates client fields accurately and preserves unchanged values', async () => {
      const client = await clientRepo.create({
        name: 'عميل أولي',
        phone: '01011111111',
      });

      const updated = await clientRepo.update(client.id, {
        name: 'عميل معدل',
        companyName: 'براند جديد',
      });

      expect(updated.name).toBe('عميل معدل');
      expect(updated.company_name).toBe('براند جديد');
      expect(updated.phone).toBe('01011111111');
    });

    it('archives (soft-deletes) client and restores without data loss', async () => {
      const client = await clientRepo.create({
        name: 'عميل للأرشفة',
      });
      expect(client.active).toBe(1);

      // Archive
      await clientRepo.archive(client.id);
      const archived = await clientRepo.getById(client.id);
      expect(archived?.active).toBe(0);

      // Unarchive
      await clientRepo.unarchive(client.id);
      const restored = await clientRepo.getById(client.id);
      expect(restored?.active).toBe(1);
    });

    it('filters client lists by active, archived, and search query', async () => {
      await clientRepo.create({ name: 'كريم عبد العزيز', companyName: 'الماسة', active: 1 });
      const client2 = await clientRepo.create({ name: 'سارة طارق', phone: '01234567890', active: 1 });
      await clientRepo.archive(client2.id);

      const activeList = await clientRepo.list({ activeOnly: true });
      expect(activeList.some((c) => c.name === 'كريم عبد العزيز')).toBe(true);
      expect(activeList.some((c) => c.name === 'سارة طارق')).toBe(false);

      const archivedList = await clientRepo.list({ archivedOnly: true });
      expect(archivedList.some((c) => c.name === 'سارة طارق')).toBe(true);

      const searchList = await clientRepo.list({ searchQuery: 'الماسة' });
      expect(searchList.length).toBe(1);
      expect(searchList[0].name).toBe('كريم عبد العزيز');
    });
  });

  describe('Client Profile 360 Aggregated Ledger', () => {
    it('aggregates contracts, dues, packages, bookings, and unallocated credit for a client', async () => {
      // 1. Create Client
      const client = await clientRepo.create({
        name: 'مؤسسة الأمل للإنتاج',
        companyName: 'الأمل ميديا',
      });

      // 2. Create Marketing Contract with dues
      const contract = await contractRepo.createMarketingContract({
        clientId: client.id,
        monthlyAmount: 800000, // 8,000 EGP = 800,000 piasters
        startDate: '2026-09-01',
      });
      const due = await contractRepo.generateMonthlyDue(contract.id, 2026, 9, '2026-09-10');
      expect(due.base_amount).toBe(800000);

      // 3. Create Sold Package (10 hours = 600 minutes + 3 reels)
      const pkg = await packageRepo.createClientPackage({
        clientId: client.id,
        nameSnapshot: 'باقة كريتور 10 ساعات + 3 ريلز',
        soldPrice: 1200000, // 12,000 EGP
        purchasedAt: '2026-09-01',
        items: [
          { unit: 'hours', quantity: 600 },
          { unit: 'reels', quantity: 3 },
        ],
      });
      expect(pkg.items.length).toBe(2);

      // 4. Create Studio Booking linked to package (2 hours = 120 minutes)
      const booking = await bookingRepo.createBooking({
        clientId: client.id,
        date: '2026-09-15',
        plannedStart: '14:00',
        plannedEnd: '16:00',
        clientPackageId: pkg.id,
      });
      expect(booking.planned_minutes).toBe(120);

      // Check package reserved minutes
      const pkgAfterBooking = await packageRepo.getById(pkg.id);
      const hoursItem = pkgAfterBooking?.items.find((i) => i.unit === 'hours');
      expect(hoursItem?.reserved_quantity).toBe(120);

      // 5. Record Payment of 10,000 EGP (1,000,000 piasters) with 8,000 EGP allocated to due
      const payment = await paymentRepo.recordPayment({
        clientId: client.id,
        amount: 1000000, // 10,000 EGP
        method: 'bank_transfer',
        date: '2026-09-05',
        targets: [
          {
            targetType: 'marketing_due',
            targetId: due.id,
            duePiasters: 800000,
          },
        ],
      });

      // Due should be fully paid
      expect(payment.allocations.length).toBe(1);
      expect(payment.allocations[0].amount).toBe(800000);
      expect(payment.unallocatedCreditPiasters).toBe(200000); // 2,000 EGP surplus

      // 6. Verify client's total unallocated credit
      const credit = await paymentRepo.getClientCreditPiasters(client.id);
      expect(credit).toBe(200000);

      // 7. Verify booking cancellation restores package hours
      await bookingRepo.cancelBooking(booking.id, 'إلغاء لظروف خاصة بالعميل');
      const pkgAfterCancel = await packageRepo.getById(pkg.id);
      const hoursAfterCancel = pkgAfterCancel?.items.find((i) => i.unit === 'hours');
      expect(hoursAfterCancel?.reserved_quantity).toBe(0);

      // 8. Verify archiving client preserves contracts, packages, and payments
      await clientRepo.archive(client.id);
      const paymentsList = await paymentRepo.listByClient(client.id);
      expect(paymentsList.length).toBe(1);
      const packagesList = await packageRepo.listByClient(client.id);
      expect(packagesList.length).toBe(1);
    });
  });
});
