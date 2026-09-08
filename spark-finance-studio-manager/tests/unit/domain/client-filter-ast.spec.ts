import { describe, it, expect } from 'vitest';
import {
  compileFilterAstToSql,
  FilterAST,
} from '../../../src/domain/models/client-filter-ast';
import { CustomFieldDefinition } from '../../../src/domain/models/client-custom-fields';

describe('Client Filter AST & Query Compiler Unit Tests', () => {
  const mockDefs: CustomFieldDefinition[] = [
    {
      id: 'def-spec',
      field_key: 'specialty',
      label: 'التخصص الأكاديمي',
      field_type: 'short_text',
      section: 'academic',
      help_text: null,
      required: 0,
      searchable: 1,
      filterable: 1,
      active: 1,
      sort_order: 1,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
    {
      id: 'def-exp',
      field_key: 'years_exp',
      label: 'سنوات الخبرة',
      field_type: 'integer',
      section: 'general',
      help_text: null,
      required: 0,
      searchable: 0,
      filterable: 1,
      active: 1,
      sort_order: 2,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
    {
      id: 'def-vip',
      field_key: 'is_vip',
      label: 'عميل مميز',
      field_type: 'boolean',
      section: 'general',
      help_text: null,
      required: 0,
      searchable: 0,
      filterable: 1,
      active: 1,
      sort_order: 3,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
    {
      id: 'def-grade',
      field_key: 'target_grades',
      label: 'المراحل المستهدفة',
      field_type: 'multi_select',
      section: 'academic',
      help_text: null,
      required: 0,
      searchable: 0,
      filterable: 1,
      active: 1,
      sort_order: 4,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
    {
      id: 'def-inactive',
      field_key: 'old_legacy_code',
      label: 'كود قديم',
      field_type: 'short_text',
      section: 'general',
      help_text: null,
      required: 0,
      searchable: 0,
      filterable: 1,
      active: 0, // DEACTIVATED
      sort_order: 5,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
  ];

  it('compiles core client_type, active, and city rules with parameter binding', () => {
    const ast: FilterAST = {
      conjunction: 'AND',
      rules: [
        { id: 'r1', field: 'client_type', operator: 'is', value: 'teacher' },
        { id: 'r2', field: 'active', operator: 'is', value: 1 },
        { id: 'r3', field: 'city', operator: 'contains', value: 'الجيزة' },
      ],
    };

    const result = compileFilterAstToSql(ast, mockDefs);
    expect(result.whereClause).toContain('c.client_type = ?');
    expect(result.whereClause).toContain('c.active = ?');
    expect(result.whereClause).toContain('c.city LIKE ?');
    expect(result.params).toEqual(['teacher', 1, '%الجيزة%']);
    expect(result.skippedRules).toHaveLength(0);
  });

  it('compiles custom text field with contains and parameter binding', () => {
    const ast: FilterAST = {
      conjunction: 'AND',
      rules: [
        { id: 'r1', field: 'specialty', operator: 'contains', value: 'فيزياء' },
      ],
    };

    const result = compileFilterAstToSql(ast, mockDefs);
    expect(result.whereClause).toContain('cfv.field_definition_id = ?');
    expect(result.whereClause).toContain('cfv.text_value LIKE ?');
    expect(result.params).toEqual(['def-spec', '%فيزياء%']);
  });

  it('compiles number field between operator with parameters', () => {
    const ast: FilterAST = {
      conjunction: 'AND',
      rules: [
        { id: 'r1', field: 'years_exp', operator: 'between', value: [3, 10] },
      ],
    };

    const result = compileFilterAstToSql(ast, mockDefs);
    expect(result.whereClause).toContain('cfv.number_value >= ? AND cfv.number_value <= ?');
    expect(result.params).toEqual(['def-exp', 3, 10]);
  });

  it('compiles boolean field operator', () => {
    const ast: FilterAST = {
      conjunction: 'AND',
      rules: [
        { id: 'r1', field: 'is_vip', operator: 'is_true' },
      ],
    };

    const result = compileFilterAstToSql(ast, mockDefs);
    expect(result.whereClause).toContain('cfv.boolean_value = 1');
    expect(result.params).toEqual(['def-vip']);
  });

  it('compiles multi-select contains_any and contains_all operators', () => {
    const astAny: FilterAST = {
      conjunction: 'AND',
      rules: [
        { id: 'r1', field: 'target_grades', operator: 'contains_any', value: ['opt-1', 'opt-2'] },
      ],
    };

    const resultAny = compileFilterAstToSql(astAny, mockDefs);
    expect(resultAny.whereClause).toContain('client_custom_field_multiselect_values');
    expect(resultAny.params).toEqual(['def-grade', 'opt-1', 'opt-2']);

    const astAll: FilterAST = {
      conjunction: 'AND',
      rules: [
        { id: 'r2', field: 'target_grades', operator: 'contains_all', value: ['opt-1', 'opt-2'] },
      ],
    };

    const resultAll = compileFilterAstToSql(astAll, mockDefs);
    expect(resultAll.whereClause).toContain('COUNT(DISTINCT cfm.option_id)');
    expect(resultAll.params).toEqual(['def-grade', 'opt-1', 'opt-2', 2]);
  });

  it('compiles actual_service filter with EXISTS subqueries', () => {
    const ast: FilterAST = {
      conjunction: 'AND',
      rules: [
        { id: 'r1', field: 'actual_service', operator: 'has_service', value: 'marketing' },
        { id: 'r2', field: 'actual_service', operator: 'does_not_have_service', value: 'studio' },
      ],
    };

    const result = compileFilterAstToSql(ast, mockDefs);
    expect(result.whereClause).toContain('marketing_contracts');
    expect(result.whereClause).toContain('studio_bookings');
    expect(result.whereClause).toContain('NOT (');
  });

  it('compiles outstanding_dues and credit operators converting EGP to piasters', () => {
    const ast: FilterAST = {
      conjunction: 'AND',
      rules: [
        { id: 'r1', field: 'outstanding_dues', operator: 'greater_than', value: 5000 },
        { id: 'r2', field: 'credit', operator: 'is_empty' },
      ],
    };

    const result = compileFilterAstToSql(ast, mockDefs);
    expect(result.params).toContain(500000); // 5,000 EGP = 500,000 piasters
    expect(result.whereClause).toContain('payments');
  });

  it('safely handles SQL injection attempts by parameterizing all input', () => {
    const maliciousInput = "'; DROP TABLE clients; --";
    const ast: FilterAST = {
      conjunction: 'AND',
      rules: [
        { id: 'r1', field: 'city', operator: 'equals', value: maliciousInput },
        { id: 'r2', field: 'specialty', operator: 'contains', value: maliciousInput },
      ],
    };

    const result = compileFilterAstToSql(ast, mockDefs);
    // Malicious text is never in SQL clause text, only in bound params
    expect(result.whereClause).not.toContain('DROP TABLE');
    expect(result.params).toContain(maliciousInput);
    expect(result.params).toContain(`%${maliciousInput}%`);
  });

  it('gracefully skips deactivated or unknown custom fields without failing compilation', () => {
    const ast: FilterAST = {
      conjunction: 'AND',
      rules: [
        { id: 'r1', field: 'city', operator: 'equals', value: 'القاهرة' },
        { id: 'r2', field: 'old_legacy_code', operator: 'equals', value: '123' }, // deactivated
        { id: 'r3', field: 'non_existent_key', operator: 'equals', value: 'xyz' }, // unknown
      ],
    };

    const result = compileFilterAstToSql(ast, mockDefs);
    expect(result.whereClause).toBe('c.city = ?');
    expect(result.params).toEqual(['القاهرة']);
    expect(result.skippedRules).toHaveLength(2);
    expect(result.skippedRules[0].rule.field).toBe('old_legacy_code');
    expect(result.skippedRules[1].rule.field).toBe('non_existent_key');
  });
});
