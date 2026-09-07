import React, { useCallback, useEffect, useState } from 'react';
import { getDatabaseDriver } from '../../database/driver';
import { BdiCurrency, BdiText } from '../../ui/bdi';
import { ActionableError, SkeletonCard } from '../../ui/feedback';

interface ReportSnapshot {
  collectedPiasters: number;
  expensesPiasters: number;
  overduePiasters: number;
  bookedMinutes: number;
}

const monthStart = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
};

export const ReportsView: React.FC = () => {
  const [snapshot, setSnapshot] = useState<ReportSnapshot | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      setSnapshot(null);
      const driver = await getDatabaseDriver();
      const from = monthStart();
      const [payments, expenses, overdue, studio] = await Promise.all([
        driver.query<{ total: number }>("SELECT COALESCE(SUM(amount), 0) AS total FROM payments WHERE status = 'active' AND date >= ?", [from]),
        driver.query<{ total: number }>('SELECT COALESCE(SUM(amount), 0) AS total FROM expenses WHERE date >= ?', [from]),
        driver.query<{ total: number }>(
          `SELECT COALESCE(SUM(d.base_amount - COALESCE((
             SELECT SUM(pa.amount) FROM payment_allocations pa
             JOIN payments p ON p.id = pa.payment_id
             WHERE pa.target_type = 'marketing_due' AND pa.target_id = d.id AND p.status = 'active'
           ), 0)), 0) AS total
           FROM marketing_monthly_dues d
           WHERE d.status IN ('due', 'partial', 'overdue')`
        ),
        driver.query<{ total: number }>("SELECT COALESCE(SUM(planned_minutes), 0) AS total FROM studio_bookings WHERE date >= ? AND status NOT IN ('cancelled', 'no_show')", [from]),
      ]);
      setSnapshot({
        collectedPiasters: Number(payments[0]?.total ?? 0),
        expensesPiasters: Number(expenses[0]?.total ?? 0),
        overduePiasters: Number(overdue[0]?.total ?? 0),
        bookedMinutes: Number(studio[0]?.total ?? 0),
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause : new Error(String(cause)));
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (error) {
    return <ActionableError title="تعذر إعداد التقرير" message={error.message} error={error} onRetry={() => void load()} />;
  }
  if (!snapshot) {
    return <div className="grid grid-cols-1 md:grid-cols-2 gap-5"><SkeletonCard rows={3} hasHeader /><SkeletonCard rows={3} hasHeader /></div>;
  }

  const net = snapshot.collectedPiasters - snapshot.expensesPiasters;
  const cards = [
    ['التحصيلات هذا الشهر', <BdiCurrency key="value" piasters={snapshot.collectedPiasters} />, 'دفعات نشطة مسجلة'],
    ['المصروفات هذا الشهر', <BdiCurrency key="value" piasters={snapshot.expensesPiasters} />, 'مصروفات تشغيلية مسجلة'],
    ['صافي التدفق النقدي', <BdiCurrency key="value" piasters={net} />, net >= 0 ? 'رصيد تشغيلي موجب' : 'يتطلب مراجعة المصروفات'],
    ['ساعات الاستوديو المخططة', <BdiText key="value">{snapshot.bookedMinutes} دقيقة</BdiText>, 'الحجوزات غير الملغاة'],
  ];

  return (
    <section className="max-w-[1400px] mx-auto space-y-6" dir="rtl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-sm font-bold text-[#1A1A1A]">ملخص الشهر الجاري</h2>
          <p className="text-xs text-neutral-400 mt-0.5">مؤشرات الأداء المالي والتشغيلي</p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="h-10 px-5 rounded-full bg-[#004AC6] hover:bg-[#003bb0] active:scale-95 text-white text-xs font-bold transition-all shadow-sm focus:outline-none"
        >
          تحديث البيانات
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {cards.map(([label, value, detail]) => (
          <article
            key={label as string}
            className="bg-white p-6 rounded-[2rem] border border-[#E5E5E5] shadow-[0_4px_20px_rgba(0,0,0,0.03)]"
          >
            <p className="text-xs font-medium text-neutral-400">{label}</p>
            <div className="mt-2 text-2xl font-bold text-[#1A1A1A]">{value}</div>
            <p className="mt-2 text-xs text-neutral-500">{detail}</p>
          </article>
        ))}
      </div>

      <div className="bg-white rounded-[2rem] border border-[#E5E5E5] shadow-[0_4px_20px_rgba(0,0,0,0.03)] p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-amber-400 shrink-0" />
          <div>
            <p className="font-semibold text-xs text-neutral-400">مستحقات التسويق المفتوحة</p>
            <p className="text-lg font-bold text-[#1A1A1A] mt-0.5">
              <BdiCurrency piasters={snapshot.overduePiasters} />
            </p>
          </div>
        </div>
        <p className="text-xs text-neutral-400 max-w-md">
          إجمالي المستحقات غير المسددة أو المسددة جزئياً
        </p>
      </div>
    </section>
  );
};
