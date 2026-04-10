import { useEffect, useState, useCallback } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { Table, Button, Form, Card } from 'react-bootstrap';
import { IconTrash, IconBroom } from '../components/TableIcons';
import { useT } from '../utils/i18n';
import { useAppUser } from '../components/AppLayout';
import { api } from '../utils/api';
import { formatDateTime } from '../utils/dateFormat';

interface AdminUser {
  id: number;
  email: string;
  name: string;
  role: string;
  created_at: string;
  updated_at: string;
}

interface RoleRow {
  slug: string;
  name: string;
  description: string | null;
  is_system: boolean;
  permissions: string[];
}

const PERMISSION_LABELS: Record<string, string> = {
  'blog.manage': 'Blog: crear/editar posts',
  'discount.manage': 'Cupones: crear/editar',
  'payments.view': 'Pagos: ver reportes',
  'users.manage': 'Usuarios: administrar',
  'settings.manage': 'Configuración global',
  'notifications.view': 'Notificaciones: ver log',
  'email_templates.manage': 'Plantillas email',
};

export default function UsersAdmin() {
  const t = useT();
  const user = useAppUser();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const limit = 50;
  const [q, setQ] = useState('');
  const [role, setRole] = useState<string>('');
  const [savingId, setSavingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [availablePermissions, setAvailablePermissions] = useState<string[]>([]);
  const [newRoleSlug, setNewRoleSlug] = useState('');
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleDescription, setNewRoleDescription] = useState('');
  const [savingRoles, setSavingRoles] = useState(false);

  useEffect(() => {
    if (!user) return;
  }, [user]);

  const fetchUsers = useCallback(() => {
    if (!user || user.role !== 'superuser') return;
    setLoading(true);
    const params = new URLSearchParams();
    params.set('limit', String(limit));
    params.set('offset', String(page * limit));
    if (q.trim()) params.set('q', q.trim());
    if (role) params.set('role', role);
    api
      .get<{ users: AdminUser[]; total: number }>(`/api/blog/admin/users-management?${params.toString()}`)
      .then((res) => {
        setUsers(res.users);
        setTotal(res.total);
      })
      .catch(() => {
        setUsers([]);
        setTotal(0);
      })
      .finally(() => setLoading(false));
  }, [user, page, q, role]);

  const fetchRoles = useCallback(() => {
    if (!user || user.role !== 'superuser') return;
    api
      .get<{ roles: RoleRow[]; availablePermissions: string[] }>('/api/blog/admin/roles')
      .then((res) => {
        setRoles(res.roles ?? []);
        setAvailablePermissions(res.availablePermissions ?? []);
      })
      .catch(() => {
        setRoles([]);
        setAvailablePermissions([]);
      });
  }, [user]);

  useEffect(() => {
    if (!user || user.role !== 'superuser') return;
    fetchUsers();
    fetchRoles();
  }, [user, fetchUsers, fetchRoles]);

  const handleRoleChange = (id: number, newRole: string) => {
    setSavingId(id);
    api
      .put<AdminUser>(`/api/blog/admin/users-management/${id}`, { role: newRole })
      .then((updated) => {
        setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, role: updated.role } : u)));
      })
      .catch(() => {})
      .finally(() => setSavingId(null));
  };

  const handleDelete = (id: number) => {
    if (!window.confirm(t('common.delete') + ' ' + t('payments.user') + '?')) return;
    setDeletingId(id);
    api
      .delete(`/api/blog/admin/users-management/${id}`)
      .then(() => {
        setUsers((prev) => prev.filter((u) => u.id !== id));
        setTotal((prev) => Math.max(0, prev - 1));
      })
      .catch(() => {})
      .finally(() => setDeletingId(null));
  };

  const handleCreateRole = () => {
    const slug = newRoleSlug.trim().toLowerCase();
    const name = newRoleName.trim();
    if (!slug || !name) return;
    setSavingRoles(true);
    api
      .post('/api/blog/admin/roles', {
        slug,
        name,
        description: newRoleDescription.trim() || null,
      })
      .then(() => {
        setNewRoleSlug('');
        setNewRoleName('');
        setNewRoleDescription('');
        fetchRoles();
      })
      .catch(() => {})
      .finally(() => setSavingRoles(false));
  };

  const handleDeleteRole = (slug: string) => {
    if (!window.confirm(`Eliminar rol "${slug}"?`)) return;
    setSavingRoles(true);
    api
      .delete(`/api/blog/admin/roles/${encodeURIComponent(slug)}`)
      .then(() => fetchRoles())
      .catch(() => {})
      .finally(() => setSavingRoles(false));
  };

  const handleToggleRolePermission = (roleSlug: string, permission: string, enabled: boolean) => {
    const roleRow = roles.find((r) => r.slug === roleSlug);
    if (!roleRow) return;
    const nextPermissions = enabled
      ? Array.from(new Set([...roleRow.permissions, permission]))
      : roleRow.permissions.filter((p) => p !== permission);
    setSavingRoles(true);
    api
      .put(`/api/blog/admin/roles/${encodeURIComponent(roleSlug)}/permissions`, {
        permissions: nextPermissions,
      })
      .then(() => fetchRoles())
      .catch(() => {})
      .finally(() => setSavingRoles(false));
  };

  if (!user) return null;
  if (user.role !== 'superuser') {
    return <Navigate to="/app" replace />;
  }

  const totalPages = Math.ceil(total / limit) || 1;

  return (
    <main className="container py-4">
      <p className="mb-2">
        <Link to="/app" className="text-muted small">
          ← {t('nav.backToPanel')}
        </Link>
      </p>
      <Card className="bg-dark border-secondary">
        <Card.Header className="text-light">{t('nav.users')}</Card.Header>
        <Card.Body>
          <div className="mb-3 p-3 rounded border border-secondary bg-dark">
            <div className="d-flex flex-wrap align-items-end gap-3">
              <Form.Group className="mb-0 d-flex flex-column">
                <Form.Label className="small mb-1 text-light">
                  {t('discountCodes.allowedUserSearchPlaceholder')}
                </Form.Label>
                <Form.Control
                  type="text"
                  value={q}
                  onChange={(e) => {
                    setQ(e.target.value);
                    setPage(0);
                  }}
                  className="bg-secondary text-light border-secondary"
                  placeholder="email o nombre…"
                />
              </Form.Group>
              <Form.Group className="mb-0 d-flex flex-column">
                <Form.Label className="small mb-1 text-light">Rol</Form.Label>
                <Form.Select
                  value={role}
                  onChange={(e) => {
                    setRole(e.target.value);
                    setPage(0);
                  }}
                  className="bg-secondary text-light border-secondary"
                  style={{ width: '140px' }}
                >
                  <option value="">{t('payments.statusAll')}</option>
                  {roles.map((r) => (
                    <option key={r.slug} value={r.slug}>{r.name}</option>
                  ))}
                </Form.Select>
              </Form.Group>
              <Button
                variant="info"
                size="sm"
                onClick={() => {
                  setQ('');
                  setRole('');
                  setPage(0);
                }}
                title={t('payments.clearFilters')}
                aria-label={t('payments.clearFilters')}
              >
                <IconBroom />
              </Button>
            </div>
          </div>

          {loading ? (
            <p className="text-muted">{t('common.loading')}</p>
          ) : users.length === 0 ? (
            <p className="text-muted">{t('payments.noPayments')}</p>
          ) : (
            <>
              <Table responsive size="sm" bordered className="mb-0">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Email</th>
                    <th>{t('discountCodes.allowedUserEmail')}</th>
                    <th>Rol</th>
                    <th>{t('payments.date')}</th>
                    <th>{t('payments.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id}>
                      <td>{u.id}</td>
                      <td>{u.email}</td>
                      <td>{u.name}</td>
                      <td>
                        <Form.Select
                          size="sm"
                          value={u.role}
                          disabled={savingId === u.id || deletingId === u.id}
                          onChange={(e) => handleRoleChange(u.id, e.target.value)}
                          className="bg-secondary text-light border-secondary"
                        >
                          {roles.map((r) => (
                            <option key={r.slug} value={r.slug}>{r.name}</option>
                          ))}
                        </Form.Select>
                      </td>
                      <td>{formatDateTime(u.created_at, 'es')}</td>
                      <td>
                        <Button
                          size="sm"
                          variant="danger"
                          disabled={deletingId === u.id}
                          onClick={() => handleDelete(u.id)}
                          title={t('common.delete')}
                        >
                          {deletingId === u.id ? (
                            <span className="small">…</span>
                          ) : (
                            <span className="d-inline-flex align-items-center gap-1">
                              <IconTrash />
                              <span>{t('common.delete')}</span>
                            </span>
                          )}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
              <div className="d-flex justify-content-between align-items-center mt-2">
                <span className="small text-muted">
                  {page * limit + 1}–{Math.min((page + 1) * limit, total)} / {total}
                </span>
                <div className="d-flex gap-2">
                  <Button
                    size="sm"
                    variant="outline-secondary"
                    disabled={page === 0}
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                  >
                    ←
                  </Button>
                  <span className="small text-muted">
                    {page + 1} / {totalPages}
                  </span>
                  <Button
                    size="sm"
                    variant="outline-secondary"
                    disabled={page + 1 >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    →
                  </Button>
                </div>
              </div>
            </>
          )}
        </Card.Body>
      </Card>

      <Card className="bg-dark border-secondary mt-4">
        <Card.Header className="text-light">Roles y permisos</Card.Header>
        <Card.Body>
          <div className="row g-2 mb-3">
            <div className="col-md-3">
              <Form.Control
                value={newRoleSlug}
                onChange={(e) => setNewRoleSlug(e.target.value)}
                placeholder="slug (ej. support_manager)"
                className="bg-secondary text-light border-secondary"
              />
            </div>
            <div className="col-md-3">
              <Form.Control
                value={newRoleName}
                onChange={(e) => setNewRoleName(e.target.value)}
                placeholder="Nombre"
                className="bg-secondary text-light border-secondary"
              />
            </div>
            <div className="col-md-4">
              <Form.Control
                value={newRoleDescription}
                onChange={(e) => setNewRoleDescription(e.target.value)}
                placeholder="Descripción (opcional)"
                className="bg-secondary text-light border-secondary"
              />
            </div>
            <div className="col-md-2 d-grid">
              <Button variant="primary" disabled={savingRoles} onClick={handleCreateRole}>
                Crear rol
              </Button>
            </div>
          </div>

          <Table responsive size="sm" bordered className="mb-0 align-middle">
            <thead>
              <tr>
                <th>Rol</th>
                <th>Descripción</th>
                <th>Permisos</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {roles.map((r) => (
                <tr key={r.slug}>
                  <td>
                    <code>{r.slug}</code>
                    <div className="small text-muted">{r.name}</div>
                  </td>
                  <td className="small">{r.description || '-'}</td>
                  <td>
                    <div className="d-flex flex-wrap gap-3">
                      {availablePermissions.map((p) => (
                        <Form.Check
                          key={p}
                          type="checkbox"
                          id={`perm-${r.slug}-${p}`}
                          label={PERMISSION_LABELS[p] ?? p}
                          checked={r.permissions.includes(p)}
                          disabled={savingRoles}
                          onChange={(e) => handleToggleRolePermission(r.slug, p, e.target.checked)}
                        />
                      ))}
                    </div>
                  </td>
                  <td className="text-nowrap">
                    <Button
                      size="sm"
                      variant="outline-danger"
                      disabled={savingRoles || r.is_system}
                      onClick={() => handleDeleteRole(r.slug)}
                    >
                      <span className="d-inline-flex align-items-center gap-1">
                        <IconTrash />
                        <span>Eliminar</span>
                      </span>
                    </Button>
                    {r.is_system && (
                      <div className="small text-muted mt-1">Rol del sistema (no eliminable)</div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
          <div className="small text-muted mt-2">
            Puedes modificar permisos en todos los roles (incluyendo roles de sistema). Solo la eliminación está bloqueada para roles de sistema.
          </div>
        </Card.Body>
      </Card>
    </main>
  );
}

