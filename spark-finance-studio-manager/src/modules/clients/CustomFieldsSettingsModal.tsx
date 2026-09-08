import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  Settings2,
  AlertCircle,
  ToggleLeft,
  ToggleRight,
  Edit2,
} from 'lucide-react';
import {
  CustomFieldDefinition,
  CustomFieldType,
  CUSTOM_FIELD_TYPES,
  validateFieldKey,
} from '../../domain/models/client-custom-fields';
import {
  ClientCustomFieldRepository,
  CreateFieldDefinitionInput,
  UpdateFieldDefinitionInput,
} from '../../database/repositories';
import { getDatabaseDriver } from '../../database/driver';
import { Select } from '../../ui/athredu/Select';

export interface CustomFieldsSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onChanged?: () => void;
}

export const CustomFieldsSettingsModal: React.FC<CustomFieldsSettingsModalProps> = ({
  isOpen,
  onClose,
  onChanged,
}) => {
  const [definitions, setDefinitions] = useState<CustomFieldDefinition[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form state for creating / editing definition
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [fieldKey, setFieldKey] = useState('');
  const [label, setLabel] = useState('');
  const [fieldType, setFieldType] = useState<CustomFieldType>('short_text');
  const [section, setSection] = useState('general');
  const [helpText, setHelpText] = useState('');
  const [required, setRequired] = useState(false);
  const [searchable, setSearchable] = useState(false);
  const [filterable, setFilterable] = useState(true);

  // Options state for single_select & multi_select
  const [options, setOptions] = useState<{ id?: string; valueKey: string; label: string }[]>([]);
  const [newOptionKey, setNewOptionKey] = useState('');
  const [newOptionLabel, setNewOptionLabel] = useState('');

  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadDefinitions = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const driver = await getDatabaseDriver();
      const repo = new ClientCustomFieldRepository(driver);
      const defs = await repo.listDefinitions();
      setDefinitions(defs);
    } catch (err: unknown) {
      console.error('Failed to load custom field definitions:', err);
      setError('فشل تحميل تعريفات الحقول المخصصة');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadDefinitions();
      resetForm();
    }
  }, [isOpen, loadDefinitions]);

  const resetForm = () => {
    setIsEditing(false);
    setEditingId(null);
    setFieldKey('');
    setLabel('');
    setFieldType('short_text');
    setSection('general');
    setHelpText('');
    setRequired(false);
    setSearchable(false);
    setFilterable(true);
    setOptions([]);
    setNewOptionKey('');
    setNewOptionLabel('');
    setFormError(null);
  };

  const handleStartEdit = (def: CustomFieldDefinition) => {
    setIsEditing(true);
    setEditingId(def.id);
    setFieldKey(def.field_key);
    setLabel(def.label);
    setFieldType(def.field_type);
    setSection(def.section || 'general');
    setHelpText(def.help_text || '');
    setRequired(def.required === 1);
    setSearchable(def.searchable === 1);
    setFilterable(def.filterable === 1);
    setOptions(
      def.options?.map((o) => ({ id: o.id, valueKey: o.value_key, label: o.label })) || []
    );
    setFormError(null);
  };

  const handleAddOption = () => {
    if (!newOptionLabel.trim()) return;
    const cleanKey = newOptionKey.trim()
      ? newOptionKey.trim().toLowerCase().replace(/\s+/g, '_')
      : `opt_${Date.now()}_${options.length + 1}`;
    setOptions([...options, { valueKey: cleanKey, label: newOptionLabel.trim() }]);
    setNewOptionKey('');
    setNewOptionLabel('');
  };

  const handleRemoveOption = (index: number) => {
    setOptions(options.filter((_, i) => i !== index));
  };

  const handleToggleActive = async (def: CustomFieldDefinition) => {
    try {
      const driver = await getDatabaseDriver();
      const repo = new ClientCustomFieldRepository(driver);
      if (def.active === 1) {
        await repo.deactivateDefinition(def.id);
      } else {
        await repo.reactivateDefinition(def.id);
      }
      await loadDefinitions();
      if (onChanged) onChanged();
    } catch (err: unknown) {
      console.error('Failed to toggle active state:', err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const cleanLabel = label.trim();
    if (!cleanLabel) {
      setFormError('اسم الحقل إلزامي');
      return;
    }

    if (
      (fieldType === 'single_select' || fieldType === 'multi_select') &&
      options.length === 0
    ) {
      setFormError('يجب إضافة خيار واحد على الأقل لحقول القوائم والاختيارات');
      return;
    }

    try {
      setIsSubmitting(true);
      const driver = await getDatabaseDriver();
      const repo = new ClientCustomFieldRepository(driver);

      if (isEditing && editingId) {
        const updatePayload: UpdateFieldDefinitionInput = {
          label: cleanLabel,
          fieldType,
          section: section.trim() || 'general',
          helpText: helpText.trim() || null,
          required,
          searchable,
          filterable,
          options,
        };
        await repo.updateDefinition(editingId, updatePayload);
      } else {
        const cleanKey = fieldKey.trim()
          ? validateFieldKey(fieldKey)
          : validateFieldKey(`cf_${Date.now().toString(36)}`);

        const createPayload: CreateFieldDefinitionInput = {
          fieldKey: cleanKey,
          label: cleanLabel,
          fieldType,
          section: section.trim() || 'general',
          helpText: helpText.trim() || null,
          required,
          searchable,
          filterable,
          options,
        };
        await repo.createDefinition(createPayload);
      }

      resetForm();
      await loadDefinitions();
      if (onChanged) onChanged();
    } catch (err: unknown) {
      console.error('Failed to save field definition:', err);
      setFormError(err instanceof Error ? err.message : 'فشل حفظ الحقل المخصص');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/40 backdrop-blur-[2px]"
      dir="rtl"
    >
      <div className="bg-white rounded-[2rem] border border-[#E5E5E5] w-full max-w-4xl max-h-[90vh] flex flex-col shadow-[0_4px_24px_rgba(0,0,0,0.06)] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-[#E5E5E5]">
          <div className="flex items-center gap-3">
            <span className="h-10 w-10 rounded-full bg-blue-50 text-[#004AC6] flex items-center justify-center">
              <Settings2 className="w-5 h-5" />
            </span>
            <div>
              <h2 className="text-lg font-bold text-[#1A1A1A]">إدارة الحقول المخصصة</h2>
              <p className="text-xs text-[#707070]">
                تخصيص بيانات العملاء وإضافتها تلقائياً لنماذج التسجيل والملف 360° والفلاتر.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="h-9 w-9 rounded-full bg-neutral-100 hover:bg-neutral-200 text-neutral-600 flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Form to Create / Edit */}
          <div className="p-5 rounded-3xl border border-[#E5E5E5] bg-[#F9FAFB] space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-[#1A1A1A]">
                {isEditing ? 'تعديل الحقل المخصص' : 'إضافة حقل مخصص جديد'}
              </h3>
              {isEditing && (
                <button
                  onClick={resetForm}
                  type="button"
                  className="text-xs text-[#004AC6] hover:underline"
                >
                  إلغاء التعديل وبدء حقل جديد
                </button>
              )}
            </div>

            {formError && (
              <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-600">
                {formError}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {/* Field Label */}
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    اسم الحقل (العنوان) *
                  </label>
                  <input
                    type="text"
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    placeholder="مثال: التخصص الأكاديمي، الرقم الضريبي"
                    className="w-full h-11 px-3.5 rounded-full border border-[#E5E5E5] text-xs font-medium text-[#1A1A1A] bg-white focus:outline-none focus:border-[#004AC6]"
                    required
                  />
                </div>

                {/* Field Key */}
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    رمز الحقل (Key بالإنجليزية)
                  </label>
                  <input
                    type="text"
                    value={fieldKey}
                    onChange={(e) => setFieldKey(e.target.value)}
                    disabled={isEditing}
                    placeholder="specialty, tax_number"
                    dir="ltr"
                    className="w-full h-11 px-3.5 rounded-full border border-[#E5E5E5] text-xs font-medium text-[#1A1A1A] bg-white disabled:bg-neutral-100 disabled:text-neutral-400 focus:outline-none focus:border-[#004AC6]"
                  />
                </div>

                {/* Field Type */}
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    نوع البيانات *
                  </label>
                  <Select
                    value={fieldType}
                    onValueChange={(val) => setFieldType(val as CustomFieldType)}
                    options={CUSTOM_FIELD_TYPES}
                  />
                </div>

                {/* Section */}
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    القسم التابع له
                  </label>
                  <input
                    type="text"
                    value={section}
                    onChange={(e) => setSection(e.target.value)}
                    placeholder="general, academic, marketing"
                    className="w-full h-11 px-3.5 rounded-full border border-[#E5E5E5] text-xs font-medium text-[#1A1A1A] bg-white focus:outline-none focus:border-[#004AC6]"
                  />
                </div>

                {/* Help text */}
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    إرشادات المساعدة للمستخدم (اختياري)
                  </label>
                  <input
                    type="text"
                    value={helpText}
                    onChange={(e) => setHelpText(e.target.value)}
                    placeholder="نص توضيحي يظهر تحت الحقل لمساعدة صفاء..."
                    className="w-full h-11 px-3.5 rounded-full border border-[#E5E5E5] text-xs font-medium text-[#1A1A1A] bg-white focus:outline-none focus:border-[#004AC6]"
                  />
                </div>
              </div>

              {/* Options builder for select types */}
              {(fieldType === 'single_select' || fieldType === 'multi_select') && (
                <div className="p-4 rounded-2xl border border-blue-100 bg-blue-50/50 space-y-3">
                  <div className="text-xs font-bold text-[#004AC6]">
                    خيارات القائمة ({fieldType === 'single_select' ? 'اختيار مفرد' : 'اختيار متعدد'}):
                  </div>
                  <div className="flex flex-wrap gap-2 items-center">
                    {options.map((opt, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white border border-[#E5E5E5] text-xs font-semibold text-[#1A1A1A] shadow-xs"
                      >
                        <span>{opt.label}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveOption(idx)}
                          className="text-neutral-400 hover:text-rose-600"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-2 items-center pt-2">
                    <input
                      type="text"
                      value={newOptionLabel}
                      onChange={(e) => setNewOptionLabel(e.target.value)}
                      placeholder="اسم الخيار (مثال: ثانوي عام)..."
                      className="flex-1 h-9 px-3 rounded-full border border-[#E5E5E5] text-xs bg-white focus:outline-none focus:border-[#004AC6]"
                    />
                    <button
                      type="button"
                      onClick={handleAddOption}
                      className="h-9 px-4 rounded-full bg-[#004AC6] text-white text-xs font-semibold hover:bg-blue-700 transition-colors cursor-pointer"
                    >
                      إضافة خيار
                    </button>
                  </div>
                </div>
              )}

              {/* Flags */}
              <div className="flex flex-wrap items-center gap-6 pt-1">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-[#1A1A1A]">
                  <input
                    type="checkbox"
                    checked={required}
                    onChange={(e) => setRequired(e.target.checked)}
                    className="w-4 h-4 rounded text-[#004AC6] border-neutral-300 focus:ring-0"
                  />
                  <span>إلزامي عند التسجيل</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-[#1A1A1A]">
                  <input
                    type="checkbox"
                    checked={searchable}
                    onChange={(e) => setSearchable(e.target.checked)}
                    className="w-4 h-4 rounded text-[#004AC6] border-neutral-300 focus:ring-0"
                  />
                  <span>مشمول في البحث السريع</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-[#1A1A1A]">
                  <input
                    type="checkbox"
                    checked={filterable}
                    onChange={(e) => setFilterable(e.target.checked)}
                    className="w-4 h-4 rounded text-[#004AC6] border-neutral-300 focus:ring-0"
                  />
                  <span>متاح في منشئ الفلاتر</span>
                </label>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="h-11 px-6 rounded-full bg-[#004AC6] text-white text-xs font-bold hover:bg-blue-700 active:scale-98 transition-all cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? 'جاري الحفظ...' : isEditing ? 'تحديث الحقل' : 'حفظ وإضافة الحقل'}
                </button>
              </div>
            </form>
          </div>

          {/* List of Definitions */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-[#1A1A1A]">
              الحقول المخصصة الحالية ({definitions.length})
            </h3>

            {isLoading ? (
              <div className="py-8 text-center text-xs text-neutral-400">جاري التحميل...</div>
            ) : definitions.length === 0 ? (
              <div className="py-8 text-center text-xs text-neutral-400 border border-dashed border-neutral-200 rounded-2xl">
                لا توجد حقول مخصصة مضافة بعد.
              </div>
            ) : (
              <div className="divide-y divide-neutral-100 border border-[#E5E5E5] rounded-3xl overflow-hidden bg-white">
                {definitions.map((def) => {
                  const typeLabel =
                    CUSTOM_FIELD_TYPES.find((t) => t.value === def.field_type)?.label ||
                    def.field_type;
                  return (
                    <div
                      key={def.id}
                      className={`p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-colors ${
                        def.active === 0 ? 'bg-neutral-50/70 opacity-60' : 'hover:bg-neutral-50/50'
                      }`}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-sm text-[#1A1A1A]">{def.label}</span>
                          <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-blue-50 text-[#004AC6] font-semibold">
                            {typeLabel}
                          </span>
                          <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-neutral-100 text-neutral-600 font-mono" dir="ltr">
                            {def.field_key}
                          </span>
                          {def.section && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-500">
                              {def.section}
                            </span>
                          )}
                          {def.required === 1 && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-50 text-rose-600 font-semibold">
                              إلزامي
                            </span>
                          )}
                          {def.searchable === 1 && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-semibold">
                              بحث
                            </span>
                          )}
                          {def.filterable === 1 && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 font-semibold">
                              فلترة
                            </span>
                          )}
                        </div>
                        {def.help_text && (
                          <p className="text-xs text-neutral-500">{def.help_text}</p>
                        )}
                        {def.options && def.options.length > 0 && (
                          <div className="text-[11px] text-neutral-500 flex gap-1.5 items-center flex-wrap pt-1">
                            <span className="font-semibold text-neutral-600">الخيارات:</span>
                            {def.options.map((o) => (
                              <span key={o.id} className="px-2 py-0.5 bg-neutral-100 rounded-md text-[10px]">
                                {o.label}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2 self-end sm:self-center">
                        <button
                          type="button"
                          onClick={() => handleToggleActive(def)}
                          title={def.active === 1 ? 'تعطيل الحقل (يحفظ السجل)' : 'إعادة تفعيل الحقل'}
                          className={`p-2 rounded-full transition-colors cursor-pointer ${
                            def.active === 1
                              ? 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                              : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
                          }`}
                        >
                          {def.active === 1 ? (
                            <ToggleRight className="w-4 h-4 text-[#004AC6]" />
                          ) : (
                            <ToggleLeft className="w-4 h-4 text-neutral-400" />
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleStartEdit(def)}
                          title="تعديل الحقل"
                          className="p-2 rounded-full bg-neutral-100 text-neutral-600 hover:bg-neutral-200 transition-colors cursor-pointer"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[#E5E5E5] flex justify-end bg-neutral-50">
          <button
            type="button"
            onClick={onClose}
            className="h-10 px-5 rounded-full border border-[#E5E5E5] text-xs font-semibold text-[#1A1A1A] hover:bg-white transition-colors cursor-pointer"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
};
