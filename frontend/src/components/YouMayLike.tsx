import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useT } from '../utils/i18n';
import { api, getImageUrl } from '../utils/api';
import type { BlogPostPublic } from '../types';
import { useCategoryMeta } from '../utils/useCategoryMeta';

interface YouMayLikeProps {
  language: string;
  limit?: number;
}

export function YouMayLike({ language, limit = 6 }: YouMayLikeProps) {
  const t = useT();
  const { pathFor } = useCategoryMeta();
  const [posts, setPosts] = useState<BlogPostPublic[]>([]);
  const [loading, setLoading] = useState(true);
  const basePath = language === 'es' ? '/noticias' : '/news';

  useEffect(() => {
    api
      .get<{ posts: BlogPostPublic[] }>(
        `/api/blog/posts?language=${language}&limit=${limit}&order=random`
      )
      .then((res) => setPosts(res.posts))
      .catch(() => setPosts([]))
      .finally(() => setLoading(false));
  }, [language, limit]);

  if (loading) {
    return (
      <section className="landing-section you-may-like">
        <h2 className="section-title section-title--center">{t('landing.youMayLike')}</h2>
        <p className="section-subtitle section-subtitle--center">{t('landing.youMayLikeSub')}</p>
        <div className="row g-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="col-6 col-md-4 col-lg-2">
              <div className="skeleton you-may-like-skeleton" />
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (posts.length === 0) return null;

  return (
    <section className="landing-section you-may-like" aria-label={t('landing.youMayLike')}>
      <h2 className="section-title section-title--center">{t('landing.youMayLike')}</h2>
      <p className="section-subtitle section-subtitle--center">{t('landing.youMayLikeSub')}</p>
      <div className="row g-4">
        {posts.map((post) => {
          const lang = language === 'en' ? 'en' : 'es';
          const categoryPath = pathFor(post.category, lang);
          const href = `${basePath}/${categoryPath}/${post.slug}`;
          return (
            <div key={post.id} className="col-6 col-md-4 col-lg-2">
              <Link to={href} className="you-may-like-card text-decoration-none">
                <div className="you-may-like-card-inner">
                  {post.featured_image && (
                    <img
                      src={getImageUrl(post.featured_image)}
                      alt=""
                      className="you-may-like-card-img"
                    />
                  )}
                  <div className="you-may-like-card-body">
                    <span className="you-may-like-card-title">{post.title}</span>
                  </div>
                </div>
              </Link>
            </div>
          );
        })}
      </div>
    </section>
  );
}
