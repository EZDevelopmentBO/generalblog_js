import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../utils/api';
import { useT } from '../utils/i18n';
import type { BlogPostPublic } from '../types';
import { PostCard } from './PostCard';
import { useCategoryMeta } from '../utils/useCategoryMeta';

interface SectionCarouselProps {
  categorySlug: string;
  language: string;
  limit?: number;
}

export function SectionCarousel({ categorySlug, language, limit = 10 }: SectionCarouselProps) {
  const t = useT();
  const [posts, setPosts] = useState<BlogPostPublic[]>([]);
  const [loading, setLoading] = useState(true);
  const carouselRef = useRef<HTMLDivElement | null>(null);
  const basePath = language === 'es' ? '/noticias' : '/news';
  const { pathFor, labelFor } = useCategoryMeta();
  const lang = language === 'en' ? 'en' : 'es';
  const categoryPath = pathFor(categorySlug, lang);
  const sectionTitle = labelFor(categorySlug, lang);

  useEffect(() => {
    api
      .get<{ posts: BlogPostPublic[] }>(
        `/api/blog/posts?language=${language}&category=${encodeURIComponent(categorySlug)}&limit=${limit}&order=published_at`
      )
      .then((res) => setPosts(res.posts))
      .catch(() => setPosts([]))
      .finally(() => setLoading(false));
  }, [language, categorySlug, limit]);

  useEffect(() => {
    const el = carouselRef.current;
    if (!el) return;
    let frameId: number | null = null;
    let lastTs = 0;
    let direction: 1 | -1 = 1;

    const step = (ts: number) => {
      if (!el) return;
      if (!lastTs) lastTs = ts;
      const dt = ts - lastTs;
      if (dt >= 30) {
        const maxScroll = el.scrollWidth - el.clientWidth;
        if (maxScroll > 0) {
          const delta = 0.2 * dt * direction;
          el.scrollLeft += delta;
          if (el.scrollLeft <= 0) direction = 1;
          else if (el.scrollLeft >= maxScroll) direction = -1;
        }
        lastTs = ts;
      }
      frameId = window.requestAnimationFrame(step);
    };

    frameId = window.requestAnimationFrame(step);
    return () => {
      if (frameId != null) window.cancelAnimationFrame(frameId);
    };
  }, [posts.length]);

  if (loading) {
    return (
      <section className="landing-section" aria-label={sectionTitle}>
        <div className="section-header">
          <h2 className="section-title">{sectionTitle}</h2>
          <Link className="section-link" to={`${basePath}/${categoryPath}`}>
            {t('landing.viewMore')}
          </Link>
        </div>
        <div className="section-carousel">
          <div className="section-carousel-inner">
            {[1, 2, 3].map((i) => (
              <div key={i} className="section-card-skeleton" />
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (posts.length === 0) return null;

  return (
    <section className="landing-section" aria-label={sectionTitle}>
      <div className="section-header">
        <h2 className="section-title">{sectionTitle}</h2>
        <Link className="section-link" to={`${basePath}/${categoryPath}`}>
          {t('landing.viewMore')}
        </Link>
      </div>
      <div className="section-carousel" ref={carouselRef}>
        <div className="section-carousel-inner">
          {posts.map((post) => (
            <div key={post.id} className="section-card-wrap">
              <PostCard post={post} language={language} basePath={basePath} variant="landing" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
