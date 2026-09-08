import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createWasmDriver, WasmSqlDriver } from '../../../src/database/driver/wasm-driver';
import { runMigrations } from '../../../src/database/migrations/runner';
import {
  ClientRepository,
  ClientCustomFieldRepository,
  ClientFilterPresetRepository,
  ContractRepository,
} from '../../../src/database/repositories';
import { DomainInvariantError } from '../../../src/domain/rules/invariants';

describe('Client Custom Fields & Dynamic Filtering Integration Tests', () => {
  let driver: WasmSqlDriver;
  let clientRepo: ClientRepository;
  let customFieldRepo: ClientCustomFieldRepository;
  let presetRepo: ClientFilterPresetRepository;
  let contractRepo: ContractRepository;

  beforeEach(async () => {
    driver = await createWasmDriver();
    await runMigrations(driver);

    clientRepo = new ClientRepository(driver);
    customFieldRepo = new ClientCustomFieldRepository(driver);
    presetRepo = new ClientFilterPresetRepository(driver);
    contractRepo = new ContractRepository(driver);
  });

  afterEach(async () => {
    await driver.close();
  });

  describe('Core Client Fields & Backwards Compatibility', () => {
    it('preserves existing client records and allows reading new core columns', async () => {
      // Legacy insert style without new columns
      const legacyId = 'legacy-client-1';
      const now = new Date().toISOString();
      await driver.execute(
        `INSERT INTO clients (id, name, company_name, phone, active, created_at, updated_at)
         VALUES (?, ?, ?, ?, 1, ?, ?);`,
        [legacyId, 'مكتب الأستاذ عادل', 'عادل إديو', '01012345678', now, now]
      );

      const retrieved = await clientRepo.getById(legacyId);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.name).toBe('مكتب الأستاذ عادل');
      // Default fallback values
      expect(retrieved?.client_type).toBe('individual');
      expect(retrieved?.preferred_contact).toBe('phone');
      expect(retrieved?.city).toBeNull();
    });

    it('creates client with all extended core fields', async () => {
      const client = await clientRepo.create({
        name: 'د. حسام غالي',
        companyName: 'أكاديمية حسام',
        phone: '01055667788',
        whatsapp: '01055667788',
        email: 'hossam@example.com',
        city: 'المنصورة',
        clientType: 'teacher',
        contactName: 'أ. سامح',
        contactRole: 'مدير العمليات',
        preferredContact: 'whatsapp',
      });

      expect(client.id).toBeDefined();
      expect(client.client_type).toBe('teacher');
      expect(client.whatsapp).toBe('01055667788');
      expect(client.email).toBe('hossam@example.com');
      expect(client.city).toBe('المنصورة');
      expect(client.preferred_contact).toBe('whatsapp');
    });
  });

  describe('Custom Field Definitions & Options Management', () => {
    it('creates definitions for single_select and multi_select with options', async () => {
      const singleDef = await customFieldRepo.createDefinition({
        fieldKey: 'primary_subject',
        label: 'المادة الأساسية',
        fieldType: 'single_select',
        section: 'academic',
        filterable: true,
        options: [
          { valueKey: 'physics', label: 'فيزياء' },
          { valueKey: 'chemistry', label: 'كيمياء' },
        ],
      });

      expect(singleDef.id).toBeDefined();
      expect(singleDef.options).toHaveLength(2);
      expect(singleDef.options?.[0].label).toBe('فيزياء');

      const multiDef = await customFieldRepo.createDefinition({
        fieldKey: 'social_channels',
        label: 'قنوات النشر',
        fieldType: 'multi_select',
        section: 'marketing',
        filterable: true,
        options: [
          { valueKey: 'tiktok', label: 'تيك توك' },
          { valueKey: 'youtube', label: 'يوتيوب' },
          { valueKey: 'facebook', label: 'فيسبوك' },
        ],
      });

      expect(multiDef.id).toBeDefined();
      expect(multiDef.options).toHaveLength(3);
    });

    it('rejects reserved field keys and duplicate keys', async () => {
      await expect(
        customFieldRepo.createDefinition({
          fieldKey: 'phone', // reserved
          label: 'هاتف إضافي',
          fieldType: 'phone',
        })
      ).rejects.toThrow(DomainInvariantError);

      await customFieldRepo.createDefinition({
        fieldKey: 'tax_record_id',
        label: 'رقم السجل الضريبي',
        fieldType: 'short_text',
      });

      await expect(
        customFieldRepo.createDefinition({
          fieldKey: 'tax_record_id', // duplicate
          label: 'رقم السجل مكرر',
          fieldType: 'short_text',
        })
      ).rejects.toThrow(DomainInvariantError);
    });

    it('prevents changing field type when client values exist', async () => {
      const def = await customFieldRepo.createDefinition({
        fieldKey: 'rating_score',
        label: 'التقييم',
        fieldType: 'integer',
      });

      const client = await clientRepo.create({ name: 'عميل تقييم' });
      await customFieldRepo.setValuesForClient(client.id, {
        rating_score: 9,
      });

      await expect(
        customFieldRepo.updateDefinition(def.id, {
          fieldType: 'date',
        })
      ).rejects.toThrow(DomainInvariantError);
    });

    it('prohibits hard deleting custom fields that have client values and requires deactivation instead', async () => {
      const def = await customFieldRepo.createDefinition({
        fieldKey: 'contract_notes_extra',
        label: 'ملاحظات إضافية',
        fieldType: 'short_text',
      });

      const client = await clientRepo.create({ name: 'عميل ملاحظة' });
      await customFieldRepo.setValuesForClient(client.id, {
        contract_notes_extra: 'قيمة مسجلة',
      });

      // Hard delete blocked
      await expect(customFieldRepo.deleteDefinition(def.id)).rejects.toThrow(DomainInvariantError);

      // Soft deactivation succeeds
      await customFieldRepo.deactivateDefinition(def.id);
      const updated = await customFieldRepo.getDefinitionById(def.id);
      expect(updated?.active).toBe(0);

      // Historical value still safely preserved
      const vals = await customFieldRepo.getValuesForClient(client.id);
      expect(vals[def.id].text_value).toBe('قيمة مسجلة');
    });
  });

  describe('Transactional Client Save with Custom Fields', () => {
    it('atomically saves client and custom field values in a single transaction', async () => {
      const moneyDef = await customFieldRepo.createDefinition({
        fieldKey: 'budget_piasters',
        label: 'الميزانية المتوقعة',
        fieldType: 'money_piasters',
      });

      const multiDef = await customFieldRepo.createDefinition({
        fieldKey: 'tech_stack',
        label: 'التقنيات المستخدمة',
        fieldType: 'multi_select',
        options: [
          { valueKey: 'wordpress', label: 'ووردبريس' },
          { valueKey: 'react', label: 'رياكت' },
        ],
      });

      const opt1 = multiDef.options![0].id;
      const opt2 = multiDef.options![1].id;

      const client = await clientRepo.saveClientWithCustomFields(
        {
          name: 'مؤسسة التقنية الحديثة',
          city: 'الإسكندرية',
        },
        {
          budget_piasters: 2500000, // 25,000 EGP
          tech_stack: [opt1, opt2],
        }
      );

      expect(client.id).toBeDefined();

      const values = await customFieldRepo.getValuesForClient(client.id);
      expect(values[moneyDef.id].number_value).toBe(2500000);
      expect(values[multiDef.id].multi_select_option_ids).toHaveLength(2);
      expect(values[multiDef.id].multi_select_option_ids).toContain(opt1);
      expect(values[multiDef.id].multi_select_option_ids).toContain(opt2);
    });

    it('rolls back client creation completely if custom fields fail', async () => {
      const preCount = (await clientRepo.list()).length;

      await expect(
        driver.transaction(async (tx) => {
          await clientRepo.create({ name: 'عميل تجربة الفشل' }, tx);
          // Force an error inside transaction
          throw new Error('Simulated custom field failure');
        })
      ).rejects.toThrow('Simulated custom field failure');

      const postCount = (await clientRepo.list()).length;
      expect(postCount).toBe(preCount);
    });
  });

  describe('Filter Presets CRUD', () => {
    it('creates, lists, updates and deletes client filter presets', async () => {
      const preset = await presetRepo.create('معلمو الجيزة', [
        { id: 'r1', field: 'client_type', operator: 'is', value: 'teacher' },
        { id: 'r2', field: 'city', operator: 'contains', value: 'الجيزة' },
      ]);

      expect(preset.id).toBeDefined();
      expect(preset.name).toBe('معلمو الجيزة');
      expect(preset.rules).toHaveLength(2);

      const all = await presetRepo.list();
      expect(all.some((p) => p.name === 'معلمو الجيزة')).toBe(true);

      const updated = await presetRepo.update(preset.id, {
        name: 'معلمو الجيزة والشيخ زايد',
      });
      expect(updated.name).toBe('معلمو الجيزة والشيخ زايد');

      await presetRepo.delete(preset.id);
      const afterDelete = await presetRepo.getById(preset.id);
      expect(afterDelete).toBeNull();
    });
  });

  describe('Repository SQLite-Level Querying with Filter AST', () => {
    it('filters clients via SQLite with Filter AST and computes live financials', async () => {
      // 1. Create 2 clients
      const client1 = await clientRepo.create({
        name: 'طارق الدسوقي',
        city: 'القاهرة',
        clientType: 'teacher',
      });
      const client2 = await clientRepo.create({
        name: 'شركة سمارت سولوشنز',
        city: 'الإسكندرية',
        clientType: 'company',
      });

      // 2. Add contract & due to client1
      const contract = await contractRepo.createMarketingContract({
        clientId: client1.id,
        monthlyAmount: 600000,
        startDate: '2026-09-01',
      });
      await contractRepo.generateMonthlyDue(contract.id, 2026, 9, '2026-09-10');

      // 3. Query with AST: client_type = teacher AND city contains القاهرة
      const results = await clientRepo.queryWithFilterAST(
        {
          conjunction: 'AND',
          rules: [
            { id: '1', field: 'client_type', operator: 'is', value: 'teacher' },
            { id: '2', field: 'city', operator: 'contains', value: 'القاهرة' },
          ],
        },
        []
      );

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe(client1.id);
      expect(results[0].outstandingDuesPiasters).toBe(600000);
      expect(results[0].activeContractsCount).toBe(1);

      // 4. Query with actual service = marketing
      const serviceResults = await clientRepo.queryWithFilterAST(
        {
          conjunction: 'AND',
          rules: [
            { id: '3', field: 'actual_service', operator: 'has_service', value: 'marketing' },
          ],
        },
        []
      );
      expect(serviceResults.map((r) => r.id)).toContain(client1.id);
      expect(serviceResults.map((r) => r.id)).not.toContain(client2.id);
    });

    it('searches across both core fields and searchable custom fields in SQLite', async () => {
      await customFieldRepo.createDefinition({
        fieldKey: 'national_id',
        label: 'الرقم القومي',
        fieldType: 'short_text',
        searchable: true,
      });

      const client = await clientRepo.saveClientWithCustomFields(
        { name: 'أيمن نور الدين' },
        { national_id: '29901011234567' }
      );

      const defs = await customFieldRepo.listDefinitions();

      // Search by national_id which is in custom field
      const searchResults = await clientRepo.queryWithFilterAST(
        { conjunction: 'AND', rules: [] },
        defs,
        { searchQuery: '29901011234567' }
      );

      expect(searchResults.some((c) => c.id === client.id)).toBe(true);
    });
  });
});
