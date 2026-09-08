import React, { useState, useEffect } from 'react';
import {
  X,
  User,
  CheckCircle2,
  AlertCircle,
  Layers,
} from 'lucide-react';
import {
  ClientRecord,
  ClientRepository,
  ClientCustomFieldRepository,
  CreateClientInput,
  UpdateClientInput,
} from '../../database/repositories';
import {
  ClientType,
  CLIENT_TYPES,
  PreferredContact,
  PREFERRED_CONTACTS,
  CustomFieldDefinition,
  validateEmail,
  validateUrl,
} from '../../domain/models/client-custom-fields';
import { getDatabaseDriver } from '../../database/driver';

export interface ClientFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  clientToEdit?: ClientRecord | null;
  onSaved: (client: ClientRecord) => void;
}

type FormTab = 'basic' | 'contact' | 'custom';

export const ClientFormModal: React.FC<ClientFormModalProps> = ({
  isOpen,
  onClose,
  clientToEdit,
  onSaved,
}) => {
  const [activeTab, setActiveTab] = useState<FormTab>('basic');

  // Core fields
  const [name, setName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [clientType, setClientType] = useState<ClientType>('individual');
  const [contactName, setContactName] = useState('');
  const [contactRole, setContactRole] = useState('');
  const [phone, setPhone] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [sameAsPhone, setSameAsPhone] = useState(false);
  const [email, setEmail] = useState('');
  const [city, setCity] = useState('');
  const [preferredContact, setPreferredContact] = useState<PreferredContact>('phone');
  const [secondaryPhone, setSecondaryPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [active, setActive] = useState(1);

  // Custom fields
  const [customDefinitions, setCustomDefinitions] = useState<CustomFieldDefinition[]>([]);
  const [customValues, setCustomValues] = useState<Record<string, unknown>>({});

  const [nameError, setNameError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [generalError, setGeneralError] = useState<string | null>(null);

  // Load custom field definitions and existing values
  useEffect(() => {
    if (!isOpen) return;

    const loadData = async () => {
      try {
        const driver = await getDatabaseDriver();
        const customRepo = new ClientCustomFieldRepository(driver);
        const defs = await customRepo.listDefinitions({ activeOnly: true });
        setCustomDefinitions(defs);

        if (clientToEdit) {
          setName(clientToEdit.name || '');
          setCompanyName(clientToEdit.company_name || '');
          setClientType(clientToEdit.client_type || 'individual');
          setContactName(clientToEdit.contact_name || '');
          setContactRole(clientToEdit.contact_role || '');
          setPhone(clientToEdit.phone || '');
          setWhatsapp(clientToEdit.whatsapp || '');
          setSameAsPhone(!!clientToEdit.phone && clientToEdit.phone === clientToEdit.whatsapp);
          setEmail(clientToEdit.email || '');
          setCity(clientToEdit.city || '');
          setPreferredContact(clientToEdit.preferred_contact || 'phone');
          setSecondaryPhone(clientToEdit.secondary_phone || '');
          setNotes(clientToEdit.notes || '');
          setActive(clientToEdit.active ?? 1);

          // Load client's custom values
          const existingVals = await customRepo.getValuesForClient(clientToEdit.id);
          const valMap: Record<string, unknown> = {};
          for (const [defId, row] of Object.entries(existingVals)) {
            const def = defs.find((d) => d.id === defId);
            if (!def) continue;

            if (def.field_type === 'multi_select') {
              valMap[def.id] = row.multi_select_option_ids || [];
            } else if (def.field_type === 'money_piasters') {
              // Convert piasters to EGP for input display
              valMap[def.id] = row.number_value !== null ? row.number_value / 100 : '';
            } else if (def.field_type === 'integer') {
              valMap[def.id] = row.number_value !== null ? row.number_value : '';
            } else if (def.field_type === 'boolean') {
              valMap[def.id] = row.boolean_value === 1;
            } else if (def.field_type === 'date') {
              valMap[def.id] = row.date_value || '';
            } else {
              valMap[def.id] = row.text_value || '';
            }
          }
          setCustomValues(valMap);
        } else {
          setName('');
          setCompanyName('');
          setClientType('individual');
          setContactName('');
          setContactRole('');
          setPhone('');
          setWhatsapp('');
          setSameAsPhone(false);
          setEmail('');
          setCity('');
          setPreferredContact('phone');
          setSecondaryPhone('');
          setNotes('');
          setActive(1);
          setCustomValues({});
        }

        setNameError(null);
        setEmailError(null);
        setGeneralError(null);
        setIsSubmitting(false);
        setActiveTab('basic');
      } catch (err) {
        console.error('Failed to load client custom fields:', err);
      }
    };

    loadData();
  }, [isOpen, clientToEdit]);

  // Sync whatsapp when sameAsPhone is checked
  useEffect(() => {
    if (sameAsPhone) {
      setWhatsapp(phone);
    }
  }, [sameAsPhone, phone]);

  // Handle ESC key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !isSubmitting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSubmitting, onClose]);

  if (!isOpen) return null;

  const handleCustomValueChange = (defId: string, value: unknown) => {
    setCustomValues((prev) => ({
      ...prev,
      [defId]: value,
    }));
  };

  const handleMultiSelectToggle = (defId: string, optionId: string) => {
    const current = Array.isArray(customValues[defId])
      ? (customValues[defId] as string[])
      : [];
    const next = current.includes(optionId)
      ? current.filter((id) => id !== optionId)
      : [...current, optionId];
    handleCustomValueChange(defId, next);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setGeneralError(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setNameError('اسم العميل إلزامي ولا يمكن تركه فارغاً');
      setActiveTab('basic');
      return;
    }
    setNameError(null);

    const trimmedEmail = email.trim();
    if (trimmedEmail && !validateEmail(trimmedEmail)) {
      setEmailError('صيغة البريد الإلكتروني غير صحيحة');
      setActiveTab('contact');
      return;
    }
    setEmailError(null);

    // Validate required custom fields
    for (const def of customDefinitions) {
      if (def.required === 1 && def.active === 1) {
        const val = customValues[def.id];
        if (
          val === undefined ||
          val === null ||
          val === '' ||
          (Array.isArray(val) && val.length === 0)
        ) {
          setGeneralError(`الحقل المخصص '${def.label}' إلزامي`);
          setActiveTab('custom');
          return;
        }
      }
      if (def.field_type === 'url' && customValues[def.id]) {
        const urlVal = String(customValues[def.id]).trim();
        if (urlVal && !validateUrl(urlVal)) {
          setGeneralError(`الرابط في '${def.label}' غير صالح. يجب أن يبدأ بـ http:// أو https://`);
          setActiveTab('custom');
          return;
        }
      }
    }

    try {
      setIsSubmitting(true);
      const driver = await getDatabaseDriver();
      const clientRepo = new ClientRepository(driver);

      // Prepare custom values for repository
      const formattedCustomVals: Record<string, unknown> = {};
      for (const def of customDefinitions) {
        if (customValues[def.id] !== undefined) {
          let val = customValues[def.id];
          if (def.field_type === 'money_piasters' && val !== '' && val !== null) {
            val = Math.round(Number(val) * 100);
          }
          formattedCustomVals[def.id] = val;
        }
      }

      let savedRecord: ClientRecord;

      if (clientToEdit) {
        const updatePayload: UpdateClientInput & { id: string } = {
          id: clientToEdit.id,
          name: trimmedName,
          companyName: companyName.trim() || null,
          clientType,
          contactName: contactName.trim() || null,
          contactRole: contactRole.trim() || null,
          phone: phone.trim() || null,
          whatsapp: whatsapp.trim() || null,
          email: trimmedEmail || null,
          city: city.trim() || null,
          preferredContact,
          secondaryPhone: secondaryPhone.trim() || null,
          notes: notes.trim() || null,
          active,
        };
        savedRecord = await clientRepo.saveClientWithCustomFields(
          updatePayload,
          formattedCustomVals
        );
      } else {
        const createPayload: CreateClientInput = {
          name: trimmedName,
          companyName: companyName.trim() || null,
          clientType,
          contactName: contactName.trim() || null,
          contactRole: contactRole.trim() || null,
          phone: phone.trim() || null,
          whatsapp: whatsapp.trim() || null,
          email: trimmedEmail || null,
          city: city.trim() || null,
          preferredContact,
          secondaryPhone: secondaryPhone.trim() || null,
          notes: notes.trim() || null,
          active: 1,
        };
        savedRecord = await clientRepo.saveClientWithCustomFields(
          createPayload,
          formattedCustomVals
        );
      }

      onSaved(savedRecord);
    } catch (err: unknown) {
      console.error('Failed to save client:', err);
      setGeneralError(err instanceof Error ? err.message : 'حدث خطأ أثناء حفظ بيانات العميل');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Group custom fields by section
  const customFieldsBySection = customDefinitions.reduce((acc, def) => {
    const sec = def.section || 'general';
    if (!acc[sec]) acc[sec] = [];
    acc[sec].push(def);
    return acc;
  }, {} as Record<string, CustomFieldDefinition[]>);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/40 backdrop-blur-[2px]"
      dir="rtl"
    >
      <div className="bg-white rounded-[2rem] border border-[#E5E5E5] w-full max-w-2xl max-h-[92vh] flex flex-col shadow-[0_4px_24px_rgba(0,0,0,0.06)] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-[#E5E5E5]">
          <div className="flex items-center gap-3">
            <span className="h-10 w-10 rounded-full bg-blue-50 text-[#004AC6] flex items-center justify-center">
              <User className="w-5 h-5" />
            </span>
            <div>
              <h2 className="text-lg font-bold text-[#1A1A1A]">
                {clientToEdit ? 'تعديل بيانات العميل' : 'إضافة عميل جديد'}
              </h2>
              <p className="text-xs text-[#707070]">
                تسجيل بيانات العميل الأساسية، قنوات التواصل، والحقول المخصصة.
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

        {/* Tabs Navigation */}
        <div className="flex items-center gap-2 px-6 pt-3 border-b border-neutral-100 bg-neutral-50/50">
          <button
            type="button"
            onClick={() => setActiveTab('basic')}
            className={`px-4 py-2 text-xs font-bold rounded-t-xl transition-all cursor-pointer border-b-2 ${
              activeTab === 'basic'
                ? 'border-[#004AC6] text-[#004AC6] bg-white'
                : 'border-transparent text-neutral-500 hover:text-neutral-800'
            }`}
          >
            البيانات الأساسية
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('contact')}
            className={`px-4 py-2 text-xs font-bold rounded-t-xl transition-all cursor-pointer border-b-2 ${
              activeTab === 'contact'
                ? 'border-[#004AC6] text-[#004AC6] bg-white'
                : 'border-transparent text-neutral-500 hover:text-neutral-800'
            }`}
          >
            التواصل والعناوين
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('custom')}
            className={`px-4 py-2 text-xs font-bold rounded-t-xl transition-all cursor-pointer border-b-2 flex items-center gap-1.5 ${
              activeTab === 'custom'
                ? 'border-[#004AC6] text-[#004AC6] bg-white'
                : 'border-transparent text-neutral-500 hover:text-neutral-800'
            }`}
          >
            <span>الحقول المخصصة</span>
            {customDefinitions.length > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-neutral-200 text-[10px] font-bold text-neutral-700">
                {customDefinitions.length}
              </span>
            )}
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          {generalError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{generalError}</span>
            </div>
          )}

          {/* TAB 1: BASIC INFO */}
          {activeTab === 'basic' && (
            <div className="space-y-4">
              {/* Name */}
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
                  اسم العميل *
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="مثال: د. حسام غالي، مستر أحمد سامي"
                  className={`w-full h-11 px-4 rounded-full border ${
                    nameError ? 'border-rose-300 bg-rose-50/20' : 'border-[#E5E5E5]'
                  } focus:border-[#004AC6] text-xs font-semibold text-[#1A1A1A] bg-white placeholder:text-neutral-400 focus:outline-none transition-all`}
                  disabled={isSubmitting}
                  autoFocus
                />
                {nameError && (
                  <p className="mt-1 text-[11px] text-rose-600 font-medium">{nameError}</p>
                )}
              </div>

              {/* Client Type & Company */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
                    نوع العميل
                  </label>
                  <select
                    value={clientType}
                    onChange={(e) => setClientType(e.target.value as ClientType)}
                    className="w-full h-11 px-4 rounded-full border border-[#E5E5E5] focus:border-[#004AC6] text-xs font-semibold text-[#1A1A1A] bg-white focus:outline-none transition-all cursor-pointer"
                    disabled={isSubmitting}
                  >
                    {CLIENT_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
                    الشركة أو العلامة التجارية
                  </label>
                  <input
                    type="text"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="اسم السنتر أو العلامة التجارية..."
                    className="w-full h-11 px-4 rounded-full border border-[#E5E5E5] focus:border-[#004AC6] text-xs font-semibold text-[#1A1A1A] bg-white placeholder:text-neutral-400 focus:outline-none transition-all"
                    disabled={isSubmitting}
                  />
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
                  ملاحظات عامة (اختياري)
                </label>
                <textarea
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="ملاحظات حول طبيعة العمل أو التعامل مع العميل..."
                  className="w-full p-3.5 rounded-2xl border border-[#E5E5E5] focus:border-[#004AC6] text-xs text-[#1A1A1A] bg-white placeholder:text-neutral-400 focus:outline-none transition-all resize-none"
                  disabled={isSubmitting}
                />
              </div>

              {/* Active Status (if editing) */}
              {clientToEdit && (
                <div className="pt-2 border-t border-neutral-100 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-semibold text-[#1A1A1A]">حالة العميل</span>
                    <p className="text-[11px] text-[#707070]">
                      {active === 1 ? 'نشط بالنظام' : 'مؤرشف'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActive(active === 1 ? 0 : 1)}
                    className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                      active === 1
                        ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                        : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                    }`}
                  >
                    {active === 1 ? 'نشط' : 'مؤرشف'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: CONTACT & ADDRESS */}
          {activeTab === 'contact' && (
            <div className="space-y-4">
              {/* Contact Person */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
                    اسم مسؤول التواصل
                  </label>
                  <input
                    type="text"
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    placeholder="مثال: أ. إسلام، د. سارة"
                    className="w-full h-11 px-4 rounded-full border border-[#E5E5E5] focus:border-[#004AC6] text-xs font-semibold text-[#1A1A1A] bg-white placeholder:text-neutral-400 focus:outline-none transition-all"
                    disabled={isSubmitting}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
                    صفة / وظيفة مسؤول التواصل
                  </label>
                  <input
                    type="text"
                    value={contactRole}
                    onChange={(e) => setContactRole(e.target.value)}
                    placeholder="مثال: مدير الأعمال، المساعد، سكرتير"
                    className="w-full h-11 px-4 rounded-full border border-[#E5E5E5] focus:border-[#004AC6] text-xs font-semibold text-[#1A1A1A] bg-white placeholder:text-neutral-400 focus:outline-none transition-all"
                    disabled={isSubmitting}
                  />
                </div>
              </div>

              {/* Phone & WhatsApp */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
                    رقم الهاتف الأساسي
                  </label>
                  <input
                    type="tel"
                    dir="ltr"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="01012345678"
                    className="w-full h-11 px-4 rounded-full border border-[#E5E5E5] focus:border-[#004AC6] text-xs font-mono text-[#1A1A1A] bg-white placeholder:text-neutral-400 focus:outline-none transition-all text-right"
                    disabled={isSubmitting}
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-neutral-700">رقم الواتساب</label>
                    <label className="flex items-center gap-1.5 cursor-pointer text-[11px] text-[#004AC6] font-medium">
                      <input
                        type="checkbox"
                        checked={sameAsPhone}
                        onChange={(e) => setSameAsPhone(e.target.checked)}
                        className="w-3.5 h-3.5 rounded border-neutral-300 text-[#004AC6] focus:ring-0"
                      />
                      <span>نفس رقم الهاتف</span>
                    </label>
                  </div>
                  <input
                    type="tel"
                    dir="ltr"
                    value={whatsapp}
                    onChange={(e) => {
                      setWhatsapp(e.target.value);
                      if (sameAsPhone) setSameAsPhone(false);
                    }}
                    placeholder="01012345678"
                    className="w-full h-11 px-4 rounded-full border border-[#E5E5E5] focus:border-[#004AC6] text-xs font-mono text-[#1A1A1A] bg-white placeholder:text-neutral-400 focus:outline-none transition-all text-right"
                    disabled={isSubmitting}
                  />
                </div>
              </div>

              {/* Email & City */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
                    البريد الإلكتروني
                  </label>
                  <input
                    type="email"
                    dir="ltr"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@example.com"
                    className={`w-full h-11 px-4 rounded-full border ${
                      emailError ? 'border-rose-300 bg-rose-50/20' : 'border-[#E5E5E5]'
                    } focus:border-[#004AC6] text-xs font-mono text-[#1A1A1A] bg-white placeholder:text-neutral-400 focus:outline-none transition-all text-right`}
                    disabled={isSubmitting}
                  />
                  {emailError && (
                    <p className="mt-1 text-[11px] text-rose-600 font-medium">{emailError}</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
                    المدينة / المحافظة
                  </label>
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="القاهرة، الجيزة، المنصورة..."
                    className="w-full h-11 px-4 rounded-full border border-[#E5E5E5] focus:border-[#004AC6] text-xs font-semibold text-[#1A1A1A] bg-white placeholder:text-neutral-400 focus:outline-none transition-all"
                    disabled={isSubmitting}
                  />
                </div>
              </div>

              {/* Preferred Contact & Secondary Phone */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
                    طريقة التواصل المفضلة
                  </label>
                  <select
                    value={preferredContact}
                    onChange={(e) => setPreferredContact(e.target.value as PreferredContact)}
                    className="w-full h-11 px-4 rounded-full border border-[#E5E5E5] focus:border-[#004AC6] text-xs font-semibold text-[#1A1A1A] bg-white focus:outline-none transition-all cursor-pointer"
                    disabled={isSubmitting}
                  >
                    {PREFERRED_CONTACTS.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
                    هاتف بديل (اختياري)
                  </label>
                  <input
                    type="tel"
                    dir="ltr"
                    value={secondaryPhone}
                    onChange={(e) => setSecondaryPhone(e.target.value)}
                    placeholder="011XXXXXXXX"
                    className="w-full h-11 px-4 rounded-full border border-[#E5E5E5] focus:border-[#004AC6] text-xs font-mono text-[#1A1A1A] bg-white placeholder:text-neutral-400 focus:outline-none transition-all text-right"
                    disabled={isSubmitting}
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: CUSTOM FIELDS */}
          {activeTab === 'custom' && (
            <div className="space-y-5">
              {customDefinitions.length === 0 ? (
                <div className="py-8 text-center text-xs text-neutral-400 border border-dashed border-neutral-200 rounded-2xl">
                  لا توجد حقول مخصصة مضافة بالنظام حتى الآن. يمكنك إضافتها من قائمة الإعدادات.
                </div>
              ) : (
                Object.entries(customFieldsBySection).map(([sectionName, defs]) => (
                  <div key={sectionName} className="space-y-3">
                    <div className="text-xs font-bold text-[#004AC6] border-b border-blue-100 pb-1 flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5" />
                      <span>{sectionName === 'general' ? 'حقول عامة' : sectionName}</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {defs.map((def) => {
                        const val = customValues[def.id];

                        return (
                          <div
                            key={def.id}
                            className={def.field_type === 'long_text' || def.field_type === 'multi_select' ? 'sm:col-span-2' : ''}
                          >
                            <label className="block text-xs font-semibold text-neutral-700 mb-1">
                              <span>{def.label}</span>
                              {def.required === 1 && (
                                <span className="text-rose-600 mr-1">*</span>
                              )}
                            </label>

                            {/* SHORT TEXT / PHONE / EMAIL / URL */}
                            {def.field_type === 'short_text' && (
                              <input
                                type="text"
                                value={(val as string) || ''}
                                onChange={(e) => handleCustomValueChange(def.id, e.target.value)}
                                placeholder={`أدخل ${def.label}...`}
                                className="w-full h-11 px-4 rounded-full border border-[#E5E5E5] text-xs font-medium text-[#1A1A1A] bg-white focus:outline-none focus:border-[#004AC6]"
                              />
                            )}

                            {def.field_type === 'phone' && (
                              <input
                                type="tel"
                                dir="ltr"
                                value={(val as string) || ''}
                                onChange={(e) => handleCustomValueChange(def.id, e.target.value)}
                                placeholder="010XXXXXXXX"
                                className="w-full h-11 px-4 rounded-full border border-[#E5E5E5] text-xs font-mono text-[#1A1A1A] bg-white text-right focus:outline-none focus:border-[#004AC6]"
                              />
                            )}

                            {def.field_type === 'email' && (
                              <input
                                type="email"
                                dir="ltr"
                                value={(val as string) || ''}
                                onChange={(e) => handleCustomValueChange(def.id, e.target.value)}
                                placeholder="name@example.com"
                                className="w-full h-11 px-4 rounded-full border border-[#E5E5E5] text-xs font-mono text-[#1A1A1A] bg-white text-right focus:outline-none focus:border-[#004AC6]"
                              />
                            )}

                            {def.field_type === 'url' && (
                              <input
                                type="url"
                                dir="ltr"
                                value={(val as string) || ''}
                                onChange={(e) => handleCustomValueChange(def.id, e.target.value)}
                                placeholder="https://..."
                                className="w-full h-11 px-4 rounded-full border border-[#E5E5E5] text-xs font-mono text-[#1A1A1A] bg-white text-right focus:outline-none focus:border-[#004AC6]"
                              />
                            )}

                            {/* LONG TEXT */}
                            {def.field_type === 'long_text' && (
                              <textarea
                                rows={2}
                                value={(val as string) || ''}
                                onChange={(e) => handleCustomValueChange(def.id, e.target.value)}
                                placeholder={`أدخل ${def.label}...`}
                                className="w-full p-3 rounded-2xl border border-[#E5E5E5] text-xs text-[#1A1A1A] bg-white focus:outline-none focus:border-[#004AC6] resize-none"
                              />
                            )}

                            {/* INTEGER */}
                            {def.field_type === 'integer' && (
                              <input
                                type="number"
                                value={val !== undefined && val !== null ? String(val) : ''}
                                onChange={(e) => handleCustomValueChange(def.id, e.target.value)}
                                placeholder="0"
                                className="w-full h-11 px-4 rounded-full border border-[#E5E5E5] text-xs font-mono text-[#1A1A1A] bg-white focus:outline-none focus:border-[#004AC6]"
                              />
                            )}

                            {/* MONEY PIASTERS (Input in EGP) */}
                            {def.field_type === 'money_piasters' && (
                              <div className="relative">
                                <input
                                  type="number"
                                  step="0.01"
                                  value={val !== undefined && val !== null ? String(val) : ''}
                                  onChange={(e) => handleCustomValueChange(def.id, e.target.value)}
                                  placeholder="0.00"
                                  className="w-full h-11 px-4 pl-12 rounded-full border border-[#E5E5E5] text-xs font-mono text-[#1A1A1A] bg-white focus:outline-none focus:border-[#004AC6]"
                                />
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-neutral-400">
                                  ج.م
                                </span>
                              </div>
                            )}

                            {/* DATE */}
                            {def.field_type === 'date' && (
                              <input
                                type="date"
                                value={(val as string) || ''}
                                onChange={(e) => handleCustomValueChange(def.id, e.target.value)}
                                className="w-full h-11 px-4 rounded-full border border-[#E5E5E5] text-xs font-medium text-[#1A1A1A] bg-white focus:outline-none focus:border-[#004AC6]"
                              />
                            )}

                            {/* BOOLEAN */}
                            {def.field_type === 'boolean' && (
                              <label className="flex items-center gap-2.5 h-11 px-4 rounded-full border border-[#E5E5E5] bg-white cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={!!val}
                                  onChange={(e) => handleCustomValueChange(def.id, e.target.checked)}
                                  className="w-4 h-4 rounded text-[#004AC6] border-neutral-300 focus:ring-0"
                                />
                                <span className="text-xs font-semibold text-[#1A1A1A]">
                                  {val ? 'نعم / مفعّل' : 'لا / غير مفعّل'}
                                </span>
                              </label>
                            )}

                            {/* SINGLE SELECT */}
                            {def.field_type === 'single_select' && (
                              <select
                                value={(val as string) || ''}
                                onChange={(e) => handleCustomValueChange(def.id, e.target.value)}
                                className="w-full h-11 px-4 rounded-full border border-[#E5E5E5] text-xs font-semibold text-[#1A1A1A] bg-white focus:outline-none focus:border-[#004AC6] cursor-pointer"
                              >
                                <option value="">اختر {def.label}...</option>
                                {def.options?.map((opt) => (
                                  <option key={opt.id} value={opt.id}>
                                    {opt.label}
                                  </option>
                                ))}
                              </select>
                            )}

                            {/* MULTI SELECT */}
                            {def.field_type === 'multi_select' && (
                              <div className="p-3 rounded-2xl border border-[#E5E5E5] bg-neutral-50/50 flex flex-wrap gap-2">
                                {def.options?.map((opt) => {
                                  const selectedList = Array.isArray(val) ? (val as string[]) : [];
                                  const isSelected = selectedList.includes(opt.id);
                                  return (
                                    <button
                                      key={opt.id}
                                      type="button"
                                      onClick={() => handleMultiSelectToggle(def.id, opt.id)}
                                      className={`text-xs px-3 py-1.5 rounded-full border transition-all cursor-pointer font-medium ${
                                        isSelected
                                          ? 'bg-[#004AC6] text-white border-[#004AC6]'
                                          : 'bg-white text-neutral-700 border-neutral-200 hover:border-neutral-300'
                                      }`}
                                    >
                                      {opt.label}
                                    </button>
                                  );
                                })}
                              </div>
                            )}

                            {def.help_text && (
                              <p className="mt-1 text-[11px] text-neutral-400">{def.help_text}</p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Modal Footer */}
          <div className="pt-4 border-t border-neutral-100 flex items-center justify-between gap-2.5">
            <div className="flex gap-2">
              {activeTab === 'contact' && (
                <button
                  type="button"
                  onClick={() => setActiveTab('basic')}
                  className="h-10 px-4 rounded-full text-xs font-semibold text-[#707070] hover:bg-neutral-100 cursor-pointer"
                >
                  السابق: الأساسية
                </button>
              )}
              {activeTab === 'custom' && (
                <button
                  type="button"
                  onClick={() => setActiveTab('contact')}
                  className="h-10 px-4 rounded-full text-xs font-semibold text-[#707070] hover:bg-neutral-100 cursor-pointer"
                >
                  السابق: التواصل
                </button>
              )}
              {activeTab === 'basic' && (
                <button
                  type="button"
                  onClick={() => setActiveTab('contact')}
                  className="h-10 px-4 rounded-full text-xs font-semibold text-[#004AC6] bg-blue-50 hover:bg-blue-100 cursor-pointer"
                >
                  التالي: التواصل
                </button>
              )}
              {activeTab === 'contact' && (
                <button
                  type="button"
                  onClick={() => setActiveTab('custom')}
                  className="h-10 px-4 rounded-full text-xs font-semibold text-[#004AC6] bg-blue-50 hover:bg-blue-100 cursor-pointer"
                >
                  التالي: الحقول المخصصة
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="h-10 px-5 rounded-full text-xs font-semibold text-[#707070] hover:text-[#1A1A1A] hover:bg-neutral-100 transition-colors cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex items-center gap-2 h-10 px-6 rounded-full bg-[#004AC6] hover:bg-blue-700 text-white text-xs font-semibold shadow-sm transition-all disabled:opacity-50 cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>
                  {isSubmitting
                    ? 'جاري الحفظ...'
                    : clientToEdit
                    ? 'حفظ التعديلات'
                    : 'تسجيل العميل'}
                </span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ClientFormModal;
