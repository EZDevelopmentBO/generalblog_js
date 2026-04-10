import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { Button, Card, Form, Modal, Table } from 'react-bootstrap';
import { IconPencil, IconTrash } from '../components/TableIcons';
import { useT } from '../utils/i18n';
import { useAppUser } from '../components/AppLayout';
import { api } from '../utils/api';
import { canManageBlogContent } from '../types';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';

interface SitePageRow {
  id: number;
  slug: string;
  language: string;
  title: string;
  body_html: string;
  meta_title: string | null;
  meta_description: string | null;
  published: boolean;
  sort_order: number;
  updated_at: string;
}

export default function SitePagesAdmin() {
  const t = useT();
  const user = useAppUser();
  const [pages, setPages] = useState<SitePageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modal, setModal] = useState<'new' | SitePageRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    slug: '',
    language: 'es' as 'es' | 'en',
    title: '',
    body_html: '',
    meta_title: '',
    meta_description: '',
    published: false,
    sort_order: 0,
  });

  const canAccess = user && canManageBlogContent(user.role, user.permissions);

  const load = () => {
    setLoading(true);
    api
      .get<{ pages: SitePageRow[] }>('/api/blog/admin/site-pages')
      .then((r) => setPages(r.pages))
      .catch(() => setError(t('sitePagesAdmin.loadError')))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (canAccess) load();
  }, [canAccess]);

  if (!user) return null;
  if (!canAccess) return <Navigate to="/app" replace />;

  const openNew = () => {
    setForm({
      slug: '',
      language: 'es',
      title: '',
      body_html: '',
      meta_title: '',
      meta_description: '',
      published: false,
      sort_order: 0,
    });
    setModal('new');
  };

  const openEdit = (p: SitePageRow) => {
    setForm({
      slug: p.slug,
      language: p.language === 'en' ? 'en' : 'es',
      title: p.title,
      body_html: p.body_html,
      meta_title: p.meta_title ?? '',
      meta_description: p.meta_description ?? '',
      published: p.published,
      sort_order: p.sort_order,
    });
    setModal(p);
  };

  const closeModal = () => setModal(null);

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      if (modal === 'new') {
        await api.post('/api/blog/admin/site-pages', form);
      } else if (modal && typeof modal === 'object' && 'id' in modal) {
        await api.put(`/api/blog/admin/site-pages/${modal.id}`, form);
      }
      closeModal();
      load();
    } catch {
      setError(t('sitePagesAdmin.saveError'));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: number) => {
    if (!window.confirm(t('sitePagesAdmin.confirmDelete'))) return;
    try {
      await api.delete(`/api/blog/admin/site-pages/${id}`);
      load();
    } catch {
      setError(t('sitePagesAdmin.deleteError'));
    }
  };

  const publicPath = (p: SitePageRow) =>
    p.language === 'en' ? `/pages/${encodeURIComponent(p.slug)}` : `/paginas/${encodeURIComponent(p.slug)}`;

  return (
    <div className="container py-4">
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
        <div>
          <Link to="/app" className="text-info text-decoration-none small d-inline-block mb-1">
            ← {t('nav.app')}
          </Link>
          <h1 className="h3 text-light mb-0">{t('sitePagesAdmin.title')}</h1>
        </div>
        <Button variant="info" size="sm" onClick={openNew}>
          {t('sitePagesAdmin.add')}
        </Button>
      </div>

      {error && <p className="text-danger small">{error}</p>}

      <Card className="bg-dark border-secondary">
        <Card.Body className="p-0">
          {loading ? (
            <p className="text-muted p-3 mb-0">{t('common.loading')}</p>
          ) : pages.length === 0 ? (
            <p className="text-muted p-3 mb-0">{t('sitePagesAdmin.empty')}</p>
          ) : (
            <Table responsive hover variant="dark" className="mb-0 align-middle">
              <thead>
                <tr>
                  <th>{t('sitePagesAdmin.colSlug')}</th>
                  <th>{t('sitePagesAdmin.colLang')}</th>
                  <th>{t('sitePagesAdmin.colTitle')}</th>
                  <th>{t('sitePagesAdmin.colPublished')}</th>
                  <th>{t('sitePagesAdmin.colOrder')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {pages.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <code>{p.slug}</code>
                    </td>
                    <td>{p.language}</td>
                    <td>{p.title}</td>
                    <td>{p.published ? t('common.yes') : t('common.no')}</td>
                    <td>{p.sort_order}</td>
                    <td className="text-end text-nowrap">
                      {p.published && (
                        <a href={publicPath(p)} className="btn btn-link btn-sm text-info" target="_blank" rel="noreferrer">
                          {t('sitePagesAdmin.viewPublic')}
                        </a>
                      )}
                      <Button variant="outline-secondary" size="sm" className="me-1" onClick={() => openEdit(p)}>
                        <IconPencil />
                      </Button>
                      <Button variant="outline-danger" size="sm" onClick={() => remove(p.id)}>
                        <IconTrash />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card.Body>
      </Card>

      <Modal show={modal != null} onHide={closeModal} size="lg" contentClassName="bg-dark text-light border-secondary">
        <Modal.Header closeButton closeVariant="white" className="border-secondary">
          <Modal.Title>{modal === 'new' ? t('sitePagesAdmin.add') : t('sitePagesAdmin.edit')}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form.Group className="mb-2">
            <Form.Label>{t('sitePagesAdmin.slug')}</Form.Label>
            <Form.Control
              value={form.slug}
              onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
              className="bg-dark text-light border-secondary"
            />
          </Form.Group>
          <Form.Group className="mb-2">
            <Form.Label>{t('sitePagesAdmin.language')}</Form.Label>
            <Form.Select
              value={form.language}
              onChange={(e) => setForm((f) => ({ ...f, language: e.target.value as 'es' | 'en' }))}
              className="bg-dark text-light border-secondary"
            >
              <option value="es">es</option>
              <option value="en">en</option>
            </Form.Select>
          </Form.Group>
          <Form.Group className="mb-2">
            <Form.Label>{t('sitePagesAdmin.pageTitle')}</Form.Label>
            <Form.Control
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              className="bg-dark text-light border-secondary"
            />
          </Form.Group>
          <Form.Group className="mb-2">
            <Form.Label>{t('sitePagesAdmin.body')}</Form.Label>
            <div className="site-pages-admin-quill">
              <ReactQuill theme="snow" value={form.body_html} onChange={(html) => setForm((f) => ({ ...f, body_html: html }))} />
            </div>
          </Form.Group>
          <Form.Group className="mb-2">
            <Form.Label>{t('sitePagesAdmin.metaTitle')}</Form.Label>
            <Form.Control
              value={form.meta_title}
              onChange={(e) => setForm((f) => ({ ...f, meta_title: e.target.value }))}
              className="bg-dark text-light border-secondary"
            />
          </Form.Group>
          <Form.Group className="mb-2">
            <Form.Label>{t('sitePagesAdmin.metaDescription')}</Form.Label>
            <Form.Control
              as="textarea"
              rows={2}
              value={form.meta_description}
              onChange={(e) => setForm((f) => ({ ...f, meta_description: e.target.value }))}
              className="bg-dark text-light border-secondary"
            />
          </Form.Group>
          <Form.Group className="mb-2">
            <Form.Label>{t('sitePagesAdmin.sortOrder')}</Form.Label>
            <Form.Control
              type="number"
              value={form.sort_order}
              onChange={(e) => setForm((f) => ({ ...f, sort_order: parseInt(e.target.value, 10) || 0 }))}
              className="bg-dark text-light border-secondary"
            />
          </Form.Group>
          <Form.Check
            type="switch"
            id="page-published"
            label={t('sitePagesAdmin.published')}
            checked={form.published}
            onChange={(e) => setForm((f) => ({ ...f, published: e.target.checked }))}
          />
        </Modal.Body>
        <Modal.Footer className="border-secondary">
          <Button variant="secondary" onClick={closeModal}>
            {t('common.cancel')}
          </Button>
          <Button variant="info" onClick={() => void save()} disabled={saving}>
            {t('common.save')}
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}
