import { Link, useSearchParams } from 'react-router-dom';
import { useT, useLanguage } from '../utils/i18n';
import { ResponsiveNavbar } from '../components/ResponsiveNavbar';
import { LanguageSelector } from '../components/LanguageSelector';
import { SiteBrand } from '../components/SiteBrand';
import { useCategoryMeta } from '../utils/useCategoryMeta';

export default function DownloadError() {
  const t = useT();
  const [searchParams] = useSearchParams();
  const language = useLanguage();
  const { pathFor } = useCategoryMeta();
  const reason = searchParams.get('reason') ?? 'expired';
  const slug = searchParams.get('slug') ?? '';
  const category = searchParams.get('category') ?? '';

  const basePath = language === 'es' ? '/noticias' : '/news';
  const lang = language === 'en' ? 'en' : 'es';
  const categoryPath = category ? pathFor(category, lang) : '';
  const postUrl = slug && categoryPath ? `${basePath}/${categoryPath}/${slug}` : null;

  const isLimit = reason === 'limit';

  return (
    <div className="min-vh-100 d-flex flex-column bg-dark text-light">
      <ResponsiveNavbar brand={<SiteBrand />}>
        <LanguageSelector />
        <Link className="btn btn-outline-light btn-sm" to="/">
          {t('common.back')}
        </Link>
      </ResponsiveNavbar>
      <main className="container py-5 flex-grow-1 d-flex align-items-center justify-content-center">
        <div className="text-center" style={{ maxWidth: '520px' }}>
          <div className="display-4 mb-3" role="img" aria-hidden>
            {isLimit ? '😅' : '⏰'}
          </div>
          <h1 className="h4 mb-3 fw-bold">
            {isLimit ? t('downloadError.titleLimit') : t('downloadError.titleExpired')}
          </h1>
          <p className="text-secondary mb-4">
            {isLimit ? t('downloadError.messageLimit') : t('downloadError.messageExpired')}
          </p>
          <div className="d-flex flex-column flex-sm-row gap-2 justify-content-center">
            {postUrl && (
              <Link className="btn btn-primary" to={postUrl}>
                {t('downloadError.backToPost')}
              </Link>
            )}
            <Link className="btn btn-outline-light" to="/">
              {t('downloadError.backHome')}
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
