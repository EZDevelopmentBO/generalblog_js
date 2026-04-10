import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { Modal, Button, Form, Table, Alert } from 'react-bootstrap';
import { IconEye, IconCurrency, IconPencil, IconTrash, IconRefresh, IconCopy, IconDownload } from '../components/TableIcons';
import { PaymentProvider } from '../components/PaymentProvider';
import { PaymentStatus } from '../components/PaymentStatus';
import { PostStatus } from '../components/PostStatus';
import { PostLanguage } from '../components/PostLanguage';
import { formatDateTime } from '../utils/dateFormat';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import { useT, useLanguage } from '../utils/i18n';
import { api, getUploadUrl, getImageUrl } from '../utils/api';
import { canManageBlogContent, type BlogPostFull, type BlogCategory } from '../types';
import { invalidatePublicCategoriesCache, prefetchCategoryMeta } from '../utils/useCategoryMeta';

interface PostCategoryRow {
  slug: string;
  path_es: string;
  path_en: string;
  label_es: string;
  label_en: string;
  sort_order: number;
}

function postPublicUrl(p: { slug: string; category: string; language: string }, cats: PostCategoryRow[]): string {
  const row = cats.find((c) => c.slug === p.category);
  const path = p.language === 'es' ? row?.path_es ?? p.category : row?.path_en ?? p.category;
  const base = p.language === 'es' ? '/noticias' : '/news';
  return `${base}/${path}/${p.slug}`;
}

interface BlogPostRow extends BlogPostFull {
  id: number;
}

