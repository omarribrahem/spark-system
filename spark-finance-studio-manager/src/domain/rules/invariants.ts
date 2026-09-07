/**
 * Domain Invariant Validators
 * Enforces business rules and data consistency standards across domain calculators and repositories.
 */

export class DomainInvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DomainInvariantError';
  }
}

/**
 * Validates that an amount is a strictly non-negative integer representing piasters (1 EGP = 100 piasters).
 * Prohibits floating-point numbers, negative values, NaN, and Infinity.
 */
export function assertIntegerPiasters(amount: number, fieldName = 'amount'): void {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) {
    throw new DomainInvariantError(`Field "${fieldName}" must be a valid finite number, got: ${amount}`);
  }
  if (!Number.isInteger(amount)) {
    throw new DomainInvariantError(
      `Field "${fieldName}" violates the integer piaster invariant: must be an integer, got: ${amount}`
    );
  }
  if (amount < 0) {
    throw new DomainInvariantError(
      `Field "${fieldName}" cannot be negative in piasters, got: ${amount}`
    );
  }
}

/**
 * Validates that time durations are strictly non-negative integers representing minutes.
 * Prohibits fractional hours/minutes, negative values, NaN.
 */
export function assertIntegerMinutes(minutes: number, fieldName = 'minutes'): void {
  if (typeof minutes !== 'number' || !Number.isFinite(minutes)) {
    throw new DomainInvariantError(`Field "${fieldName}" must be a valid finite number, got: ${minutes}`);
  }
  if (!Number.isInteger(minutes)) {
    throw new DomainInvariantError(
      `Field "${fieldName}" violates the integer minutes invariant: must be an integer, got: ${minutes}`
    );
  }
  if (minutes < 0) {
    throw new DomainInvariantError(
      `Field "${fieldName}" cannot be negative minutes, got: ${minutes}`
    );
  }
}

/**
 * Validates non-empty string fields (e.g. void reasons, client names).
 */
export function assertNonEmptyString(value: unknown, fieldName = 'value'): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new DomainInvariantError(`Field "${fieldName}" is mandatory and cannot be empty`);
  }
  return value.trim();
}

/**
 * Validates date format 'YYYY-MM-DD'.
 */
export function assertValidDateString(date: string, fieldName = 'date'): void {
  assertNonEmptyString(date, fieldName);
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(date)) {
    throw new DomainInvariantError(
      `Field "${fieldName}" must follow ISO date format 'YYYY-MM-DD', got: "${date}"`
    );
  }
  const [y, m, d] = date.split('-').map(Number);
  const parsed = new Date(Date.UTC(y, m - 1, d));
  if (
    parsed.getUTCFullYear() !== y ||
    parsed.getUTCMonth() !== m - 1 ||
    parsed.getUTCDate() !== d
  ) {
    throw new DomainInvariantError(
      `Field "${fieldName}" represents an invalid calendar date: "${date}"`
    );
  }
}

/**
 * Validates time format 'HH:MM' (24-hour).
 */
export function assertValidTimeString(time: string, fieldName = 'time'): void {
  assertNonEmptyString(time, fieldName);
  const regex = /^([01]\d|2[0-3]):([0-5]\d)$/;
  if (!regex.test(time)) {
    throw new DomainInvariantError(
      `Field "${fieldName}" must follow 24-hour time format 'HH:MM', got: "${time}"`
    );
  }
}

/**
 * Enforces expense validation: if category is 'other', description is strictly mandatory.
 */
export function assertExpenseCategoryValid(category: string, description?: string | null): void {
  assertNonEmptyString(category, 'category');
  if (category === 'other') {
    if (!description || description.trim().length === 0) {
      throw new DomainInvariantError(
        'Detailed description is mandatory when expense category is "other" (PRD §48 / BR-041)'
      );
    }
  }
}
