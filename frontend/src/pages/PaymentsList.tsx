import { useEffect, useState, useCallback } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { Table, Button, Form } from 'react-bootstrap';
import { IconRefresh, IconBroom } from '../components/TableIcons';
import { PaymentProvider } from '../components/PaymentProvider';
import { PaymentStatus } from '../components/PaymentStatus';
import { DateInput } from '../components/DateInput';
import { useT, useLanguage } from '../utils/i18n';
import { formatDateTime } from '../utils/dateFormat';
import { api } from '../utils/api';

type SortField = 'created_at' | 'amount_usd' | 'status' | 'provider' | 'post_title';
type SortOrder = 'asc' | 'desc';

function explorerTxUrl(network: string | null | undefined, txId: string | null | undefined): string | null {
  if (!txId) return null;
  const n = (network ?? '').toUpperCase();
  if (n === 'BSC' || n === 'BEP20') return `https://bscscan.com/tx/${txId}`;
  if (n === 'TRX' || n === 'TRC20' || n === 'TRON') return `https://tronscan.org/#/transaction/${txId}`;
  if (n === 'ETH' || n === 'ERC20') return `https://etherscan.io/tx/${txId}`;
  return null;
}

interface PaymentWithPost {
  id: number;
  post_id: number;
  post_title: string | null;
  provider: string;
  amount_usd: number;
  status: string;
  captured_at: string | null;
  created_at: string;
  payer_email: string | null;
  paypal_order_id: string | null;
  binance_deposit_tx_id?: string | null;
  binance_deposit_from_address?: string | null;
  binance_deposit_network?: string | null;
  user_id: number | null;
  user_email: string | null;
  user_name: string | null;
}

interface PostOption {
  id: number;
  title: string;
}

