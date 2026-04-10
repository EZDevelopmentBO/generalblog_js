import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useT } from '../utils/i18n';
import { api } from '../utils/api';
import { getImageUrl } from '../utils/api';
import type { BlogPostPublic } from '../types';
import { useCategoryMeta } from '../utils/useCategoryMeta';

interface MoreNewsCarouselProps {
  excludePostId: number;
  limit?: number;
  titleKey?: string;
  language: string;
}

export function MoreNewsCarousel({
  excludePostId,
  limit = 4,
  titleKey = 'blogPost.moreNews',
  language,
}: MoreNewsCarouselProps) {
  const t = useT();
  const { pathFor } = useCategoryMeta();
  const [posts, setPosts] = useState<BlogPostPublic[]>([]);

  useEffect(() => {
    api
      .get<{ posts: BlogPostPublic[] }>(
        `/api/blog/posts?language=${language}&limit=${limit}&order=random&excludeId=${excludePostId}`
      )
      .then((res) => setPosts(res.posts))
      .catch(() => setPosts([]));
  }, [excludePostId, limit, language]);

  if (posts.length === 0) return null;

  const basePath = language === 'es' ? '/noticias' : '/news';

  return (
    <section className="mt-5 pt-4 border-top border-secondary">
      <h2 className="h5 mb-3">{t(titleKey)}</h2>
      <div className="row g-3">
        {posts.map((post) => {
          const lang = language === 'en' ? 'en' : 'es';
          const categoryPath = pathFor(post.category, lang);
          const href = `${basePath}/${categoryPath}/${post.slug}`;
          return (
            <div key={post.id} className="col-6 col-lg-3">
              <Link to={href} className="text-decoration-none d-block h-100">
                <article className="card h-100 bg-dark border-secondary more-news-card">
                  {post.featured_image && (
                    <img
                      src={getImageUrl(post.featured_image)}
                      className="card-img-top more-news-card__img"
                      alt=""
                    />
                  )}
                  <div className="card-body p-3">
                    <h3 className="card-title more-news-card__title">{post.title}</h3>
                  </div>
                </article>
              </Link>
            </div>
          );
        })}
      </div>
    </section>
  );
}
