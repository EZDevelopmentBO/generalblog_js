import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
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
  reference: string;
  address: string;
  tag?: string;
  network: string;
  amount: string;
  amountBase?: number;
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

export default function PaymentTransfer() {
  const location = useLocation();
  const navigate = useNavigate();
  const t = useT();
  const language = useLanguage();
  const { pathFor } = useCategoryMeta();
  const state = location.state as LocationState | null;
  const [pollStatus, setPollStatus] = useState<'PENDING' | 'PAID' | string>('PENDING');
  const [paidResult, setPaidResult] = useState<StatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<'address' | 'amount' | null>(null);

  useEffect(() => {
    if (!state?.reference) return;
    const ref = state.reference;
    const poll = () => {
      api
        .get<StatusResponse>(
          `/api/payments/status?reference=${encodeURIComponent(ref)}`
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
  }, [state?.reference, t]);

  const copy = (value: string, key: 'address' | 'amount') => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    });
  };

  if (!state?.reference) {
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
            <p className="text-warning">{t('paymentWait.invalidState')}</p>
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
        <div className="text-center" style={{ maxWidth: '480px' }}>
          {pollStatus === 'PAID' && paidResult ? (
            <>
              <h1 className="h4 mb-3">{t('paymentReturn.successTitle')}</h1>
              <p className="text-muted small mb-3">{t('paymentReturn.valid48h')}</p>
              <p className="text-info small mb-3">{t('paymentTransfer.saveLinkNoEmail')}</p>
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
              <h1 className="h4 mb-3">{t('paymentTransfer.title')}</h1>
              <p className="text-muted small mb-3">{t('paymentTransfer.instruction')}</p>
              <div className="mb-3 d-flex flex-column align-items-center">
                <p className="small text-muted mb-2">{t('paymentTransfer.scanAddress')}</p>
                <div className="bg-white p-2 rounded">
                  <QRCodeSVG
                    value={state.address.trim()}
                    size={200}
                    level="M"
                    includeMargin
                  />
                </div>
                <p className="small text-muted mt-2 mb-0">{t('paymentTransfer.amountThenSend')}</p>
                <p className="small text-warning mt-1 mb-0">{t('paymentTransfer.qrOrCopy')}</p>
              </div>
              <div className="bg-dark rounded p-3 mb-3 text-start">
                <div className="mb-2">
                  <label className="small text-muted">{t('paymentTransfer.network')}</label>
                  <div className="d-flex align-items-center gap-2">
                    <code className="text-light flex-grow-1 text-break">{state.network}</code>
                  </div>
                  {(state.network === 'BEP20' || state.network === 'BSC') && (
                    <p className="small text-info mt-1 mb-0">{t('paymentTransfer.gasNoteBEP20')}</p>
                  )}
                  {(state.network === 'TRC20' || state.network === 'TRON' || state.network === 'TRX') && (
                    <p className="small text-info mt-1 mb-0">{t('paymentTransfer.gasNoteTRC20')}</p>
                  )}
                </div>
                {(state.amountBase != null && Number(state.amountBase) !== Number(state.amount)) && (
                <p className="small text-muted mb-2">
                  {t('paymentTransfer.priceIs')}{' '}
                  <strong>{Number(state.amountBase).toFixed(4).replace(/\.?0+$/, '')} USD</strong>.
                  {' '}{t('paymentTransfer.exactAmountIntro')}{' '}
                  <strong>{state.amount} USDT</strong>{' '}
                  {t('paymentTransfer.exactAmountWithDecimals')}{' '}
                  {t('paymentTransfer.exactAmountWarning')}
                </p>
                )}
                <div className="mb-2">
                  <label className="small text-muted">{t('paymentTransfer.amount')}</label>
                  <div className="d-flex align-items-center gap-2">
                    <code className="text-warning fs-5">{state.amount} USDT</code>
                    <button
                      type="button"
                      className="btn btn-outline-secondary btn-sm"
                      onClick={() => copy(state.amount, 'amount')}
                    >
                      {copied === 'amount' ? t('paymentTransfer.copied') : t('paymentTransfer.copy')}
                    </button>
                  </div>
                </div>
                <div className="mb-2">
                  <label className="small text-muted">{t('paymentTransfer.address')}</label>
                  <div className="d-flex align-items-center gap-2 flex-wrap">
                    <code className="text-light flex-grow-1 text-break small">{state.address}</code>
                    <button
                      type="button"
                      className="btn btn-outline-secondary btn-sm"
                      onClick={() => copy(state.address, 'address')}
                    >
                      {copied === 'address' ? t('paymentTransfer.copied') : t('paymentTransfer.copy')}
                    </button>
                  </div>
                </div>
                {state.tag && (
                  <div>
                    <label className="small text-muted">{t('paymentTransfer.tag')}</label>
                    <div><code className="text-light">{state.tag}</code></div>
                  </div>
                )}
              </div>
              {error && <p className="text-warning small">{error}</p>}
              <p className="small text-info mb-2">{t('paymentTransfer.emailNoticePending')}</p>
              <p className="small text-muted">{t('paymentWait.polling')}</p>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
