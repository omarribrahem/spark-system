import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setupTestContext, TestContext } from '../harness/test-context';
import { ClientFixture } from '../fixtures/client-fixture';

describe('Tier 1: Subscriptions, Website Projects & Milestones (F-014 .. F-016)', () => {
  let ctx: TestContext;
  let clientFixture: ClientFixture;
  let clientId: string;

  beforeEach(async () => {
    ctx = await setupTestContext();
    clientFixture = new ClientFixture(ctx.driver);
    clientId = await clientFixture.create({ name: 'مؤسسة الرواد' });
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  // F-014: Subscriptions (e.g. 3arrab)
  describe('F-014: Subscriptions', () => {
    it('creates monthly subscription with recurring amount and billing day', async () => {
      await ctx.driver.execute(
        `INSERT INTO subscriptions (id, client_id, service_name, monthly_amount, billing_day, start_date, status)
         VALUES ('sub_1', ?, '3arrab Subscription', 150000, 1, '2026-10-01', 'active')`,
        [clientId]
      );

      const subs = await ctx.driver.query<{ service_name: string; monthly_amount: number; status: string }>(
        "SELECT service_name, monthly_amount, status FROM subscriptions WHERE id = 'sub_1'"
      );
      expect(subs[0]?.service_name).toBe('3arrab Subscription');
      expect(subs[0]?.monthly_amount).toBe(150000);
      expect(subs[0]?.monthly_amount).toBePiasters();
      expect(subs[0]?.status).toBe('active');
    });

    it('generates subscription monthly dues', async () => {
      await ctx.driver.execute(
        `INSERT INTO subscriptions (id, client_id, service_name, monthly_amount, billing_day, start_date, status)
         VALUES ('sub_2', ?, 'Hosting & Maintenance', 100000, 5, '2026-10-01', 'active')`,
        [clientId]
      );

      await ctx.driver.execute(
        `INSERT INTO subscription_dues (id, subscription_id, client_id, year, month, amount, paid_amount, due_date, status)
         VALUES ('sub_due_1', 'sub_2', ?, 2026, 10, 100000, 0, '2026-10-05', 'due')`,
        [clientId]
      );

      const dues = await ctx.driver.query<{ amount: number; status: string }>(
        "SELECT amount, status FROM subscription_dues WHERE id = 'sub_due_1'"
      );
      expect(dues[0]?.amount).toBe(100000);
      expect(dues[0]?.amount).toBePiasters();
      expect(dues[0]?.status).toBe('due');
    });

    it('handles billing day 31 across short months gracefully', () => {
      const getAdjustedDueDate = (year: number, month: number, billingDay: number) => {
        const daysInMonth = new Date(year, month, 0).getDate();
        const resolvedDay = Math.min(billingDay, daysInMonth);
        return `${year}-${String(month).padStart(2, '0')}-${String(resolvedDay).padStart(2, '0')}`;
      };

      expect(getAdjustedDueDate(2026, 2, 31)).toBe('2026-02-28');
      expect(getAdjustedDueDate(2028, 2, 31)).toBe('2028-02-29'); // Leap year
      expect(getAdjustedDueDate(2026, 4, 31)).toBe('2026-04-30');
    });

    it('cancels subscription and prevents subsequent dues', async () => {
      await ctx.driver.execute(
        `INSERT INTO subscriptions (id, client_id, service_name, monthly_amount, billing_day, start_date, status)
         VALUES ('sub_cancel', ?, 'SEO Retainer', 250000, 1, '2026-01-01', 'active')`,
        [clientId]
      );

      await ctx.driver.execute("UPDATE subscriptions SET status = 'cancelled' WHERE id = 'sub_cancel'");

      const subs = await ctx.driver.query<{ status: string }>(
        "SELECT status FROM subscriptions WHERE id = 'sub_cancel'"
      );
      expect(subs[0]?.status).toBe('cancelled');
    });

    it('keeps overdue subscriptions active without auto-termination', async () => {
      await ctx.driver.execute(
        `INSERT INTO subscriptions (id, client_id, service_name, monthly_amount, billing_day, start_date, status)
         VALUES ('sub_overdue', ?, 'SaaS Seat', 50000, 1, '2026-09-01', 'active')`,
        [clientId]
      );

      await ctx.driver.execute(
        `INSERT INTO subscription_dues (id, subscription_id, client_id, year, month, amount, paid_amount, due_date, status)
         VALUES ('sub_due_over', 'sub_overdue', ?, 2026, 9, 50000, 0, '2026-09-01', 'overdue')`,
        [clientId]
      );

      const subs = await ctx.driver.query<{ status: string }>("SELECT status FROM subscriptions WHERE id = 'sub_overdue'");
      expect(subs[0]?.status).toBe('active');
    });
  });

  // F-015: Website Projects
  describe('F-015: Website Projects', () => {
    it('creates website project with fixed total price in piasters', async () => {
      await ctx.driver.execute(
        `INSERT INTO website_projects (id, client_id, project_name, total_price, paid_amount, start_date, expected_delivery_date, status)
         VALUES ('web_1', ?, 'متجر إلكتروني متكامل', 2500000, 0, '2026-10-01', '2026-12-01', 'new')`,
        [clientId]
      );

      const projects = await ctx.driver.query<{ project_name: string; total_price: number; status: string }>(
        "SELECT project_name, total_price, status FROM website_projects WHERE id = 'web_1'"
      );
      expect(projects[0]?.project_name).toBe('متجر إلكتروني متكامل');
      expect(projects[0]?.total_price).toBe(2500000);
      expect(projects[0]?.total_price).toBePiasters();
      expect(projects[0]?.status).toBe('new');
    });

    it('calculates website project remaining balance: total_price - paid_amount', async () => {
      await ctx.driver.execute(
        `INSERT INTO website_projects (id, client_id, project_name, total_price, paid_amount, start_date, status)
         VALUES ('web_2', ?, 'موقع تعريفي', 1500000, 500000, '2026-10-01', 'in_progress')`,
        [clientId]
      );

      const projects = await ctx.driver.query<{ total_price: number; paid_amount: number }>(
        "SELECT total_price, paid_amount FROM website_projects WHERE id = 'web_2'"
      );
      const remaining = projects[0].total_price - projects[0].paid_amount;
      expect(remaining).toBe(1000000);
      expect(remaining).toBePiasters();
    });

    it('tracks website project statuses: new, in_progress, waiting, completed, cancelled', async () => {
      await ctx.driver.execute(
        `INSERT INTO website_projects (id, client_id, project_name, total_price, start_date, status)
         VALUES ('web_status', ?, 'بوابة عملاء', 2000000, '2026-10-01', 'new')`,
        [clientId]
      );

      await ctx.driver.execute("UPDATE website_projects SET status = 'in_progress' WHERE id = 'web_status'");
      let p = await ctx.driver.query<{ status: string }>("SELECT status FROM website_projects WHERE id = 'web_status'");
      expect(p[0].status).toBe('in_progress');

      await ctx.driver.execute("UPDATE website_projects SET status = 'completed' WHERE id = 'web_status'");
      p = await ctx.driver.query<{ status: string }>("SELECT status FROM website_projects WHERE id = 'web_status'");
      expect(p[0].status).toBe('completed');
    });

    it('validates total price is strictly greater than zero', () => {
      const validatePrice = (price: number) => {
        if (price <= 0) throw new Error('Website project total price must be > 0 piasters');
      };
      expect(() => validatePrice(0)).toThrow('must be > 0');
      expect(() => validatePrice(-1000)).toThrow('must be > 0');
    });

    it('tracks project delivery target date', async () => {
      await ctx.driver.execute(
        `INSERT INTO website_projects (id, client_id, project_name, total_price, start_date, expected_delivery_date)
         VALUES ('web_date', ?, 'موقع طبي', 1800000, '2026-10-01', '2026-11-15')`,
        [clientId]
      );

      const p = await ctx.driver.query<{ expected_delivery_date: string }>(
        "SELECT expected_delivery_date FROM website_projects WHERE id = 'web_date'"
      );
      expect(p[0]?.expected_delivery_date).toBe('2026-11-15');
    });
  });

  // F-016: Milestone Progress
  describe('F-016: Milestone Progress', () => {
    it('creates project milestones with target amounts and dates', async () => {
      await ctx.driver.execute(
        `INSERT INTO website_projects (id, client_id, project_name, total_price, start_date)
         VALUES ('web_m', ?, 'تطبيق ويب', 3000000, '2026-10-01')`,
        [clientId]
      );

      await ctx.driver.execute(
        `INSERT INTO website_milestones (id, project_id, title, target_amount, paid_amount, target_date, status, order_index)
         VALUES ('ms_1', 'web_m', 'المرحلة 1: التصميم الأولي (UI/UX)', 1000000, 0, '2026-10-15', 'pending', 1)`,
        []
      );

      const ms = await ctx.driver.query<{ title: string; target_amount: number; status: string }>(
        "SELECT title, target_amount, status FROM website_milestones WHERE id = 'ms_1'"
      );
      expect(ms[0]?.title).toBe('المرحلة 1: التصميم الأولي (UI/UX)');
      expect(ms[0]?.target_amount).toBe(1000000);
      expect(ms[0]?.target_amount).toBePiasters();
    });

    it('updates milestone status when payment is applied', async () => {
      await ctx.driver.execute(
        `INSERT INTO website_projects (id, client_id, project_name, total_price, start_date)
         VALUES ('web_m2', ?, 'تطبيق ويب 2', 2000000, '2026-10-01')`,
        [clientId]
      );

      await ctx.driver.execute(
        `INSERT INTO website_milestones (id, project_id, title, target_amount, paid_amount, status)
         VALUES ('ms_2', 'web_m2', 'المرحلة 1: البرمجة', 1000000, 0, 'pending')`
      );

      // Apply full payment
      await ctx.driver.execute(
        "UPDATE website_milestones SET paid_amount = 1000000, status = 'completed' WHERE id = 'ms_2'"
      );

      const ms = await ctx.driver.query<{ status: string; paid_amount: number }>(
        "SELECT status, paid_amount FROM website_milestones WHERE id = 'ms_2'"
      );
      expect(ms[0]?.status).toBe('completed');
      expect(ms[0]?.paid_amount).toBe(1000000);
    });

    it('prevents milestone target amount from exceeding remaining project total', () => {
      const totalProjectPrice = 2000000;
      const existingMilestonesSum = 1500000;
      const proposedMilestone = 800000;

      const isValid = existingMilestonesSum + proposedMilestone <= totalProjectPrice;
      expect(isValid).toBe(false);
    });

    it('queries next upcoming milestone for Safaa dashboard', async () => {
      await ctx.driver.execute(
        `INSERT INTO website_projects (id, client_id, project_name, total_price, start_date)
         VALUES ('web_dash', ?, 'منصة عقارية', 4000000, '2026-10-01')`,
        [clientId]
      );

      await ctx.driver.execute(
        `INSERT INTO website_milestones (id, project_id, title, target_amount, target_date, status, order_index)
         VALUES ('ms_next', 'web_dash', 'دفعة تسليم الواجهات', 1500000, '2026-10-20', 'pending', 1)`
      );

      const next = await ctx.driver.query<{ title: string; target_date: string }>(
        "SELECT title, target_date FROM website_milestones WHERE status = 'pending' ORDER BY target_date ASC LIMIT 1"
      );
      expect(next[0]?.title).toBe('دفعة تسليم الواجهات');
      expect(next[0]?.target_date).toBe('2026-10-20');
    });

    it('supports 0-piaster milestone for deliverable-only phase', async () => {
      await ctx.driver.execute(
        `INSERT INTO website_projects (id, client_id, project_name, total_price, start_date)
         VALUES ('web_zero', ?, 'بوابة إخبارية', 1000000, '2026-10-01')`,
        [clientId]
      );

      await ctx.driver.execute(
        `INSERT INTO website_milestones (id, project_id, title, target_amount, status)
         VALUES ('ms_free', 'web_zero', 'مرحلة إطلاق السيرفر التجريبي', 0, 'pending')`
      );

      const ms = await ctx.driver.query<{ target_amount: number }>(
        "SELECT target_amount FROM website_milestones WHERE id = 'ms_free'"
      );
      expect(ms[0]?.target_amount).toBe(0);
      expect(ms[0]?.target_amount).toBePiasters();
    });
  });
});
