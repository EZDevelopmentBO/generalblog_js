import { useEffect, useState, useCallback } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { Table, Button, Form } from 'react-bootstrap';
import { DateInput } from '../components/DateInput';
import { IconBroom } from '../components/TableIcons';
import { NotificationStatus } from '../components/NotificationStatus';
import { NotificationChannel } from '../components/NotificationChannel';
import { useT, useLanguage } from '../utils/i18n';
import { formatDateTime } from '../utils/dateFormat';
import { api } from '../utils/api';

interface NotificationRow {
  id: number;
  channel: string;
  recipient: string;
  subject_or_template: string | null;
  related_type: string | null;
  related_id: number | null;
  sent_at: string;
  status: string;
  error_message: string | null;
}

export default function NotificationsList() {
  const t = useT();
  const language = useLanguage();
  const [user, setUser] = useState<{ role: string } | null | undefined>(undefined);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const limit = 30;
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [channel, setChannel] = useState('');
  const [status, setStatus] = useState('');
  const [recipient, setRecipient] = useState('');

  useEffect(() => {
    api
      .get<{ role: string }>('/auth/me')
      .then(setUser)
      .catch(() => setUser(null));
  }, []);

  const fetchNotifications = useCallback(() => {
    if (user?.role !== 'superuser') return;
    setLoading(true);
    const params = new URLSearchParams();
    params.set('limit', String(limit));
    params.set('offset', String(page * limit));
    if (from) params.set('from', `${from}T00:00:00.000Z`);
    if (to) params.set('to', `${to}T23:59:59.999Z`);
    if (channel) params.set('channel', channel);
    if (status) params.set('status', status);
    if (recipient.trim()) params.set('recipient', recipient.trim());
    api
      .get<{ notifications: NotificationRow[]; total: number }>(`/api/blog/admin/notifications?${params.toString()}`)
      .then((res) => {
        setNotifications(res.notifications);
        setTotal(res.total);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user, page, from, to, channel, status, recipient]);

  useEffect(() => {
    if (user === undefined || user?.role !== 'superuser') return;
    fetchNotifications();
  }, [user, fetchNotifications]);

  const hasActiveFilters = from || to || channel || status || recipient.trim();
  const clearFilters = () => {
    setFrom('');
    setTo('');
    setChannel('');
    setStatus('');
    setRecipient('');
    setPage(0);
  };

  const channelLabel = (ch: string) => {
    if (ch === 'email') return t('notifications.channelEmail');
    if (ch === 'whatsapp') return t('notifications.channelWhatsapp');
    if (ch === 'telegram') return t('notifications.channelTelegram');
    return ch;
  };

  const statusLabel = (s: string) => {
    if (s === 'sent') return t('notifications.statusSent');
    if (s === 'failed') return t('notifications.statusFailed');
    return s;
  };

  const relatedLabel = (row: NotificationRow) => {
    if (!row.related_type) return '—';
    const id = row.related_id != null ? ` #${row.related_id}` : '';
    return `${row.related_type}${id}`;
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
        <h1 className="h4 mb-3">{t('notifications.title')}</h1>

        <div className="mb-3 p-3 rounded border border-secondary bg-dark">
          <div className="d-flex flex-wrap align-items-end gap-3">
            <Form.Group className="mb-0 d-flex flex-column">
              <Form.Label className="small mb-1">{t('notifications.fromDate')}</Form.Label>
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
              <Form.Label className="small mb-1">{t('notifications.toDate')}</Form.Label>
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
              <Form.Label className="small mb-1">{t('notifications.filterChannel')}</Form.Label>
              <Form.Select
                value={channel}
                onChange={(e) => {
                  setChannel(e.target.value);
                  setPage(0);
                }}
                className="bg-secondary text-light border-secondary"
              >
                <option value="">{t('payments.statusAll')}</option>
                <option value="email">{t('notifications.channelEmail')}</option>
                <option value="whatsapp">{t('notifications.channelWhatsapp')}</option>
                <option value="telegram">{t('notifications.channelTelegram')}</option>
              </Form.Select>
            </Form.Group>
            <Form.Group className="mb-0 d-flex flex-column">
              <Form.Label className="small mb-1">{t('notifications.filterStatus')}</Form.Label>
              <Form.Select
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value);
                  setPage(0);
                }}
                className="bg-secondary text-light border-secondary"
              >
                <option value="">{t('payments.statusAll')}</option>
                <option value="sent">{t('notifications.statusSent')}</option>
                <option value="failed">{t('notifications.statusFailed')}</option>
              </Form.Select>
            </Form.Group>
            <Form.Group className="mb-0 d-flex flex-column">
              <Form.Label className="small mb-1">{t('notifications.filterRecipient')}</Form.Label>
              <Form.Control
                type="text"
                value={recipient}
                onChange={(e) => {
                  setRecipient(e.target.value);
                  setPage(0);
                }}
                placeholder="email o número..."
                className="bg-secondary text-light border-secondary"
                style={{ minWidth: '160px' }}
              />
            </Form.Group>
            {hasActiveFilters && (
              <Button variant="info" size="sm" onClick={clearFilters} title={t('notifications.clearFilters')} aria-label={t('notifications.clearFilters')}>
                <IconBroom />
              </Button>
            )}
          </div>
        </div>

        {loading ? (
          <p className="text-muted">{t('common.loading')}</p>
        ) : notifications.length === 0 ? (
          <p className="text-muted">{t('notifications.noNotifications')}</p>
        ) : (
          <>
            <Table responsive size="sm" bordered className="mb-0">
              <thead>
                <tr>
                  <th>{t('notifications.sentAt')}</th>
                  <th>{t('notifications.channel')}</th>
                  <th>{t('notifications.recipient')}</th>
                  <th>{t('notifications.template')}</th>
                  <th>{t('notifications.related')}</th>
                  <th>{t('notifications.status')}</th>
                  <th>{t('notifications.error')}</th>
                </tr>
              </thead>
              <tbody>
                {notifications.map((row) => (
                  <tr key={row.id}>
                    <td className="small">{formatDateTime(row.sent_at, language)}</td>
                    <td className="text-center">
                      <NotificationChannel
                        channel={row.channel}
                        label={channelLabel(row.channel)}
                        iconInCircle
                        showLabel={false}
                      />
                    </td>
                    <td className="small text-break">{row.recipient}</td>
                    <td className="small">{row.subject_or_template ?? '—'}</td>
                    <td className="small">{relatedLabel(row)}</td>
                    <td className="text-center">
                      <NotificationStatus
                        status={row.status}
                        label={statusLabel(row.status)}
                        iconInCircle
                        showLabel={false}
                      />
                    </td>
                    <td className="small text-break" style={{ maxWidth: '200px' }}>
                      {row.error_message ? (
                        <span className="text-danger">{row.error_message}</span>
                      ) : (
                        <span className="fst-italic text-muted">{t('notifications.noErrors')}</span>
                      )}
                    </td>
                  </tr>
                ))}
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
