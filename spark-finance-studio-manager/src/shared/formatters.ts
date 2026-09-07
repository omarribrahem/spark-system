/**
 * Pure formatting and conversion utilities for Spark Finance & Studio Manager.
 * Strictly adheres to Integer Piasters and Integer Minutes invariants.
 */

/**
 * Converts integer piasters to decimal EGP.
 * e.g., 150000 -> 1500
 */
export function piastersToEgp(piasters: number): number {
  if (!Number.isInteger(piasters)) {
    throw new Error(`Invalid piaster amount: must be an integer, received ${piasters}`);
  }
  return piasters / 100;
}

/**
 * Converts decimal or integer EGP to integer piasters.
 * e.g., 1500 -> 150000, 15.5 -> 1550
 */
export function egpToPiasters(egp: number): number {
  return Math.round(egp * 100);
}

/**
 * Formats integer piasters into formatted Egyptian currency string.
 * e.g., 150000 -> "1,500 ج.م"
 */
export function formatPiasters(piasters: number, includeSymbol = true): string {
  const egp = piastersToEgp(piasters);
  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: egp % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(egp);

  return includeSymbol ? `${formatted} ج.م` : formatted;
}

/**
 * Converts integer minutes to decimal hours.
 * e.g., 90 -> 1.5, 270 -> 4.5
 */
export function minutesToDecimalHours(minutes: number): number {
  if (!Number.isInteger(minutes)) {
    throw new Error(`Invalid minutes: must be an integer, received ${minutes}`);
  }
  return minutes / 60;
}

/**
 * Converts decimal hours to integer minutes.
 * e.g., 1.5 -> 90, 4.5 -> 270
 */
export function hoursToMinutes(hours: number): number {
  return Math.round(hours * 60);
}

/**
 * Formats integer minutes into human-readable Arabic duration string.
 * e.g., 90 -> "ساعة ونصف (90 دقيقة)", 60 -> "ساعة واحدة (60 دقيقة)"
 */
export function formatMinutesArabic(minutes: number): string {
  const hours = minutes / 60;
  if (minutes === 60) return 'ساعة واحدة';
  if (minutes === 90) return 'ساعة ونصف';
  if (minutes === 120) return 'ساعتان';
  if (hours % 1 === 0) return `${hours} ساعات`;
  return `${hours} ساعة (${minutes} دقيقة)`;
}
