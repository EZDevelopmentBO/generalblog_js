import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { ResponsiveNavbar } from '../components/ResponsiveNavbar';
import { LanguageSelector } from '../components/LanguageSelector';
import { SiteBrand } from '../components/SiteBrand';
import { NavLoginButton } from '../components/NavLoginButton';
import { NavLogoutButton } from '../components/NavLogoutButton';
import { useT } from '../utils/i18n';
import { api } from '../utils/api';
import { useSiteConfig } from '../contexts/SiteConfig';

interface SitePagePayload {
  id: number;
  slug: string;
  language: string;
  title: string;
  body_html: string;
  meta_title: string | null;
  meta_description: string | null;
}

export default function SitePageView() {
  const { slug } = useParams<{ slug: string }>();
  const location = useLocation();
  const t = useT();
  const { site_title } = useSiteConfig();
  const language = location.pathname.startsWith('/pages/') ? 'en' : 'es';
  const [page, setPage] = useState<SitePagePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<{ name: string } | null>(null);

  useEffect(() => {
    api.get<{ name: string }>('/auth/me').then(setUser).catch(() => setUser(null));
  }, []);

  useEffect(() => {
    if (!slug) {
      setError('Not found');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    api
      .get<{ page: SitePagePayload }>(
        `/api/blog/static-pages/${encodeURIComponent(slug)}?language=${language}`
      )
      .then((res) => {
        setPage(res.page);
        const title = res.page.meta_title?.trim() || res.page.title;
        document.title = title ? `${title} — ${site_title || 'Blog'}` : site_title || '';
        let desc = document.querySelector('meta[name="description"]');
        if (!desc) {
          desc = document.createElement('meta');
          desc.setAttribute('name', 'description');
          document.head.appendChild(desc);
        }
        desc.setAttribute('content', res.page.meta_description?.trim() || res.page.title);
      })
      .catch(() => {
        setPage(null);
        setError('notFound');
      })
      .finally(() => setLoading(false));
  }, [slug, language, site_title]);

  const homeLink = language === 'es' ? '/' : '/';

  return (
    <div className="min-vh-100 d-flex flex-column">
      <ResponsiveNavbar brand={<SiteBrand />}>
        <LanguageSelector />
        {user ? (
          <>
            <Link className="btn btn-outline-light btn-sm" to="/app">
              {t('nav.app')}
            </Link>
            <NavLogoutButton />
          </>
        ) : (
          <NavLoginButton />
        )}
      </ResponsiveNavbar>

      <main className="container py-4 flex-grow-1">
        {loading && <p className="text-muted">{t('common.loading')}</p>}
        {error && !loading && (
          <div>
            <p className="text-danger">{t('sitePage.notFound')}</p>
            <Link to={homeLink}>{t('sitePage.backHome')}</Link>
          </div>
        )}
        {page && !loading && (
          <article className="site-page-content">
            <h1 className="mb-4">{page.title}</h1>
            <div
              className="site-page-body"
              dangerouslySetInnerHTML={{ __html: page.body_html }}
            />
          </article>
        )}
      </main>
    </div>
  );
}
