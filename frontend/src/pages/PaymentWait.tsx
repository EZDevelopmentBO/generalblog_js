import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useT, useLanguage } from '../utils/i18n';
import { formatDateTime } from '../utils/dateFormat';
import { api } from '../utils/api';
import { ResponsiveNavbar } from '../components/ResponsiveNavbar';
import { LanguageSelector } from '../components/LanguageSelector';
import { SiteBrand } from '../components/SiteBrand';
import { useCategoryMeta } from '../utils/useCategoryMeta';
import { setPostUnlockedInSession } from '../utils/downloadUnlockStorage';

const POLL_INTERVAL_MS = 3000;

interface LocationState {
  merchantTradeNo: string;
  checkoutUrl: string;
  qrcodeLink: string;
  sandbox?: boolean;
}

interface StatusResponse {
  status: string;
  downloadUrl?: string;
  expiresAt?: string;
  postId?: number;
  postSlug?: string;
  postCategory?: string;
  postLanguage?: string;
  download_file_is_image?: boolean;
}

export default function PaymentWait() {
  const location = useLocation();
  const navigate = useNavigate();
  const t = useT();
  const language = useLanguage();
  const { pathFor } = useCategoryMeta();
  const state = location.state as LocationState | null;
  const [pollStatus, setPollStatus] = useState<'PENDING' | 'PAID' | string>('PENDING');
  const [paidResult, setPaidResult] = useState<StatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [simulating, setSimulating] = useState(false);

  useEffect(() => {
    if (!state?.merchantTradeNo) {
      setError('Falta información de pago.');
      return;
    }
    const merchantTradeNo = state.merchantTradeNo;

    const poll = () => {
      api
        .get<StatusResponse>(
          `/api/payments/status?merchantTradeNo=${encodeURIComponent(merchantTradeNo)}`
        )
        .then((data) => {
          setPollStatus(data.status);
          if (data.status === 'PAID' && (data.downloadUrl || (data.download_file_is_image && data.postId && data.postSlug))) {
            if (data.download_file_is_image && data.postId && typeof sessionStorage !== 'undefined') {
              setPostUnlockedInSession(data.postId);
            }
            setPaidResult(data);
          }
        })
        .catch(() => setError(t('common.error')));
    };

    poll();
    const id = setInterval(poll, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [state?.merchantTradeNo, t]);

  if (!state?.merchantTradeNo) {
    return (
      <div className="min-vh-100 d-flex flex-column">
        <ResponsiveNavbar
          brand={<SiteBrand />}
        >
          <LanguageSelector />
          <Link className="btn btn-outline-light btn-sm" to="/">{t('common.back')}</Link>
        </ResponsiveNavbar>
        <main className="container py-5 flex-grow-1 d-flex align-items-center justify-content-center">
          <div className="text-center">
            <p className="text-warning">{error || t('paymentWait.invalidState')}</p>
            <Link className="btn btn-outline-primary" to="/">{t('common.back')}</Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-vh-100 d-flex flex-column">
      <ResponsiveNavbar
        brand={<SiteBrand />}
      >
        <LanguageSelector />
        <Link className="btn btn-outline-light btn-sm" to="/">{t('common.back')}</Link>
      </ResponsiveNavbar>
      <main className="container py-5 flex-grow-1 d-flex align-items-center justify-content-center">
        <div className="text-center" style={{ maxWidth: '420px' }}>
          {pollStatus === 'PAID' && paidResult ? (
            <>
              <h1 className="h4 mb-3">{t('paymentReturn.successTitle')}</h1>
              <p className="text-muted small mb-3">{t('paymentReturn.valid48h')}</p>
              <p className="text-info small mb-3">{t('paymentWait.saveLinkNoEmail')}</p>
              {paidResult.download_file_is_image && paidResult.postSlug ? (
                <button
                  type="button"
                  className="btn btn-primary btn-lg"
                  onClick={() => {
                    if (paidResult?.postId && paidResult?.postSlug && paidResult?.postCategory) {
                      if (typeof sessionStorage !== 'undefined') {
                        setPostUnlockedInSession(paidResult.postId);
                      }
                      const l = (paidResult.postLanguage ?? 'es') === 'en' ? 'en' : 'es';
                      const bp = l === 'es' ? '/noticias' : '/news';
                      navigate(`${bp}/${pathFor(paidResult.postCategory, l)}/${paidResult.postSlug}`);
                    }
                  }}
                >
                  {language === 'es' ? 'Ver contenido' : 'View content'}
                </button>
              ) : paidResult.downloadUrl ? (
                <a href={paidResult.downloadUrl} className="btn btn-primary btn-lg" target="_blank" rel="noopener noreferrer">
                  {t('paymentReturn.downloadButton')}
                </a>
              ) : null}
              {paidResult.expiresAt && (
                <p className="mt-3 small text-muted">
                  {t('blogAdmin.expiresAt')}: {formatDateTime(paidResult.expiresAt, language)}
                </p>
              )}
            </>
          ) : (
            <>
              <h1 className="h4 mb-3">{t('paymentWait.title')}</h1>
              <p className="text-muted small mb-3">{t('paymentWait.instruction')}</p>
              {state.qrcodeLink && (
                <div className="mb-3">
                  <img src={state.qrcodeLink} alt="QR Binance Pay" style={{ maxWidth: '220px', height: 'auto' }} />
                </div>
              )}
              {state.checkoutUrl && state.checkoutUrl !== '#' && (
                <a
                  href={state.checkoutUrl}
                  className="btn btn-warning mb-3"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t('paymentWait.openBinance')}
                </a>
              )}
              {state.sandbox && (
                <div className="mb-3">
                  <button
                    type="button"
                    className="btn btn-outline-success"
                    disabled={simulating}
                    onClick={async () => {
                      if (!state?.merchantTradeNo) return;
                      setSimulating(true);
                      try {
                        await api.get(
                          `/api/payments/status?merchantTradeNo=${encodeURIComponent(state.merchantTradeNo)}&simulate=paid`
                        );
                      } finally {
                        setSimulating(false);
                      }
                    }}
                  >
                    {simulating ? t('paymentWait.simulating') : t('paymentWait.simulatePay')}
                  </button>
                </div>
              )}
              {error && <p className="text-warning small">{error}</p>}
              <p className="small text-info mb-2">{t('paymentWait.emailNoticePending')}</p>
              <p className="small text-muted">{t('paymentWait.polling')}</p>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
