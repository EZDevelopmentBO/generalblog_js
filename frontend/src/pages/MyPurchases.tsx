import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useT, useLanguage } from '../utils/i18n';
import { formatDateTime } from '../utils/dateFormat';
import { api } from '../utils/api';
import { useAppUser } from '../components/AppLayout';
import { IconLink, IconMail, IconDownload, IconCopy } from '../components/TableIcons';
import { PaymentProvider } from '../components/PaymentProvider';
import { useCategoryMeta } from '../utils/useCategoryMeta';
import { setPostUnlockedInSession } from '../utils/downloadUnlockStorage';

interface Purchase {
  id: number;
  post_id: number;
  post_title: string | null;
  post_slug: string | null;
  post_category: string | null;
  provider: string;
  amount_usd: number;
  status: string;
  captured_at: string | null;
  created_at: string;
}

interface LinkResult {
  paymentId: number;
  downloadUrl: string;
  expiresAt: string;
  postId?: number;
  postSlug?: string;
  postCategory?: string;
  postLanguage?: string;
  download_file_is_image?: boolean;
}

export default function MyPurchases() {
  const t = useT();
  const language = useLanguage();
  const navigate = useNavigate();
  const user = useAppUser();
  const { pathFor } = useCategoryMeta();

  function purchasePostHref(p: Purchase): string {
    const basePath = language === 'es' ? '/noticias' : '/news';
    if (!p.post_slug || !p.post_category) return basePath;
    const lang = language === 'en' ? 'en' : 'es';
    return `${basePath}/${pathFor(p.post_category, lang)}/${p.post_slug}`;
  }
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [linkForPaymentId, setLinkForPaymentId] = useState<number | null>(null);
  const [linkResult, setLinkResult] = useState<LinkResult | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [sendingEmail, setSendingEmail] = useState(false);

  useEffect(() => {
    if (!user) return;
    api
      .get<{ purchases: Purchase[] }>('/api/me/purchases')
      .then((data) => setPurchases(data.purchases))
      .catch(() => setPurchases([]))
      .finally(() => setLoading(false));
  }, [user]);

  async function getDownloadLink(paymentId: number, sendEmail: boolean) {
    setLinkForPaymentId(paymentId);
    setLinkError(null);
    setLinkResult(null);
    setSendingEmail(sendEmail);
    try {
      const data = await api.post<LinkResult>('/api/me/download-link', {
        paymentId,
        sendEmail,
      });
      setLinkResult({
        paymentId,
        downloadUrl: data.downloadUrl,
        expiresAt: data.expiresAt,
        postId: data.postId,
        postSlug: data.postSlug,
        postCategory: data.postCategory,
        postLanguage: data.postLanguage,
        download_file_is_image: data.download_file_is_image,
      });
    } catch (e) {
      setLinkError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setLinkForPaymentId(null);
      setSendingEmail(false);
    }
  }

  function copyLink(url: string) {
    navigator.clipboard.writeText(url).then(() => {
      // Opcional: toast "Copiado"
    });
  }

  if (!user) return null;

  return (
    <main className="container py-5">
        <p className="mb-2">
          <Link to="/app" className="text-muted small">← {t('nav.backToPanel')}</Link>
        </p>
        <h1 className="h3 mb-4">{t('myPurchases.title')}</h1>
        <p className="text-muted mb-4">{t('myPurchases.intro')}</p>

        {linkError && (
          <div className="alert alert-danger" role="alert">
            {linkError}
          </div>
        )}

        {loading ? (
          <p className="text-muted">{t('common.loading')}</p>
        ) : purchases.length === 0 ? (
          <div className="alert alert-info">
            {t('myPurchases.noPurchases')}
            <div className="mt-2">
              <Link to="/noticias" className="btn btn-outline-primary btn-sm">
                {t('nav.allNews')}
              </Link>
            </div>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="table table-hover">
              <thead>
                <tr>
                  <th>{t('myPurchases.post')}</th>
                  <th>{t('payments.date')}</th>
                  <th>{t('payments.provider')}</th>
                  <th>{t('payments.amount')}</th>
                  <th>{t('payments.status')}</th>
                  <th>{t('payments.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {purchases.map((p) => (
                  <tr key={p.id}>
                    <td>
                      {p.post_slug ? (
                        <Link to={purchasePostHref(p)} className="text-decoration-none">
                          {p.post_title || `#${p.post_id}`}
                        </Link>
                      ) : (
                        p.post_title || `#${p.post_id}`
                      )}
                    </td>
                    <td>{formatDateTime(p.created_at, language)}</td>
                    <td>
                      <PaymentProvider
                        provider={p.provider}
                        label={
                          p.provider === 'paypal'
                            ? t('payments.providerPayPal')
                            : p.provider === 'binance_pay'
                              ? t('payments.providerBinancePay')
                              : t('blogAdmin.paymentMethodTransferUSDT')
                        }
                      />
                    </td>
                    <td>${Number(p.amount_usd).toFixed(2)}</td>
                    <td>
                      <span
                        className={`badge ${
                          p.status === 'captured'
                            ? 'bg-success'
                            : p.status === 'pending'
                              ? 'bg-warning text-dark'
                              : 'bg-secondary'
                        }`}
                      >
                        {p.status === 'captured'
                          ? t('myPurchases.statusCaptured')
                          : p.status === 'pending'
                            ? t('myPurchases.statusPending')
                            : p.status}
                      </span>
                    </td>
                    <td>
                      {p.status === 'captured' && (
                        <div className="d-flex flex-wrap gap-1 align-items-center">
                          {linkResult?.paymentId === p.id ? (
                            <div className="d-flex flex-column gap-1">
                              {linkResult.download_file_is_image && linkResult.postSlug && linkResult.postCategory ? (
                                <button
                                  type="button"
                                  className="btn btn-success btn-sm"
                                  title={language === 'es' ? 'Ver contenido' : 'View content'}
                                  onClick={() => {
                                    if (linkResult?.postId && linkResult?.postSlug && linkResult?.postCategory) {
                                      if (typeof sessionStorage !== 'undefined') {
                                        setPostUnlockedInSession(linkResult.postId);
                                      }
                                      const l = (linkResult.postLanguage ?? language) === 'en' ? 'en' : 'es';
                                      const bp = l === 'es' ? '/noticias' : '/news';
                                      navigate(`${bp}/${pathFor(linkResult.postCategory, l)}/${linkResult.postSlug}`);
                                    }
                                  }}
                                >
                                  {language === 'es' ? 'Ver contenido' : 'View content'}
                                </button>
                              ) : (
                                <>
                                  <a
                                    href={linkResult.downloadUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="btn btn-success btn-sm"
                                    title={t('myPurchases.download')}
                                  >
                                    <IconDownload />
                                  </a>
                                  <button
                                    type="button"
                                    className="btn btn-secondary btn-sm"
                                    onClick={() => copyLink(linkResult.downloadUrl)}
                                    title={t('myPurchases.copyLink')}
                                  >
                                    <IconCopy />
                                  </button>
                                </>
                              )}
                              <small className="text-muted">
                                {t('blogAdmin.expiresAt')}: {formatDateTime(linkResult.expiresAt, language)}
                              </small>
                            </div>
                          ) : (
                            <>
                              <button
                                type="button"
                                className="btn btn-primary btn-sm"
                                disabled={linkForPaymentId !== null}
                                onClick={() => getDownloadLink(p.id, false)}
                                title={t('myPurchases.getLink')}
                              >
                                {linkForPaymentId === p.id ? <span className="small">…</span> : <IconLink />}
                              </button>
                              <button
                                type="button"
                                className="btn btn-info btn-sm"
                                disabled={linkForPaymentId !== null || sendingEmail}
                                onClick={() => getDownloadLink(p.id, true)}
                                title={t('myPurchases.getLinkAndEmail')}
                              >
                                {sendingEmail && linkForPaymentId === p.id ? <span className="small">…</span> : <IconMail />}
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
  );
}
