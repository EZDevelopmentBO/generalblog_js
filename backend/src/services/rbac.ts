import { query } from '../config/database';

export const KNOWN_PERMISSIONS = [
  'blog.manage',
  'discount.manage',
  'payments.view',
  'users.manage',
  'settings.manage',
  'notifications.view',
  'email_templates.manage',
] as const;
export type KnownPermission = (typeof KNOWN_PERMISSIONS)[number];

export interface RoleRow {
  slug: string;
  name: string;
  description: string | null;
  is_system: boolean;
  created_at: string;
  updated_at: string;
}

type CacheEntry = { expiresAt: number; permissions: string[] };
const rolePermissionCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 30_000;

function setRolePermissionCache(role: string, permissions: string[]): void {
  rolePermissionCache.set(role, { expiresAt: Date.now() + CACHE_TTL_MS, permissions });
}

export function clearRolePermissionCache(role?: string): void {
  if (role) {
    rolePermissionCache.delete(role);
    return;
  }
  rolePermissionCache.clear();
}

export async function getPermissionsByRole(role: string | null | undefined): Promise<string[]> {
  if (!role) return [];
  const cached = rolePermissionCache.get(role);
  if (cached && cached.expiresAt > Date.now()) return cached.permissions;
  const { rows } = await query<{ permission_key: string }>(
    `SELECT permission_key
     FROM role_permissions
     WHERE role_slug = $1
     ORDER BY permission_key`,
    [role]
  );
  const permissions = rows.map((r) => r.permission_key);
  setRolePermissionCache(role, permissions);
  return permissions;
}

export async function roleHasPermission(role: string | null | undefined, permission: string): Promise<boolean> {
  if (!role) return false;
  const permissions = await getPermissionsByRole(role);
  return permissions.includes(permission);
}

export async function listRolesWithPermissions(): Promise<Array<RoleRow & { permissions: string[] }>> {
  const { rows } = await query<RoleRow>('SELECT * FROM roles ORDER BY slug ASC');
  const result: Array<RoleRow & { permissions: string[] }> = [];
  for (const row of rows) {
    result.push({
      ...row,
      permissions: await getPermissionsByRole(row.slug),
    });
  }
  return result;
}

export async function roleExists(roleSlug: string): Promise<boolean> {
  const { rows } = await query<{ ok: number }>('SELECT 1 AS ok FROM roles WHERE slug = $1 LIMIT 1', [roleSlug]);
  return rows.length > 0;
}

export async function createRole(input: { slug: string; name: string; description?: string | null }): Promise<RoleRow | null> {
  const slug = input.slug.trim().toLowerCase();
  if (!/^[a-z][a-z0-9_]*$/.test(slug)) return null;
  const name = input.name.trim();
  if (!name) return null;
  const { rows } = await query<RoleRow>(
    `INSERT INTO roles (slug, name, description, is_system)
     VALUES ($1, $2, $3, false)
     ON CONFLICT (slug) DO NOTHING
     RETURNING *`,
    [slug, name, input.description?.trim() || null]
  );
  return rows[0] ?? null;
}

export async function updateRole(
  slug: string,
  input: { name?: string; description?: string | null }
): Promise<RoleRow | null> {
  const { rows } = await query<RoleRow>(
    `UPDATE roles
     SET name = COALESCE($2, name),
         description = $3,
         updated_at = NOW()
     WHERE slug = $1
     RETURNING *`,
    [slug, input.name?.trim() || null, input.description?.trim() || null]
  );
  return rows[0] ?? null;
}

export async function deleteRole(slug: string): Promise<{ ok: boolean; error?: string }> {
  const { rows } = await query<{ is_system: boolean }>('SELECT is_system FROM roles WHERE slug = $1', [slug]);
  if (!rows[0]) return { ok: false, error: 'Rol no encontrado' };
  if (rows[0].is_system) return { ok: false, error: 'No se puede eliminar un rol del sistema' };
  const usage = await query<{ count: string }>('SELECT COUNT(*)::text AS count FROM users WHERE role = $1', [slug]);
  if (parseInt(usage.rows[0]?.count ?? '0', 10) > 0) {
    return { ok: false, error: 'No se puede eliminar: hay usuarios asignados a este rol' };
  }
  await query('DELETE FROM roles WHERE slug = $1', [slug]);
  clearRolePermissionCache(slug);
  return { ok: true };
}

export async function setRolePermissions(roleSlug: string, permissions: string[]): Promise<void> {
  const normalized = Array.from(new Set(permissions.map((p) => p.trim()).filter(Boolean)));
  await query('DELETE FROM role_permissions WHERE role_slug = $1', [roleSlug]);
  for (const perm of normalized) {
    await query(
      `INSERT INTO role_permissions (role_slug, permission_key)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [roleSlug, perm]
    );
  }
  clearRolePermissionCache(roleSlug);
}
