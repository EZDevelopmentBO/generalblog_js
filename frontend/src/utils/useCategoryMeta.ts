import { useEffect, useState, useCallback } from 'react';
import { api } from './api';
import type { BlogCategoryMeta } from '../types';

let globalCategories: BlogCategoryMeta[] | null = null;
let inflight: Promise<BlogCategoryMeta[]> | null = null;

export function invalidatePublicCategoriesCache(): void {
  globalCategories = null;
  inflight = null;
}

/** Precarga metadatos de categorías (una petición para toda la app). */
export function prefetchCategoryMeta(): Promise<BlogCategoryMeta[]> {
  if (globalCategories) return Promise.resolve(globalCategories);
  if (inflight) return inflight;
  inflight = api
    .get<{ categories: BlogCategoryMeta[] }>('/api/blog/categories')
    .then((r) => {
      globalCategories = r.categories;
      return r.categories;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export function useCategoryMeta() {
  const [categories, setCategories] = useState<BlogCategoryMeta[]>(globalCategories ?? []);
  const [loading, setLoading] = useState(globalCategories === null);

  useEffect(() => {
    let cancelled = false;
    prefetchCategoryMeta().then((cats) => {
      if (!cancelled) {
        setCategories(cats);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const pathFor = useCallback(
    (slug: string, lang: 'es' | 'en') => {
      const row = categories.find((c) => c.slug === slug);
      return row ? (lang === 'en' ? row.path_en : row.path_es) : slug;
    },
    [categories]
  );

  const slugFromPath = useCallback(
    (pathSeg: string, lang: 'es' | 'en') => {
      const p = pathSeg.toLowerCase();
      return categories.find((m) => (lang === 'en' ? m.path_en : m.path_es).toLowerCase() === p)?.slug;
    },
    [categories]
  );

  const labelFor = useCallback(
    (slug: string, lang: 'es' | 'en') => {
      const row = categories.find((c) => c.slug === slug);
      if (!row) return slug;
      return lang === 'en' ? row.label_en : row.label_es;
    },
    [categories]
  );

  const refetch = useCallback(() => {
    invalidatePublicCategoriesCache();
    return prefetchCategoryMeta().then(setCategories);
  }, []);

  return { categories, loading, pathFor, slugFromPath, labelFor, refetch };
}
