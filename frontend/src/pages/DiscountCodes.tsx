import { useEffect, useState, useCallback, useMemo } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { IconPencil, IconTrash, IconCopy } from '../components/TableIcons';
import { Button, Card, Table, Form, Modal } from 'react-bootstrap';
import { useT, useLanguage } from '../utils/i18n';
import { api } from '../utils/api';
import { canManageDiscountCodes } from '../types';

interface UserOption {
  id: number;
  email: string;
  name: string;
}

interface DiscountCodeRow {
  id: number;
  code: string;
  description: string | null;
  discount_type: 'percent' | 'fixed';
  discount_value: string;
  scope: 'global' | 'post';
  post_id: number | null;
  categories: string[] | null;
  valid_from: string | null;
  valid_until: string | null;
  usage_limit_total: number | null;
  usage_count: number;
  usage_limit_per_user: number | null;
  min_purchase_usd: string | null;
  allowed_user_id: number | null;
  campaign_slug: string | null;
  created_at: string;
}

interface PostOption {
  id: number;
  title: string;
  has_download?: boolean;
}

const scopeLabel = (scope: string, t: (k: string) => string) =>
  scope === 'global' ? t('discountCodes.scopeGlobal') : t('discountCodes.scopePost');

export default function DiscountCodes() {
  const t = useT();
  const language = useLanguage();
  const [user, setUser] = useState<{ role: string; permissions?: string[] } | null | undefined>(undefined);
  const [codes, setCodes] = useState<DiscountCodeRow[]>([]);
  const [posts, setPosts] = useState<PostOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [sendCouponEmail, setSendCouponEmail] = useState('');
  const [sendCouponCodeId, setSendCouponCodeId] = useState('');
  const [sendCouponLoading, setSendCouponLoading] = useState(false);
  const [sendCouponMessage, setSendCouponMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [categoryOptions, setCategoryOptions] = useState<Array<{ slug: string; label: string }>>([]);
  const [form, setForm] = useState({
    code: '',
    description: '',
    discount_type: 'percent' as 'percent' | 'fixed',
    discount_value: 10,
    scope: 'global' as 'global' | 'post',
    post_id: '',
    categories: [] as string[],
    valid_from: '',
    valid_until: '',
    usage_limit_total: '',
    usage_limit_per_user: '',
    min_purchase_usd: '',
    allowed_user_id: '',
    campaign_slug: '',
  });

  const load = useCallback(() => {
    if (!canManageDiscountCodes(user?.role, user?.permissions)) return;
    api
      .get<{ discountCodes: DiscountCodeRow[] }>('/api/blog/admin/discount-codes')
      .then((r) => setCodes(r.discountCodes))
      .catch(() => setMessage({ type: 'error', text: t('common.error') }));
  }, [user, t]);

  useEffect(() => {
    api.get<{ role: string }>('/auth/me').then(setUser).catch(() => setUser(null));
  }, []);

  useEffect(() => {
    if (!canManageDiscountCodes(user?.role, user?.permissions)) {
      setLoading(false);
      return;
    }
    setLoading(true);
    load();
    api
      .get<{ categories: Array<{ slug: string; label_es: string; label_en: string }> }>('/api/blog/admin/post-categories')
      .then((r) =>
        setCategoryOptions(
          (r.categories ?? []).map((c) => ({
            slug: c.slug,
            label: language === 'en' ? c.label_en : c.label_es,
          }))
        )
      )
      .catch(() => setCategoryOptions([]));
    api
      .get<{ posts: PostOption[] }>('/api/blog/admin/posts?limit=100')
      .then((r) => setPosts(r.posts?.filter((p) => p.has_download) ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
    api.get<{ users: UserOption[] }>('/api/blog/admin/users').then((r) => setUsers(r.users ?? [])).catch(() => setUsers([]));
  }, [user, load, language]);

  const sendableCodes = useMemo(
    () => codes.filter((c) => !c.allowed_user_id && !c.campaign_slug),
    [codes]
  );

  const handleSendCouponEmail = (e: React.FormEvent) => {
    e.preventDefault();
    setSendCouponMessage(null);
    const email = sendCouponEmail.trim();
    const id = sendCouponCodeId ? parseInt(sendCouponCodeId, 10) : 0;
    if (!email || !Number.isFinite(id)) {
      setSendCouponMessage({ type: 'error', text: t('discountCodes.sendCoupon.fillRequired') });
      return;
    }
    setSendCouponLoading(true);
    api
      .post<{ sent: boolean }>('/api/blog/admin/send-coupon-email', { email, discountCodeId: id })
      .then(() => {
        setSendCouponMessage({ type: 'success', text: t('discountCodes.sendCoupon.sent') });
        setSendCouponEmail('');
        setSendCouponCodeId('');
      })
      .catch((err) => setSendCouponMessage({ type: 'error', text: err instanceof Error ? err.message : t('common.error') }))
      .finally(() => setSendCouponLoading(false));
  };

  const openCreate = () => {
    setEditingId(null);
    setUserSearch('');
    setForm({
      code: '',
      description: '',
      discount_type: 'percent',
      discount_value: 10,
      scope: 'global',
      post_id: '',
      categories: [],
      valid_from: '',
      valid_until: '',
      usage_limit_total: '',
      usage_limit_per_user: '',
      min_purchase_usd: '',
      allowed_user_id: '',
      campaign_slug: '',
    });
    setShowModal(true);
    if (users.length === 0) api.get<{ users: UserOption[] }>('/api/blog/admin/users').then((r) => setUsers(r.users ?? [])).catch(() => setUsers([]));
  };

  const openEdit = (row: DiscountCodeRow) => {
    setEditingId(row.id);
    setUserSearch('');
    setForm({
      code: row.code,
      description: row.description ?? '',
      discount_type: row.discount_type,
      discount_value: parseFloat(row.discount_value) || 0,
      scope: row.scope,
      post_id: row.post_id != null ? String(row.post_id) : '',
      categories: row.categories ?? [],
      valid_from: row.valid_from ? row.valid_from.slice(0, 16) : '',
      valid_until: row.valid_until ? row.valid_until.slice(0, 16) : '',
      usage_limit_total: row.usage_limit_total != null ? String(row.usage_limit_total) : '',
      usage_limit_per_user: row.usage_limit_per_user != null ? String(row.usage_limit_per_user) : '',
      min_purchase_usd: row.min_purchase_usd ?? '',
      allowed_user_id: row.allowed_user_id != null ? String(row.allowed_user_id) : '',
      campaign_slug: row.campaign_slug ?? '',
    });
    setShowModal(true);
    if (users.length === 0) api.get<{ users: UserOption[] }>('/api/blog/admin/users').then((r) => setUsers(r.users ?? [])).catch(() => setUsers([]));
  };

  const filteredUsers = useMemo(() => {
    const term = userSearch.trim().toLowerCase();
    if (!term) return users;
    return users.filter((u) => u.email.toLowerCase().includes(term) || (u.name && u.name.toLowerCase().includes(term)));
  }, [users, userSearch]);

  const selectedUser = useMemo(
    () => (form.allowed_user_id ? users.find((u) => u.id === parseInt(form.allowed_user_id, 10)) : null),
    [users, form.allowed_user_id]
  );
  const userOptions = useMemo(() => {
    const list = filteredUsers;
    if (selectedUser && !list.some((u) => u.id === selectedUser.id)) return [selectedUser, ...list];
    return list;
  }, [filteredUsers, selectedUser]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setSaving(true);
    const body = {
      code: form.code.trim(),
      description: form.description.trim() || undefined,
      discount_type: form.discount_type,
      discount_value: form.discount_value,
      scope: form.scope,
      post_id: form.scope === 'post' && form.post_id ? parseInt(form.post_id, 10) : undefined,
      categories: form.scope === 'global' && form.categories.length ? form.categories : undefined,
      valid_from: form.valid_from ? new Date(form.valid_from).toISOString() : undefined,
      valid_until: form.valid_until ? new Date(form.valid_until).toISOString() : undefined,
      usage_limit_total: form.usage_limit_total ? parseInt(form.usage_limit_total, 10) : undefined,
      usage_limit_per_user: form.usage_limit_per_user ? parseInt(form.usage_limit_per_user, 10) : undefined,
      min_purchase_usd: form.min_purchase_usd ? parseFloat(form.min_purchase_usd) : undefined,
      allowed_user_id: form.allowed_user_id ? parseInt(form.allowed_user_id, 10) : null,
      campaign_slug: form.campaign_slug.trim() ? form.campaign_slug.trim() : null,
    };
    const promise = editingId
      ? api.put<DiscountCodeRow>(`/api/blog/admin/discount-codes/${editingId}`, body)
      : api.post<DiscountCodeRow>('/api/blog/admin/discount-codes', body);
    promise
      .then(() => {
        setMessage({ type: 'success', text: editingId ? t('discountCodes.saved') : t('discountCodes.created') });
        setShowModal(false);
        load();
      })
      .catch((err) => setMessage({ type: 'error', text: err instanceof Error ? err.message : t('common.error') }))
      .finally(() => setSaving(false));
  };

  const handleDelete = (id: number) => {
    if (!confirm(t('discountCodes.confirmDelete'))) return;
    api
      .delete(`/api/blog/admin/discount-codes/${id}`)
      .then(() => {
        setMessage({ type: 'success', text: t('discountCodes.deleted') });
        load();
      })
      .catch(() => setMessage({ type: 'error', text: t('common.error') }));
  };

  if (user === undefined || loading) {
    return (
      <div className="container py-5">
        <p className="text-muted">{t('common.loading')}</p>
      </div>
    );
  }
  if (user === null || !canManageDiscountCodes(user.role, user.permissions)) {
    return <Navigate to={user === null ? '/' : '/app'} replace />;
  }

  return (
    <>
    <main className="container py-4">
        <p className="mb-2">
          <Link to="/app" className="text-muted small">← {t('nav.backToPanel')}</Link>
        </p>
        <h1 className="h4 mb-2">{t('discountCodes.title')}</h1>
        <p className="text-muted small mb-3">{t('discountCodes.intro')}</p>
        {message && (
          <div className={`alert alert-${message.type === 'success' ? 'success' : 'danger'} py-2 mb-3`}>{message.text}</div>
        )}

        <Card className="border-secondary bg-dark text-light mb-4">
          <Card.Header className="border-secondary">
            <Card.Title className="h6 mb-0">{t('discountCodes.sendCoupon.title')}</Card.Title>
          </Card.Header>
          <Card.Body>
            <p className="text-muted small mb-3">{t('discountCodes.sendCoupon.intro')}</p>
            <p className="text-muted small mb-3">{t('discountCodes.sendCoupon.listHint')}</p>
            <Form onSubmit={handleSendCouponEmail} className="row g-3 align-items-end">
              <div className="col-md-5">
                <Form.Group>
                  <Form.Label className="small">{t('discountCodes.sendCoupon.recipientEmail')}</Form.Label>
                  <Form.Control
                    type="email"
                    value={sendCouponEmail}
                    onChange={(e) => setSendCouponEmail(e.target.value)}
                    placeholder="email@ejemplo.com"
                    className="bg-secondary text-light border-secondary mb-1"
                  />
                  <Form.Text className="text-muted small d-block">{t('discountCodes.sendCoupon.recipientHint')}</Form.Text>
                  <Form.Select
                    size="sm"
                    className="bg-secondary text-light border-secondary mt-1 w-auto"
                    value=""
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v) setSendCouponEmail(v);
                    }}
                  >
                    <option value="">{t('discountCodes.sendCoupon.fillFromUser')}</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.email}>{u.email}{u.name ? ` (${u.name})` : ''}</option>
                    ))}
                  </Form.Select>
                </Form.Group>
              </div>
              <div className="col-md-5">
                <Form.Group>
                  <Form.Label className="small">{t('discountCodes.sendCoupon.coupon')}</Form.Label>
                  <Form.Select
                    value={sendCouponCodeId}
                    onChange={(e) => setSendCouponCodeId(e.target.value)}
                    className="bg-secondary text-light border-secondary"
                  >
                    <option value="">{t('discountCodes.sendCoupon.selectCoupon')}</option>
                    {sendableCodes.map((c) => (
                      <option key={c.id} value={c.id}>{c.code} — {c.discount_type === 'percent' ? `${c.discount_value}%` : `${c.discount_value} USD`}</option>
                    ))}
                  </Form.Select>
                </Form.Group>
              </div>
              <div className="col-md-2">
                <Button type="submit" variant="outline-info" disabled={sendCouponLoading}>
                  {sendCouponLoading ? t('common.loading') : t('discountCodes.sendCoupon.send')}
                </Button>
              </div>
            </Form>
            {sendCouponMessage && (
              <div className={`alert alert-${sendCouponMessage.type === 'success' ? 'success' : 'danger'} py-2 mt-3 mb-0 small`}>
                {sendCouponMessage.text}
              </div>
            )}
          </Card.Body>
        </Card>

        <div className="d-flex justify-content-end mb-3">
          <Button variant="primary" onClick={openCreate}>{t('discountCodes.new')}</Button>
        </div>
        {copiedCode && (
          <div className="alert alert-success py-2 mb-2 mb-md-3 d-flex align-items-center gap-2" role="status">
            <span className="small">{t('discountCodes.copiedToClipboard')}</span>
            <code className="bg-white text-dark px-2 py-1 rounded small">{copiedCode}</code>
          </div>
        )}
        <Card className="border-secondary bg-dark text-light">
          <Card.Body className="p-0">
            <Table responsive bordered className="mb-0">
              <thead>
                <tr>
                  <th>{t('discountCodes.code')}</th>
                  <th>{t('discountCodes.type')}</th>
                  <th>{t('discountCodes.value')}</th>
                  <th>{t('discountCodes.scope')}</th>
                  <th>{t('discountCodes.usage')}</th>
                  <th>{t('discountCodes.validity')}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {codes.map((row) => (
                  <tr key={row.id}>
                    <td><code>{row.code}</code></td>
                    <td>{row.discount_type === 'percent' ? '%' : 'USD'}</td>
                    <td>{row.discount_value}</td>
                    <td>{scopeLabel(row.scope, t)}{row.scope === 'post' && row.post_id ? ` #${row.post_id}` : ''}</td>
                    <td>{row.usage_count}{row.usage_limit_total != null ? ` / ${row.usage_limit_total}` : ''}</td>
                    <td className="small">
                      {row.valid_from || row.valid_until
                        ? `${row.valid_from ? row.valid_from.slice(0, 10) : '—'} / ${row.valid_until ? row.valid_until.slice(0, 10) : '—'}`
                        : t('discountCodes.indefinite')}
                    </td>
                    <td>
                      <Button
                        variant="secondary btn-sm me-1"
                        onClick={() => {
                          navigator.clipboard.writeText(row.code).then(() => {
                            setCopiedCode(row.code);
                            setTimeout(() => setCopiedCode(null), 2500);
                          });
                        }}
                        title={t('discountCodes.copyCode')}
                      >
                        <IconCopy />
                      </Button>
                      <Button variant="warning btn-sm me-1" onClick={() => openEdit(row)} title={t('common.edit')}>
                        <IconPencil />
                      </Button>
                      <Button variant="danger btn-sm" onClick={() => handleDelete(row.id)} title={t('common.delete')}>
                        <IconTrash />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
            {codes.length === 0 && (
              <p className="text-muted text-center py-4 mb-0">{t('discountCodes.noCodes')}</p>
            )}
          </Card.Body>
        </Card>
      </main>

      <Modal show={showModal} onHide={() => setShowModal(false)} data-bs-theme="dark" contentClassName="bg-dark text-light" size="xl">
        <Modal.Header closeButton className="border-secondary">
          <Modal.Title>{editingId ? t('discountCodes.edit') : t('discountCodes.new')}</Modal.Title>
        </Modal.Header>
        <Form onSubmit={handleSubmit}>
          <Modal.Body className="pb-4">
            {/* Sección: Datos básicos */}
            <h6 className="text-secondary border-bottom border-secondary pb-2 mb-3">{t('discountCodes.sectionBasic')}</h6>
            <div className="row g-3 mb-4">
              <div className="col-md-6">
                <Form.Group>
                  <Form.Label>{t('discountCodes.code')} *</Form.Label>
                  <Form.Control
                    value={form.code}
                    onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                    className="bg-secondary text-light border-secondary"
                    required
                  />
                </Form.Group>
              </div>
              <div className="col-md-6">
                <Form.Group>
                  <Form.Label>{t('discountCodes.description')}</Form.Label>
                  <Form.Control
                    value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                    className="bg-secondary text-light border-secondary"
                    placeholder={t('discountCodes.descriptionPlaceholder')}
                  />
                </Form.Group>
              </div>
            </div>

            {/* Sección: Descuento y ámbito */}
            <h6 className="text-secondary border-bottom border-secondary pb-2 mb-3">{t('discountCodes.sectionDiscount')}</h6>
            <div className="row g-3 mb-4">
              <div className="col-md-4">
                <Form.Group>
                  <Form.Label>{t('discountCodes.discountType')}</Form.Label>
                  <Form.Select
                    value={form.discount_type}
                    onChange={(e) => setForm((f) => ({ ...f, discount_type: e.target.value as 'percent' | 'fixed' }))}
                    className="bg-secondary text-light border-secondary"
                  >
                    <option value="percent">{t('discountCodes.percent')}</option>
                    <option value="fixed">{t('discountCodes.fixed')}</option>
                  </Form.Select>
                </Form.Group>
              </div>
              <div className="col-md-4">
                <Form.Group>
                  <Form.Label>{t('discountCodes.discountValue')} *</Form.Label>
                  <Form.Control
                    type="number"
                    step={form.discount_type === 'percent' ? 1 : 0.01}
                    min={0}
                    max={form.discount_type === 'percent' ? 100 : undefined}
                    value={form.discount_value}
                    onChange={(e) => setForm((f) => ({ ...f, discount_value: parseFloat(e.target.value) || 0 }))}
                    className="bg-secondary text-light border-secondary"
                    required
                  />
                </Form.Group>
              </div>
              <div className="col-md-4">
                <Form.Group>
                  <Form.Label>{t('discountCodes.scope')}</Form.Label>
                  <Form.Select
                    value={form.scope}
                    onChange={(e) => setForm((f) => ({ ...f, scope: e.target.value as 'global' | 'post' }))}
                    className="bg-secondary text-light border-secondary"
                  >
                    <option value="global">{t('discountCodes.scopeGlobal')}</option>
                    <option value="post">{t('discountCodes.scopePost')}</option>
                  </Form.Select>
                </Form.Group>
              </div>
              {form.scope === 'post' && (
                <div className="col-12">
                  <Form.Group>
                    <Form.Label>{t('discountCodes.post')} *</Form.Label>
                    <Form.Select
                      value={form.post_id}
                      onChange={(e) => setForm((f) => ({ ...f, post_id: e.target.value }))}
                      className="bg-secondary text-light border-secondary"
                      required
                    >
                      <option value="">—</option>
                      {posts.map((p) => (
                        <option key={p.id} value={p.id}>{p.title?.slice(0, 60)}</option>
                      ))}
                    </Form.Select>
                  </Form.Group>
                </div>
              )}
              {form.scope === 'global' && (
                <div className="col-12">
                  <Form.Group>
                    <Form.Label>{t('discountCodes.categories')}</Form.Label>
                    <div className="d-flex flex-wrap gap-3">
                      {categoryOptions.map((cat) => (
                        <Form.Check
                          key={cat.slug}
                          type="checkbox"
                          id={`cat-${cat.slug}`}
                          label={cat.label}
                          checked={form.categories.includes(cat.slug)}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              categories: e.target.checked
                                ? [...f.categories, cat.slug]
                                : f.categories.filter((c) => c !== cat.slug),
                            }))
                          }
                          className="text-light"
                        />
                      ))}
                    </div>
                    <Form.Text className="text-muted">{t('discountCodes.categoriesHint')}</Form.Text>
                  </Form.Group>
                </div>
              )}
            </div>

            {/* Sección: Vigencia y límites */}
            <h6 className="text-secondary border-bottom border-secondary pb-2 mb-3">{t('discountCodes.sectionValidity')}</h6>
            <div className="row g-3 mb-4">
              <div className="col-md-6">
                <Form.Group>
                  <Form.Label>{t('discountCodes.validFrom')}</Form.Label>
                  <Form.Control
                    type="datetime-local"
                    value={form.valid_from}
                    onChange={(e) => setForm((f) => ({ ...f, valid_from: e.target.value }))}
                    className="bg-secondary text-light border-secondary"
                  />
                </Form.Group>
              </div>
              <div className="col-md-6">
                <Form.Group>
                  <Form.Label>{t('discountCodes.validUntil')}</Form.Label>
                  <Form.Control
                    type="datetime-local"
                    value={form.valid_until}
                    onChange={(e) => setForm((f) => ({ ...f, valid_until: e.target.value }))}
                    className="bg-secondary text-light border-secondary"
                  />
                </Form.Group>
              </div>
              <div className="col-12">
                <Form.Text className="text-muted">{t('discountCodes.validityHint')}</Form.Text>
              </div>
              <div className="col-md-4">
                <Form.Group>
                  <Form.Label>{t('discountCodes.usageLimitTotal')}</Form.Label>
                  <Form.Control
                    type="number"
                    min={0}
                    value={form.usage_limit_total}
                    onChange={(e) => setForm((f) => ({ ...f, usage_limit_total: e.target.value }))}
                    className="bg-secondary text-light border-secondary"
                    placeholder={t('discountCodes.unlimited')}
                  />
                </Form.Group>
              </div>
              <div className="col-md-4">
                <Form.Group>
                  <Form.Label>{t('discountCodes.usageLimitPerUser')}</Form.Label>
                  <Form.Control
                    type="number"
                    min={0}
                    value={form.usage_limit_per_user}
                    onChange={(e) => setForm((f) => ({ ...f, usage_limit_per_user: e.target.value }))}
                    className="bg-secondary text-light border-secondary"
                    placeholder={t('discountCodes.unlimited')}
                  />
                </Form.Group>
              </div>
              <div className="col-md-4">
                <Form.Group>
                  <Form.Label>{t('discountCodes.minPurchase')}</Form.Label>
                  <Form.Control
                    type="number"
                    step={0.01}
                    min={0}
                    value={form.min_purchase_usd}
                    onChange={(e) => setForm((f) => ({ ...f, min_purchase_usd: e.target.value }))}
                    className="bg-secondary text-light border-secondary"
                    placeholder="—"
                  />
                </Form.Group>
              </div>
            </div>

            {/* Sección: Restricciones (usuario, campaña) */}
            <h6 className="text-secondary border-bottom border-secondary pb-2 mb-3">{t('discountCodes.sectionRestrictions')}</h6>
            <div className="row g-3">
              <div className="col-md-6">
                <Form.Group>
                  <Form.Label>{t('discountCodes.allowedUserEmail')}</Form.Label>
                  <Form.Control
                    type="text"
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    className="bg-secondary text-light border-secondary mb-2"
                    placeholder={t('discountCodes.allowedUserSearchPlaceholder')}
                  />
                  <div className="d-flex align-items-center gap-2 flex-wrap">
                    <Form.Select
                      value={form.allowed_user_id || ''}
                      onChange={(e) => setForm((f) => ({ ...f, allowed_user_id: e.target.value }))}
                      className="bg-secondary text-light border-secondary flex-grow-1"
                      style={{ minWidth: '200px' }}
                    >
                      <option value="">{t('discountCodes.allowedUserIdPlaceholder')}</option>
                      {userOptions.map((u) => (
                        <option key={u.id} value={String(u.id)}>
                          {u.email}{u.name ? ` (${u.name})` : ''}
                        </option>
                      ))}
                    </Form.Select>
                    {form.allowed_user_id ? (
                      <Button
                        type="button"
                        variant="outline-secondary"
                        size="sm"
                        onClick={() => setForm((f) => ({ ...f, allowed_user_id: '' }))}
                      >
                        {t('discountCodes.allowedUserClear')}
                      </Button>
                    ) : null}
                  </div>
                  <Form.Text className="text-muted">{t('discountCodes.allowedUserIdHint')}</Form.Text>
                </Form.Group>
              </div>
              <div className="col-md-6">
                <Form.Group>
                  <Form.Label>{t('discountCodes.campaignSlug')}</Form.Label>
                  <Form.Control
                    type="text"
                    value={form.campaign_slug}
                    onChange={(e) => setForm((f) => ({ ...f, campaign_slug: e.target.value }))}
                    className="bg-secondary text-light border-secondary"
                    placeholder={t('discountCodes.campaignSlugPlaceholder')}
                  />
                  <Form.Text className="text-muted d-block">{t('discountCodes.campaignSlugHint')}</Form.Text>
                  <Form.Text className="text-muted d-block">{t('discountCodes.campaignSlugUnique')}</Form.Text>
                  <Form.Text className="text-muted d-block">{t('discountCodes.campaignSlugWelcomeTemplate')}</Form.Text>
                </Form.Group>
              </div>
            </div>
          </Modal.Body>
          <Modal.Footer className="border-secondary">
            <Button variant="secondary" onClick={() => setShowModal(false)}>{t('common.cancel')}</Button>
            <Button type="submit" variant="primary" disabled={saving}>{saving ? t('common.loading') : t('common.save')}</Button>
          </Modal.Footer>
        </Form>
      </Modal>
    </>
  );
}
