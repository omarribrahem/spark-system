import React, { useCallback, useEffect, useState } from 'react';
import { getDatabaseDriver } from '../../database/driver';
import { ClientRecord, ClientRepository } from '../../database/repositories';
import { BdiDate, BdiText } from '../../ui/bdi';
import { ActionableError, EmptyState, SkeletonCard } from '../../ui/feedback';
import { Select } from '../../ui/athredu/Select';
import {
  createStudioBooking,
  listStudioBookings,
  StudioBookingWithDetails,
  StudioOverlapConflictError,
} from './studio-service';
import { OverlapCollisionModal } from './OverlapCollisionModal';
import { ConflictDetail } from '../../domain/models/booking';

const today = (): string => new Date().toISOString().slice(0, 10);

export const StudioView: React.FC = () => {
  const [bookings, setBookings] = useState<StudioBookingWithDetails[]>([]);
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [conflicts, setConflicts] = useState<ConflictDetail[]>([]);
  const [form, setForm] = useState({ clientId: '', date: today(), startTime: '10:00', endTime: '11:00', notes: '' });

  const load = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const driver = await getDatabaseDriver();
      const [nextBookings, nextClients] = await Promise.all([
        listStudioBookings(driver, { startDate: today(), excludeCancelled: true }),
        new ClientRepository(driver).list({ activeOnly: true }),
      ]);
      setBookings(nextBookings);
      setClients(nextClients);
      setForm((current) => current.clientId ? current : { ...current, clientId: nextClients[0]?.id ?? '' });
    } catch (cause) {
      setError(cause instanceof Error ? cause : new Error(String(cause)));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.clientId) {
      setError(new Error('أضف عميلًا نشطًا أولًا قبل إنشاء حجز.'));
      return;
    }

    try {
      setIsSaving(true);
      setError(null);
      const driver = await getDatabaseDriver();
      await createStudioBooking(driver, {
        clientId: form.clientId,
        date: form.date,
        startTime: form.startTime,
        endTime: form.endTime,
        notes: form.notes.trim() || null,
      });
      setForm((current) => ({ ...current, notes: '' }));
      await load();
    } catch (cause) {
      if (cause instanceof StudioOverlapConflictError) {
        setConflicts(cause.conflicts);
      } else {
        setError(cause instanceof Error ? cause : new Error(String(cause)));
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="max-w-[1400px] mx-auto space-y-6">
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.7fr)_minmax(320px,0.85fr)] gap-6 items-start">
        <div className="bg-white rounded-[2rem] border border-[#E5E5E5] shadow-[0_4px_20px_rgba(0,0,0,0.03)] overflow-hidden">
          <div className="flex items-center justify-between gap-4 px-6 py-5 border-b border-neutral-100">
            <div>
              <h2 className="text-base font-bold text-[#1A1A1A]">الحجوزات القادمة</h2>
              <p className="text-xs text-neutral-400 mt-1">يمنع النظام أي تداخل زمني قبل الحفظ.</p>
            </div>
            <span className="text-xs font-semibold text-neutral-600 bg-neutral-100 px-3 py-1 rounded-full">
              <BdiText>{bookings.length} جلسة</BdiText>
            </span>
          </div>

          {isLoading ? (
            <div className="p-6 space-y-3"><SkeletonCard rows={4} hasHeader /><SkeletonCard rows={2} /></div>
          ) : bookings.length === 0 ? (
            <div className="p-6"><EmptyState title="لا توجد حجوزات قادمة" description="سجّل أول جلسة ليظهر الجدول التشغيلي هنا." /></div>
          ) : (
            <div className="divide-y divide-neutral-100">
              {bookings.map((booking) => (
                <article key={booking.id} className="grid grid-cols-[auto_1fr] gap-4 px-6 py-4 hover:bg-neutral-50/70 transition-colors">
                  <div className="w-1.5 rounded-full bg-[#004AC6]" aria-hidden="true" />
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div>
                      <p className="font-semibold text-sm text-[#1A1A1A]">{booking.clientName}</p>
                      <p className="text-xs text-neutral-400 mt-1">
                        <BdiDate value={booking.date} format="date" /> · <BdiDate timeRange={{ start: booking.planned_start, end: booking.planned_end }} />
                      </p>
                    </div>
                    <div className="text-xs text-neutral-500 sm:text-left">
                      <span className="block font-semibold text-[#1A1A1A]"><BdiText>{booking.planned_minutes} دقيقة</BdiText></span>
                      <span className="text-neutral-400">{booking.status === 'scheduled' ? 'مجدول' : booking.status}</span>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>

        <form onSubmit={submit} className="bg-white rounded-[2rem] border border-[#E5E5E5] shadow-[0_4px_20px_rgba(0,0,0,0.03)] p-6 space-y-4" noValidate>
          <div>
            <h2 className="text-base font-bold text-[#1A1A1A]">إضافة حجز</h2>
            <p className="text-xs text-neutral-400 mt-1">تُحسب المدة بالدقائق وتُراجع التعارضات تلقائيًا.</p>
          </div>
          <div>
            <label className="block text-xs font-semibold text-neutral-600 mb-1.5">العميل</label>
            <Select
              value={form.clientId}
              onValueChange={(val) => setForm({ ...form, clientId: val })}
              placeholder="اختر العميل"
              options={clients.map((c) => ({ value: c.id, label: c.name }))}
            />
          </div>
          <label className="block text-xs font-semibold text-neutral-600">التاريخ
            <input
              type="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              className="mt-1.5 w-full h-11 px-4 rounded-full border border-[#E5E5E5] bg-white text-xs font-semibold text-[#1A1A1A] focus:outline-none focus:border-[#004AC6] shadow-sm transition-all"
              required
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs font-semibold text-neutral-600">من
              <input
                type="time"
                value={form.startTime}
                onChange={(e) => setForm({ ...form, startTime: e.target.value })}
                className="mt-1.5 w-full h-11 px-4 rounded-full border border-[#E5E5E5] bg-white text-xs font-semibold text-[#1A1A1A] focus:outline-none focus:border-[#004AC6] shadow-sm transition-all"
                required
              />
            </label>
            <label className="block text-xs font-semibold text-neutral-600">إلى
              <input
                type="time"
                value={form.endTime}
                onChange={(e) => setForm({ ...form, endTime: e.target.value })}
                className="mt-1.5 w-full h-11 px-4 rounded-full border border-[#E5E5E5] bg-white text-xs font-semibold text-[#1A1A1A] focus:outline-none focus:border-[#004AC6] shadow-sm transition-all"
                required
              />
            </label>
          </div>
          <label className="block text-xs font-semibold text-neutral-600">ملاحظات
              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={3}
                placeholder="أي تفاصيل خاصة بالجلسة..."
                className="mt-1.5 w-full p-3.5 rounded-2xl border border-[#E5E5E5] bg-white text-xs text-[#1A1A1A] placeholder-neutral-400 focus:outline-none focus:border-[#004AC6] shadow-sm transition-all resize-none"
              />
          </label>
          <button
            type="submit"
            disabled={isSaving || isLoading}
            className="w-full h-11 rounded-full bg-[#004AC6] hover:bg-blue-700 text-white text-xs font-bold transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 shadow-sm"
          >
            {isSaving ? 'جاري حفظ الحجز…' : 'تأكيد الحجز'}
          </button>
          {error && <ActionableError title="تعذر إتمام الحجز" message={error.message} error={error} onRetry={() => void load()} />}
        </form>
      </div>
      <OverlapCollisionModal isOpen={conflicts.length > 0} onClose={() => setConflicts([])} conflicts={conflicts} proposedDate={form.date} proposedStartTime={form.startTime} proposedEndTime={form.endTime} />
    </section>
  );
};
