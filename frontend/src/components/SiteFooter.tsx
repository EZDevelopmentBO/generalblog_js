import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useT, useLanguage } from '../utils/i18n';
import { api } from '../utils/api';
import { NavLoginButton } from './NavLoginButton';
import { useSiteConfig } from '../contexts/SiteConfig';

const SEP = '|';

/**
 * Pie de página general del sitio: landing, noticias, panel de app y resto de páginas.
 */
export function SiteFooter() {
  const t = useT();
  const language = useLanguage();
  const { site_title, site_slogan } = useSiteConfig();
  const [user, setUser] = useState<{ name: string; role: string } | null | undefined>(undefined);

  useEffect(() => {
    api
      .get<{ name: string; role: string }>('/auth/me')
      .then((me) => setUser(me))
      .catch(() => setUser(null));
  }, []);

  const newsPath = language === 'es' ? '/noticias' : '/news';

  return (
    <footer className="site-footer" role="contentinfo">
      <div className="container">
        <div className="site-footer__brand">
          {site_title} <span>— {site_slogan}</span>
        </div>
        <div className="site-footer__links">
          <Link to="/">{t('landing.footerHome')}</Link>
          <span className="site-footer__sep">{SEP}</span>
          <Link to={newsPath}>{t('landing.footerNews')}</Link>
          {user === null && (
            <>
              <span className="site-footer__sep">{SEP}</span>
              <NavLoginButton />
            </>
          )}
        </div>
      </div>
    </footer>
  );
}
