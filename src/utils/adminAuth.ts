// Super Admin Authentication
// Only this specific Supabase UID can access admin features

export const SUPER_ADMIN_UID = import.meta.env.VITE_ADMIN_USER_ID || 'your-admin-user-id-here';

export function isSuperAdmin(userId: string | undefined): boolean {
  return userId === SUPER_ADMIN_UID;
}

export function requireSuperAdmin(userId: string | undefined): void {
  if (!isSuperAdmin(userId)) {
    throw new Error('Super admin access required');
  }
}
