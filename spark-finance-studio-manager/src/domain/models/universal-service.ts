/**
 * Universal Service Domain Models:
 * - Service Definition (تعريف الخدمة)
 * - Plan Template & Entitlements (قالب الخطة والاستحقاقات)
 * - Sold Plan & Entitlements (الخطة المباعة ولقطة الاستحقاقات)
 * - Client Agreements & Contracts (العقود والاشتراكات والمشاريع)
 * - Workflow Stages & Reel Lifecycle
 */

export type BillingMethod =
  | 'one_time'
  | 'recurring'
  | 'project_installments'
  | 'hourly_or_quantity'
  | 'entitlement_package';

export const BILLING_METHODS: Array<{ id: BillingMethod; label: string; description: string }> = [
  { id: 'one_time', label: 'دفعة واحدة', description: 'خدمة تسدد وتنفذ لمرة واحدة' },
  { id: 'recurring', label: 'اشتراك متكرر', description: 'تجديد شهري أو دوري منتظم' },
  { id: 'project_installments', label: 'أقساط مشروع', description: 'دفعات مرحلية مرتبطة بنسب إنجاز' },
  { id: 'hourly_or_quantity', label: 'بالساعة أو الكمية', description: 'محاسبة بحسب حجم الاستهلاك الفعلي' },
  { id: 'entitlement_package', label: 'باقة استحقاقات', description: 'رصيد محدد من الساعات أو الريلز أو التصاميم' },
];

export type ServiceStatus =
  | 'draft'
  | 'active'
  | 'paused'
  | 'completed'
  | 'cancelled'
  | 'expired';

export const SERVICE_STATUSES: Array<{ id: ServiceStatus; label: string; color: string }> = [
  { id: 'draft', label: 'مسودة', color: 'bg-neutral-100 text-neutral-600' },
  { id: 'active', label: 'نشط', color: 'bg-emerald-50 text-emerald-700' },
  { id: 'paused', label: 'موقوف مؤقتاً', color: 'bg-amber-50 text-amber-700' },
  { id: 'completed', label: 'مكتمل', color: 'bg-blue-50 text-blue-700' },
  { id: 'cancelled', label: 'ملغي', color: 'bg-rose-50 text-rose-700' },
  { id: 'expired', label: 'منتهي', color: 'bg-slate-100 text-slate-600' },
];

export type CollectionStatus =
  | 'unpaid'
  | 'partially_paid'
  | 'paid'
  | 'overdue'
  | 'refunded';

export const COLLECTION_STATUSES: Array<{ id: CollectionStatus; label: string; color: string }> = [
  { id: 'unpaid', label: 'غير مسدد', color: 'bg-rose-50 text-rose-700' },
  { id: 'partially_paid', label: 'مسدد جزئياً', color: 'bg-amber-50 text-amber-700' },
  { id: 'paid', label: 'مسدد بالكامل', color: 'bg-emerald-50 text-emerald-700' },
  { id: 'overdue', label: 'متأخر', color: 'bg-red-50 text-red-700' },
  { id: 'refunded', label: 'مسترد', color: 'bg-purple-50 text-purple-700' },
];

export interface UniversalServiceDefinition {
  id: string;
  name: string;
  service_type_key: string;
  description: string | null;
  billing_method: BillingMethod;
  default_price: number; // integer piasters
  currency: string; // default 'EGP'
  default_duration_days: number | null;
  unit_name: string | null;
  requires_contract: number; // 0 or 1
  has_fixed_dates: number; // 0 or 1
  auto_renew: number; // 0 or 1
  active: number; // 0 or 1
  tags: string | null; // comma-separated or json
  created_at: string;
  updated_at: string;
}

export interface PlanTemplate {
  id: string;
  service_id: string;
  name: string;
  description: string | null;
  default_price: number; // integer piasters
  billing_method: BillingMethod;
  duration_days: number | null;
  terms: string | null;
  active: number; // 0 or 1
  sort_order: number;
  tags: string | null;
  created_at: string;
  updated_at: string;
}

export interface PlanTemplateEntitlement {
  id: string;
  plan_template_id: string;
  entitlement_name: string;
  entitlement_key: string;
  quantity: number;
  unit: string;
  allow_overage: number; // 0 or 1
  rollover_allowed: number; // 0 or 1
  sort_order: number;
}

export interface SoldPlan {
  id: string;
  client_id: string;
  plan_template_id: string | null;
  name_snapshot: string;
  price_snapshot: number; // integer piasters
  discount_snapshot: number; // integer piasters
  tax_snapshot: number; // integer piasters
  total_snapshot: number; // integer piasters
  billing_method: BillingMethod;
  terms_snapshot: string | null;
  start_date: string;
  end_date: string | null;
  renewal_date: string | null;
  service_status: ServiceStatus;
  collection_status: CollectionStatus;
  assignee: string | null;
  agreement_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface SoldPlanEntitlement {
  id: string;
  sold_plan_id: string;
  entitlement_name: string;
  entitlement_key: string;
  quantity_initial: number;
  quantity_used: number;
  quantity_reserved: number;
  quantity_remaining: number;
  unit: string;
  allow_overage: number; // 0 or 1
  rollover_allowed: number; // 0 or 1
  sort_order: number;
}

export interface ClientAgreement {
  id: string;
  client_id: string;
  service_id: string | null;
  plan_template_id: string | null;
  agreement_number: string;
  display_name: string;
  agreement_type: 'contract' | 'subscription' | 'project' | 'custom';
  start_date: string;
  end_date: string | null;
  renewal_date: string | null;
  billing_method: BillingMethod;
  agreed_amount: number; // integer piasters
  discount_amount: number; // integer piasters
  tax_amount: number; // integer piasters
  total_amount: number; // integer piasters
  service_status: ServiceStatus;
  collection_status: CollectionStatus;
  assignee: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type ReelStageKey =
  | 'planned'
  | 'ready_to_film'
  | 'filmed'
  | 'editing'
  | 'review'
  | 'delivered'
  | 'cancelled';

export const PROTECTED_REEL_STAGES: readonly ReelStageKey[] = ['delivered', 'cancelled'];

export interface WorkflowStage {
  id: string;
  workflow_type: string; // 'reel'
  stage_key: string;
  label: string;
  color_class: string;
  sort_order: number;
  is_protected: number; // 1 for delivered & cancelled
  active: number;
}

export const DEFAULT_REEL_STAGES: Array<{
  stage_key: ReelStageKey;
  label: string;
  color_class: string;
  sort_order: number;
  is_protected: number;
}> = [
  { stage_key: 'planned', label: 'المخطط', color_class: 'bg-blue-50 text-blue-700', sort_order: 10, is_protected: 0 },
  { stage_key: 'ready_to_film', label: 'جاهز للتصوير', color_class: 'bg-sky-50 text-sky-700', sort_order: 20, is_protected: 0 },
  { stage_key: 'filmed', label: 'تم التصوير', color_class: 'bg-amber-50 text-amber-700', sort_order: 30, is_protected: 0 },
  { stage_key: 'editing', label: 'قيد المونتاج', color_class: 'bg-purple-50 text-purple-700', sort_order: 40, is_protected: 0 },
  { stage_key: 'review', label: 'قيد المراجعة', color_class: 'bg-indigo-50 text-indigo-700', sort_order: 50, is_protected: 0 },
  { stage_key: 'delivered', label: 'تم التسليم', color_class: 'bg-emerald-50 text-emerald-700', sort_order: 60, is_protected: 1 },
  { stage_key: 'cancelled', label: 'ملغي', color_class: 'bg-rose-50 text-rose-700', sort_order: 70, is_protected: 1 },
];
