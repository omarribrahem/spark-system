import { IDatabaseDriver } from '../harness/test-database';

export interface BookingData {
  id?: string;
  clientId: string;
  packageId?: string;
  recurringRuleId?: string;
  bookingDate: string; // YYYY-MM-DD
  startTime: string;   // HH:mm
  endTime: string;     // HH:mm
  bookingPricePiasters?: number;
  depositPiasters?: number;
  status?: 'scheduled' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled' | 'no_show';
  notes?: string;
}

export class BookingFixture {
  constructor(private driver: IDatabaseDriver) {}

  public async createBooking(data: BookingData): Promise<string> {
    const id = data.id || `booking_${Math.random().toString(36).substring(2, 9)}`;

    // Calculate planned duration in integer minutes
    const [sH, sM] = data.startTime.split(':').map(Number);
    const [eH, eM] = data.endTime.split(':').map(Number);
    const plannedMinutes = (eH * 60 + eM) - (sH * 60 + sM);

    if (plannedMinutes <= 0) {
      throw new Error(`Invalid booking times: end time ${data.endTime} must be after start time ${data.startTime}`);
    }

    // Check overlap conflict synchronously
    const existing = await this.driver.query<{ start_time: string; end_time: string; status: string }>(
      'SELECT start_time, end_time, status FROM studio_bookings WHERE booking_date = ? AND status != ?',
      [data.bookingDate, 'cancelled']
    );

    const hasConflict = existing.some(
      (slot) => data.startTime < slot.end_time && data.endTime > slot.start_time
    );

    if (hasConflict) {
      throw new Error('يوجد حجز آخر في نفس الوقت');
    }

    await this.driver.execute(
      `INSERT INTO studio_bookings (
        id, client_id, package_id, recurring_rule_id, booking_date,
        start_time, end_time, planned_minutes, booking_price, deposit_amount, status, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        data.clientId,
        data.packageId || null,
        data.recurringRuleId || null,
        data.bookingDate,
        data.startTime,
        data.endTime,
        plannedMinutes,
        data.bookingPricePiasters || 0,
        data.depositPiasters || 0,
        data.status || 'scheduled',
        data.notes || null,
      ]
    );

    // If package linked, reserve hours
    if (data.packageId) {
      const items = await this.driver.query<{ id: string; reserved_quantity: number }>(
        "SELECT id, reserved_quantity FROM client_package_items WHERE client_package_id = ? AND unit_type = 'hours'",
        [data.packageId]
      );
      if (items.length > 0) {
        await this.driver.execute(
          'UPDATE client_package_items SET reserved_quantity = ? WHERE id = ?',
          [items[0].reserved_quantity + plannedMinutes, items[0].id]
        );
      }
    }

    return id;
  }

  public async completeBooking(
    bookingId: string,
    actualStartTime: string,
    actualEndTime: string
  ): Promise<{ actualMinutes: number }> {
    const bookings = await this.driver.query<{
      package_id: string | null;
      planned_minutes: number;
    }>('SELECT package_id, planned_minutes FROM studio_bookings WHERE id = ?', [bookingId]);

    if (bookings.length === 0) throw new Error('Booking not found');
    const booking = bookings[0];

    const [sH, sM] = actualStartTime.split(':').map(Number);
    const [eH, eM] = actualEndTime.split(':').map(Number);
    const actualMinutes = (eH * 60 + eM) - (sH * 60 + sM);

    await this.driver.execute(
      `UPDATE studio_bookings SET
        actual_start_time = ?,
        actual_end_time = ?,
        actual_minutes = ?,
        status = 'completed'
       WHERE id = ?`,
      [actualStartTime, actualEndTime, actualMinutes, bookingId]
    );

    if (booking.package_id) {
      const items = await this.driver.query<{
        id: string;
        used_quantity: number;
        reserved_quantity: number;
        purchased_quantity: number;
      }>(
        "SELECT id, used_quantity, reserved_quantity, purchased_quantity FROM client_package_items WHERE client_package_id = ? AND unit_type = 'hours'",
        [booking.package_id]
      );
      if (items.length > 0) {
        const item = items[0];
        const newReserved = Math.max(0, item.reserved_quantity - booking.planned_minutes);
        const newUsed = item.used_quantity + actualMinutes;
        await this.driver.execute(
          'UPDATE client_package_items SET reserved_quantity = ?, used_quantity = ? WHERE id = ?',
          [newReserved, newUsed, item.id]
        );

        // Update package status if used
        await this.driver.execute(
          "UPDATE client_packages SET status = 'active' WHERE id = ? AND status = 'not_started'",
          [booking.package_id]
        );
      }
    }

    return { actualMinutes };
  }

  public async cancelBooking(bookingId: string, cancelReason: string): Promise<void> {
    if (!cancelReason || cancelReason.trim() === '') {
      throw new Error('Mandatory cancellation reason required');
    }

    const bookings = await this.driver.query<{
      package_id: string | null;
      planned_minutes: number;
      actual_minutes: number | null;
      status: string;
    }>('SELECT package_id, planned_minutes, actual_minutes, status FROM studio_bookings WHERE id = ?', [bookingId]);

    if (bookings.length === 0) throw new Error('Booking not found');
    const booking = bookings[0];

    await this.driver.execute(
      "UPDATE studio_bookings SET status = 'cancelled', cancel_reason = ? WHERE id = ?",
      [cancelReason, bookingId]
    );

    // Release reserved or used minutes from package
    if (booking.package_id) {
      const items = await this.driver.query<{
        id: string;
        used_quantity: number;
        reserved_quantity: number;
      }>(
        "SELECT id, used_quantity, reserved_quantity FROM client_package_items WHERE client_package_id = ? AND unit_type = 'hours'",
        [booking.package_id]
      );
      if (items.length > 0) {
        const item = items[0];
        if (booking.status === 'completed' && booking.actual_minutes) {
          // Revert used minutes
          await this.driver.execute(
            'UPDATE client_package_items SET used_quantity = ? WHERE id = ?',
            [Math.max(0, item.used_quantity - booking.actual_minutes), item.id]
          );
        } else {
          // Revert reserved minutes
          await this.driver.execute(
            'UPDATE client_package_items SET reserved_quantity = ? WHERE id = ?',
            [Math.max(0, item.reserved_quantity - booking.planned_minutes), item.id]
          );
        }
      }
    }
  }
}