export default function PaymentsList() {
  const t = useT();
  const language = useLanguage();
  const [user, setUser] = useState<{ name: string; role: string } | null | undefined>(undefined);
  const [payments, setPayments] = useState<PaymentWithPost[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const limit = 30;
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [postId, setPostId] = useState<string>('');
  const [status, setStatus] = useState<string>('');
  const [sortBy, setSortBy] = useState<SortField>('created_at');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [postsForFilter, setPostsForFilter] = useState<PostOption[]>([]);
  const [regeneratingId, setRegeneratingId] = useState<number | null>(null);
  const [regeneratedLink, setRegeneratedLink] = useState<{ id: number; url: string; expiresAt: string } | null>(null);
  const [stats, setStats] = useState<{
    totalUsd: number;
    totalCount: number;
    byProvider: Array<{ provider: string; totalUsd: number; count: number }>;
  } | null>(null);

  useEffect(() => {
    api
      .get<{ name: string; role: string }>('/auth/me')
      .then((u) => setUser(u))
      .catch(() => setUser(null));
  }, []);

  const fetchPayments = useCallback(() => {
    if (user?.role !== 'superuser') return;
    setLoading(true);
    const params = new URLSearchParams();
    params.set('limit', String(limit));
    params.set('offset', String(page * limit));
    // Desde/hasta: se envían como fecha; el backend usa la zona horaria del usuario para que "7 feb" = todo el día 7 en tu hora.
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if ((from || to) && typeof Intl !== 'undefined' && Intl.DateTimeFormat) {
      try {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        if (tz) params.set('timezone', tz);
      } catch (_) {}
    }
    if (postId) params.set('postId', postId);
    if (status) params.set('status', status);
    params.set('sortBy', sortBy);
    params.set('sortOrder', sortOrder);
    api
      .get<{ payments: PaymentWithPost[]; total: number }>(`/api/blog/admin/payments?${params.toString()}`)
      .then((res) => {
        setPayments(res.payments);
        setTotal(res.total);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user, page, from, to, postId, status, sortBy, sortOrder]);

  useEffect(() => {
    if (user === undefined || user?.role !== 'superuser') return;
    fetchPayments();
  }, [user, fetchPayments]);

  useEffect(() => {
    if (user?.role !== 'superuser') return;
    api
      .get<{ posts: Array<{ id: number; title: string }>; total: number }>('/api/blog/admin/posts?limit=300')
      .then((res) => setPostsForFilter(res.posts.map((p) => ({ id: p.id, title: p.title }))))
      .catch(() => setPostsForFilter([]));
  }, [user]);

  useEffect(() => {
    if (user?.role !== 'superuser') return;
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if ((from || to) && typeof Intl !== 'undefined' && Intl.DateTimeFormat) {
      try {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        if (tz) params.set('timezone', tz);
      } catch (_) {}
    }
    if (postId) params.set('postId', postId);
    const q = params.toString();
    api
      .get<{ totalUsd: number; totalCount: number; byProvider: Array<{ provider: string; totalUsd: number; count: number }> }>(
        `/api/blog/admin/payments/stats${q ? `?${q}` : ''}`
      )
      .then(setStats)
      .catch(() => setStats(null));
  }, [user, from, to, postId]);

  const handleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
    setPage(0);
  };

  const clearFilters = () => {
    setFrom('');
    setTo('');
    setPostId('');
    setStatus('');
    setSortBy('created_at');
    setSortOrder('desc');
    setPage(0);
  };

  const hasActiveFilters = from || to || postId || status || sortBy !== 'created_at' || sortOrder !== 'desc';

  const handleRegenerateLink = (paymentId: number) => {
    setRegeneratingId(paymentId);
    setRegeneratedLink(null);
    api
      .post<{ downloadUrl: string; expiresAt: string }>(`/api/blog/admin/payments/${paymentId}/regenerate-download-token`)
      .then((data) => setRegeneratedLink({ id: paymentId, url: data.downloadUrl, expiresAt: data.expiresAt }))
      .catch(() => {})
      .finally(() => setRegeneratingId(null));
  };

  if (user === undefined) {
    return (
      <div className="container py-5">
        <p className="text-muted">{t('common.loading')}</p>
      </div>
    );
  }
  if (user === null || user.role !== 'superuser') {
    return <Navigate to={user === null ? '/' : '/app'} replace />;
  }

  return (
    <main className="container py-4">
        <p className="mb-2">
          <Link to="/app" className="text-muted small">← {t('nav.backToPanel')}</Link>
        </p>
        <h1 className="h4 mb-3">{t('payments.title')}</h1>
        {stats != null && (
          <div className="mb-3 p-2 rounded border border-secondary bg-dark">
            <span className="me-3">
              <strong>{t('payments.totalUsd')}:</strong> {stats.totalUsd.toFixed(2)} USD
            </span>
            <span className="me-3">
              <strong>{t('payments.totalCount')}:</strong> {stats.totalCount}
            </span>
            {stats.byProvider.length > 0 && (
              <span>
                {stats.byProvider.map((p) => (
                  <span key={p.provider} className="me-2 small d-inline-flex align-items-center gap-1">
                    <PaymentProvider
                      provider={p.provider}
                      label={
                        p.provider === 'paypal'
                          ? t('payments.providerPayPal')
                          : p.provider === 'binance_pay'
                            ? t('payments.providerBinancePay')
                            : t('payments.providerBinanceDeposit')
                      }
                      iconSize={14}
                      iconInCircle
                    />
                    : {p.totalUsd.toFixed(2)} USD ({p.count})
                  </span>
                ))}
              </span>
            )}
          </div>
        )}
        <div className="mb-3 p-3 rounded border border-secondary bg-dark">
          <div className="d-flex flex-wrap align-items-end gap-3">
            <Form.Group className="mb-0 d-flex flex-column">
              <Form.Label className="small mb-1">{t('payments.fromDate')}</Form.Label>
              <DateInput
                value={from}
                onChange={(v) => {
                  setFrom(v);
                  setPage(0);
                }}
                language={language}
                className="bg-secondary text-light border-secondary"
              />
            </Form.Group>
            <Form.Group className="mb-0 d-flex flex-column">
              <Form.Label className="small mb-1">{t('payments.toDate')}</Form.Label>
              <DateInput
                value={to}
                onChange={(v) => {
                  setTo(v);
                  setPage(0);
                }}
                language={language}
                className="bg-secondary text-light border-secondary"
              />
            </Form.Group>
            <Form.Group className="mb-0 d-flex flex-column">
              <Form.Label className="small mb-1">{t('payments.filterPost')}</Form.Label>
              <Form.Select
                value={postId}
                onChange={(e) => {
                  setPostId(e.target.value);
                  setPage(0);
                }}
                className="bg-secondary text-light border-secondary"
                style={{ width: '140px', maxWidth: '140px' }}
              >
                <option value="">{t('payments.statusAll')}</option>
                {postsForFilter.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title.slice(0, 50)}{p.title.length > 50 ? '…' : ''}
                  </option>
                ))}
              </Form.Select>
            </Form.Group>
            <Form.Group className="mb-0 d-flex flex-column">
              <Form.Label className="small mb-1">{t('payments.filterStatus')}</Form.Label>
              <Form.Select
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value);
                  setPage(0);
                }}
                className="bg-secondary text-light border-secondary"
              >
                <option value="">{t('payments.statusAll')}</option>
                <option value="captured">{t('payments.statusCaptured')}</option>
                <option value="pending">{t('payments.statusPending')}</option>
                <option value="failed">{t('payments.statusFailed')}</option>
                <option value="expired">{t('payments.statusExpired')}</option>
              </Form.Select>
            </Form.Group>
            {hasActiveFilters && (
              <Button variant="info" size="sm" onClick={clearFilters} title={t('payments.clearFilters')} aria-label={t('payments.clearFilters')}>
                <IconBroom />
              </Button>
            )}
          </div>
        </div>
        {regeneratedLink && (
          <div className="alert alert-success py-2 mb-3 d-flex flex-wrap align-items-center gap-2">
            <span>{t('payments.regenerateSuccess')}</span>
            <a href={regeneratedLink.url} target="_blank" rel="noopener noreferrer" className="small text-break">
              {regeneratedLink.url}
            </a>
            <Button
              size="sm"
              variant="outline-secondary"
              onClick={() => {
                navigator.clipboard.writeText(regeneratedLink!.url);
              }}
            >
              {t('blogAdmin.copyLink')}
            </Button>
            <Button size="sm" variant="outline-secondary" onClick={() => setRegeneratedLink(null)}>
              ×
            </Button>
          </div>
        )}
        {loading ? (
          <p className="text-muted">{t('common.loading')}</p>
        ) : payments.length === 0 ? (
          <p className="text-muted">{t('payments.noPayments')}</p>
        ) : (
          <>
            <Table responsive size="sm" bordered className="mb-0">
              <thead>
                <tr>
                  <th
                    style={{ cursor: 'pointer', userSelect: 'none' }}
                    onClick={() => handleSort('created_at')}
                    title={t('payments.sortBy')}
                  >
                    {t('payments.date')} {sortBy === 'created_at' && (sortOrder === 'asc' ? '↑' : '↓')}
                  </th>
                  <th
                    style={{ cursor: 'pointer', userSelect: 'none' }}
                    onClick={() => handleSort('post_title')}
                    title={t('payments.sortBy')}
                  >
                    {t('payments.post')} {sortBy === 'post_title' && (sortOrder === 'asc' ? '↑' : '↓')}
                  </th>
                  <th
                    style={{ cursor: 'pointer', userSelect: 'none' }}
                    onClick={() => handleSort('amount_usd')}
                    title={t('payments.sortBy')}
                  >
                    {t('payments.amount')} {sortBy === 'amount_usd' && (sortOrder === 'asc' ? '↑' : '↓')}
                  </th>
                  <th
                    style={{ cursor: 'pointer', userSelect: 'none' }}
                    onClick={() => handleSort('provider')}
                    title={t('payments.sortBy')}
                  >
                    {t('payments.provider')} {sortBy === 'provider' && (sortOrder === 'asc' ? '↑' : '↓')}
                  </th>
                  <th
                    style={{ cursor: 'pointer', userSelect: 'none' }}
                    onClick={() => handleSort('status')}
                    title={t('payments.sortBy')}
                  >
                    {t('payments.status')} {sortBy === 'status' && (sortOrder === 'asc' ? '↑' : '↓')}
                  </th>
                  <th>{t('payments.payer')}</th>
                  <th>{t('payments.user')}</th>
                  <th>{t('payments.txOrDetail')}</th>
                  <th>{t('payments.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((pay) => {
                  const txUrl = pay.provider === 'binance_deposit' ? explorerTxUrl(pay.binance_deposit_network, pay.binance_deposit_tx_id) : null;
                  return (
                    <tr key={pay.id}>
                      <td>{formatDateTime(pay.created_at, language)}</td>
                      <td>
                        <Link to={`/app/blog-admin`} className="text-decoration-none">
                          {pay.post_title ?? `#${pay.post_id}`}
                        </Link>
                      </td>
                      <td>{Number(pay.amount_usd).toFixed(2)} USD</td>
                      <td>
                        <PaymentProvider
                          provider={pay.provider}
                          label={
                            pay.provider === 'paypal'
                              ? t('payments.providerPayPal')
                              : pay.provider === 'binance_pay'
                                ? t('payments.providerBinancePay')
                                : t('payments.providerBinanceDeposit')
                          }
                          iconInCircle
                        />
                      </td>
                      <td>
                        <PaymentStatus
                          status={pay.status}
                          label={
                            pay.status === 'captured'
                              ? t('payments.statusCaptured')
                              : pay.status === 'pending'
                                ? t('payments.statusPending')
                                : pay.status === 'failed'
                                  ? t('payments.statusFailed')
                                  : t('payments.statusExpired')
                          }
                          iconInCircle
                        />
                      </td>
                      <td className="small">
                        {pay.provider === 'binance_deposit'
                          ? (pay.binance_deposit_from_address ? (
                              <span className="text-break" title={pay.binance_deposit_from_address}>
                                {pay.binance_deposit_from_address.slice(0, 10)}…{pay.binance_deposit_from_address.slice(-8)}
                              </span>
                            ) : '-')
                          : (pay.payer_email ?? '-')}
                      </td>
                      <td className="small">
                        {pay.user_email
                          ? (
                            <span title={pay.user_name ?? ''}>
                              {pay.user_email}
                            </span>
                          )
                          : '-'}
                      </td>
                      <td className="small">
                        {txUrl && pay.binance_deposit_tx_id ? (
                          <a href={txUrl} target="_blank" rel="noopener noreferrer" className="text-info">
                            {t('payments.viewTx')}
                          </a>
                        ) : pay.provider === 'binance_deposit' && pay.binance_deposit_tx_id ? (
                          <span className="text-muted" title={pay.binance_deposit_tx_id}>{pay.binance_deposit_tx_id.slice(0, 12)}…</span>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td>
                        {pay.status === 'captured' && (
                          <Button
                            size="sm"
                            variant="info"
                            disabled={regeneratingId === pay.id}
                            onClick={() => handleRegenerateLink(pay.id)}
                            title={t('payments.regenerateLink')}
                          >
                            {regeneratingId === pay.id ? <span className="small">…</span> : <IconRefresh />}
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
            {total > limit && (
              <div className="d-flex justify-content-between align-items-center mt-2">
                <span className="small text-muted">
                  {page * limit + 1}-{Math.min((page + 1) * limit, total)} / {total}
                </span>
                <div>
                  <Button
                    size="sm"
                    variant="outline-secondary"
                    disabled={page === 0}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    {t('allNews.prev')}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline-secondary"
                    className="ms-2"
                    disabled={(page + 1) * limit >= total}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    {t('allNews.next')}
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </main>
  );
}
