import { Link, useSearchParams, useParams, useLocation, useNavigate } from 'react-router-dom';
import { useT, useLanguage } from '../utils/i18n';
import { api } from '../utils/api';
import type { BlogPostPublic } from '../types';
import { PostCard } from '../components/PostCard';
import { useCategoryMeta } from '../utils/useCategoryMeta';
import { ResponsiveNavbar } from '../components/ResponsiveNavbar';
import { LanguageSelector } from '../components/LanguageSelector';
import { SiteBrand } from '../components/SiteBrand';
import { useEffect, useState } from 'react';
const LIMIT = 12;

export default function AllNews() {
  const t = useT();
  const language = useLanguage();
  const navigate = useNavigate();
  const { categories: categoryRows, slugFromPath, pathFor, labelFor } = useCategoryMeta();
  const { categoryPath: categoryPathParam } = useParams<{ categoryPath?: string }>();
  const location = useLocation();
  const isEs = location.pathname.startsWith('/noticias');
  const langUi = language === 'en' ? 'en' : 'es';
  const categoryFromUrl = categoryPathParam ? slugFromPath(categoryPathParam, isEs ? 'es' : 'en') : undefined;

  const [searchParams, setSearchParams] = useSearchParams();
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
  const categoryFromQuery = searchParams.get('category')?.trim() || undefined;
  const category = categoryFromUrl ?? categoryFromQuery;

  const [data, setData] = useState<{ posts: BlogPostPublic[]; total: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const offset = (page - 1) * LIMIT;
    api
      .get<{ posts: BlogPostPublic[]; total: number }>(
        `/api/blog/posts?language=${language}&limit=${LIMIT}&offset=${offset}${category ? `&category=${category}` : ''}`
      )
      .then(setData)
      .finally(() => setLoading(false));
  }, [language, page, category]);

  useEffect(() => {
    const catLabel = category ? labelFor(category, langUi) : '';
    const title = category
      ? (language === 'es' ? `${catLabel} — Noticias` : `${catLabel} — News`)
      : (language === 'es' ? 'Noticias — Mi blog' : 'News — My blog');
    document.title = title;
    let desc = document.querySelector('meta[name="description"]');
    if (!desc) {
      desc = document.createElement('meta');
      desc.setAttribute('name', 'description');
      document.head.appendChild(desc);
    }
    desc.setAttribute('content', language === 'es' ? 'Últimas noticias y análisis por categoría: criptomonedas, metales, acciones, forex.' : 'Latest news and analysis by category: crypto, metals, stocks, forex.');
    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) ogTitle.setAttribute('content', title);
    const ogDesc = document.querySelector('meta[property="og:description"]');
    if (ogDesc) ogDesc.setAttribute('content', desc.getAttribute('content') || '');
    const ogImage = document.querySelector('meta[property="og:image"]');
    if (ogImage) ogImage.remove();
  }, [language, category, t, labelFor, langUi]);

  const totalPages = data ? Math.ceil(data.total / LIMIT) : 0;
  const basePath = language === 'es' ? '/noticias' : '/news';

  const handleCategoryChange = (cat: string | '') => {
    if (cat === '') {
      navigate(basePath);
    } else {
      const path = pathFor(cat, langUi);
      navigate(`${basePath}/${path}`);
    }
  };

  return (
    <div className="page-all-news min-vh-100 d-flex flex-column">
      <ResponsiveNavbar brand={<SiteBrand />}>
        <LanguageSelector />
        <Link className="btn btn-outline-light btn-sm" to="/">
          {t('common.back')}
        </Link>
      </ResponsiveNavbar>

      <main className="container py-5 flex-grow-1">
        {category ? (
          <header className="category-header mb-4">
            <h1 className="category-header__title">{labelFor(category, langUi)}</h1>
            <p className="category-header__intro">
              {(() => {
                const introKey = `categoryIntro.${category}`;
                const introTrans = t(introKey);
                if (introTrans !== introKey) return introTrans;
                return language === 'es'
                  ? 'Artículos y análisis en esta categoría.'
                  : 'Articles and analysis in this category.';
              })()}
            </p>
            <Link to={basePath} className="category-header__back">
              ← {t('allNews.allCategories')}
            </Link>
          </header>
        ) : (
          <h1 className="h2 mb-4">{t('allNews.title')}</h1>
        )}

        <div className="mb-4">
          <label className="form-label">{t('allNews.filterByCategory')}</label>
          <select
            className="form-select form-select-sm w-auto bg-dark text-light border-secondary"
            value={category ?? ''}
            onChange={(e) => {
              const v = e.target.value;
              handleCategoryChange(v);
            }}
          >
            <option value="">{t('allNews.allCategories')}</option>
            {categoryRows.map((c) => (
              <option key={c.slug} value={c.slug}>
                {langUi === 'en' ? c.label_en : c.label_es}
              </option>
            ))}
          </select>
        </div>

        {loading ? (
          <p className="text-muted">{t('common.loading')}</p>
        ) : !data || data.posts.length === 0 ? (
          <p className="text-muted">{t('allNews.noPosts')}</p>
        ) : (
          <>
            <div className="row g-4">
              {data.posts.map((post) => (
                <div key={post.id} className="col-md-6 col-lg-4">
                  <PostCard post={post} language={language} basePath={basePath} />
                </div>
              ))}
            </div>
            {totalPages > 1 && (
              <nav className="d-flex justify-content-center gap-2 mt-4">
                <button
                  className="btn btn-outline-secondary btn-sm"
                  disabled={page <= 1}
                  onClick={() => setSearchParams({ ...Object.fromEntries(searchParams), page: String(page - 1) })}
                >
                  {t('allNews.prev')}
                </button>
                <span className="align-self-center small">
                  {t('allNews.page')} {page} / {totalPages}
                </span>
                <button
                  className="btn btn-outline-secondary btn-sm"
                  disabled={page >= totalPages}
                  onClick={() => setSearchParams({ ...Object.fromEntries(searchParams), page: String(page + 1) })}
                >
                  {t('allNews.next')}
                </button>
              </nav>
            )}
          </>
        )}
      </main>
    </div>
  );
}
