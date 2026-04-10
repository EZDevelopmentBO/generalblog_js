import { pool, query } from '../config/database';

export interface BlogCategoryRow {
  slug: string;
  path_es: string;
  path_en: string;
  label_es: string;
  label_en: string;
  sort_order: number;
  created_at?: string;
}

const SLUG_RE = /^[a-z][a-z0-9_]*$/;
const PATH_RE = /^[a-z0-9][a-z0-9_-]*$/;

type CategoryCache = {
  bySlug: Map<string, BlogCategoryRow>;
  pathEsToSlug: Map<string, string>;
  pathEnToSlug: Map<string, string>;
  orderedSlugs: string[];
};

let cache: CategoryCache | null = null;

export async function refreshBlogCategoriesCache(): Promise<void> {
  const { rows } = await query<BlogCategoryRow>(
    'SELECT slug, path_es, path_en, label_es, label_en, sort_order FROM blog_categories ORDER BY sort_order ASC, slug ASC'
  );
  const bySlug = new Map<string, BlogCategoryRow>();
  const pathEsToSlug = new Map<string, string>();
  const pathEnToSlug = new Map<string, string>();
  const orderedSlugs: string[] = [];
  for (const r of rows) {
    bySlug.set(r.slug, r);
    pathEsToSlug.set(r.path_es.toLowerCase(), r.slug);
    pathEnToSlug.set(r.path_en.toLowerCase(), r.slug);
    orderedSlugs.push(r.slug);
  }
  cache = { bySlug, pathEsToSlug, pathEnToSlug, orderedSlugs };
}

export function isValidCategory(cat: string): boolean {
  return Boolean(cache?.bySlug.has(cat));
}

export function getCategoryUrlPath(slug: string, lang: 'es' | 'en'): string | undefined {
  const row = cache?.bySlug.get(slug);
  if (!row) return undefined;
  return lang === 'en' ? row.path_en : row.path_es;
}

export function slugFromCategoryPath(pathSeg: string, lang: 'es' | 'en'): string | undefined {
  if (!cache) return undefined;
  const m = lang === 'en' ? cache.pathEnToSlug : cache.pathEsToSlug;
  return m.get(pathSeg.toLowerCase());
}

export function getOrderedCategorySlugs(): string[] {
  return cache ? [...cache.orderedSlugs] : [];
}

export async function listAllBlogCategories(): Promise<BlogCategoryRow[]> {
  const { rows } = await query<BlogCategoryRow>(
    'SELECT slug, path_es, path_en, label_es, label_en, sort_order, created_at FROM blog_categories ORDER BY sort_order ASC, slug ASC'
  );
  return rows;
}

export interface PublicCategoryWithCount extends BlogCategoryRow {
  count: number;
}

export async function getPublicCategoriesWithMeta(language?: string): Promise<PublicCategoryWithCount[]> {
  const lang = language === 'es' || language === 'en' ? language : null;
  const sql = `
    SELECT c.slug, c.path_es, c.path_en, c.label_es, c.label_en, c.sort_order,
           COUNT(p.id)::text AS count
    FROM blog_categories c
    LEFT JOIN blog_posts p ON p.category = c.slug AND p.published = true
      ${lang ? 'AND p.language = $1' : ''}
    GROUP BY c.slug, c.path_es, c.path_en, c.label_es, c.label_en, c.sort_order
    ORDER BY c.sort_order ASC, c.slug ASC
  `;
  const { rows } = await query<BlogCategoryRow & { count: string }>(sql, lang ? [lang] : []);
  return rows.map((r) => ({
    slug: r.slug,
    path_es: r.path_es,
    path_en: r.path_en,
    label_es: r.label_es,
    label_en: r.label_en,
    sort_order: r.sort_order,
    count: parseInt(r.count as unknown as string, 10),
  }));
}

export async function countPostsByCategory(slug: string): Promise<number> {
  const { rows } = await query<{ n: string }>(
    'SELECT COUNT(*)::text AS n FROM blog_posts WHERE category = $1',
    [slug]
  );
  return parseInt(rows[0]?.n ?? '0', 10);
}

