/**
 * User Roles & Permissions Domain Model:
 * Implements role-based access control (RBAC) enforced in domain and data layers.
 */

export type UserRole = 'admin' | 'finance' | 'operations' | 'viewer';

export interface UserRecord {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  active: number;
  avatar_url?: string | null;
  created_at: string;
  updated_at: string;
}

export type PermissionAction =
  | 'manage_users'
  | 'manage_settings'
  | 'create_backup'
  | 'restore_backup'
  | 'manage_finance'
  | 'void_payment'
  | 'manage_clients'
  | 'manage_operations'
  | 'manage_services_and_plans'
  | 'manage_reels'
  | 'manage_bookings'
  | 'override_entitlements'
  | 'delete_attachment';

export const ROLE_PERMISSIONS: Record<UserRole, PermissionAction[]> = {
  admin: [
    'manage_users',
    'manage_settings',
    'create_backup',
    'restore_backup',
    'manage_finance',
    'void_payment',
    'manage_clients',
    'manage_operations',
    'manage_services_and_plans',
    'manage_reels',
    'manage_bookings',
    'override_entitlements',
    'delete_attachment',
  ],
  finance: [
    'create_backup',
    'manage_finance',
    'void_payment',
    'delete_attachment',
  ],
  operations: [
    'create_backup',
    'manage_clients',
    'manage_operations',
    'manage_services_and_plans',
    'manage_reels',
    'manage_bookings',
    'delete_attachment',
  ],
  viewer: [],
};

export class PermissionDeniedError extends Error {
  constructor(public readonly action: PermissionAction, public readonly role: UserRole) {
    super(`عذراً، دورك الحالي (${role}) لا يملك صلاحية لتنفيذ هذا الإجراء (${action}).`);
    this.name = 'PermissionDeniedError';
  }
}

export function hasPermission(role: UserRole, action: PermissionAction): boolean {
  if (role === 'admin') return true;
  return ROLE_PERMISSIONS[role]?.includes(action) ?? false;
}

export function assertPermission(role: UserRole, action: PermissionAction): void {
  if (!hasPermission(role, action)) {
    throw new PermissionDeniedError(action, role);
  }
}
