import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useT } from '../utils/i18n';
import { api } from '../utils/api';
import { CategoryIcon } from './CategoryIcon';
import type { BlogCategoryMeta } from '../types';

interface LandingCategoriesProps {
  language: string;
}

export function LandingCategories({ language }: LandingCategoriesProps) {
  const t = useT();
  const [categories, setCategories] = useState<BlogCategoryMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const basePath = language === 'es' ? '/noticias' : '/news';
  const lang = language === 'en' ? 'en' : 'es';

  useEffect(() => {
    api
      .get<{ categories: BlogCategoryMeta[] }>(`/api/blog/categories?language=${language}`)
      .then((res) => setCategories(res.categories.filter((c) => c.count > 0)))
      .catch(() => setCategories([]))
      .finally(() => setLoading(false));
  }, [language]);

  if (loading || categories.length === 0) return null;

  return (
    <section className="landing-categories" aria-label={t('landing.categoriesTitle')}>
      <div className="container">
        <h2 className="landing-categories__title">{t('landing.categoriesTitle')}</h2>
        <p className="landing-categories__sub">{t('landing.categoriesSub')}</p>
        <div className="landing-categories__grid">
          {categories.map((row) => {
            const path = lang === 'en' ? row.path_en : row.path_es;
            const href = `${basePath}/${path}`;
            const label = lang === 'en' ? row.label_en : row.label_es;
            const countText = t('landing.articlesCount').replace('{{count}}', String(row.count));
            return (
              <Link
                key={row.slug}
                to={href}
                className={`landing-categories__card landing-categories__card--${row.slug}`}
              >
                <CategoryIcon category={row.slug} className="landing-categories__icon" size={44} />
                <span className="landing-categories__name">{label}</span>
                <span className="landing-categories__count">{countText}</span>
                <span className="landing-categories__action">{t('landing.viewMore')} →</span>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