export default function BlogAdmin() {
  const t = useT();
  const language = useLanguage();
  const [user, setUser] = useState<{ role: string; permissions?: string[] } | null>(null);
  const [posts, setPosts] = useState<BlogPostRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [publishedFilter, setPublishedFilter] = useState<'all' | 'yes' | 'no'>('all');
  const [page, setPage] = useState(0);
  const limit = 20;
  const [sortBy, setSortBy] = useState<'published_at' | 'views' | null>(null);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [editModal, setEditModal] = useState<BlogPostRow | 'new' | null>(null);
  const [generateModal, setGenerateModal] = useState(false);
  const [generateTopic, setGenerateTopic] = useState('');
  const [generateLang, setGenerateLang] = useState<'es' | 'en'>('es');
  const [generating, setGenerating] = useState(false);
  const [promptSent, setPromptSent] = useState<{ system: string; user: string } | null>(null);

  const [form, setForm] = useState({
    title: '',
    category: 'analysis' as BlogCategory,
    content: '',
    excerpt: '',
    featured_image: '',
    published: false,
    published_at: '',
    meta_title: '',
    meta_description: '',
    meta_keywords: '',
    language: 'es',
    related_title: '',
    related_year: '',
    video_url: '',
    gallery: [] as string[],
    conclusion: '',
    has_download: false,
    download_price_usd: '1.00',
    payment_methods: ['paypal', 'binance_pay', 'binance_deposit'] as string[],
    download_free: false,
  });
  const [downloadFileInfo, setDownloadFileInfo] = useState<{ hasFile: boolean; filename_display?: string }>({ hasFile: false });
  const [pendingDownloadFile, setPendingDownloadFile] = useState<File | null>(null);
  const [testDownloadLink, setTestDownloadLink] = useState<{ url: string; expiresAt: string } | null>(null);
  const [generatingTestLink, setGeneratingTestLink] = useState(false);
  const [uploadingZip, setUploadingZip] = useState(false);
  const downloadInputRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadingGallery, setUploadingGallery] = useState(false);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const [paymentsModalPost, setPaymentsModalPost] = useState<BlogPostRow | null>(null);
  const [postPayments, setPostPayments] = useState<{ post_title: string; payments: Array<{ id: number; amount_usd: number; status: string; created_at: string; payer_email: string | null; provider: string; binance_deposit_tx_id?: string | null; binance_deposit_from_address?: string | null; binance_deposit_network?: string | null }> } | null>(null);
  const [loadingPostPayments, setLoadingPostPayments] = useState(false);
  const [regeneratingPaymentId, setRegeneratingPaymentId] = useState<number | null>(null);
  const [regeneratedLinkModal, setRegeneratedLinkModal] = useState<{ url: string; expiresAt: string } | null>(null);
  const [paymentCredentials, setPaymentCredentials] = useState<{ paypal: boolean; binancePay: boolean; binanceTransfer: boolean } | null>(null);
  const [postCategories, setPostCategories] = useState<PostCategoryRow[]>([]);
  const [categoriesModal, setCategoriesModal] = useState(false);
  const [categoryForm, setCategoryForm] = useState({
    slug: '',
    path_es: '',
    path_en: '',
    label_es: '',
    label_en: '',
    sort_order: 100,
  });
  const [editingCategorySlug, setEditingCategorySlug] = useState<string | null>(null);
  const [categorySaving, setCategorySaving] = useState(false);

  const refreshPostCategories = () =>
    api.get<{ categories: PostCategoryRow[] }>('/api/blog/admin/post-categories').then((r) => {
      setPostCategories(r.categories);
      return r.categories;
    });

  useEffect(() => {
    api.get<{ id: number; role: string; permissions?: string[] }>('/auth/me').then((u) => setUser(u)).catch(() => setUser(null));
  }, []);

  useEffect(() => {
    if (!canManageBlogContent(user?.role, user?.permissions)) return;
    refreshPostCategories().catch(() => setPostCategories([]));
  }, [user?.role]);

  useEffect(() => {
    if (user?.role === 'superuser') {
      api.get<{ paypal: boolean; binancePay: boolean; binanceTransfer: boolean }>('/api/blog/admin/settings/payment-credentials')
        .then(setPaymentCredentials)
        .catch(() => setPaymentCredentials(null));
    } else {
      setPaymentCredentials(null);
    }
  }, [user?.role]);

  const loadPosts = () => {
    setLoading(true);
    const params = new URLSearchParams({
      limit: String(limit),
      offset: String(page * limit),
    });
    if (search) params.set('search', search);
    if (publishedFilter === 'yes') params.set('published', 'true');
    if (publishedFilter === 'no') params.set('published', 'false');
    if (sortBy) {
      params.set('sortBy', sortBy);
      params.set('sortOrder', sortOrder);
    }
    api
      .get<{ posts: BlogPostRow[]; total: number }>(`/api/blog/admin/posts?${params}`)
      .then((res) => {
        setPosts(res.posts);
        setTotal(res.total);
      })
      .catch(() => setError(t('blogAdmin.errorLoad')))
      .finally(() => setLoading(false));
  };

  const handleSort = (column: 'published_at' | 'views') => {
    if (sortBy === column) {
      if (sortOrder === 'asc') {
        setSortBy(null);
      } else {
        setSortOrder('asc');
      }
    } else {
      setSortBy(column);
      setSortOrder('desc');
    }
    setPage(0);
  };

  const configuredPaymentSlugs = useMemo(() => {
    if (!paymentCredentials) return ['paypal', 'binance_pay', 'binance_deposit'];
    const s: string[] = [];
    if (paymentCredentials.paypal) s.push('paypal');
    if (paymentCredentials.binancePay) s.push('binance_pay');
    if (paymentCredentials.binanceTransfer) s.push('binance_deposit');
    return s.length ? s : ['paypal', 'binance_pay', 'binance_deposit'];
  }, [paymentCredentials]);

  const isSignalPost = useMemo(() => {
    if (!editModal || editModal === 'new' || typeof editModal === 'string') return false;
    const c = editModal.content || '';
    return (
      c.includes('signal-data-block') ||
      c.includes('signal-chart') ||
      c.includes('class="signal-post"')
    );
  }, [editModal]);

  useEffect(() => {
    if (canManageBlogContent(user?.role, user?.permissions)) loadPosts();
  }, [user, page, search, publishedFilter, sortBy, sortOrder]);

  if (user && !canManageBlogContent(user.role, user.permissions)) {
    return <Navigate to="/app" replace />;
  }
  if (user === null && !loading) {
    return <Navigate to="/" replace />;
  }

  const openNew = () => {
    setForm({
      title: '',
      category: 'analysis',
      content: '',
      excerpt: '',
      featured_image: '',
      published: false,
      published_at: '',
      meta_title: '',
      meta_description: '',
      meta_keywords: '',
      language: 'es',
      related_title: '',
      related_year: '',
      video_url: '',
      gallery: [],
      conclusion: '',
      has_download: false,
      download_price_usd: '1.00',
      payment_methods: [...configuredPaymentSlugs],
      download_free: false,
    });
    setDownloadFileInfo({ hasFile: false });
    setPendingDownloadFile(null);
    setTestDownloadLink(null);
    setEditModal('new');
    setPromptSent(null);
  };

  const openEdit = (p: BlogPostRow) => {
    setForm({
      title: p.title,
      category: p.category,
      content: p.content,
      excerpt: p.excerpt ?? '',
      featured_image: p.featured_image ?? '',
      published: p.published,
      published_at: p.published_at ? p.published_at.slice(0, 16) : '',
      meta_title: p.meta_title ?? '',
      meta_description: p.meta_description ?? '',
      meta_keywords: p.meta_keywords ?? '',
      language: p.language,
      related_title: p.related_title ?? '',
      related_year: p.related_year ?? '',
      video_url: p.video_url ?? '',
      gallery: Array.isArray(p.gallery) ? p.gallery : (p.gallery ? [String(p.gallery)] : []),
      conclusion: p.conclusion ?? '',
      has_download: p.has_download ?? false,
      download_price_usd: Number.isFinite(Number(p.download_price_usd)) ? String(Number(p.download_price_usd)) : '1.00',
      payment_methods: (() => {
        const fromPost = Array.isArray(p.payment_methods) && p.payment_methods.length > 0
          ? p.payment_methods.filter((m) => configuredPaymentSlugs.includes(m))
          : configuredPaymentSlugs;
        return fromPost.length > 0 ? fromPost : [...configuredPaymentSlugs];
      })(),
      download_free: p.download_free ?? false,
    });
    setEditModal(p);
    setPromptSent(null);
    setTestDownloadLink(null);
    api.get<{ hasFile: boolean; filename_display?: string }>(`/api/blog/admin/posts/${p.id}/download`)
      .then(setDownloadFileInfo)
      .catch(() => setDownloadFileInfo({ hasFile: false }));
  };

  const handleGenerateTestDownloadLink = () => {
    if (editModal === 'new' || typeof editModal === 'string') return;
    const postId = (editModal as BlogPostRow).id;
    setGeneratingTestLink(true);
    setTestDownloadLink(null);
    api
      .post<{ downloadUrl: string; expiresAt: string }>(`/api/blog/admin/posts/${postId}/generate-test-download-link`)
      .then((data) => setTestDownloadLink({ url: data.downloadUrl, expiresAt: data.expiresAt }))
      .catch((e) => setError(e.message || t('blogAdmin.errorSave')))
      .finally(() => setGeneratingTestLink(false));
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    const isNew = editModal === 'new';
    const hasDownloadFile = isNew ? !!pendingDownloadFile : downloadFileInfo.hasFile;
    const parsedPrice = Number(form.download_price_usd);
    const requiresPriceValidation = form.has_download && hasDownloadFile && !form.download_free;
    if (requiresPriceValidation && (!Number.isFinite(parsedPrice) || parsedPrice <= 0)) {
      setSaving(false);
      setError(language === 'es' ? 'El precio de descarga debe ser mayor a 0.' : 'Download price must be greater than 0.');
      return;
    }
    const body = {
      ...form,
      published_at: form.published_at || null,
      excerpt: form.excerpt || null,
      featured_image: form.featured_image || null,
      meta_title: form.meta_title || null,
      meta_description: form.meta_description || null,
      meta_keywords: form.meta_keywords || null,
      related_title: form.related_title || null,
      related_year: form.related_year || null,
      video_url: form.video_url.trim() || null,
      gallery: form.gallery.length ? form.gallery : null,
      conclusion: form.conclusion.trim() || null,
      has_download: form.has_download && hasDownloadFile,
      download_price_usd: Number.isFinite(parsedPrice) ? parsedPrice : 0,
      payment_methods: form.has_download && hasDownloadFile && !form.download_free ? form.payment_methods : undefined,
      download_free: form.download_free,
    };
    const fileToUpload = isNew ? pendingDownloadFile : null;
    try {
      const post = isNew
        ? await api.post<BlogPostRow>('/api/blog/admin/posts', body)
        : await api.put<BlogPostRow>(`/api/blog/admin/posts/${(editModal as BlogPostRow).id}`, body);
      if (isNew && fileToUpload && form.has_download && post.id) {
        setUploadingZip(true);
        const fd = new FormData();
        fd.append('file', fileToUpload);
        const r = await fetch(`/api/blog/admin/posts/${post.id}/download`, {
          method: 'POST',
          body: fd,
          credentials: 'include',
        });
        if (!r.ok) throw new Error(await r.text());
        setPendingDownloadFile(null);
        setUploadingZip(false);
      }
      setSuccess(isNew ? t('blogAdmin.postCreated') : t('blogAdmin.postUpdated'));
      setEditModal(null);
      loadPosts();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('blogAdmin.errorSave'));
    } finally {
      setSaving(false);
      setUploadingZip(false);
    }
  };

  const handleDelete = (id: number) => {
    if (!window.confirm(t('blogAdmin.deleteConfirm'))) return;
    api.delete(`/api/blog/admin/posts/${id}`).then(() => {
      setSuccess(t('blogAdmin.postDeleted'));
      loadPosts();
      setEditModal(null);
    }).catch(() => setError(t('blogAdmin.errorDelete')));
  };

  const openPaymentsModal = (p: BlogPostRow) => {
    setPaymentsModalPost(p);
    setPostPayments(null);
    setRegeneratedLinkModal(null);
    setLoadingPostPayments(true);
    api
      .get<{ post_title: string; payments: Array<{ id: number; amount_usd: number; status: string; created_at: string; payer_email: string | null; provider: string; binance_deposit_tx_id?: string | null; binance_deposit_from_address?: string | null; binance_deposit_network?: string | null }> }>(`/api/blog/admin/posts/${p.id}/payments`)
      .then(setPostPayments)
      .catch(() => setPostPayments({ post_title: p.title, payments: [] }))
      .finally(() => setLoadingPostPayments(false));
  };

  const handleRegenerateLinkInModal = (paymentId: number) => {
    setRegeneratingPaymentId(paymentId);
    api
      .post<{ downloadUrl: string; expiresAt: string }>(`/api/blog/admin/payments/${paymentId}/regenerate-download-token`)
      .then((res) => setRegeneratedLinkModal({ url: res.downloadUrl, expiresAt: res.expiresAt }))
      .catch(() => setError(t('payments.regenerateError')))
      .finally(() => setRegeneratingPaymentId(null));
  };

  const handleGenerate = () => {
    if (!generateTopic.trim()) return;
    setGenerating(true);
    setError('');
    api
      .post<{ post: BlogPostRow; prompt_sent?: { system: string; user: string } }>(
        '/api/blog/admin/generate-post',
        { topic: generateTopic.trim(), language: generateLang }
      )
      .then((res) => {
        setGenerateModal(false);
        setGenerateTopic('');
        setPromptSent(res.prompt_sent ?? null);
        openEdit(res.post);
        setSuccess(t('blogAdmin.postCreated'));
      })
      .catch((e) => setError(e.message || t('blogAdmin.errorGenerate')))
      .finally(() => setGenerating(false));
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.append('image', file);
    fetch(getUploadUrl(), { method: 'POST', body: fd, credentials: 'include' })
      .then((r) => r.json())
      .then((data: { url: string }) => {
        setForm((f) => ({ ...f, featured_image: data.url }));
      })
      .finally(() => setUploading(false));
    e.target.value = '';
  };

  const handleGalleryUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    setUploadingGallery(true);
    const uploadUrl = getUploadUrl();
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const fd = new FormData();
      fd.append('image', file);
      try {
        const r = await fetch(uploadUrl, { method: 'POST', body: fd, credentials: 'include' });
        const data = (await r.json()) as { url: string };
        if (data.url) {
          setForm((f) => ({ ...f, gallery: [...f.gallery, data.url] }));
        }
      } catch (_) {
        // skip failed upload
      }
    }
    setUploadingGallery(false);
    e.target.value = '';
  };

  const removeGalleryImage = (index: number) => {
    setForm((f) => ({ ...f, gallery: f.gallery.filter((_, i) => i !== index) }));
  };

  const handleDownloadUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || editModal === 'new' || typeof editModal === 'string') return;
    const postId = (editModal as BlogPostRow).id;
    setUploadingZip(true);
    const fd = new FormData();
    fd.append('file', file);
    try {
      const r = await fetch(`/api/blog/admin/posts/${postId}/download`, {
        method: 'POST',
        body: fd,
        credentials: 'include',
      });
      const data = (await r.json()) as { hasFile?: boolean; filename_display?: string };
      setDownloadFileInfo({ hasFile: !!data.hasFile, filename_display: data.filename_display });
    } catch (_) {
      setError(t('blogAdmin.errorSave'));
    } finally {
      setUploadingZip(false);
      e.target.value = '';
    }
  };

  const handleDownloadRemove = () => {
    if (editModal === 'new' || typeof editModal === 'string') return;
    const postId = (editModal as BlogPostRow).id;
    api.delete(`/api/blog/admin/posts/${postId}/download`).then(() => {
      setDownloadFileInfo({ hasFile: false });
      setForm((f) => ({ ...f, has_download: false }));
    });
  };

  const handlePendingDownloadSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setPendingDownloadFile(file || null);
    e.target.value = '';
  };

  const resetCategoryForm = () => {
    setCategoryForm({
      slug: '',
      path_es: '',
      path_en: '',
      label_es: '',
      label_en: '',
      sort_order: 100,
    });
    setEditingCategorySlug(null);
  };

  const openEditCategoryRow = (c: PostCategoryRow) => {
    setEditingCategorySlug(c.slug);
    setCategoryForm({
      slug: c.slug,
      path_es: c.path_es,
      path_en: c.path_en,
      label_es: c.label_es,
      label_en: c.label_en,
      sort_order: c.sort_order,
    });
  };

  const saveCategoryRow = () => {
    setCategorySaving(true);
    const body = {
      slug: categoryForm.slug.trim(),
      path_es: categoryForm.path_es.trim(),
      path_en: categoryForm.path_en.trim(),
      label_es: categoryForm.label_es.trim(),
      label_en: categoryForm.label_en.trim(),
      sort_order: Number(categoryForm.sort_order),
    };
    const req = editingCategorySlug
      ? api.put(`/api/blog/admin/post-categories/${encodeURIComponent(editingCategorySlug)}`, body)
      : api.post('/api/blog/admin/post-categories', body);
    req
      .then(() => refreshPostCategories())
      .then(() => {
        invalidatePublicCategoriesCache();
        void prefetchCategoryMeta();
        setSuccess(t('blogAdmin.categorySaved'));
        resetCategoryForm();
      })
      .catch(() => setError(t('blogAdmin.errorSave')))
      .finally(() => setCategorySaving(false));
  };

  const deleteCategoryRow = (slug: string) => {
    if (!window.confirm(t('blogAdmin.deleteCategoryConfirm'))) return;
    api
      .delete(`/api/blog/admin/post-categories/${encodeURIComponent(slug)}`)
      .then(() => refreshPostCategories())
      .then(() => {
        invalidatePublicCategoriesCache();
        void prefetchCategoryMeta();
        setSuccess(t('blogAdmin.categoryDeleted'));
      })
      .catch(() => setError(t('blogAdmin.errorDelete')));
  };

  return (
    <>
    <main className="container py-4">
        <p className="mb-2">
          <Link to="/app" className="text-muted small">← {t('nav.backToPanel')}</Link>
        </p>
        <h1 className="h3 mb-4">{t('blogAdmin.title')}</h1>
        {error && <Alert variant="danger" onClose={() => setError('')} dismissible>{error}</Alert>}
        {success && <Alert variant="success" onClose={() => setSuccess('')} dismissible>{success}</Alert>}

        <div className="d-flex flex-wrap gap-2 mb-4">
          <Button variant="primary" onClick={openNew}>{t('blogAdmin.newPost')}</Button>
          <Button variant="outline-warning" onClick={() => setGenerateModal(true)}>
            {t('blogAdmin.generateWithAI')}
          </Button>
          <Button
            variant="outline-info"
            onClick={() => {
              setCategoriesModal(true);
              refreshPostCategories().catch(() => {});
            }}
          >
            {t('blogAdmin.manageCategories')}
          </Button>
        </div>

        <div className="mb-3 d-flex flex-wrap gap-2 align-items-center">
          <Form.Control
            className="w-auto bg-dark text-light border-secondary"
            placeholder={t('blogAdmin.search')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Form.Select
            className="w-auto bg-dark text-light border-secondary"
            value={publishedFilter}
            onChange={(e) => setPublishedFilter(e.target.value as 'all' | 'yes' | 'no')}
          >
            <option value="all">{t('blogAdmin.filterAll')}</option>
            <option value="yes">{t('blogAdmin.filterPublished')}</option>
            <option value="no">{t('blogAdmin.filterDrafts')}</option>
          </Form.Select>
        </div>

        {loading ? (
          <p className="text-muted">{t('common.loading')}</p>
        ) : posts.length === 0 ? (
          <p className="text-muted">{t('blogAdmin.noPosts')}</p>
        ) : (
          <Table striped bordered responsive className="blog-admin-posts">
            <thead>
              <tr>
                <th>{t('blogAdmin.titleLabel')}</th>
                <th>{t('blogAdmin.categoryLabel')}</th>
                <th>{t('blogAdmin.languageLabel')}</th>
                <th>{t('blogAdmin.filterStatus')}</th>
                <th
                  style={{ cursor: 'pointer', userSelect: 'none' }}
                  onClick={() => handleSort('published_at')}
                  title={t('blogAdmin.sortByColumn')}
                >
                  {t('blogAdmin.publishedAtShortLabel')}
                  {sortBy === 'published_at' ? (sortOrder === 'asc' ? ' ↑' : ' ↓') : ''}
                </th>
                <th
                  style={{ cursor: 'pointer', userSelect: 'none' }}
                  onClick={() => handleSort('views')}
                  title={t('blogAdmin.sortByColumn')}
                >
                  {t('blogAdmin.viewsLabel')}
                  {sortBy === 'views' ? (sortOrder === 'asc' ? ' ↑' : ' ↓') : ''}
                </th>
                <th>{t('blogAdmin.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {posts.map((p) => (
                <tr key={p.id}>
                  <td>{p.title}</td>
                  <td>
                    {postCategories.find((c) => c.slug === p.category)?.[
                      language === 'en' ? 'label_en' : 'label_es'
                    ] ?? p.category}
                  </td>
                  <td>
                    <PostLanguage
                      language={p.language}
                      label={p.language === 'en' ? t('blogAdmin.languageEn') : t('blogAdmin.languageEs')}
                      iconInCircle
                    />
                  </td>
                  <td>
                    <PostStatus
                      published={p.published}
                      label={p.published ? t('common.published') : t('common.draft')}
                      iconInCircle
                    />
                  </td>
                  <td>{p.published_at ? formatDateTime(p.published_at, language) : '-'}</td>
                  <td>{p.views ?? 0}</td>
                  <td>
                    {p.published && (
                      <Link to={postPublicUrl(p, postCategories)} target="_blank" rel="noopener noreferrer">
                        <Button size="sm" variant="success" className="me-1" title={t('blogAdmin.view')}>
                          <IconEye />
                        </Button>
                      </Link>
                    )}
                    <Button
                      size="sm"
                      variant={p.download_free ? 'success' : 'info'}
                      className="me-1"
                      onClick={() => openPaymentsModal(p)}
                      title={t('payments.forPost')}
                    >
                      {p.download_free ? <IconDownload /> : <IconCurrency />}
                    </Button>
                    <Button size="sm" variant="warning" className="me-1" onClick={() => openEdit(p)} title={t('blogAdmin.edit')}>
                      <IconPencil />
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => handleDelete(p.id)} title={t('blogAdmin.delete')}>
                      <IconTrash />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        {total > limit && (
          <div className="d-flex justify-content-between align-items-center mt-2">
            <span className="small text-muted">
              {page * limit + 1}-{Math.min((page + 1) * limit, total)} / {total}
            </span>
            <div>
              <Button size="sm" variant="outline-secondary" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                {t('allNews.prev')}
              </Button>
              <Button size="sm" variant="outline-secondary" className="ms-2" disabled={(page + 1) * limit >= total} onClick={() => setPage((p) => p + 1)}>
                {t('allNews.next')}
              </Button>
            </div>
          </div>
        )}
      </main>

      {/* Generate modal */}
      <Modal show={generateModal} onHide={() => setGenerateModal(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>{t('blogAdmin.generateWithAI')}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form.Group className="mb-2">
            <Form.Label>{t('blogAdmin.generateTopic')}</Form.Label>
            <Form.Control
              value={generateTopic}
              onChange={(e) => setGenerateTopic(e.target.value)}
              placeholder="ej: Análisis del Bitcoin en 2025"
            />
          </Form.Group>
          <Form.Group>
            <Form.Label>{t('blogAdmin.generateLanguage')}</Form.Label>
            <Form.Select value={generateLang} onChange={(e) => setGenerateLang(e.target.value as 'es' | 'en')}>
              <option value="es">Español</option>
              <option value="en">English</option>
            </Form.Select>
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setGenerateModal(false)}>{t('common.cancel')}</Button>
          <Button variant="primary" disabled={generating || !generateTopic.trim()} onClick={handleGenerate}>
            {generating ? t('common.loading') : t('blogAdmin.generateSubmit')}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Payments by post modal */}
      <Modal size="lg" centered show={paymentsModalPost !== null} onHide={() => { setPaymentsModalPost(null); setPostPayments(null); setRegeneratedLinkModal(null); }}>
        <Modal.Header closeButton>
          <Modal.Title className="text-break">{t('payments.forPost')}{paymentsModalPost ? `: ${paymentsModalPost.title.slice(0, 50)}${paymentsModalPost.title.length > 50 ? '…' : ''}` : ''}</Modal.Title>
        </Modal.Header>
        <Modal.Body className="pb-0">
          {loadingPostPayments && <p className="text-muted mb-0">{t('common.loading')}</p>}
          {!loadingPostPayments && postPayments && postPayments.payments.length > 0 && (
            <>
              <div className="d-flex flex-wrap align-items-center gap-3 mb-3 p-2 rounded bg-light text-dark">
                <span><strong>{t('payments.totalUsd')}:</strong> {postPayments.payments.reduce((sum, p) => sum + Number(p.amount_usd), 0).toFixed(2)} USD</span>
                <span><strong>{t('payments.totalCount')}:</strong> {postPayments.payments.length}</span>
                <span className="small">
                  {postPayments.payments.filter((p) => p.status === 'captured').length} captured
                  {postPayments.payments.some((p) => p.status !== 'captured') && ` · ${postPayments.payments.filter((p) => p.status !== 'captured').length} other`}
                </span>
              </div>
              {regeneratedLinkModal && (
                <Alert variant="success" className="py-2 mb-2 d-flex flex-wrap align-items-center gap-2">
                  <span className="small">{t('payments.regenerateSuccess')}</span>
                  <a href={regeneratedLinkModal.url} target="_blank" rel="noopener noreferrer" className="small text-break">{regeneratedLinkModal.url}</a>
                  <Button size="sm" variant="secondary" onClick={() => navigator.clipboard.writeText(regeneratedLinkModal.url)} title={t('blogAdmin.copyLink')}>
                  <IconCopy />
                </Button>
                  <Button size="sm" variant="outline-secondary" onClick={() => setRegeneratedLinkModal(null)}>×</Button>
                </Alert>
              )}
              <div className="table-responsive" style={{ maxHeight: 'min(60vh, 400px)', overflowY: 'auto' }}>
                <Table size="sm" bordered className="mb-0">
                  <thead className="position-sticky top-0">
                    <tr>
                      <th>{t('payments.date')}</th>
                      <th>{t('payments.amount')}</th>
                      <th>{t('payments.provider')}</th>
                      <th>{t('payments.status')}</th>
                      <th>{t('payments.payer')}</th>
                      <th>{t('payments.txOrDetail')}</th>
                      {user?.role === 'superuser' && <th>{t('payments.actions')}</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {postPayments.payments.map((pay) => {
                      const txUrl = pay.provider === 'binance_deposit' && pay.binance_deposit_tx_id
                        ? (() => {
                            const n = (pay.binance_deposit_network ?? '').toUpperCase();
                            if (n === 'BSC' || n === 'BEP20') return `https://bscscan.com/tx/${pay.binance_deposit_tx_id}`;
                            if (n === 'TRX' || n === 'TRC20' || n === 'TRON') return `https://tronscan.org/#/transaction/${pay.binance_deposit_tx_id}`;
                            if (n === 'ETH' || n === 'ERC20') return `https://etherscan.io/tx/${pay.binance_deposit_tx_id}`;
                            return null;
                          })()
                        : null;
                      const providerLabel =
                        pay.provider === 'paypal'
                          ? t('payments.providerPayPal')
                          : pay.provider === 'binance_pay'
                            ? t('payments.providerBinancePay')
                            : t('payments.providerBinanceDeposit');
                      const statusLabel =
                        pay.status === 'captured'
                          ? t('payments.statusCaptured')
                          : pay.status === 'pending'
                            ? t('payments.statusPending')
                            : pay.status === 'failed'
                              ? t('payments.statusFailed')
                              : t('payments.statusExpired');
                      return (
                        <tr key={pay.id}>
                          <td>{formatDateTime(pay.created_at, language)}</td>
                          <td>{Number(pay.amount_usd).toFixed(2)} USD</td>
                          <td>
                            <PaymentProvider provider={pay.provider} label={providerLabel} />
                          </td>
                          <td>
                            <PaymentStatus status={pay.status} label={statusLabel} iconInCircle />
                          </td>
                          <td className="small text-break">
                            {pay.provider === 'binance_deposit'
                              ? (pay.binance_deposit_from_address ?? '-')
                              : (pay.payer_email ?? '-')}
                          </td>
                          <td className="small">
                            {txUrl ? <a href={txUrl} target="_blank" rel="noopener noreferrer">{t('payments.viewTx')}</a> : '-'}
                          </td>
                          {user?.role === 'superuser' && (
                            <td>
                              {pay.status === 'captured' && (
                                <Button
                                  size="sm"
                                  variant="info"
                                  disabled={regeneratingPaymentId === pay.id}
                                  onClick={() => handleRegenerateLinkInModal(pay.id)}
                                  title={t('payments.regenerateLink')}
                                >
                                  {regeneratingPaymentId === pay.id ? <span className="small">…</span> : <IconRefresh />}
                                </Button>
                              )}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </Table>
              </div>
            </>
          )}
          {!loadingPostPayments && postPayments && postPayments.payments.length === 0 && <p className="text-muted mb-0">{t('payments.noPayments')}</p>}
        </Modal.Body>
        <Modal.Footer className="pt-3 border-top">
          <Button variant="secondary" onClick={() => { setPaymentsModalPost(null); setPostPayments(null); setRegeneratedLinkModal(null); }}>{t('payments.close')}</Button>
        </Modal.Footer>
      </Modal>

      <Modal size="lg" show={categoriesModal} onHide={() => { setCategoriesModal(false); resetCategoryForm(); }}>
        <Modal.Header closeButton>
          <Modal.Title>{t('blogAdmin.manageCategories')}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p className="small text-muted">{t('blogAdmin.categoriesHint')}</p>
          <Table size="sm" bordered responsive className="mb-3">
            <thead>
              <tr>
                <th>{t('blogAdmin.slug')}</th>
                <th>ES</th>
                <th>EN</th>
                <th>{t('blogAdmin.sortOrder')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {postCategories.map((c) => (
                <tr key={c.slug}>
                  <td>{c.slug}</td>
                  <td className="small">{c.path_es} · {c.label_es}</td>
                  <td className="small">{c.path_en} · {c.label_en}</td>
                  <td>{c.sort_order}</td>
                  <td className="text-nowrap">
                    <Button size="sm" variant="outline-info" className="me-1" onClick={() => openEditCategoryRow(c)}>
                      {t('blogAdmin.edit')}
                    </Button>
                    <Button size="sm" variant="outline-danger" onClick={() => deleteCategoryRow(c.slug)}>
                      {t('blogAdmin.delete')}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
          <h6 className="text-secondary">{editingCategorySlug ? t('blogAdmin.edit') : t('blogAdmin.newCategory')}</h6>
          <Form.Group className="mb-2">
            <Form.Label>{t('blogAdmin.slug')}</Form.Label>
            <Form.Control
              className="bg-dark text-light border-secondary"
              value={categoryForm.slug}
              onChange={(e) => setCategoryForm((f) => ({ ...f, slug: e.target.value }))}
              disabled={Boolean(editingCategorySlug)}
            />
          </Form.Group>
          <div className="row g-2">
            <div className="col-md-6">
              <Form.Group className="mb-2">
                <Form.Label>{t('blogAdmin.pathUrlEs')}</Form.Label>
                <Form.Control
                  className="bg-dark text-light border-secondary"
                  value={categoryForm.path_es}
                  onChange={(e) => setCategoryForm((f) => ({ ...f, path_es: e.target.value }))}
                />
              </Form.Group>
            </div>
            <div className="col-md-6">
              <Form.Group className="mb-2">
                <Form.Label>{t('blogAdmin.pathUrlEn')}</Form.Label>
                <Form.Control
                  className="bg-dark text-light border-secondary"
                  value={categoryForm.path_en}
                  onChange={(e) => setCategoryForm((f) => ({ ...f, path_en: e.target.value }))}
                />
              </Form.Group>
            </div>
          </div>
          <div className="row g-2">
            <div className="col-md-6">
              <Form.Group className="mb-2">
                <Form.Label>{t('blogAdmin.nameEs')}</Form.Label>
                <Form.Control
                  className="bg-dark text-light border-secondary"
                  value={categoryForm.label_es}
                  onChange={(e) => setCategoryForm((f) => ({ ...f, label_es: e.target.value }))}
                />
              </Form.Group>
            </div>
            <div className="col-md-6">
              <Form.Group className="mb-2">
                <Form.Label>{t('blogAdmin.nameEn')}</Form.Label>
                <Form.Control
                  className="bg-dark text-light border-secondary"
                  value={categoryForm.label_en}
                  onChange={(e) => setCategoryForm((f) => ({ ...f, label_en: e.target.value }))}
                />
              </Form.Group>
            </div>
          </div>
          <Form.Group className="mb-2">
            <Form.Label>{t('blogAdmin.sortOrder')}</Form.Label>
            <Form.Control
              type="number"
              className="bg-dark text-light border-secondary"
              value={categoryForm.sort_order}
              onChange={(e) => setCategoryForm((f) => ({ ...f, sort_order: parseInt(e.target.value, 10) || 0 }))}
            />
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => resetCategoryForm()}>
            {t('blogAdmin.clearCategoryForm')}
          </Button>
          <Button variant="primary" disabled={categorySaving} onClick={saveCategoryRow}>
            {t('blogAdmin.saveCategory')}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Edit modal */}
      <Modal size="xl" show={editModal !== null} onHide={() => setEditModal(null)}>
        <Modal.Header closeButton>
          <Modal.Title>{editModal === 'new' ? t('blogAdmin.newPost') : t('blogAdmin.edit')}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {promptSent && (
            <details className="mb-3">
              <summary>{t('blogAdmin.viewPromptSent')}</summary>
              <pre className="small bg-dark p-2 rounded overflow-auto" style={{ maxHeight: '200px' }}>
                <strong>{t('blogAdmin.promptSystem')}</strong>{'\n'}{promptSent.system}{'\n\n'}<strong>{t('blogAdmin.promptUser')}</strong>{'\n'}{promptSent.user}
              </pre>
            </details>
          )}
          <Form>
            <Form.Group className="mb-2">
              <Form.Label>{t('blogAdmin.titleLabel')}</Form.Label>
              <Form.Control value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
            </Form.Group>
            <Form.Group className="mb-2">
              <Form.Label>{t('blogAdmin.categoryLabel')}</Form.Label>
              <Form.Select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as BlogCategory }))}>
                {postCategories.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {language === 'en' ? c.label_en : c.label_es}
                  </option>
                ))}
              </Form.Select>
            </Form.Group>
            <Form.Group className="mb-2">
              <Form.Label>{t('blogAdmin.contentLabel')}</Form.Label>
              {isSignalPost && editModal && editModal !== 'new' && typeof editModal !== 'string' ? (
                <>
                  <div
                    className="border rounded p-2 bg-dark text-light small mb-1"
                    style={{ maxHeight: 300, overflowY: 'auto' }}
                  >
                    <div
                      className="post-content"
                      dangerouslySetInnerHTML={{ __html: editModal.content }}
                    />
                  </div>
                  <Form.Text className="text-warning d-block">
                    Este es un post de señal generado automáticamente (tabla + gráfico).
                    El contenido no se edita aquí para no romper el HTML. Solo cambia precio,
                    métodos de pago y metadatos.
                  </Form.Text>
                </>
              ) : (
                <ReactQuill
                  theme="snow"
                  value={form.content}
                  onChange={(v: string) => setForm((f) => ({ ...f, content: v }))}
                />
              )}
            </Form.Group>
            <Form.Group className="mb-2">
              <Form.Label>{t('blogAdmin.excerptLabel')}</Form.Label>
              <Form.Control as="textarea" rows={2} value={form.excerpt} onChange={(e) => setForm((f) => ({ ...f, excerpt: e.target.value }))} />
            </Form.Group>
            <Form.Group className="mb-2">
              <Form.Label>{t('blogAdmin.featuredImageLabel')}</Form.Label>
              <div className="d-flex gap-2 align-items-center">
                <Form.Control type="file" accept="image/*" onChange={handleImageUpload} disabled={uploading} />
                {form.featured_image && <img src={getImageUrl(form.featured_image)} alt="" style={{ height: 60, objectFit: 'cover' }} />}
              </div>
            </Form.Group>
            <Form.Group className="mb-2">
              <Form.Label>{t('blogAdmin.videoUrlLabel')}</Form.Label>
              <Form.Control
                type="url"
                placeholder="https://www.youtube.com/watch?v=... o https://vimeo.com/..."
                value={form.video_url}
                onChange={(e) => setForm((f) => ({ ...f, video_url: e.target.value }))}
              />
            </Form.Group>
            <Form.Group className="mb-2">
              <Form.Label>{t('blogAdmin.galleryLabel')}</Form.Label>
              <div className="d-flex flex-wrap gap-2 align-items-start">
                {form.gallery.map((url, index) => (
                  <div key={index} className="position-relative">
                    <img
                      src={getImageUrl(url)}
                      alt=""
                      style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 6 }}
                    />
                    <button
                      type="button"
                      className="btn btn-sm btn-danger position-absolute top-0 end-0"
                      style={{ transform: 'translate(50%, -50%)' }}
                      aria-label={t('common.delete')}
                      onClick={() => removeGalleryImage(index)}
                    >
                      ×
                    </button>
                  </div>
                ))}
                <div>
                  <input
                    ref={galleryInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="d-none"
                    onChange={handleGalleryUpload}
                    disabled={uploadingGallery}
                  />
                  <Button
                    type="button"
                    variant="outline-secondary"
                    size="sm"
                    disabled={uploadingGallery}
                    onClick={() => galleryInputRef.current?.click()}
                  >
                    {uploadingGallery ? t('common.loading') : t('blogAdmin.galleryAddImage')}
                  </Button>
                </div>
              </div>
            </Form.Group>
            <Form.Group className="mb-2">
              <Form.Label>{t('blogAdmin.conclusionLabel')}</Form.Label>
              <Form.Control
                as="textarea"
                rows={4}
                value={form.conclusion}
                onChange={(e) => setForm((f) => ({ ...f, conclusion: e.target.value }))}
                placeholder="<p>Conclusión en HTML...</p>"
              />
              <Form.Text className="text-muted d-block">
                Puedes escribir HTML aquí (por ejemplo párrafos, listas, etc.).
              </Form.Text>
            </Form.Group>
            {(() => {
              const hasDownloadFile = editModal === 'new' ? !!pendingDownloadFile : downloadFileInfo.hasFile;
              return (
                <>
            <Form.Group className="mb-2">
              <Form.Label>{t('blogAdmin.downloadFileLabel')}</Form.Label>
              <div className="d-flex flex-wrap gap-2 align-items-center">
                {editModal === 'new' ? (
                  <>
                    {pendingDownloadFile ? (
                      <>
                        <span className="text-muted small">{pendingDownloadFile.name}</span>
                        <Button type="button" variant="outline-danger" size="sm" onClick={() => setPendingDownloadFile(null)}>
                          {t('common.delete')}
                        </Button>
                      </>
                    ) : (
                      <span className="text-muted small">{t('blogAdmin.downloadFileNone')}</span>
                    )}
                    <input
                      type="file"
                      accept=".zip,application/zip"
                      className="d-none"
                      id="pending-download-input"
                      onChange={handlePendingDownloadSelect}
                    />
                    <Button
                      type="button"
                      variant="outline-secondary"
                      size="sm"
                      onClick={() => document.getElementById('pending-download-input')?.click()}
                    >
                      {t('blogAdmin.downloadFileSelect')}
                    </Button>
                  </>
                ) : (
                  <>
                    {downloadFileInfo.hasFile ? (
                      <>
                        <span className="text-muted small">{downloadFileInfo.filename_display ?? 'ZIP'}</span>
                        <Button type="button" variant="outline-danger" size="sm" onClick={handleDownloadRemove}>
                          {t('common.delete')}
                        </Button>
                      </>
                    ) : (
                      <span className="text-muted small">{t('blogAdmin.downloadFileNone')}</span>
                    )}
                    <input
                      ref={downloadInputRef}
                      type="file"
                      accept=".zip,application/zip"
                      className="d-none"
                      onChange={handleDownloadUpload}
                      disabled={uploadingZip}
                    />
                    <Button
                      type="button"
                      variant="outline-secondary"
                      size="sm"
                      disabled={uploadingZip}
                      onClick={() => downloadInputRef.current?.click()}
                    >
                      {uploadingZip ? t('common.loading') : t('blogAdmin.downloadFileUpload')}
                    </Button>
                  </>
                )}
              </div>
            </Form.Group>
            {editModal !== 'new' && downloadFileInfo.hasFile && (
              <Form.Group className="mb-2 p-2 rounded border border-info">
                <Form.Label className="text-info">{t('blogAdmin.testDownloadLink')}</Form.Label>
                <div className="d-flex flex-wrap gap-2 align-items-center">
                  <Button
                    type="button"
                    variant="outline-info"
                    size="sm"
                    disabled={generatingTestLink}
                    onClick={handleGenerateTestDownloadLink}
                  >
                    {generatingTestLink ? t('common.loading') : t('blogAdmin.generateTestLink')}
                  </Button>
                  {testDownloadLink && (
                    <>
                      <a href={testDownloadLink.url} target="_blank" rel="noopener noreferrer" className="small text-break">
                        {testDownloadLink.url}
                      </a>
                      <Button
                        type="button"
                        variant="outline-secondary"
                        size="sm"
                        onClick={() => {
                          navigator.clipboard.writeText(testDownloadLink!.url);
                          setSuccess(t('blogAdmin.linkCopied'));
                        }}
                      >
                        {t('blogAdmin.copyLink')}
                      </Button>
                      <span className="small text-muted">
                        {t('blogAdmin.expiresAt')}: {formatDateTime(testDownloadLink.expiresAt, language)}
                      </span>
                    </>
                  )}
                </div>
              </Form.Group>
            )}
            <Form.Group className="mb-2">
              <Form.Check
                type="checkbox"
                id="has-download"
                label={t('blogAdmin.hasDownloadLabel')}
                checked={form.has_download}
                disabled={!hasDownloadFile}
                onChange={(e) => setForm((f) => ({ ...f, has_download: e.target.checked }))}
              />
              {!hasDownloadFile && (
                <Form.Text className="text-warning d-block">
                  {t('blogAdmin.downloadFileRequiredForPay')}
                </Form.Text>
              )}
            </Form.Group>
            {form.has_download && (
              <>
                <Form.Group className="mb-2">
                  <Form.Check
                    type="checkbox"
                    id="download-free"
                    label={t('blogAdmin.downloadFreeLabel')}
                    checked={form.download_free}
                    onChange={(e) => setForm((f) => ({ ...f, download_free: e.target.checked }))}
                  />
                  <Form.Text className="text-muted d-block">{t('blogAdmin.downloadFreeHint')}</Form.Text>
                </Form.Group>
                {!form.download_free && (
                <>
                <Form.Group className="mb-2">
                  <Form.Label>{t('blogAdmin.downloadPriceLabel')}</Form.Label>
                  <Form.Control
                    type="number"
                    min={0}
                    step={0.01}
                    value={form.download_price_usd}
                    onChange={(e) => {
                      setForm((f) => ({ ...f, download_price_usd: e.target.value }));
                    }}
                  />
                  <Form.Text className="text-muted">{t('blogAdmin.downloadPriceHint')}</Form.Text>
                </Form.Group>
                <Form.Group className="mb-2">
                  <Form.Label>{t('blogAdmin.paymentMethodsLabel')}</Form.Label>
                  <div className="d-flex flex-wrap gap-3">
                    {configuredPaymentSlugs.includes('paypal') && (
                      <Form.Check
                        type="checkbox"
                        id="pm-paypal"
                        label={t('blogAdmin.paymentMethodPayPal')}
                        checked={form.payment_methods.includes('paypal')}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setForm((f) => ({ ...f, payment_methods: [...f.payment_methods, 'paypal'] }));
                          } else if (form.payment_methods.length > 1) {
                            setForm((f) => ({ ...f, payment_methods: f.payment_methods.filter((m) => m !== 'paypal') }));
                          }
                        }}
                      />
                    )}
                    {configuredPaymentSlugs.includes('binance_pay') && (
                      <Form.Check
                        type="checkbox"
                        id="pm-binance-pay"
                        label={t('blogAdmin.paymentMethodBinancePay')}
                        checked={form.payment_methods.includes('binance_pay')}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setForm((f) => ({ ...f, payment_methods: [...f.payment_methods, 'binance_pay'] }));
                          } else if (form.payment_methods.length > 1) {
                            setForm((f) => ({ ...f, payment_methods: f.payment_methods.filter((m) => m !== 'binance_pay') }));
                          }
                        }}
                      />
                    )}
                    {configuredPaymentSlugs.includes('binance_deposit') && (
                      <Form.Check
                        type="checkbox"
                        id="pm-binance-deposit"
                        label={t('blogAdmin.paymentMethodTransferUSDT')}
                        checked={form.payment_methods.includes('binance_deposit')}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setForm((f) => ({ ...f, payment_methods: [...f.payment_methods, 'binance_deposit'] }));
                          } else if (form.payment_methods.length > 1) {
                            setForm((f) => ({ ...f, payment_methods: f.payment_methods.filter((m) => m !== 'binance_deposit') }));
                          }
                        }}
                      />
                    )}
                  </div>
                  <Form.Text className="text-muted">{t('blogAdmin.paymentMethodsHint')}</Form.Text>
                </Form.Group>
                </>
                )}
              </>
            )}
                </>
              );
            })()}
            <Form.Group className="mb-2">
              <Form.Check type="checkbox" label={t('blogAdmin.publishedLabel')} checked={form.published} onChange={(e) => setForm((f) => ({ ...f, published: e.target.checked }))} />
            </Form.Group>
            <Form.Group className="mb-2">
              <Form.Label>{t('blogAdmin.publishedAtLabel')}</Form.Label>
              <Form.Control type="datetime-local" value={form.published_at} onChange={(e) => setForm((f) => ({ ...f, published_at: e.target.value }))} />
            </Form.Group>
            <Form.Group className="mb-2">
              <Form.Label>{t('blogAdmin.metaTitleLabel')}</Form.Label>
              <Form.Control value={form.meta_title} onChange={(e) => setForm((f) => ({ ...f, meta_title: e.target.value }))} />
            </Form.Group>
            <Form.Group className="mb-2">
              <Form.Label>{t('blogAdmin.metaDescriptionLabel')}</Form.Label>
              <Form.Control as="textarea" rows={2} value={form.meta_description} onChange={(e) => setForm((f) => ({ ...f, meta_description: e.target.value }))} />
            </Form.Group>
            <Form.Group className="mb-2">
              <Form.Label>{t('blogAdmin.languageLabel')}</Form.Label>
              <Form.Select value={form.language} onChange={(e) => setForm((f) => ({ ...f, language: e.target.value }))}>
                <option value="es">Español</option>
                <option value="en">English</option>
              </Form.Select>
            </Form.Group>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setEditModal(null)}>{t('common.cancel')}</Button>
          <Button variant="primary" disabled={saving || uploadingZip} onClick={handleSave}>{t('common.save')}</Button>
        </Modal.Footer>
      </Modal>
    </>
  );
}