export async function createBlogCategory(input: {
  slug: string;
  path_es: string;
  path_en: string;
  label_es: string;
  label_en: string;
  sort_order?: number;
}): Promise<BlogCategoryRow | null> {
  const slug = input.slug.trim().toLowerCase();
  const path_es = input.path_es.trim().toLowerCase();
  const path_en = input.path_en.trim().toLowerCase();
  const label_es = input.label_es.trim();
  const label_en = input.label_en.trim();
  if (!SLUG_RE.test(slug) || !PATH_RE.test(path_es) || !PATH_RE.test(path_en) || !label_es || !label_en) {
    return null;
  }
  const sort_order = input.sort_order != null && Number.isFinite(input.sort_order) ? Number(input.sort_order) : 100;
  try {
    const { rows } = await query<BlogCategoryRow>(
      `INSERT INTO blog_categories (slug, path_es, path_en, label_es, label_en, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING slug, path_es, path_en, label_es, label_en, sort_order`,
      [slug, path_es, path_en, label_es, label_en, sort_order]
    );
    await refreshBlogCategoriesCache();
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

export async function updateBlogCategory(
  slug: string,
  input: Partial<{ slug: string; path_es: string; path_en: string; label_es: string; label_en: string; sort_order: number }>
): Promise<BlogCategoryRow | null> {
  const existing = cache?.bySlug.get(slug);
  if (!existing) return null;

  let newSlug = existing.slug;
  if (input.slug !== undefined) {
    const s = input.slug.trim().toLowerCase();
    if (!SLUG_RE.test(s)) return null;
    newSlug = s;
  }
  const path_es = input.path_es !== undefined ? input.path_es.trim().toLowerCase() : existing.path_es;
  const path_en = input.path_en !== undefined ? input.path_en.trim().toLowerCase() : existing.path_en;
  const label_es = input.label_es !== undefined ? input.label_es.trim() : existing.label_es;
  const label_en = input.label_en !== undefined ? input.label_en.trim() : existing.label_en;
  const sort_order =
    input.sort_order !== undefined && Number.isFinite(input.sort_order) ? Number(input.sort_order) : existing.sort_order;

  if (!PATH_RE.test(path_es) || !PATH_RE.test(path_en) || !label_es || !label_en) return null;

  if (newSlug !== existing.slug) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('UPDATE blog_posts SET category = $1, updated_at = NOW() WHERE category = $2', [
        newSlug,
        existing.slug,
      ]);
      await client.query(
        `UPDATE blog_categories SET slug = $1, path_es = $2, path_en = $3, label_es = $4, label_en = $5, sort_order = $6 WHERE slug = $7`,
        [newSlug, path_es, path_en, label_es, label_en, sort_order, existing.slug]
      );
      await client.query('COMMIT');
    } catch {
      await client.query('ROLLBACK').catch(() => {});
      return null;
    } finally {
      client.release();
    }
  } else {
    try {
      await query(
        `UPDATE blog_categories SET path_es = $1, path_en = $2, label_es = $3, label_en = $4, sort_order = $5 WHERE slug = $6`,
        [path_es, path_en, label_es, label_en, sort_order, existing.slug]
      );
    } catch {
      return null;
    }
  }
  await refreshBlogCategoriesCache();
  return cache?.bySlug.get(newSlug) ?? null;
}

export async function deleteBlogCategory(slug: string): Promise<{ ok: boolean; error?: string }> {
  const n = await countPostsByCategory(slug);
  if (n > 0) return { ok: false, error: 'Hay posts usando esta categoría' };
  try {
    const { rowCount } = await query('DELETE FROM blog_categories WHERE slug = $1', [slug]);
    if (rowCount === 0) return { ok: false, error: 'Categoría no encontrada' };
    await refreshBlogCategoriesCache();
    return { ok: true };
  } catch {
    return { ok: false, error: 'No se pudo eliminar' };
  }
}
