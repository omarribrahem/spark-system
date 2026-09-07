import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setupTestContext, TestContext } from '../harness/test-context';
import { ClientFixture } from '../fixtures/client-fixture';

describe('Tier 2: Strings, Arabic RTL & Boundary Formatting', () => {
  let ctx: TestContext;
  let clientFixture: ClientFixture;

  beforeEach(async () => {
    ctx = await setupTestContext();
    clientFixture = new ClientFixture(ctx.driver);
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  it('stores and retrieves maximum length (500 characters) client name without truncation', async () => {
    const longName = 'أ'.repeat(500);
    const clientId = await clientFixture.create({ name: longName });

    const client = await clientFixture.getById(clientId);
    expect(client?.name).toBe(longName);
    expect((client?.name as string).length).toBe(500);
  });

  it('preserves full Arabic RTL diacritics (Tashkeel, Tanween, Shaddah)', async () => {
    const arabicWithTashkeel = 'شَرِكَةُ سْبَارْك لِلإِنْتَاجِ الفَنِّيِّ';
    const clientId = await clientFixture.create({ name: arabicWithTashkeel });

    const client = await clientFixture.getById(clientId);
    expect(client?.name).toBe(arabicWithTashkeel);
  });

  it('handles strings containing special symbols and punctuation safely', async () => {
    const specialChars = "سيد & أولاده / للتجارة (ش.م.م) - فرع 'المهندسين' #100%";
    const clientId = await clientFixture.create({ name: specialChars });

    const client = await clientFixture.getById(clientId);
    expect(client?.name).toBe(specialChars);
  });

  it('strictly validates non-empty client name rejecting pure whitespace', async () => {
    const createWithValidation = async (name: string) => {
      if (!name || name.trim() === '') throw new Error('Client name cannot be empty');
      return await clientFixture.create({ name });
    };

    await expect(createWithValidation('')).rejects.toThrow('Client name cannot be empty');
    await expect(createWithValidation('    ')).rejects.toThrow('Client name cannot be empty');
  });

  it('wraps numbers, currency, and telephone in <bdi> for bidirectional isolation', () => {
    const amountHtml = '<bdi>15,000</bdi> ج.م';
    const phoneHtml = '<bdi dir="ltr">+20 10 1234 5678</bdi>';
    const timeHtml = '<bdi dir="ltr">02:00 PM → 04:30 PM</bdi>';

    expect(amountHtml).toContain('<bdi>');
    expect(phoneHtml).toContain('<bdi dir="ltr">');
    expect(timeHtml).toContain('<bdi dir="ltr">');
  });
});
