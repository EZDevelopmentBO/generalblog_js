import { useEffect, useState } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { useT, useLanguage } from '../utils/i18n';
import { formatDateTime } from '../utils/dateFormat';
import { api } from '../utils/api';
import { ResponsiveNavbar } from '../components/ResponsiveNavbar';
import { LanguageSelector } from '../components/LanguageSelector';
import { SiteBrand } from '../components/SiteBrand';
import { useCategoryMeta } from '../utils/useCategoryMeta';
import { setPostUnlockedInSession } from '../utils/downloadUnlockStorage';

interface CaptureResponse {
  status: string;
  downloadUrl?: string;
  expiresAt?: string;
  postId?: number;
  postSlug?: string;
  postCategory?: string;
  postLanguage?: string;
  download_file_is_image?: boolean;
}

export default function PaymentReturn() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const t = useT();
  const language = useLanguage();
  const { pathFor } = useCategoryMeta();
  const token = searchParams.get('token');
  const [state, setState] = useState<'loading' | 'success' | 'error'>('loading');
  const [result, setResult] = useState<CaptureResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token?.trim()) {
      setState('error');
      setError('Falta el token de la orden.');
      return;
    }
    api
      .post<CaptureResponse>('/api/payments/capture', {
        orderId: token.trim(),
      })
      .then((data) => {
        if (data.status === 'captured' && (data.downloadUrl || (data.download_file_is_image && data.postId && data.postSlug))) {
          if (data.download_file_is_image && data.postId && typeof sessionStorage !== 'undefined') {
            setPostUnlockedInSession(data.postId);
          }
          setResult(data);
          setState('success');
        } else {
          setState('error');
          setError('No se pudo completar la descarga.');
        }
      })
      .catch((e) => {
        setState('error');
        setError(e.message || 'Error al confirmar el pago.');
      });
  }, [token]);

  const goToContent = () => {
    if (!result?.postId || !result?.postSlug || !result?.postCategory) return;
    if (typeof sessionStorage !== 'undefined') {
      setPostUnlockedInSession(result.postId);
    }
    const l = (result.postLanguage ?? 'es') === 'en' ? 'en' : 'es';
    const basePath = l === 'es' ? '/noticias' : '/news';
    const path = pathFor(result.postCategory, l);
    navigate(`${basePath}/${path}/${result.postSlug}`);
  };

  return (
    <div className="min-vh-100 d-flex flex-column">
      <ResponsiveNavbar brand={<SiteBrand />}>
        <LanguageSelector />
        <Link className="btn btn-outline-light btn-sm" to="/">
          {t('common.back')}
        </Link>
      </ResponsiveNavbar>
      <main className="container py-5 flex-grow-1 d-flex align-items-center justify-content-center">
        <div className="text-center" style={{ maxWidth: '480px' }}>
          {state === 'loading' && (
            <p className="text-muted">{t('common.loading')}</p>
          )}
          {state === 'success' && result && (
            <>
              <h1 className="h4 mb-3">
                {t('paymentReturn.successTitle')}
              </h1>
              <p className="text-muted small mb-3">
                {t('paymentReturn.valid48h')}
              </p>
              <p className="text-info small mb-3">
                {t('paymentReturn.emailSentSession')}
              </p>
              {result.download_file_is_image && result.postSlug ? (
                <button
                  type="button"
                  className="btn btn-primary btn-lg"
                  onClick={goToContent}
                >
                  {language === 'es' ? 'Ver contenido' : 'View content'}
                </button>
              ) : result.downloadUrl ? (
                <a
                  href={result.downloadUrl}
                  className="btn btn-primary btn-lg"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t('paymentReturn.downloadButton')}
                </a>
              ) : null}
              {result.expiresAt && (
                <p className="mt-3 small text-muted">
                  {t('blogAdmin.expiresAt')}: {formatDateTime(result.expiresAt, language)}
                </p>
              )}
            </>
          )}
          {state === 'error' && (
            <>
              <h1 className="h4 mb-3 text-warning">
                {t('paymentReturn.errorTitle')}
              </h1>
              <p className="text-muted">{error}</p>
              <Link className="btn btn-outline-primary" to="/">
                {t('common.back')}
              </Link>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
