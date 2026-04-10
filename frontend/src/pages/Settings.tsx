import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { Form, Button, Card } from 'react-bootstrap';
import { useT } from '../utils/i18n';
import { api, getImageUrl, getUploadUrl } from '../utils/api';

interface SettingsSchema {
  download_token_hours?: { min: number; max: number; description: string };
  download_max_count?: { min: number; max: number; description: string };
}

interface PaymentCredentials {
  paypal: boolean;
  paypalMode: 'sandbox' | 'live';
  binancePay: boolean;
  binanceTransfer: boolean;
}

export default function Settings() {
  const t = useT();
  const [user, setUser] = useState<{ name: string; role: string } | null | undefined>(undefined);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [schema, setSchema] = useState<SettingsSchema>({});
  const [downloadTokenHours, setDownloadTokenHours] = useState<string>('48');
  const [downloadMaxCount, setDownloadMaxCount] = useState<string>('1');
  const [saving, setSaving] = useState(false);
  const [savingNotifications, setSavingNotifications] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState('587');
  const [smtpSecure, setSmtpSecure] = useState(false);
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPassNew, setSmtpPassNew] = useState('');
  const [smtpFrom, setSmtpFrom] = useState('');
  const [welcomeWithCouponEnabled, setWelcomeWithCouponEnabled] = useState(false);
  const [welcomeCampaignCodeId, setWelcomeCampaignCodeId] = useState('');
  const [campaignCodes, setCampaignCodes] = useState<{ id: number; code: string; campaign_slug: string | null }[]>([]);
  const [savingWelcome, setSavingWelcome] = useState(false);
  const [paymentCredentials, setPaymentCredentials] = useState<PaymentCredentials | null>(null);
  const [siteTitle, setSiteTitle] = useState('');
  const [siteSlogan, setSiteSlogan] = useState('');
  const [savingSiteTitleSlogan, setSavingSiteTitleSlogan] = useState(false);
  const [landingValueBgUrl, setLandingValueBgUrl] = useState('');
  const [uploadingLandingValueBg, setUploadingLandingValueBg] = useState(false);

  useEffect(() => {
    api
      .get<{ name: string; role: string }>('/auth/me')
      .then(setUser)
      .catch(() => setUser(null));
  }, []);

  useEffect(() => {
    if (user?.role !== 'superuser') {
      setLoading(false);
      return;
    }
    Promise.all([
      api.get<Record<string, string>>('/api/blog/admin/settings'),
      api.get<SettingsSchema>('/api/blog/admin/settings/schema'),
    ])
      .then(([settingsRes, schemaRes]) => {
        setSettings(settingsRes);
        setSchema(schemaRes);
        const h = settingsRes.download_token_hours ?? '48';
        setDownloadTokenHours(h);
        const c = settingsRes.download_max_count ?? '1';
        setDownloadMaxCount(c);
        setEmailEnabled(settingsRes.email_enabled === 'true' || settingsRes.email_enabled === '1');
        setSmtpHost(settingsRes.smtp_host ?? '');
        setSmtpPort(settingsRes.smtp_port ?? '587');
        setSmtpSecure(settingsRes.smtp_secure === 'true' || settingsRes.smtp_secure === '1');
        setSmtpUser(settingsRes.smtp_user ?? '');
        setSmtpFrom(settingsRes.smtp_from ?? '');
        setWelcomeWithCouponEnabled(settingsRes.welcome_with_coupon_enabled === 'true' || settingsRes.welcome_with_coupon_enabled === '1');
        setWelcomeCampaignCodeId(settingsRes.welcome_campaign_discount_code_id ?? '');
        setSiteTitle(settingsRes.site_title ?? '');
        setSiteSlogan(settingsRes.site_slogan ?? '');
        setLandingValueBgUrl(settingsRes.landing_value_bg_url ?? '');
      })
      .catch(() => setMessage({ type: 'error', text: t('settings.errorLoad') }))
      .finally(() => setLoading(false));
    api.get<{ discountCodes: { id: number; code: string; campaign_slug: string | null }[] }>('/api/blog/admin/discount-codes').then((r) => setCampaignCodes((r.discountCodes ?? []).filter((c) => c.campaign_slug))).catch(() => setCampaignCodes([]));
    api.get<PaymentCredentials>('/api/blog/admin/settings/payment-credentials').then(setPaymentCredentials).catch(() => setPaymentCredentials(null));
  }, [user]);

  if (user === undefined || loading) {
    return (
      <div className="container py-5">
        <p className="text-muted">{t('common.loading')}</p>
      </div>
    );
  }
  if (user === null || user.role !== 'superuser') {
    return <Navigate to={user === null ? '/' : '/app'} replace />;
  }

  const minH = schema.download_token_hours?.min ?? 1;
  const maxH = schema.download_token_hours?.max ?? 168;
  const minC = schema.download_max_count?.min ?? 1;
  const maxC = schema.download_max_count?.max ?? 100;

  const handleSaveSiteTitleSlogan = (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSiteTitleSlogan(true);
    setMessage(null);
    api
      .put<Record<string, string>>('/api/blog/admin/settings', {
        site_title: siteTitle.trim(),
        site_slogan: siteSlogan.trim(),
      })
      .then((updated) => {
        setSettings(updated);
        setSiteTitle(updated.site_title ?? '');
        setSiteSlogan(updated.site_slogan ?? '');
        setMessage({ type: 'success', text: t('settings.saved') });
      })
      .catch(() => setMessage({ type: 'error', text: t('settings.errorSave') }))
      .finally(() => setSavingSiteTitleSlogan(false));
  };

  const handleUploadLandingValueBg = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setMessage(null);
    setUploadingLandingValueBg(true);
    try {
      const formData = new FormData();
      formData.append('image', file);
      formData.append('slug', 'landing-value-bg');
      const res = await fetch(getUploadUrl(), { method: 'POST', body: formData, credentials: 'include' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || 'Upload failed');
      const url = (data as { url?: string }).url;
      if (!url) throw new Error('No URL returned');
      const updated = await api.put<Record<string, string>>('/api/blog/admin/settings', { landing_value_bg_url: url });
      setSettings(updated);
      setLandingValueBgUrl(updated.landing_value_bg_url ?? url);
      setMessage({ type: 'success', text: t('settings.saved') });
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : t('settings.errorSave') });
    } finally {
      setUploadingLandingValueBg(false);
      e.target.value = '';
    }
  };

  const handleRemoveLandingValueBg = () => {
    setMessage(null);
    api
      .put<Record<string, string>>('/api/blog/admin/settings', { landing_value_bg_url: '' })
      .then((updated) => {
        setSettings(updated);
        setLandingValueBgUrl(updated.landing_value_bg_url ?? '');
        setMessage({ type: 'success', text: t('settings.saved') });
      })
      .catch(() => setMessage({ type: 'error', text: t('settings.errorSave') }));
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const hours = Math.floor(Number(downloadTokenHours));
    const maxCount = Math.floor(Number(downloadMaxCount));
    if (!Number.isFinite(hours) || hours < minH || hours > maxH) {
      setMessage({ type: 'error', text: t('settings.invalidHours') });
      return;
    }
    if (!Number.isFinite(maxCount) || maxCount < minC || maxCount > maxC) {
      setMessage({ type: 'error', text: t('settings.invalidMaxCount') });
      return;
    }
    setSaving(true);
    setMessage(null);
    api
      .put<Record<string, string>>('/api/blog/admin/settings', {
        download_token_hours: hours,
        download_max_count: maxCount,
      })
      .then((updated) => {
        setSettings(updated);
        setDownloadTokenHours(updated.download_token_hours ?? String(hours));
        setDownloadMaxCount(updated.download_max_count ?? String(maxCount));
        setMessage({ type: 'success', text: t('settings.saved') });
      })
      .catch(() => setMessage({ type: 'error', text: t('settings.errorSave') }))
      .finally(() => setSaving(false));
  };

  const handleSaveWelcome = (e: React.FormEvent) => {
    e.preventDefault();
    setSavingWelcome(true);
    setMessage(null);
    api
      .put<Record<string, string>>('/api/blog/admin/settings', {
        welcome_with_coupon_enabled: welcomeWithCouponEnabled,
        welcome_campaign_discount_code_id: welcomeCampaignCodeId.trim() || '',
      })
      .then((updated) => {
        setSettings(updated);
        setWelcomeWithCouponEnabled(updated.welcome_with_coupon_enabled === 'true' || updated.welcome_with_coupon_enabled === '1');
        setWelcomeCampaignCodeId(updated.welcome_campaign_discount_code_id ?? '');
        setMessage({ type: 'success', text: t('settings.saved') });
      })
      .catch(() => setMessage({ type: 'error', text: t('settings.errorSave') }))
      .finally(() => setSavingWelcome(false));
  };

  const handleSaveNotifications = (e: React.FormEvent) => {
    e.preventDefault();
    setSavingNotifications(true);
    setMessage(null);
    const body: Record<string, unknown> = {
      email_enabled: emailEnabled,
      smtp_host: smtpHost.trim(),
      smtp_port: smtpPort.trim() || '587',
      smtp_secure: smtpSecure,
      smtp_user: smtpUser.trim(),
      smtp_from: smtpFrom.trim(),
    };
    if (smtpPassNew.trim()) body.smtp_pass = smtpPassNew;
    api
      .put<Record<string, string>>('/api/blog/admin/settings', body)
      .then((updated) => {
        setSettings(updated);
        setEmailEnabled(updated.email_enabled === 'true' || updated.email_enabled === '1');
        setSmtpHost(updated.smtp_host ?? '');
        setSmtpPort(updated.smtp_port ?? '587');
        setSmtpSecure(updated.smtp_secure === 'true' || updated.smtp_secure === '1');
        setSmtpUser(updated.smtp_user ?? '');
        setSmtpFrom(updated.smtp_from ?? '');
        setSmtpPassNew('');
        setMessage({ type: 'success', text: t('settings.saved') });
      })
      .catch(() => setMessage({ type: 'error', text: t('settings.errorSave') }))
      .finally(() => setSavingNotifications(false));
  };

  return (
    <main className="container py-4">
        <p className="mb-2">
          <Link to="/app" className="text-muted small">← {t('nav.backToPanel')}</Link>
        </p>
        <h1 className="h4 mb-4">{t('settings.title')}</h1>

        {message && (
          <div className={`alert alert-${message.type === 'success' ? 'success' : 'danger'} py-2`} role="alert">
            {message.text}
          </div>
        )}

        <Card className="border-secondary bg-dark text-light mb-4">
          <Card.Header className="border-secondary">{t('settings.siteTitleSloganCardTitle')}</Card.Header>
          <Card.Body>
            <Form onSubmit={handleSaveSiteTitleSlogan}>
              <Form.Group className="mb-3">
                <Form.Label>{t('settings.siteTitleLabel')}</Form.Label>
                <Form.Control
                  type="text"
                  value={siteTitle}
                  onChange={(e) => setSiteTitle(e.target.value)}
                  placeholder="Mi blog"
                  className="bg-secondary text-light border-secondary"
                />
                <Form.Text className="text-muted">{t('settings.siteTitleHint')}</Form.Text>
              </Form.Group>
              <Form.Group className="mb-3">
                <Form.Label>{t('settings.siteSloganLabel')}</Form.Label>
                <Form.Control
                  type="text"
                  value={siteSlogan}
                  onChange={(e) => setSiteSlogan(e.target.value)}
                  placeholder="Artículos, ideas y novedades"
                  className="bg-secondary text-light border-secondary"
                />
                <Form.Text className="text-muted">{t('settings.siteSloganHint')}</Form.Text>
              </Form.Group>
              <Button type="submit" variant="primary" disabled={savingSiteTitleSlogan}>
                {savingSiteTitleSlogan ? t('common.loading') : t('common.save')}
              </Button>
            </Form>
          </Card.Body>
        </Card>

        <Card className="border-secondary bg-dark text-light mb-4">
          <Card.Header className="border-secondary">{t('settings.landingValueBgCardTitle')}</Card.Header>
          <Card.Body>
            <p className="text-muted small mb-3">{t('settings.landingValueBgRecommendations')}</p>
            {landingValueBgUrl && (
              <div className="mb-3">
                <img
                  src={getImageUrl(landingValueBgUrl)}
                  alt="Fondo actual"
                  className="rounded border border-secondary"
                  style={{ maxWidth: '100%', maxHeight: 180, objectFit: 'cover' }}
                />
              </div>
            )}
            <div className="d-flex flex-wrap gap-2 align-items-center">
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={handleUploadLandingValueBg}
                className="d-none"
                id="landing-value-bg-input"
              />
              <Button
                variant="primary"
                size="sm"
                disabled={uploadingLandingValueBg}
                onClick={() => document.getElementById('landing-value-bg-input')?.click()}
              >
                {uploadingLandingValueBg ? t('common.loading') : t('settings.landingValueBgUpload')}
              </Button>
              {landingValueBgUrl && (
                <Button variant="outline-danger" size="sm" onClick={handleRemoveLandingValueBg}>
                  {t('settings.landingValueBgRemove')}
                </Button>
              )}
            </div>
          </Card.Body>
        </Card>

        <Card className="border-secondary bg-dark text-light">
          <Card.Body>
            <Form onSubmit={handleSave}>
              <Form.Group className="mb-3">
                <Form.Label>{t('settings.downloadTokenHoursLabel')}</Form.Label>
                <Form.Control
                  type="number"
                  min={minH}
                  max={maxH}
                  value={downloadTokenHours}
                  onChange={(e) => setDownloadTokenHours(e.target.value)}
                  className="bg-secondary text-light border-secondary"
                />
                <Form.Text className="text-muted">
                  {t('settings.downloadTokenHoursHint')} ({minH}–{maxH} {t('settings.hours')})
                </Form.Text>
              </Form.Group>
              <Form.Group className="mb-3">
                <Form.Label>{t('settings.downloadMaxCountLabel')}</Form.Label>
                <Form.Control
                  type="number"
                  min={minC}
                  max={maxC}
                  value={downloadMaxCount}
                  onChange={(e) => setDownloadMaxCount(e.target.value)}
                  className="bg-secondary text-light border-secondary"
                />
                <Form.Text className="text-muted">
                  {t('settings.downloadMaxCountHint')} ({minC}–{maxC} {t('settings.downloads')})
                </Form.Text>
              </Form.Group>
              <Button type="submit" variant="primary" disabled={saving}>
                {saving ? t('common.loading') : t('common.save')}
              </Button>
            </Form>
          </Card.Body>
        </Card>

        <Card className="border-secondary bg-dark text-light mt-4">
          <Card.Header className="border-secondary">{t('settings.paymentMethodsCardTitle')}</Card.Header>
          <Card.Body>
            <p className="text-muted small mb-3">{t('settings.paymentMethodsHint')}</p>
            <ul className="list-unstyled mb-0">
              <li className="d-flex align-items-center gap-2 mb-2">
                <span className="text-nowrap">PayPal</span>
                {paymentCredentials ? (
                  <>
                    {paymentCredentials.paypal ? (
                      <span className="badge bg-success">{t('settings.configured')} ({paymentCredentials.paypalMode === 'live' ? t('settings.modeLive') : t('settings.modeSandbox')})</span>
                    ) : (
                      <span className="badge bg-secondary">{t('settings.notConfigured')}</span>
                    )}
                  </>
                ) : (
                  <span className="text-muted">—</span>
                )}
              </li>
              <li className="d-flex align-items-center gap-2 mb-2">
                <span className="text-nowrap">Binance Pay</span>
                {paymentCredentials ? (
                  paymentCredentials.binancePay ? (
                    <span className="badge bg-success">{t('settings.configured')}</span>
                  ) : (
                    <span className="badge bg-secondary">{t('settings.notConfigured')}</span>
                  )
                ) : (
                  <span className="text-muted">—</span>
                )}
              </li>
              <li className="d-flex align-items-center gap-2">
                <span className="text-nowrap">{t('settings.binanceTransferLabel')}</span>
                {paymentCredentials ? (
                  paymentCredentials.binanceTransfer ? (
                    <span className="badge bg-success">{t('settings.configured')}</span>
                  ) : (
                    <span className="badge bg-secondary">{t('settings.notConfigured')}</span>
                  )
                ) : (
                  <span className="text-muted">—</span>
                )}
              </li>
            </ul>
          </Card.Body>
        </Card>

        <Card className="border-secondary bg-dark text-light mt-4">
          <Card.Header className="border-secondary">{t('settings.welcomeCardTitle')}</Card.Header>
          <Card.Body>
            <Form onSubmit={handleSaveWelcome}>
              <Form.Group className="mb-3">
                <Form.Check
                  type="switch"
                  id="welcome-with-coupon-enabled"
                  label={t('settings.welcomeWithCouponEnabled')}
                  checked={welcomeWithCouponEnabled}
                  onChange={(e) => setWelcomeWithCouponEnabled(e.target.checked)}
                />
                <Form.Text className="text-muted d-block">{t('settings.welcomeWithCouponHint')}</Form.Text>
              </Form.Group>
              {welcomeWithCouponEnabled && (
                <Form.Group className="mb-3">
                  <Form.Label>{t('settings.welcomeCampaignCoupon')}</Form.Label>
                  <Form.Select
                    value={welcomeCampaignCodeId}
                    onChange={(e) => setWelcomeCampaignCodeId(e.target.value)}
                    className="bg-secondary text-light border-secondary"
                  >
                    <option value="">{t('settings.welcomeCampaignCouponAny')}</option>
                    {campaignCodes.map((c) => (
                      <option key={c.id} value={c.id}>{c.code} (ref={c.campaign_slug})</option>
                    ))}
                  </Form.Select>
                  <Form.Text className="text-muted">{t('settings.welcomeCampaignCouponHint')}</Form.Text>
                </Form.Group>
              )}
              <Button type="submit" variant="primary" disabled={savingWelcome}>
                {savingWelcome ? t('common.loading') : t('common.save')}
              </Button>
            </Form>
          </Card.Body>
        </Card>

        <Card className="border-secondary bg-dark text-light mt-4">
          <Card.Header className="border-secondary">{t('settings.notifications')}</Card.Header>
          <Card.Body>
            <Form onSubmit={handleSaveNotifications}>
              <Form.Group className="mb-3">
                <Form.Check
                  type="switch"
                  id="email-enabled"
                  label={t('settings.emailEnabled')}
                  checked={emailEnabled}
                  onChange={(e) => setEmailEnabled(e.target.checked)}
                />
              </Form.Group>
              <Form.Group className="mb-2">
                <Form.Label>{t('settings.smtpHost')}</Form.Label>
                <Form.Control
                  type="text"
                  value={smtpHost}
                  onChange={(e) => setSmtpHost(e.target.value)}
                  placeholder="smtp.ejemplo.com"
                  className="bg-secondary text-light border-secondary"
                />
              </Form.Group>
              <div className="row g-2 mb-2">
                <div className="col-6">
                  <Form.Label>{t('settings.smtpPort')}</Form.Label>
                  <Form.Control
                    type="number"
                    value={smtpPort}
                    onChange={(e) => setSmtpPort(e.target.value)}
                    className="bg-secondary text-light border-secondary"
                  />
                </div>
                <div className="col-6 d-flex align-items-end mb-2">
                  <Form.Check
                    type="switch"
                    id="smtp-secure"
                    label={t('settings.smtpSecure')}
                    checked={smtpSecure}
                    onChange={(e) => setSmtpSecure(e.target.checked)}
                    className="text-light"
                  />
                </div>
              </div>
              <Form.Group className="mb-2">
                <Form.Label>{t('settings.smtpUser')}</Form.Label>
                <Form.Control
                  type="text"
                  value={smtpUser}
                  onChange={(e) => setSmtpUser(e.target.value)}
                  className="bg-secondary text-light border-secondary"
                  autoComplete="off"
                />
              </Form.Group>
              <Form.Group className="mb-2">
                <Form.Label>{t('settings.smtpPassword')}</Form.Label>
                <Form.Control
                  type="password"
                  value={smtpPassNew}
                  onChange={(e) => setSmtpPassNew(e.target.value)}
                  placeholder={settings.smtp_pass_set ? t('settings.smtpPasswordPlaceholder') : ''}
                  className="bg-secondary text-light border-secondary"
                  autoComplete="new-password"
                />
              </Form.Group>
              <Form.Group className="mb-3">
                <Form.Label>{t('settings.smtpFrom')}</Form.Label>
                <Form.Control
                  type="text"
                  value={smtpFrom}
                  onChange={(e) => setSmtpFrom(e.target.value)}
                  placeholder="noreply@tudominio.com"
                  className="bg-secondary text-light border-secondary"
                />
              </Form.Group>
              <p className="text-muted small mb-2">
                {t('settings.templatesInSeparatePage')}{' '}
                <Link to="/app/email-templates" className="text-info">{t('emailTemplates.title')}</Link>.
              </p>
              <Button type="submit" variant="primary" disabled={savingNotifications}>
                {savingNotifications ? t('common.loading') : t('settings.saveNotifications')}
              </Button>
            </Form>
            <p className="text-muted small mt-3 mb-0">{t('settings.whatsappTelegramComingSoon')}</p>
          </Card.Body>
        </Card>
    </main>
  );
}
