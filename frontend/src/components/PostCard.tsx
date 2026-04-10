import { Link } from 'react-router-dom';
import type { BlogPostPublic } from '../types';
import { getImageUrl } from '../utils/api';
import { useCategoryMeta } from '../utils/useCategoryMeta';
import { formatDate } from '../utils/dateFormat';

interface PostCardProps {
  post: BlogPostPublic;
  language: string;
  basePath: string;
  /** En landing: muestra badge de categoría y card más visual */
  variant?: 'default' | 'landing';
}

export function PostCard({ post, language, basePath, variant = 'default' }: PostCardProps) {
  const { pathFor, labelFor } = useCategoryMeta();
  const lang = language === 'en' ? 'en' : 'es';
  const categoryPath = pathFor(post.category, lang);
  const href = `${basePath}/${categoryPath}/${post.slug}`;
  const categoryLabel = labelFor(post.category, lang);
  const date = post.published_at ? formatDate(post.published_at, language as 'es' | 'en') : '';
  const isLanding = variant === 'landing';

  return (
    <article className={`card h-100 bg-dark border-secondary ${isLanding ? 'landing-card' : ''}`}>
      {post.featured_image && (
        <div className="card-img-top-wrap">
          <Link to={href} className="card-img-top-link" aria-label={post.title}>
            <img
              src={getImageUrl(post.featured_image)}
              className="card-img-top"
              alt=""
              style={{ height: isLanding ? '200px' : '180px', objectFit: 'cover' }}
            />
            {isLanding && (
              <span className="landing-card__category">{categoryLabel}</span>
            )}
          </Link>
        </div>
      )}
      <div className="card-body d-flex flex-column">
        <div className="text-muted small mb-1">{date}</div>
        <h3 className="card-title h6">
          <Link to={href} className="text-decoration-none text-light">
            {post.title}
          </Link>
        </h3>
        {post.excerpt && <p className="card-text small text-secondary flex-grow-1">{post.excerpt}</p>}
        <Link to={href} className="btn btn-sm btn-outline-primary mt-2 align-self-start">
          {language === 'es' ? 'Leer más' : 'Read more'}
        </Link>
      </div>
    </article>
  );
}
