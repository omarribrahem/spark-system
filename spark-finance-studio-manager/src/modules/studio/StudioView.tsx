import React, { useCallback, useEffect, useState } from 'react';
import { getDatabaseDriver } from '../../database/driver';
import { ClientRecord, ClientRepository } from '../../database/repositories';
import { BdiDate, BdiText } from '../../ui/bdi';
import { ActionableError, EmptyState, SkeletonCard } from '../../ui/feedback';
import { Select } from '../../ui/athredu/Select';
import { Button } from '../../ui/athredu/Button';
import { Card } from '../../ui/athredu/Card';
import {
  listStudioBookings,
  cancelStudioBooking,
  resolveAndCompleteBooking,
  StudioBookingWithDetails,
} from './studio-service';
import {
  Clock,
  Plus,
  CheckCircle2,
  CalendarDays,
} from 'lucide-react';

export interface StudioViewProps {
  onOpenHeaderForm?: (mode: string) => void;
}

type CalendarViewMode = 'week' | 'month' | 'list';

const today = (): string => new Date().toISOString().slice(0, 10);

export const StudioView: React.FC<StudioViewProps> = ({ onOpenHeaderForm }) => {
  const [viewMode, setViewMode] = useState<CalendarViewMode>('week');
  const [bookings, setBookings] = useState<StudioBookingWithDetails[]>([]);
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const load = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const driver = await getDatabaseDriver();
      const [allBookings, nextClients] = await Promise.all([
        listStudioBookings(driver, { excludeCancelled: false }),
        new ClientRepository(driver).list({ activeOnly: true }),
      ]);
      setBookings(allBookings);
      setClients(nextClients);
    } catch (cause) {
      setError(cause instanceof Error ? cause : new Error(String(cause)));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCancelBooking = async (id: string) => {
    if (!window.confirm('هل أنت متأكد من إلغاء هذا الحجز؟ سيتم استعادة رصيد الساعات إن وجد.')) return;
    try {
      const driver = await getDatabaseDriver();
      await cancelStudioBooking(driver, id, 'إلغاء بناء على طلب العميل');
      await load();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'تعذر إلغاء الحجز');
    }
  };

  const handleCompleteBooking = async (b: StudioBookingWithDetails) => {
    try {
      const driver = await getDatabaseDriver();
      await resolveAndCompleteBooking(driver, {
        bookingId: b.id,
        actualStart: b.planned_start,
        actualEnd: b.planned_end,
        actualMinutes: b.planned_minutes,
      });
      await load();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'تعذر إنهاء الجلسة');
    }
  };

  // Filtered bookings
  const filteredBookings = bookings.filter((b) => {
    if (selectedClientId !== 'all' && b.client_id !== selectedClientId) return false;
    if (selectedStatus !== 'all' && b.status !== selectedStatus) return false;
    return true;
  });

  // Calculate stats
  const todayStr = today();
  const todayBookings = bookings.filter((b) => b.date === todayStr && b.status !== 'cancelled');
  const totalUpcoming = bookings.filter((b) => b.date >= todayStr && b.status !== 'cancelled');
  const totalCompleted = bookings.filter((b) => b.status === 'completed');

  // Helpers for Week view (7 days from start of week)
  const getWeekDates = () => {
    const curr = new Date();
    const first = curr.getDate() - curr.getDay(); // Sunday as 0
    const week = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(curr.setDate(first + i));
      week.push(d.toISOString().slice(0, 10));
    }
    return week;
  };
  const weekDates = getWeekDates();

  const getDayName = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'short' });
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case 'confirmed':
        return <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700">مؤكد</span>;
      case 'in_progress':
        return <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700">قيد التنفيذ</span>;
      case 'completed':
        return <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700">مكتمل</span>;
      case 'cancelled':
        return <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-rose-50 text-rose-700">ملغي</span>;
      default:
        return <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-neutral-100 text-neutral-600">{status}</span>;
    }
  };

  return (
    <section className="space-y-6" dir="rtl">
      {/* Top Header Card */}
      <header className="rounded-[2rem] border border-[#E5E5E5] bg-white p-6 shadow-[0_4px_20px_rgba(0,0,0,0.03)] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-extrabold text-[#1A1A1A]">
            جدول حجوزات الاستوديو
          </h1>
          <p className="text-xs text-neutral-400 mt-1">
            إدارة جلسات التصوير والتسجيل وحساب استهلاك الساعات بدون أي تداخل زمني.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <Button
            onClick={() => onOpenHeaderForm?.('form-booking')}
            variant="brand"
            className="flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span>حجز جلسة جديدة</span>
          </Button>
        </div>
      </header>

      {/* KPI Stats Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="flex items-center gap-4">
          <div className="w-11 h-11 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <span className="text-xs text-neutral-400 font-medium">جلسات اليوم</span>
            <div className="text-xl font-extrabold text-[#1A1A1A] mt-0.5">
              <BdiText>{todayBookings.length} جلسة</BdiText>
            </div>
            <span className="text-[11px] text-neutral-500">
              {todayBookings.reduce((acc, b) => acc + Math.round(b.planned_minutes / 60), 0)} ساعات عمل
            </span>
          </div>
        </Card>

        <Card className="flex items-center gap-4">
          <div className="w-11 h-11 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
            <CalendarDays className="w-5 h-5" />
          </div>
          <div>
            <span className="text-xs text-neutral-400 font-medium">حجوزات قادمة</span>
            <div className="text-xl font-extrabold text-[#1A1A1A] mt-0.5">
              <BdiText>{totalUpcoming.length} جلسة</BdiText>
            </div>
            <span className="text-[11px] text-neutral-500">مجدولة بالجدول التشغيلي</span>
          </div>
        </Card>

        <Card className="flex items-center gap-4">
          <div className="w-11 h-11 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <span className="text-xs text-neutral-400 font-medium">جلسات مكتملة</span>
            <div className="text-xl font-extrabold text-[#1A1A1A] mt-0.5">
              <BdiText>{totalCompleted.length} جلسة</BdiText>
            </div>
            <span className="text-[11px] text-emerald-600 font-medium">تم خصم ساعاتها واعتمادها</span>
          </div>
        </Card>
      </div>

      {/* View Mode & Filter Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white p-4 rounded-2xl border border-[#E5E5E5]">
        {/* View Mode Tabs */}
        <div className="flex items-center gap-1.5 p-1 bg-neutral-100 rounded-xl">
          <button
            onClick={() => setViewMode('week')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
              viewMode === 'week' ? 'bg-white text-[#1A1A1A] shadow-sm' : 'text-neutral-500 hover:text-neutral-900'
            }`}
          >
            عرض أسبوعي
          </button>
          <button
            onClick={() => setViewMode('month')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
              viewMode === 'month' ? 'bg-white text-[#1A1A1A] shadow-sm' : 'text-neutral-500 hover:text-neutral-900'
            }`}
          >
            عرض شهري
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
              viewMode === 'list' ? 'bg-white text-[#1A1A1A] shadow-sm' : 'text-neutral-500 hover:text-neutral-900'
            }`}
          >
            قائمة الجلسات
          </button>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2">
          <Select
            value={selectedClientId}
            onValueChange={setSelectedClientId}
            options={[
              { value: 'all', label: 'جميع العملاء' },
              ...clients.map((c) => ({ value: c.id, label: c.name })),
            ]}
          />
          <Select
            value={selectedStatus}
            onValueChange={setSelectedStatus}
            options={[
              { value: 'all', label: 'جميع الحالات' },
              { value: 'confirmed', label: 'مؤكد' },
              { value: 'in_progress', label: 'قيد التنفيذ' },
              { value: 'completed', label: 'مكتمل' },
              { value: 'cancelled', label: 'ملغي' },
            ]}
          />
        </div>
      </div>

      {/* Main Content Area */}
      {isLoading ? (
        <div className="p-6 space-y-4">
          <SkeletonCard rows={3} hasHeader />
          <SkeletonCard rows={3} />
        </div>
      ) : error ? (
        <ActionableError title="تعذر تحميل الحجوزات" message={error.message} error={error} onRetry={() => void load()} />
      ) : filteredBookings.length === 0 ? (
        <EmptyState
          title="لا توجد حجوزات استوديو تطابق المعايير"
          description="يمكنك إنشاء حجز جديد في أي وقت بالنقر على زر حجز جلسة جديدة أعلاه."
          actionLabel="حجز جلسة استوديو"
          onAction={() => onOpenHeaderForm?.('form-booking')}
        />
      ) : viewMode === 'week' ? (
        /* 1. WEEK VIEW */
        <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
          {weekDates.map((dateStr) => {
            const dayBookings = filteredBookings.filter((b) => b.date === dateStr);
            const isToday = dateStr === todayStr;

            return (
              <div
                key={dateStr}
                className={`rounded-2xl border p-3 min-h-[220px] flex flex-col ${
                  isToday
                    ? 'bg-blue-50/40 border-blue-200'
                    : 'bg-white border-[#E5E5E5]'
                }`}
              >
                <div className="flex items-center justify-between pb-2 border-b border-neutral-100 mb-2">
                  <span className={`text-xs font-bold ${isToday ? 'text-blue-700' : 'text-[#1A1A1A]'}`}>
                    {getDayName(dateStr)}
                  </span>
                  {isToday && (
                    <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
                  )}
                </div>

                <div className="space-y-2 flex-1 overflow-y-auto">
                  {dayBookings.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-neutral-300 text-[11px]">
                      متاح
                    </div>
                  ) : (
                    dayBookings.map((b) => (
                      <div
                        key={b.id}
                        className="bg-white p-2.5 rounded-xl border border-neutral-200/80 shadow-sm space-y-1.5 text-right hover:border-neutral-300 transition-all"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-[#1A1A1A] truncate">{b.clientName}</span>
                          {statusBadge(b.status)}
                        </div>
                        <div className="flex items-center gap-1 text-[11px] text-neutral-500">
                          <Clock className="w-3 h-3 text-neutral-400" />
                          <span>{b.planned_start} - {b.planned_end} ({Math.round(b.planned_minutes / 60)} س)</span>
                        </div>
                        {b.notes && (
                          <p className="text-[10px] text-neutral-400 line-clamp-1">{b.notes}</p>
                        )}
                        {b.status === 'confirmed' && (
                          <div className="flex items-center justify-end gap-1 pt-1 border-t border-neutral-100">
                            <button
                              onClick={() => handleCompleteBooking(b)}
                              className="text-[10px] text-emerald-600 font-bold hover:underline"
                            >
                              إتمام
                            </button>
                            <span className="text-neutral-300">|</span>
                            <button
                              onClick={() => handleCancelBooking(b.id)}
                              className="text-[10px] text-rose-500 font-medium hover:underline"
                            >
                              إلغاء
                            </button>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : viewMode === 'month' ? (
        /* 2. MONTH CALENDAR VIEW */
        <div className="bg-white rounded-[2rem] border border-[#E5E5E5] p-6 shadow-[0_4px_20px_rgba(0,0,0,0.03)] space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
            <h3 className="text-sm font-bold text-[#1A1A1A]">أجندة الشهر</h3>
            <span className="text-xs text-neutral-500">إجمالي الجلسات: {filteredBookings.length}</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2.5">
            {Array.from({ length: 30 }).map((_, idx) => {
              const dayNum = idx + 1;
              const now = new Date();
              const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
              const dayBookings = filteredBookings.filter((b) => b.date === dateStr);
              const isToday = dateStr === todayStr;

              return (
                <div
                  key={dayNum}
                  className={`p-3 rounded-2xl border min-h-[90px] flex flex-col justify-between ${
                    isToday
                      ? 'bg-blue-50/50 border-blue-300'
                      : dayBookings.length > 0
                      ? 'bg-neutral-50/70 border-neutral-200'
                      : 'bg-white border-neutral-100'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[#1A1A1A]">{dayNum}</span>
                    {dayBookings.length > 0 && (
                      <span className="w-5 h-5 rounded-full bg-[#004AC6] text-white text-[10px] font-bold flex items-center justify-center">
                        {dayBookings.length}
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-neutral-400 truncate">
                    {dayBookings.length > 0
                      ? dayBookings.map((b) => b.clientName).join(', ')
                      : 'لا جلسات'}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* 3. LIST VIEW */
        <div className="bg-white rounded-[2rem] border border-[#E5E5E5] shadow-[0_4px_20px_rgba(0,0,0,0.03)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-neutral-50/80 border-b border-neutral-100 text-neutral-500 font-semibold">
                <tr>
                  <th className="px-6 py-4">العميل</th>
                  <th className="px-6 py-4">التاريخ</th>
                  <th className="px-6 py-4">الوقت والمدة</th>
                  <th className="px-6 py-4">الحالة</th>
                  <th className="px-6 py-4">ملاحظات</th>
                  <th className="px-6 py-4 text-left">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {filteredBookings.map((b) => (
                  <tr key={b.id} className="hover:bg-neutral-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <span className="font-bold text-[#1A1A1A] block">{b.clientName}</span>
                      {b.clientCompany && (
                        <span className="text-[11px] text-neutral-400 block">{b.clientCompany}</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <BdiDate value={b.date} />
                    </td>
                    <td className="px-6 py-4">
                      <span className="font-semibold text-neutral-700 block">
                        {b.planned_start} - {b.planned_end}
                      </span>
                      <span className="text-[11px] text-neutral-400">
                        {Math.round(b.planned_minutes / 60)} ساعة ({b.planned_minutes} د)
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {statusBadge(b.status)}
                    </td>
                    <td className="px-6 py-4 text-neutral-500 max-w-[200px] truncate">
                      {b.notes || '-'}
                    </td>
                    <td className="px-6 py-4 text-left">
                      {b.status === 'confirmed' && (
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleCompleteBooking(b)}
                            className="h-7 px-3 rounded-full bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-bold transition-all text-[11px]"
                          >
                            إتمام الجلسة
                          </button>
                          <button
                            onClick={() => handleCancelBooking(b.id)}
                            className="h-7 px-3 rounded-full bg-rose-50 text-rose-600 hover:bg-rose-100 font-medium transition-all text-[11px]"
                          >
                            إلغاء
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
};
