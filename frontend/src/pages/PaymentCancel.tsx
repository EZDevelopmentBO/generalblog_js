import { Link } from 'react-router-dom';
import { useT } from '../utils/i18n';
import { ResponsiveNavbar } from '../components/ResponsiveNavbar';
import { SiteBrand } from '../components/SiteBrand';
import { LanguageSelector } from '../components/LanguageSelector';

export default function PaymentCancel() {
  const t = useT();
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
          <h1 className="h4 mb-3">{t('paymentCancel.title')}</h1>
          <p className="text-muted">{t('paymentCancel.message')}</p>
          <Link className="btn btn-outline-primary" to="/">
            {t('common.back')}
          </Link>
        </div>
      </main>
    </div>
  );
}
