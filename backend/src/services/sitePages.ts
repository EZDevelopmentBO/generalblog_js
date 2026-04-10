import { query } from '../config/database';

export interface SitePageRow {
  id: number;
  slug: string;
  language: string;
  title: string;
  body_html: string;
  meta_title: string | null;
  meta_description: string | null;
  published: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export type SitePageCreateInput = {
  slug: string;
  language: 'es' | 'en';
  title: string;
  body_html: string;
  meta_title?: string | null;
  meta_description?: string | null;
  published?: boolean;
  sort_order?: number;
};

export async function listSitePagesAdmin(): Promise<SitePageRow[]> {
  const { rows } = await query<SitePageRow>(
    `SELECT id, slug, language, title, body_html, meta_title, meta_description, published, sort_order, created_at, updated_at
     FROM site_pages
     ORDER BY sort_order ASC, language ASC, slug ASC`
  );
  return rows;
}

export async function getSitePageById(id: number): Promise<SitePageRow | null> {
  const { rows } = await query<SitePageRow>(
    `SELECT id, slug, language, title, body_html, meta_title, meta_description, published, sort_order, created_at, updated_at
     FROM site_pages WHERE id = $1`,
    [id]
  );
  return rows[0] ?? null;
}

export async function createSitePage(input: SitePageCreateInput): Promise<SitePageRow | null> {
  const slug = input.slug.trim().toLowerCase().replace(/\s+/g, '-');
  if (!slug || !input.title.trim()) return null;
  const { rows } = await query<SitePageRow>(
    `INSERT INTO site_pages (slug, language, title, body_html, meta_title, meta_description, published, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, false), COALESCE($8, 0))
     RETURNING id, slug, language, title, body_html, meta_title, meta_description, published, sort_order, created_at, updated_at`,
    [
      slug,
      input.language,
      input.title.trim(),
      input.body_html ?? '',
      input.meta_title?.trim() || null,
      input.meta_description?.trim() || null,
      input.published,
      input.sort_order,
    ]
  );
  return rows[0] ?? null;
}

export async function updateSitePage(
  id: number,
  patch: Partial<SitePageCreateInput>
): Promise<SitePageRow | null> {
  const cur = await getSitePageById(id);
  if (!cur) return null;
  const slug =
    patch.slug != null ? patch.slug.trim().toLowerCase().replace(/\s+/g, '-') : cur.slug;
  const title = patch.title != null ? patch.title.trim() : cur.title;
  const body_html = patch.body_html != null ? patch.body_html : cur.body_html;
  const language = patch.language ?? (cur.language as 'es' | 'en');
  const meta_title = patch.meta_title !== undefined ? patch.meta_title?.trim() || null : cur.meta_title;
  const meta_description =
    patch.meta_description !== undefined ? patch.meta_description?.trim() || null : cur.meta_description;
  const published = patch.published !== undefined ? patch.published : cur.published;
  const sort_order = patch.sort_order !== undefined ? patch.sort_order : cur.sort_order;
  if (!slug || !title) return null;
  const { rows } = await query<SitePageRow>(
    `UPDATE site_pages SET
       slug = $2, language = $3, title = $4, body_html = $5, meta_title = $6, meta_description = $7,
       published = $8, sort_order = $9, updated_at = NOW()
     WHERE id = $1
     RETURNING id, slug, language, title, body_html, meta_title, meta_description, published, sort_order, created_at, updated_at`,
    [id, slug, language, title, body_html, meta_title, meta_description, published, sort_order]
  );
  return rows[0] ?? null;
}

export async function deleteSitePage(id: number): Promise<boolean> {
  const { rowCount } = await query('DELETE FROM site_pages WHERE id = $1', [id]);
  return rowCount > 0;
}

export async function listPublishedSitePagesPublic(language: string): Promise<
  Pick<SitePageRow, 'slug' | 'title' | 'sort_order'>[]
> {
  const lang = language === 'en' ? 'en' : 'es';
  const { rows } = await query<Pick<SitePageRow, 'slug' | 'title' | 'sort_order'>>(
    `SELECT slug, title, sort_order FROM site_pages WHERE published = true AND language = $1 ORDER BY sort_order ASC, slug ASC`,
    [lang]
  );
  return rows;
}

export async function getPublishedSitePageBySlug(
  slug: string,
  language: string
): Promise<SitePageRow | null> {
  const s = slug.trim().toLowerCase();
  const lang = language === 'en' ? 'en' : 'es';
  const { rows } = await query<SitePageRow>(
    `SELECT id, slug, language, title, body_html, meta_title, meta_description, published, sort_order, created_at, updated_at
     FROM site_pages WHERE slug = $1 AND language = $2 AND published = true`,
    [s, lang]
  );
  return rows[0] ?? null;
}

export async function listPublishedSitePageSitemapEntries(
  base: string
): Promise<{ loc: string; lastmod: string; changefreq: string; priority: string }[]> {
  const { rows } = await query<{ slug: string; language: string; updated_at: string }>(
    `SELECT slug, language, updated_at::text AS updated_at FROM site_pages WHERE published = true ORDER BY language, slug`
  );
  const b = base.replace(/\/$/, '');
  const today = new Date().toISOString().slice(0, 10);
  return rows.map((r) => {
    const prefix = r.language === 'en' ? '/pages' : '/paginas';
    return {
      loc: `${b}${prefix}/${encodeURIComponent(r.slug)}`,
      lastmod: (r.updated_at && r.updated_at.slice(0, 10)) || today,
      changefreq: 'monthly',
      priority: '0.6',
    };
  });
}
