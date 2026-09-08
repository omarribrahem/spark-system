import React, { useState, useMemo } from 'react';
import {
  Plus,
  X,
  Bookmark,
  BookmarkPlus,
  Trash2,
  Edit2,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react';
import {
  FilterAST,
  FilterRule,
  CORE_FILTERABLE_FIELDS,
  OPERATORS_BY_TYPE,
  FilterOperator,
} from '../../domain/models/client-filter-ast';
import { CustomFieldDefinition } from '../../domain/models/client-custom-fields';
import {
  ClientFilterPreset,
  ClientFilterPresetRepository,
} from '../../database/repositories';
import { getDatabaseDriver } from '../../database/driver';
import { Select } from '../../ui/athredu/Select';

export interface ClientFilterBuilderProps {
  ast: FilterAST;
  customDefinitions: CustomFieldDefinition[];
  presets: ClientFilterPreset[];
  activePresetId?: string | null;
  onAstChange: (newAst: FilterAST) => void;
  onPresetsChange: () => void;
  onSelectPreset: (preset: ClientFilterPreset | null) => void;
}

export const ClientFilterBuilder: React.FC<ClientFilterBuilderProps> = ({
  ast,
  customDefinitions,
  presets,
  activePresetId,
  onAstChange,
  onPresetsChange,
  onSelectPreset,
}) => {
  const [isBuilderOpen, setIsBuilderOpen] = useState(false);

  // Draft rule state
  const [selectedFieldKey, setSelectedFieldKey] = useState<string>('client_type');
  const [selectedOperator, setSelectedOperator] = useState<FilterOperator>('is');
  const [valueSingle, setValueSingle] = useState<string>('teacher');
  const [valueBetweenMin, setValueBetweenMin] = useState<string>('');
  const [valueBetweenMax, setValueBetweenMax] = useState<string>('');
  const [valueMulti, setValueMulti] = useState<string[]>([]);

  // Preset saving popover state
  const [isSavingPreset, setIsSavingPreset] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');
  const [isRenamingPreset, setIsRenamingPreset] = useState(false);
  const [renamedPresetName, setRenamedPresetName] = useState('');

  // Combined filterable fields
  const allFilterableFields = useMemo(() => {
    const fields = [...CORE_FILTERABLE_FIELDS];

    const activeCustom = customDefinitions.filter(
      (d) => d.filterable === 1 && d.active === 1
    );

    for (const d of activeCustom) {
      const typeCategory =
        d.field_type === 'integer' || d.field_type === 'money_piasters'
          ? 'number'
          : d.field_type === 'date'
          ? 'date'
          : d.field_type === 'boolean'
          ? 'boolean'
          : d.field_type === 'single_select'
          ? 'single_select'
          : d.field_type === 'multi_select'
          ? 'multi_select'
          : 'text';

      fields.push({
        key: d.field_key,
        label: d.label,
        category: 'custom',
        type: d.field_type,
        operators: (OPERATORS_BY_TYPE[typeCategory] || OPERATORS_BY_TYPE.text).map((o) => o.value),
        options: d.options?.map((o) => ({ value: o.id, label: o.label })),
        section: d.section,
      });
    }

    return fields;
  }, [customDefinitions]);

  // Current selected field metadata
  const currentFieldMeta = useMemo(() => {
    return allFilterableFields.find((f) => f.key === selectedFieldKey) || allFilterableFields[0];
  }, [allFilterableFields, selectedFieldKey]);

  // Available operators for currently selected field
  const availableOperators = useMemo(() => {
    if (!currentFieldMeta) return OPERATORS_BY_TYPE.text;
    const typeCategory =
      currentFieldMeta.type === 'integer' || currentFieldMeta.type === 'money_piasters'
        ? 'number'
        : currentFieldMeta.type === 'date'
        ? 'date'
        : currentFieldMeta.type === 'boolean'
        ? 'boolean'
        : currentFieldMeta.type === 'single_select'
        ? 'single_select'
        : currentFieldMeta.type === 'multi_select'
        ? 'multi_select'
        : currentFieldMeta.type === 'service'
        ? 'service'
        : currentFieldMeta.type === 'status'
        ? 'single_select'
        : 'text';

    return OPERATORS_BY_TYPE[typeCategory] || OPERATORS_BY_TYPE.text;
  }, [currentFieldMeta]);

  // When field changes, set default operator and value
  const handleFieldChange = (key: string) => {
    setSelectedFieldKey(key);
    const meta = allFilterableFields.find((f) => f.key === key);
    if (!meta) return;

    const typeCategory =
      meta.type === 'integer' || meta.type === 'money_piasters'
        ? 'number'
        : meta.type === 'date'
        ? 'date'
        : meta.type === 'boolean'
        ? 'boolean'
        : meta.type === 'single_select'
        ? 'single_select'
        : meta.type === 'multi_select'
        ? 'multi_select'
        : meta.type === 'service'
        ? 'service'
        : 'text';

    const defaultOp = OPERATORS_BY_TYPE[typeCategory]?.[0]?.value || 'contains';
    setSelectedOperator(defaultOp);

    if (meta.options && meta.options.length > 0) {
      setValueSingle(meta.options[0].value);
      setValueMulti([meta.options[0].value]);
    } else {
      setValueSingle('');
      setValueMulti([]);
    }
    setValueBetweenMin('');
    setValueBetweenMax('');
  };

  const handleAddRule = () => {
    let finalValue: unknown = valueSingle;

    if (selectedOperator === 'between') {
      finalValue = [valueBetweenMin, valueBetweenMax];
    } else if (
      selectedOperator === 'contains_any' ||
      selectedOperator === 'contains_all'
    ) {
      finalValue = valueMulti;
    } else if (
      selectedOperator === 'is_empty' ||
      selectedOperator === 'is_not_empty' ||
      selectedOperator === 'is_true' ||
      selectedOperator === 'is_false'
    ) {
      finalValue = undefined;
    }

    const newRule: FilterRule = {
      id: crypto.randomUUID(),
      field: selectedFieldKey,
      operator: selectedOperator,
      value: finalValue,
    };

    onAstChange({
      conjunction: 'AND',
      rules: [...ast.rules, newRule],
    });
  };

  const handleRemoveRule = (ruleId: string) => {
    onAstChange({
      conjunction: 'AND',
      rules: ast.rules.filter((r) => r.id !== ruleId),
    });
  };

  const handleClearAll = () => {
    onAstChange({
      conjunction: 'AND',
      rules: [],
    });
    onSelectPreset(null);
  };

  // Presets operations
  const handleSavePreset = async () => {
    const cleanName = newPresetName.trim();
    if (!cleanName || ast.rules.length === 0) return;
    try {
      const driver = await getDatabaseDriver();
      const repo = new ClientFilterPresetRepository(driver);
      const created = await repo.create(cleanName, ast.rules);
      setIsSavingPreset(false);
      setNewPresetName('');
      onPresetsChange();
      onSelectPreset(created);
    } catch (err) {
      console.error('Failed to save preset:', err);
    }
  };

  const handleDeleteActivePreset = async () => {
    if (!activePresetId) return;
    try {
      const driver = await getDatabaseDriver();
      const repo = new ClientFilterPresetRepository(driver);
      await repo.delete(activePresetId);
      onPresetsChange();
      onSelectPreset(null);
    } catch (err) {
      console.error('Failed to delete preset:', err);
    }
  };

  const handleRenameActivePreset = async () => {
    if (!activePresetId || !renamedPresetName.trim()) return;
    try {
      const driver = await getDatabaseDriver();
      const repo = new ClientFilterPresetRepository(driver);
      const updated = await repo.update(activePresetId, { name: renamedPresetName.trim() });
      setIsRenamingPreset(false);
      onPresetsChange();
      onSelectPreset(updated);
    } catch (err) {
      console.error('Failed to rename preset:', err);
    }
  };

  // Helper to format rule chip label
  const getRuleChipLabel = (rule: FilterRule) => {
    const field = allFilterableFields.find((f) => f.key === rule.field);
    const fieldName = field?.label || rule.field;

    const op = availableOperators.find((o) => o.value === rule.operator);
    const opLabel = op?.label || rule.operator;

    let valDisplay = '';
    if (rule.operator === 'between' && Array.isArray(rule.value)) {
      valDisplay = `${rule.value[0]} - ${rule.value[1]}`;
    } else if (Array.isArray(rule.value)) {
      const labels = rule.value.map((v) => {
        const opt = field?.options?.find((o) => o.value === v);
        return opt ? opt.label : v;
      });
      valDisplay = labels.join(', ');
    } else if (field?.options && rule.value !== undefined) {
      const opt = field.options.find((o) => o.value === String(rule.value));
      valDisplay = opt ? opt.label : String(rule.value);
    } else if (rule.value !== undefined) {
      valDisplay = String(rule.value);
    }

    if (!valDisplay) {
      return `${fieldName}: ${opLabel}`;
    }
    return `${fieldName}: ${opLabel} "${valDisplay}"`;
  };

  // Check if current active preset contains deactivated custom field
  const deactivatedWarning = useMemo(() => {
    if (!activePresetId) return false;
    for (const rule of ast.rules) {
      const isCore = CORE_FILTERABLE_FIELDS.some((c) => c.key === rule.field);
      if (!isCore) {
        const customDef = customDefinitions.find((d) => d.field_key === rule.field);
        if (customDef && customDef.active === 0) {
          return true;
        }
      }
    }
    return false;
  }, [activePresetId, ast.rules, customDefinitions]);

  return (
    <div className="space-y-3" dir="rtl">
      {/* Top Bar Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setIsBuilderOpen(!isBuilderOpen)}
            className={`h-9 px-4 rounded-full border text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              isBuilderOpen || ast.rules.length > 0
                ? 'bg-blue-50 border-blue-200 text-[#004AC6]'
                : 'bg-white border-[#E5E5E5] text-neutral-700 hover:bg-neutral-50'
            }`}
          >
            <Plus className={`w-3.5 h-3.5 transition-transform ${isBuilderOpen ? 'rotate-45' : ''}`} />
            <span>بناء فلتر مخصص</span>
            {ast.rules.length > 0 && (
              <span className="h-5 w-5 rounded-full bg-[#004AC6] text-white text-[10px] flex items-center justify-center font-bold">
                {ast.rules.length}
              </span>
            )}
          </button>

          {/* Presets Dropdown */}
          <div className="relative flex items-center gap-1.5 min-w-[180px]">
            <Select
              value={activePresetId || 'all'}
              onValueChange={(val) => {
                if (val === 'all') {
                  onSelectPreset(null);
                } else {
                  const found = presets.find((p) => p.id === val);
                  if (found) onSelectPreset(found);
                }
              }}
              options={[
                { value: 'all', label: `الفلاتر المحفوظة (${presets.length})...` },
                ...presets.map((p) => ({
                  value: p.id,
                  label: `${p.name} (${p.rules?.length || 0} شروط)`,
                })),
              ]}
              className="!h-9 !text-xs !py-0"
            />

            {/* Save current as preset button */}
            {ast.rules.length > 0 && !activePresetId && (
              <button
                type="button"
                onClick={() => setIsSavingPreset(true)}
                title="حفظ الفلتر الحالي"
                className="h-9 px-3 rounded-full border border-neutral-200 bg-white hover:bg-neutral-50 text-xs text-[#004AC6] font-semibold flex items-center gap-1 cursor-pointer transition-colors"
              >
                <BookmarkPlus className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">حفظ الفلتر</span>
              </button>
            )}

            {/* Manage active preset */}
            {activePresetId && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    const activeP = presets.find((p) => p.id === activePresetId);
                    if (activeP) {
                      setRenamedPresetName(activeP.name);
                      setIsRenamingPreset(true);
                    }
                  }}
                  title="إعادة تسمية الفلتر"
                  className="p-2 rounded-full bg-neutral-100 hover:bg-neutral-200 text-neutral-600 cursor-pointer transition-colors"
                >
                  <Edit2 className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={handleDeleteActivePreset}
                  title="حذف الفلتر المحفوظ"
                  className="p-2 rounded-full bg-rose-50 hover:bg-rose-100 text-rose-600 cursor-pointer transition-colors"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Clear all rules */}
        {ast.rules.length > 0 && (
          <button
            type="button"
            onClick={handleClearAll}
            className="h-8 px-3 text-xs text-neutral-500 hover:text-neutral-900 flex items-center gap-1 cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" />
            <span>مسح الشروط ({ast.rules.length})</span>
          </button>
        )}
      </div>

      {/* Preset Save Modal / Input Banner */}
      {isSavingPreset && (
        <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-2xl flex items-center gap-2">
          <Bookmark className="w-4 h-4 text-[#004AC6] shrink-0" />
          <input
            type="text"
            value={newPresetName}
            onChange={(e) => setNewPresetName(e.target.value)}
            placeholder="اسم الفلتر المحفوظ (مثال: معلمو الجيزة النشطون)..."
            className="flex-1 h-8 px-3 rounded-full border border-blue-200 bg-white text-xs text-[#1A1A1A] focus:outline-none focus:border-[#004AC6]"
            autoFocus
          />
          <button
            type="button"
            onClick={handleSavePreset}
            className="h-8 px-4 rounded-full bg-[#004AC6] text-white text-xs font-semibold hover:bg-blue-700 cursor-pointer transition-colors"
          >
            حفظ
          </button>
          <button
            type="button"
            onClick={() => setIsSavingPreset(false)}
            className="h-8 px-3 rounded-full text-xs text-neutral-600 hover:bg-neutral-100 cursor-pointer"
          >
            إلغاء
          </button>
        </div>
      )}

      {/* Preset Rename Banner */}
      {isRenamingPreset && (
        <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-2xl flex items-center gap-2">
          <input
            type="text"
            value={renamedPresetName}
            onChange={(e) => setRenamedPresetName(e.target.value)}
            className="flex-1 h-8 px-3 rounded-full border border-blue-200 bg-white text-xs text-[#1A1A1A] focus:outline-none focus:border-[#004AC6]"
            autoFocus
          />
          <button
            type="button"
            onClick={handleRenameActivePreset}
            className="h-8 px-4 rounded-full bg-[#004AC6] text-white text-xs font-semibold hover:bg-blue-700 cursor-pointer transition-colors"
          >
            تعديل
          </button>
          <button
            type="button"
            onClick={() => setIsRenamingPreset(false)}
            className="h-8 px-3 rounded-full text-xs text-neutral-600 hover:bg-neutral-100 cursor-pointer"
          >
            إلغاء
          </button>
        </div>
      )}

      {/* Deactivated Field Warning */}
      {deactivatedWarning && (
        <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
          <span>
            تنبيه: يحتوي هذا الفلتر المحفوظ على حقل معطل حالياً. تم تجاهل شرطه تلقائياً دون حذف الفلتر.
          </span>
        </div>
      )}

      {/* Filter Builder Inputs Box */}
      {isBuilderOpen && (
        <div className="p-4 rounded-3xl border border-[#E5E5E5] bg-[#F9FAFB] space-y-3">
          <div className="text-xs font-bold text-[#1A1A1A] mb-1">إضافة شرط تصفية جديد:</div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {/* Field Dropdown */}
            <div>
              <label className="block text-[11px] font-semibold text-neutral-600 mb-1">الحقل</label>
              <Select
                value={selectedFieldKey}
                onValueChange={(val) => handleFieldChange(val)}
                options={[
                  ...CORE_FILTERABLE_FIELDS.map((f) => ({ value: f.key, label: f.label })),
                  ...allFilterableFields
                    .filter((f) => f.category === 'custom')
                    .map((f) => ({ value: f.key, label: `${f.label} (${f.section || 'مخصص'})` })),
                ]}
                className="!h-10"
              />
            </div>

            {/* Operator Dropdown */}
            <div>
              <label className="block text-[11px] font-semibold text-neutral-600 mb-1">العملية</label>
              <Select
                value={selectedOperator}
                onValueChange={(val) => setSelectedOperator(val as FilterOperator)}
                options={availableOperators.map((op) => ({ value: op.value, label: op.label }))}
                className="!h-10"
              />
            </div>

            {/* Value Input */}
            <div>
              <label className="block text-[11px] font-semibold text-neutral-600 mb-1">القيمة</label>
              {selectedOperator === 'is_empty' ||
              selectedOperator === 'is_not_empty' ||
              selectedOperator === 'is_true' ||
              selectedOperator === 'is_false' ? (
                <div className="h-10 px-3 flex items-center text-xs text-neutral-400 bg-neutral-100 rounded-full">
                  لا تتطلب قيمة إضافية
                </div>
              ) : selectedOperator === 'between' ? (
                <div className="flex gap-1.5">
                  <input
                    type={currentFieldMeta.type === 'date' ? 'date' : 'number'}
                    value={valueBetweenMin}
                    onChange={(e) => setValueBetweenMin(e.target.value)}
                    placeholder="من"
                    className="w-1/2 h-10 px-2 rounded-full border border-[#E5E5E5] bg-white text-xs focus:outline-none focus:border-[#004AC6]"
                  />
                  <input
                    type={currentFieldMeta.type === 'date' ? 'date' : 'number'}
                    value={valueBetweenMax}
                    onChange={(e) => setValueBetweenMax(e.target.value)}
                    placeholder="إلى"
                    className="w-1/2 h-10 px-2 rounded-full border border-[#E5E5E5] bg-white text-xs focus:outline-none focus:border-[#004AC6]"
                  />
                </div>
              ) : currentFieldMeta.options &&
                currentFieldMeta.options.length > 0 &&
                (selectedOperator === 'contains_any' || selectedOperator === 'contains_all') ? (
                <div className="flex flex-wrap gap-1.5 p-1 bg-white border border-[#E5E5E5] rounded-2xl max-h-24 overflow-y-auto">
                  {currentFieldMeta.options.map((opt) => {
                    const isSelected = valueMulti.includes(opt.value);
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => {
                          if (isSelected) {
                            setValueMulti(valueMulti.filter((v) => v !== opt.value));
                          } else {
                            setValueMulti([...valueMulti, opt.value]);
                          }
                        }}
                        className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
                          isSelected
                            ? 'bg-[#004AC6] text-white border-[#004AC6]'
                            : 'bg-neutral-50 text-neutral-700 border-neutral-200'
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              ) : currentFieldMeta.options && currentFieldMeta.options.length > 0 ? (
                <Select
                  value={valueSingle}
                  onValueChange={(val) => setValueSingle(val)}
                  options={currentFieldMeta.options.map((opt) => ({
                    value: opt.value,
                    label: opt.label,
                  }))}
                  className="!h-10"
                />
              ) : (
                <input
                  type={
                    currentFieldMeta.type === 'date'
                      ? 'date'
                      : currentFieldMeta.type === 'integer' ||
                        currentFieldMeta.type === 'money_piasters'
                      ? 'number'
                      : 'text'
                  }
                  value={valueSingle}
                  onChange={(e) => setValueSingle(e.target.value)}
                  placeholder="أدخل القيمة..."
                  className="w-full h-10 px-3 rounded-full border border-[#E5E5E5] bg-white text-xs font-medium text-[#1A1A1A] focus:outline-none focus:border-[#004AC6]"
                />
              )}
            </div>
          </div>

          <div className="flex justify-end pt-1">
            <button
              type="button"
              onClick={handleAddRule}
              className="h-9 px-5 rounded-full bg-[#004AC6] text-white text-xs font-bold hover:bg-blue-700 active:scale-98 transition-all cursor-pointer flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>إضافة الشرط</span>
            </button>
          </div>
        </div>
      )}

      {/* Active Rules Filter Chips */}
      {ast.rules.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="text-xs font-semibold text-neutral-500">الفلاتر المطبقة:</span>
          {ast.rules.map((rule) => (
            <span
              key={rule.id}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-50 border border-blue-100 text-[#004AC6] text-xs font-semibold shadow-xs"
            >
              <span>{getRuleChipLabel(rule)}</span>
              <button
                type="button"
                onClick={() => handleRemoveRule(rule.id)}
                className="p-0.5 rounded-full hover:bg-blue-100 text-blue-400 hover:text-[#004AC6] transition-colors cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
};
