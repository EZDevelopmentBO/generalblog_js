import { Link } from 'react-router-dom';
import { useLanguageContext } from '../utils/i18n';
import { api, getImageUrl } from '../utils/api';
import { useEffect, useState } from 'react';
import { SectionCarousel } from '../components/SectionCarousel';
import { useCategoryMeta } from '../utils/useCategoryMeta';
import { YouMayLike } from '../components/YouMayLike';
import { LandingCategories } from '../components/LandingCategories';
import { ResponsiveNavbar } from '../components/ResponsiveNavbar';
import { LanguageSelector } from '../components/LanguageSelector';
import { NavLogoutButton } from '../components/NavLogoutButton';
import { NavLoginButton } from '../components/NavLoginButton';
import { SiteBrand } from '../components/SiteBrand';
import { useSiteConfig } from '../contexts/SiteConfig';
import type { BlogPostPublic } from '../types';

export default function Landing() {
  const { t, language } = useLanguageContext();
  const { categories: categoryRows, pathFor, labelFor } = useCategoryMeta();
  const { site_title, site_slogan, landing_value_bg_url } = useSiteConfig();
  const [user, setUser] = useState<{ name: string; role: string } | null>(null);
  const [featuredPost, setFeaturedPost] = useState<BlogPostPublic | null>(null);

  useEffect(() => {
    api.get<{ id: number; name: string; role: string }>('/auth/me').catch(() => null).then((me) => {
      setUser(me ?? null);
    });
  }, []);

  useEffect(() => {
    api
      .get<{ posts: BlogPostPublic[] }>(`/api/blog/posts?language=${language}&limit=1&order=published_at`)
      .then((res) => setFeaturedPost(res.posts[0] ?? null))
      .catch(() => setFeaturedPost(null));
  }, [language]);

  useEffect(() => {
    document.title = site_title || (language === 'es' ? 'Mi blog' : 'My blog');
    let desc = document.querySelector('meta[name="description"]');
    if (!desc) {
      desc = document.createElement('meta');
      desc.setAttribute('name', 'description');
      document.head.appendChild(desc);
    }
    desc.setAttribute(
      'content',
      site_slogan ||
        (language === 'es'
          ? 'Artículos, ideas y novedades. Personaliza este texto en Configuración.'
          : 'Articles, ideas and updates. Customize this in Settings.')
    );
    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) ogTitle.setAttribute('content', document.title);
    const ogDesc = document.querySelector('meta[property="og:description"]');
    if (ogDesc) ogDesc.setAttribute('content', desc.getAttribute('content') || '');
    const ogImage = document.querySelector('meta[property="og:image"]');
    if (ogImage) ogImage.remove();
  }, [language, site_title, site_slogan]);

  const hasGoogleAuth = true;

  return (
    <div className="min-vh-100 d-flex flex-column landing-page">
      <ResponsiveNavbar brand={<SiteBrand />}>
        <LanguageSelector />
        {user ? (
          <>
            <Link className="btn btn-outline-light btn-sm" to="/app">
              {t('nav.app')}
            </Link>
            <NavLogoutButton />
          </>
        ) : hasGoogleAuth ? (
          <NavLoginButton />
        ) : null}
      </ResponsiveNavbar>

      <main className="flex-grow-1">
        {/* Hero */}
        <section className="landing-hero" aria-label="Presentación">
          <div className="landing-hero-bg" aria-hidden="true" />
          <div className="container landing-hero-content">
            <h1 className="landing-hero-title">{site_title}</h1>
            <p className="landing-hero-subtitle">{site_slogan}</p>
            <p className="landing-hero-topics">{t('landing.heroTopics')}</p>
            <div className="landing-hero-ctas">
              <Link className="landing-hero-cta" to={language === 'es' ? '/noticias' : '/news'}>
                {t('landing.heroCtaPrimary')}
              </Link>
              <Link className="landing-hero-cta landing-hero-cta--secondary" to={language === 'es' ? '/noticias' : '/news'}>
                {t('landing.heroCtaSecondary')}
              </Link>
            </div>
          </div>
        </section>

        {/* Te puede interesar (random) */}
        <div className="container container--sections">
          <YouMayLike language={language} limit={6} />
        </div>

        {/* Bloque de valor: qué aportamos y cómo aprovecharlo */}
        <section
          className={`landing-value ${landing_value_bg_url ? 'landing-value--has-bg' : ''}`}
          aria-label={t('landing.valueHeadline')}
          style={landing_value_bg_url ? { ['--landing-value-bg-url' as string]: `url(${getImageUrl(landing_value_bg_url)})` } : undefined}
        >
          <div className="container">
            <h2 className="landing-value__headline">{t('landing.valueHeadline')}</h2>
            <p className="landing-value__lead">{t('landing.valueLead')}</p>
            <div className="landing-value__grid">
              <div className="landing-value__card">
                <h3 className="landing-value__card-title">{t('landing.value1Title')}</h3>
                <p className="landing-value__card-text">{t('landing.value1Text')}</p>
              </div>
              <div className="landing-value__card">
                <h3 className="landing-value__card-title">{t('landing.value2Title')}</h3>
                <p className="landing-value__card-text">{t('landing.value2Text')}</p>
              </div>
              <div className="landing-value__card">
                <h3 className="landing-value__card-title">{t('landing.value3Title')}</h3>
                <p className="landing-value__card-text">{t('landing.value3Text')}</p>
              </div>
            </div>
            <div className="landing-value__cta-wrap">
              <Link className="landing-hero-cta" to={language === 'es' ? '/noticias' : '/news'}>
                {t('landing.valueCta')}
              </Link>
            </div>
          </div>
        </section>

        {/* Categorías dinámicas (desde BD) con iconos */}
        <LandingCategories language={language} />

        {/* Destacado: última noticia — enganche para seguir leyendo */}
        {featuredPost && (
          <section className="landing-featured" aria-label={t('landing.featured')}>
            <div className="container">
              <h2 className="landing-featured__label">{t('landing.featured')}</h2>
              <Link
                to={`${language === 'es' ? '/noticias' : '/news'}/${pathFor(featuredPost.category, language === 'en' ? 'en' : 'es')}/${featuredPost.slug}`}
                className="landing-featured__card"
              >
                <div className="landing-featured__img-wrap">
                  {featuredPost.featured_image ? (
                    <img src={getImageUrl(featuredPost.featured_image)} alt="" className="landing-featured__img" />
                  ) : (
                    <div className="landing-featured__img-placeholder" />
                  )}
                  <span className="landing-featured__category">{labelFor(featuredPost.category, language === 'en' ? 'en' : 'es')}</span>
                </div>
                <div className="landing-featured__body">
                  <h3 className="landing-featured__title">{featuredPost.title}</h3>
                  {featuredPost.excerpt && <p className="landing-featured__excerpt">{featuredPost.excerpt}</p>}
                  <span className="landing-featured__link">{t('landing.readMore')} →</span>
                </div>
              </Link>
            </div>
          </section>
        )}

        {/* Intro a las secciones + carruseles */}
        <div className="container container--sections">
          <div className="landing-section-intro">
            <h2 className="landing-section-intro__title">{t('landing.sectionIntro')}</h2>
            <p className="landing-section-intro__sub">{t('landing.sectionIntroSub')}</p>
          </div>
          {categoryRows.map((c) => (
            <SectionCarousel key={c.slug} categorySlug={c.slug} language={language} limit={10} />
          ))}
        </div>
      </main>
    </div>
  );
}
